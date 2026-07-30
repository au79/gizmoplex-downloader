import { confirm } from '@inquirer/prompts';
import { mkdir, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { extractPageTitleCandidates, fetchVideosForUrls } from './video-discovery.js';
import { MetadataCache } from './metadata-cache.js';
import { fetchInteractiveTransactions, selectItemsForTransaction, selectTransaction, displaySelectedItems } from './interactive-ui.js';
import { planVideoDownloads, planZipDownload, resolvePlannedDownloadPaths, summaryForPlan } from './archive-planning.js';
import { inProgressPath } from './in-progress.js';
import { printDownloadPlan } from './terminal.js';
import { printDownloadSummary } from './summary.js';
import { errorMessage } from './runtime.js';
import { sanitizePathComponent } from './format.js';
import type { HttpClient } from './http-client.js';
import type { Options, PlannedVideoDownload, Transaction, SelectedInteractiveItem } from '../types.js';

export async function processInteractiveArchive(
  client: HttpClient,
  transactions: Transaction[],
  options: Options,
  _controller: unknown,
  execute: (planned: PlannedVideoDownload[], planPath: string, delay: Options['delay']) => Promise<void>,
): Promise<void> {
  const outputRoot = path.resolve(options.out);
  await ensureDirectory(outputRoot);
  const metadataCache = new MetadataCache(outputRoot, ensureDirectory, extractPageTitleCandidates);
  const interactiveTransactions = await fetchInteractiveTransactions(client, transactions, outputRoot, countDownloadedItems);
  const selectedItems = new Map<string, SelectedInteractiveItem>();
  while (true) {
    const selection = await selectTransaction(interactiveTransactions, selectedItems);
    if (selection.kind === 'confirm') break;
    await selectItemsForTransaction(client, metadataCache, selection.transaction, selectedItems, outputRoot, options, {
      fetchVideos: fetchVideosForUrls,
      planVideo: async (innerClient, transaction, page, root, innerOptions) => planVideoDownloads(innerClient, transaction, page, page.title, root, innerOptions, ensureDirectory, fileSize, page.vhxVideo, page.vimeoConfig),
      planZip: (innerClient, transaction, link, root) => planZipDownload(innerClient, transaction, link, root, ensureDirectory, fileSize),
    });
  }
  const planned = await Promise.all([...selectedItems.values()].map(async (selected): Promise<PlannedVideoDownload> => {
    if (selected.item.kind === 'zip') return { downloads: await planZipDownload(client, selected.transaction, selected.item.link, outputRoot, ensureDirectory, fileSize), transactionDescription: selected.transaction.description, videoTitle: selected.item.link.label || selected.item.link.url, videoUrl: selected.item.link.url };
    if (!selected.page) throw new Error(`Missing fetched metadata for ${selected.item.url}.`);
    return { downloads: await planVideoDownloads(client, selected.transaction, selected.page, selected.page.title, outputRoot, options, ensureDirectory, fileSize, selected.page.vhxVideo, selected.page.vimeoConfig), transactionDescription: selected.transaction.description, videoTitle: selected.page.title, videoUrl: selected.page.url };
  }));
  const resolvedPlan = await resolvePlannedDownloadPaths(planned, fileSize);
  console.error('');
  displaySelectedItems(selectedItems);
  console.error('Download summary for selected items:');
  printDownloadSummary(summaryForPlan(resolvedPlan), console.error);
  if (!await confirm({ message: 'Download selected files now?', default: false }, { output: process.stderr })) { console.error('Download cancelled.'); return; }
  await execute(resolvedPlan, inProgressPath(outputRoot, options.inProgressPlan), options.delay);
}

export async function ensureDirectory(directory: string): Promise<void> {
  try { await mkdir(directory, { recursive: true }); } catch (error) { throw new Error(`Could not create output directory ${directory}: ${errorMessage(error)}`); }
}

export async function fileSize(filePath: string): Promise<number | undefined> {
  try { const result = await stat(filePath); return result.isFile() ? result.size : undefined; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error; }
}

export async function countDownloadedItems(outputRoot: string, transaction: Transaction): Promise<number> {
  try { return (await readdir(path.join(outputRoot, sanitizePathComponent(transaction.description)), { withFileTypes: true })).filter((entry) => entry.isFile() && /\.(mp4|zip)$/i.test(entry.name)).length; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 0; throw error; }
}
