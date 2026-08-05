import { confirm } from '@inquirer/prompts';
import { mkdir, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { readEmail, readPassword } from '../credentials.js';
import type { Options, PlannedDownload, PlannedVideoDownload, Transaction, VideoPage } from '../types.js';
import { login, type HttpClient } from './http-client.js';
import { fetchTransactions } from './transactions.js';
import { MetadataCache } from './metadata-cache.js';
import { TransactionCache } from './transaction-cache.js';
import { extractPageTitleCandidates, fetchVideoMetadata, fetchVideosForUrls } from './video-discovery.js';
import { extractVideoUrls, extractZipDownloadLinks, zipFilename } from './links.js';
import { planVideoDownloads, planZipDownload, resolvePlannedDownloadPaths, summaryForPlan } from './archive-planning.js';
import { downloadPlannedVideos } from './download-execution.js';
import { deleteInProgressPlan, createResumeController, inProgressPath, offerInProgressPlan, readInProgressPlan, saveInProgressPlan, saveInProgressPlanSync } from './in-progress.js';
import { printDownloadPlan, printTransactions } from './terminal.js';
import { printDownloadSummary } from './summary.js';
import { processInteractiveArchive } from './interactive-workflow.js';
import { errorMessage, sleep } from './runtime.js';
import { formatDuration, redactUrl, sanitizePathComponent } from './format.js';
import { confirmSufficientDiskSpace } from './storage.js';

export async function runApplication(options: Options): Promise<void> {
  const outputRoot = path.resolve(options.out);
  const startedAt = Date.now();
  const controller = createResumeController();
  const signalHandler = createInterruptHandler(controller);
  process.on('SIGINT', signalHandler);
  try {
    if (options.showInProgressPlan) {
      const planPath = inProgressPath(outputRoot, options.inProgressPlan);
      const plan = await readInProgressPlan(planPath);
      if (!plan) throw new Error(`No saved .in-progress plan found at ${planPath}.`);
      console.log(JSON.stringify(plan, (key, value) => key === 'url' || key === 'videoUrl' ? redactUrl(String(value)) : value, 2));
      return;
    }
    if (options.clearCache) await new MetadataCache(outputRoot, ensureDirectory, extractPageTitleCandidates).clear();
    const transactionCache = new TransactionCache(outputRoot, ensureDirectory);
    const cachedTransactions = await transactionCache.read();
    if (cachedTransactions) {
      console.error('Cached transactions:');
      printTransactions(cachedTransactions);
    }
    const client = await login(await readEmail(), await readPassword(), options.timeout);
    const refreshedTransactions = fetchAndCacheTransactions(client, transactionCache, cachedTransactions);
    if (await offerSavedPlan(client, options, controller)) { await refreshedTransactions; return; }
    if (options.interactive) {
      const transactions = await refreshedTransactions;
      await processInteractiveArchive(client, transactions, options, controller, (planned, planPath, delay) => executePlan(client, planned, planPath, delay, false, controller, outputRoot, options.yes));
    } else {
      const transactions = cachedTransactions ?? await refreshedTransactions;
      if (!cachedTransactions) printTransactions(transactions);
      await processArchive(client, transactions, options, controller);
      await refreshedTransactions;
    }
  } finally {
    process.off('SIGINT', signalHandler);
    if (!options.showInProgressPlan) (options.dryRun ? console.log : console.error)(`Total runtime: ${formatDuration(Date.now() - startedAt)}`);
  }
}

export async function fetchAndCacheTransactions(client: HttpClient, cache: TransactionCache, cachedTransactions: Transaction[] | undefined): Promise<Transaction[]> {
  try {
    const fetchedTransactions = await fetchTransactions(client);
    if (!cachedTransactions || !sameTransactions(cachedTransactions, fetchedTransactions)) await cache.write(fetchedTransactions);
    if (cachedTransactions && !sameTransactions(cachedTransactions, fetchedTransactions)) {
      console.error('Updated transactions:');
      printTransactions(fetchedTransactions);
    }
    return fetchedTransactions;
  } catch (error) {
    if (!cachedTransactions) throw error;
    console.error(`Could not refresh transactions; using cached data: ${errorMessage(error)}`);
    return cachedTransactions;
  }
}

function sameTransactions(left: Transaction[], right: Transaction[]): boolean {
  return left.length === right.length && left.every((transaction, index) => {
    const other = right[index];
    return transaction.date === other.date && transaction.description === other.description && transaction.url === other.url;
  });
}

export function createInterruptHandler(controller: { saveSync(): void }, exit: (code: number) => never = process.exit): () => void {
  return () => { controller.saveSync(); exit(130); };
}

async function offerSavedPlan(client: HttpClient, options: Options, controller: ReturnType<typeof createResumeController>): Promise<boolean> {
  return offerInProgressPlan(client, options, (planned) => {
    const summary = summaryForPlan(planned);
    console.error('');
    console.error('Download summary for saved .in-progress plan:');
    printDownloadSummary(summary, console.error);
  }, (savedClient, planned, planPath, delay, deleteOnSuccess) => executePlan(savedClient, planned, planPath, delay, deleteOnSuccess, controller, path.resolve(options.out), options.yes), async (count) => confirm({ message: `Use saved .in-progress plan with ${count} video(s)?`, default: true }, { output: process.stderr }));
}

export async function processArchive(client: HttpClient, transactions: Transaction[], options: Options, controller: ReturnType<typeof createResumeController>): Promise<void> {
  const outputRoot = path.resolve(options.out);
  await ensureDirectory(outputRoot);
  const metadataCache = new MetadataCache(outputRoot, ensureDirectory, extractPageTitleCandidates);
  const output = options.dryRun ? console.log : console.error;
  output('');
  output(options.dryRun ? 'Dry run archive plan:' : 'Archive downloads:');
  const queue: Array<{ transaction: Transaction; videoUrl: string }> = [];
  const planned: PlannedVideoDownload[] = [];

  for (const transaction of transactions) {
    const productPage = await client.get(transaction.url, undefined, `product page for ${transaction.description}`);
    const videoUrls = extractVideoUrls(productPage.body, productPage.url);
    const zipLinks = extractZipDownloadLinks(productPage.body, productPage.url);
    for (const zipLink of zipLinks) planned.push({ downloads: await planZipDownload(client, transaction, zipLink, outputRoot, ensureDirectory, fileSize), transactionDescription: transaction.description, videoTitle: zipFilename(zipLink), videoUrl: zipLink.url });
    if (videoUrls.length === 0 && zipLinks.length === 0) { output(''); output(transaction.description); output('  No video pages found.'); continue; }
    queue.push(...videoUrls.map((videoUrl) => ({ transaction, videoUrl })));
  }
  for (const [index, item] of queue.entries()) {
    output(''); output(`${index + 1} of ${queue.length}`);
    const video = await fetchVideoMetadata(client, metadataCache, item.transaction, item.videoUrl);
    const downloads = await planVideoDownloads(client, item.transaction, { downloadLinks: video.downloadLinks, pageTitleCandidates: video.pageTitleCandidates, url: video.pageUrl }, video.title, outputRoot, options, ensureDirectory, fileSize, video.vhxVideo, video.vimeoConfig);
    planned.push({ downloads, transactionDescription: item.transaction.description, videoTitle: video.title, videoUrl: item.videoUrl });
  }
  const resolvedPlan = await resolvePlannedDownloadPaths(planned, fileSize);
  const summary = summaryForPlan(resolvedPlan);
  resolvedPlan.forEach((item) => printDownloadPlan(item.transactionDescription, item.videoTitle, item.videoUrl, item.downloads, options.dryRun));
  if (options.dryRun) { printDownloadSummary(summary, console.log); return; }
  console.error('Download summary:');
  printDownloadSummary(summary, console.error);
  if (!options.yes && !await confirm({ message: 'Download planned files now?', default: false }, { output: process.stderr })) { console.error('Download cancelled.'); return; }
  await executePlan(client, resolvedPlan, inProgressPath(outputRoot, options.inProgressPlan), options.delay, false, controller, outputRoot, options.yes);
}

export async function executePlan(client: HttpClient, planned: PlannedVideoDownload[], planPath: string, delay: Options['delay'], deleteOnSuccess: boolean, controller: ReturnType<typeof createResumeController>, outputRoot: string, yes: boolean): Promise<void> {
  if (!await confirmSufficientDiskSpace(outputRoot, planned, yes)) { console.error('Download cancelled.'); return; }
  await downloadPlannedVideos(client, planned, planPath, delay, deleteOnSuccess, {
    ensureDirectory,
    fileSize,
    printPlan: (item) => printDownloadPlan(item.transactionDescription, item.videoTitle, item.videoUrl, item.downloads, false),
    waitDelay: waitRandomDelay,
    deletePlan: deleteInProgressPlan,
    savePlan: saveInProgressPlan,
    setActive: controller.setActive,
  });
}

export async function ensureDirectory(dirPath: string): Promise<void> {
  try { await mkdir(dirPath, { recursive: true }); } catch (error) { throw new Error(`Could not create output directory ${dirPath}: ${errorMessage(error)}`); }
}

export async function fileSize(filePath: string): Promise<number | undefined> {
  try { const result = await stat(filePath); return result.isFile() ? result.size : undefined; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error; }
}

export async function countDownloadedItems(outputRoot: string, transaction: Transaction): Promise<number> {
  const productDir = path.join(outputRoot, sanitizePathComponent(transaction.description));
  try { return (await readdir(productDir, { withFileTypes: true })).filter((entry) => entry.isFile() && /\.(mp4|zip)$/i.test(entry.name)).length; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 0; throw error; }
}

async function waitRandomDelay(delay: { min: number; max: number }): Promise<void> {
  const seconds = Math.floor(Math.random() * (delay.max - delay.min + 1)) + delay.min;
  console.error(`Waiting ${seconds}s before next downloadable item...`);
  await sleep(seconds * 1000);
}
