#!/usr/bin/env node

import { checkbox, confirm, input, password, select } from '@inquirer/prompts';
import * as cheerio from 'cheerio';
import { Command } from 'commander';
import 'dotenv/config';
import { createWriteStream, writeFileSync } from 'node:fs';
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import ProgressBar from 'progress';
import { formatBytes, formatDuration, normalizeText, redactUrl, sanitizePathComponent } from './lib/format.js';
import { parseOptionalDelayRange, parsePositiveInteger } from './lib/options.js';
import type { DelayRange } from './lib/options.js';
import { extensionForDownload, extractDownloadLinks, extractVideoUrls, extractZipDownloadLinks, parseSubtitleFormat, selectHighestResolutionVideo, selectSubtitleLinks, zipFilename } from './lib/links.js';
import type { DownloadLink, SubtitleFormat } from './lib/links.js';
import { addSummaryDownload, createDownloadSummary, printDownloadSummary } from './lib/summary.js';

const LOGIN_URL = 'https://www.gizmoplex.com/login';
const TRANSACTIONS_URL = 'https://www.gizmoplex.com/settings/manage/transactions';
const TRANSACTIONS_API_URL = 'https://www.gizmoplex.com/customer_settings/transactions';
const MAX_FETCH_ATTEMPTS = 10;
const INITIAL_RETRY_DELAY_MS = 1000;

type Options = {
  clearCache: boolean;
  delay?: DelayRange;
  dryRun: boolean;
  inProgressPlan?: string;
  interactive: boolean;
  out: string;
  showInProgressPlan: boolean;
  srt: boolean;
  timeout: number;
  vtt: boolean;
};

type CliOptions = Omit<Options, 'delay'> & {
  delay?: string;
};

type Transaction = {
  date: string;
  description: string;
  url: string;
};

type VideoPage = {
  downloadLinks: DownloadLink[];
  pageTitleCandidates: PageTitleCandidates;
  title: string;
  url: string;
  vimeoConfig?: VimeoConfigResponse;
  vhxVideo?: VhxVideoResponse;
};

type CachedVideoMetadata = {
  downloadLinks: DownloadLink[];
  fetchedAt: string;
  pageTitleCandidates: PageTitleCandidates;
  pageUrl: string;
  videoUrl: string;
  vimeoConfig?: VimeoConfigResponse;
  vhxVideo?: VhxVideoResponse;
};

type LegacyCachedVideoMetadata = {
  fetchedAt: string;
  videoPage?: HttpResponse;
  videoUrl: string;
  vimeoConfig?: VimeoConfigResponse;
  vhxEmbedHtml?: string;
  vhxVideo?: VhxVideoResponse;
};

type ResolvedVideoMetadata = CachedVideoMetadata & {
  title: string;
};

type VimeoMetadata = {
  config?: VimeoConfigResponse;
};

type PageTitleCandidates = {
  h1?: string;
  jsonLdTitle?: string;
  ogVideoTitle?: string;
  pageTitle?: string;
  siteName?: string;
  twitterTitle?: string;
};

type InteractiveTransaction = {
  alreadyDownloadedCount: number;
  items: InteractiveItem[];
  transaction: Transaction;
};

type InteractiveItem =
  | { id: string; kind: 'video'; url: string }
  | { id: string; kind: 'zip'; link: DownloadLink };

type SelectedInteractiveItem = {
  item: InteractiveItem;
  page?: VideoPage;
  transaction: Transaction;
};

type TransactionMenuSelection =
  | { kind: 'confirm' }
  | { kind: 'transaction'; transaction: InteractiveTransaction };

type PlannedDownload = {
  extension: string;
  kind: 'video' | 'subtitle' | 'zip';
  label: string;
  path: string;
  sizeBytes?: number;
  skip: boolean;
  url: string;
};

type PlannedVideoDownload = {
  downloads: PlannedDownload[];
  transactionDescription: string;
  videoTitle: string;
  videoUrl: string;
};

type InProgressPlan = {
  planned: PlannedVideoDownload[];
  savedAt: string;
  version: 1;
};

type VideoMetadataForPlanning = {
  downloadLinks: DownloadLink[];
  pageTitleCandidates: PageTitleCandidates;
  url: string;
};

type ApiTransaction = {
  date?: unknown;
  product_name?: unknown;
  product_url?: unknown;
};

let activeInProgress: { path: string; planned: PlannedVideoDownload[] } | undefined;

const program = new Command()
  .name('gizmoplex-downloader')
  .description('List purchased Gizmoplex transactions.')
  .option('--dry-run', 'show what would be downloaded without writing files', false)
  .option('-i, --interactive', 'select one transaction and choose videos interactively', false)
  .option('--clear-cache', 'clear cached video metadata at app launch', false)
  .option('--out <dirpath>', 'root directory for downloaded files', './gizmoplex-archive/')
  .option('--in-progress-plan <filepath>', 'path to the in-progress download plan')
  .option('--show-in-progress-plan', 'print the saved in-progress download plan and exit', false)
  .option('--delay <seconds>', 'random delay range between video pages, as min-max seconds')
  .option('--srt', 'select SRT subtitle files', false)
  .option('--vtt', 'select VTT subtitle files', false)
  .option('--timeout <ms>', 'request timeout in milliseconds', parsePositiveInteger, 30_000);

program.parse();

function normalizeOptions(options: CliOptions): Options {
  return {
    ...options,
    delay: parseOptionalDelayRange(options.delay, options.dryRun),
  };
}

async function readEmail(): Promise<string> {
  const envEmail = process.env.GIZMOPLEX_EMAIL ?? process.env.GIZMOPLEX_USERNAME;

  if (envEmail) {
    return envEmail;
  }

  return input({
    message: 'Gizmoplex email',
    required: true,
  });
}

async function readPassword(): Promise<string> {
  const envPassword = process.env.GIZMOPLEX_PASSWORD;

  if (envPassword) {
    return envPassword;
  }

  return password({
    message: 'Gizmoplex password',
    mask: '*',
    validate: (value) => value.length > 0 || 'Password is required',
  });
}

async function login(email: string, userPassword: string, options: Options): Promise<HttpClient> {
  const client = new HttpClient(options.timeout);
  const loginPage = await client.get(LOGIN_URL, undefined, 'Gizmoplex login page');
  const $login = cheerio.load(loginPage.body);
  const authenticityToken = $login('#login-form-password input[name="authenticity_token"]').attr('value');

  if (!authenticityToken) {
    throw new Error('Could not find login authenticity token.');
  }

  const loginResponse = await client.post(new URL('/login.json', LOGIN_URL).toString(), new URLSearchParams({
    email,
    password: userPassword,
    authenticity_token: authenticityToken,
    utf8: '✓',
  }), LOGIN_URL);

  if (loginResponse.status === 401) {
    throw new Error('Login failed: Gizmoplex returned 401 for the configured email/password.');
  }

  if (loginResponse.status >= 400) {
    throw new Error(`Login failed: Gizmoplex returned ${loginResponse.status}. ${extractPageError(loginResponse.body)}`.trim());
  }

  const redirectUrl = extractRedirectUrl(loginResponse.body);

  if (redirectUrl) {
    await client.get(redirectUrl);
  }

  return client;
}

async function fetchTransactions(client: HttpClient, options: Options): Promise<Transaction[]> {
  const transactionsApiResponse = await client.get(TRANSACTIONS_API_URL, 'application/json', 'Gizmoplex transactions API');

  if (new URL(transactionsApiResponse.url).pathname.includes('/login')) {
    throw new Error('Transactions API redirected to login.');
  }

  const transactions = extractApiTransactions(transactionsApiResponse.body);

  return transactions;
}

class HttpClient {
  private readonly cookies = new Map<string, string>();

  constructor(private readonly timeout: number) {}

  async get(
    url: string,
    accept = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    resourceDescription = url,
  ): Promise<HttpResponse> {
    return this.request(url, {
      method: 'GET',
      headers: {
        accept,
      },
    }, resourceDescription);
  }

  async post(url: string, body: URLSearchParams, referer: string): Promise<HttpResponse> {
    return this.request(url, {
      method: 'POST',
      body,
      headers: {
        accept: 'application/json',
        'content-type': 'application/x-www-form-urlencoded',
        origin: new URL(url).origin,
        referer,
        'x-requested-with': 'XMLHttpRequest',
      },
    }, `Gizmoplex login submission for ${referer}`);
  }

  async getWithBearer(url: string, token: string, resourceDescription = url): Promise<HttpResponse> {
    return this.request(url, {
      method: 'GET',
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${token}`,
      },
    }, resourceDescription);
  }

  async getWithHeaders(url: string, headers: HeadersInit, resourceDescription = url): Promise<HttpResponse> {
    return this.request(url, {
      method: 'GET',
      headers,
    }, resourceDescription);
  }

  async contentLength(url: string, resourceDescription = url): Promise<number | undefined> {
    const response = await this.fetchRaw(url, {
      method: 'HEAD',
      headers: {
        accept: '*/*',
      },
    }, 0, true, `content length for ${resourceDescription}`);
    const value = response.headers.get('content-length');

    return value ? Number.parseInt(value, 10) : undefined;
  }

  async downloadToFile(url: string, filePath: string, resourceDescription = url): Promise<void> {
    const response = await this.fetchRaw(url, {
      method: 'GET',
      headers: {
        accept: '*/*',
      },
    }, 0, false, `download ${resourceDescription} to ${filePath}`);

    if (!response.ok) {
      throw new Error(`Download failed: ${response.status} ${response.statusText} for ${url}`);
    }

    if (!response.body) {
      throw new Error(`Download failed: response body was empty for ${url}`);
    }

    const tempPath = `${filePath}.part`;
    const totalBytes = parseContentLength(response.headers);
    const progress = createDownloadProgressBar(resourceDescription, totalBytes);
    let downloadedBytes = 0;
    const startedAt = Date.now();
    const progressStream = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        downloadedBytes += chunk.length;
        progress.tick(progressTickLength(progress, chunk.length), progressTokens(downloadedBytes, totalBytes, startedAt));
        callback(null, chunk);
      },
    });

    try {
      await pipeline(
        Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]),
        progressStream,
        createWriteStream(tempPath),
      );
      finishProgressBar(progress, downloadedBytes, totalBytes, startedAt);
      await rename(tempPath, filePath);
    } catch (error) {
      progress.terminate();
      await rm(tempPath, { force: true });
      throw error;
    }
  }

  private async request(url: string, init: RequestInit, resourceDescription: string, redirectCount = 0): Promise<HttpResponse> {
    const response = await this.fetchRaw(url, init, redirectCount, true, resourceDescription);

    return {
      body: await response.text(),
      status: response.status,
      url: response.url,
    };
  }

  private async fetchRaw(
    url: string,
    init: RequestInit,
    redirectCount = 0,
    useTimeout = true,
    resourceDescription = url,
  ): Promise<Response> {
    if (redirectCount > 10) {
      throw new Error(`Too many redirects while fetching ${resourceDescription} (${redactUrl(url)}).`);
    }

    let retryDelayMs = INITIAL_RETRY_DELAY_MS;
    let lastError: unknown;

    for (let attempt = 1; attempt <= MAX_FETCH_ATTEMPTS; attempt += 1) {
      try {
        const response = await fetch(url, {
          ...init,
          redirect: 'manual',
          headers: {
            'user-agent': 'gizmoplex-downloader/1.0',
            accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            cookie: this.cookieHeader(),
            ...init.headers,
          },
          signal: useTimeout ? AbortSignal.timeout(this.timeout) : undefined,
        });

        this.storeCookies(response.headers);

        if (response.status >= 300 && response.status < 400) {
          const location = response.headers.get('location');

          if (!location) {
            throw new Error(`Redirect from ${redactUrl(url)} did not include a location while fetching ${resourceDescription}.`);
          }

          const nextUrl = new URL(location, url).toString();
          const preserveMethod = response.status === 307 || response.status === 308;

          return this.fetchRaw(nextUrl, preserveMethod ? init : { method: 'GET' }, redirectCount + 1, useTimeout, resourceDescription);
        }

        if (response.ok || response.status === 401) {
          return response;
        }

        if (!isRetryableStatus(response.status)) {
          throw new Error(`Request failed: ${response.status} ${response.statusText} while fetching ${resourceDescription} (${redactUrl(url)}).`);
        }

        lastError = new Error(`Request failed: ${response.status} ${response.statusText}`);
      } catch (error) {
        lastError = error;

        if (!isRetryableFetchError(error)) {
          throw new Error(`Request failed while fetching ${resourceDescription} (${redactUrl(url)}): ${errorMessage(error)}`);
        }
      }

      if (attempt < MAX_FETCH_ATTEMPTS) {
        console.error(`Fetch attempt ${attempt}/${MAX_FETCH_ATTEMPTS} failed for ${resourceDescription} (${redactUrl(url)}): ${errorMessage(lastError)}. Retrying in ${formatRetryDelay(retryDelayMs)}...`);
        await sleep(retryDelayMs);
        retryDelayMs *= 2;
      }
    }

    throw new Error(`Request failed after ${MAX_FETCH_ATTEMPTS} attempts while fetching ${resourceDescription} (${redactUrl(url)}): ${errorMessage(lastError)}`);
  }

  private cookieHeader(): string {
    return [...this.cookies.entries()].map(([name, value]) => `${name}=${value}`).join('; ');
  }

  private storeCookies(headers: Headers): void {
    for (const cookie of getSetCookies(headers)) {
      const [pair] = cookie.split(';', 1);
      const separatorIndex = pair.indexOf('=');

      if (separatorIndex <= 0) {
        continue;
      }

      this.cookies.set(pair.slice(0, separatorIndex), pair.slice(separatorIndex + 1));
    }
  }
}

type HttpResponse = {
  body: string;
  status: number;
  url: string;
};

class MetadataCache {
  private readonly videoCacheDir: string;

  constructor(private readonly outputRoot: string) {
    this.videoCacheDir = path.join(outputRoot, '.cache', 'videos');
  }

  async clear(): Promise<void> {
    await rm(path.join(this.outputRoot, '.cache'), { force: true, recursive: true });
  }

  async read(videoUrl: string): Promise<CachedVideoMetadata | undefined> {
    try {
      const raw = await readFile(this.cachePath(videoUrl), 'utf8');
      const parsed = JSON.parse(raw) as CachedVideoMetadata | LegacyCachedVideoMetadata;

      if (parsed.videoUrl !== videoUrl) {
        return undefined;
      }

      const migrated = migrateLegacyCachedVideoMetadata(parsed);

      if (!migrated.downloadLinks || !migrated.pageTitleCandidates) {
        return undefined;
      }

      if (isLegacyCachedVideoMetadata(parsed)) {
        await this.write(migrated);
      }

      return migrated;
    } catch (error) {
      if (isNodeError(error) && error.code === 'ENOENT') {
        return undefined;
      }

      throw new Error(`Could not read metadata cache for ${videoUrl}: ${errorMessage(error)}`);
    }
  }

  async write(metadata: CachedVideoMetadata): Promise<void> {
    await ensureDirectory(this.videoCacheDir);
    await writeFile(this.cachePath(metadata.videoUrl), `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');
  }

  private cachePath(videoUrl: string): string {
    return path.join(this.videoCacheDir, `${hashCacheKey(videoUrl)}.json`);
  }
}

function isLegacyCachedVideoMetadata(value: CachedVideoMetadata | LegacyCachedVideoMetadata): value is LegacyCachedVideoMetadata {
  return 'videoPage' in value;
}

function migrateLegacyCachedVideoMetadata(value: CachedVideoMetadata | LegacyCachedVideoMetadata): CachedVideoMetadata {
  if (!isLegacyCachedVideoMetadata(value)) {
    return value;
  }

  const html = value.videoPage?.body ?? '';
  const pageUrl = value.videoPage?.url ?? value.videoUrl;

  return {
    downloadLinks: html ? extractDownloadLinks(html, pageUrl) : [],
    fetchedAt: value.fetchedAt,
    pageTitleCandidates: html ? extractPageTitleCandidates(html) : {},
    pageUrl,
    videoUrl: value.videoUrl,
    vimeoConfig: value.vimeoConfig,
    vhxVideo: value.vhxVideo,
  };
}

function getSetCookies(headers: Headers): string[] {
  const withHelper = headers as Headers & { getSetCookie?: () => string[] };

  if (withHelper.getSetCookie) {
    return withHelper.getSetCookie();
  }

  const header = headers.get('set-cookie');

  return header ? header.split(/,(?=\s*[^;,=]+=[^;,]+)/) : [];
}

async function processArchive(client: HttpClient, transactions: Transaction[], options: Options): Promise<void> {
  const outputRoot = path.resolve(options.out);
  await ensureDirectory(outputRoot);
  const metadataCache = new MetadataCache(outputRoot);

  const output = options.dryRun ? console.log : console.error;
  const summary = createDownloadSummary();

  output('');
  output(options.dryRun ? 'Dry run archive plan:' : 'Archive downloads:');

  const videoQueue: Array<{ transaction: Transaction; videoUrl: string }> = [];

  for (const transaction of transactions) {
    const productPage = await client.get(transaction.url, undefined, `product page for ${transaction.description}`);
    const videoUrls = extractVideoUrls(productPage.body, productPage.url);
    const zipLinks = extractZipDownloadLinks(productPage.body, productPage.url);

    for (const zipLink of zipLinks) {
      const plannedZip: PlannedVideoDownload = {
        downloads: await planZipDownload(client, transaction, zipLink, outputRoot, options),
        transactionDescription: transaction.description,
        videoTitle: zipFilename(zipLink),
        videoUrl: zipLink.url,
      };

      for (const download of plannedZip.downloads) {
        addSummaryDownload(summary.required, download);
        addSummaryDownload(download.skip ? summary.alreadyDownloaded : summary.remaining, download);
      }

      printDownloadPlan(plannedZip.transactionDescription, plannedZip.videoTitle, plannedZip.videoUrl, plannedZip.downloads, options.dryRun);

      if (!options.dryRun) {
        await downloadPlannedVideos(client, [plannedZip], inProgressPath(outputRoot, options.inProgressPlan), undefined, false);
      }
    }

    if (videoUrls.length === 0 && zipLinks.length === 0) {
      output('');
      output(`${transaction.description}`);
      output('  No video pages found.');
      continue;
    }

    videoQueue.push(...videoUrls.map((videoUrl) => ({ transaction, videoUrl })));
  }

  let shouldDelayBeforeNextVideoPage = false;

  for (const [index, item] of videoQueue.entries()) {
    if (shouldDelayBeforeNextVideoPage && options.delay) {
      await waitRandomDelay(options.delay);
    }

    output('');
    output(`${index + 1} of ${videoQueue.length}`);

    const video = await fetchVideoMetadata(client, metadataCache, item.transaction, item.videoUrl);
    const downloads = await planVideoDownloads(client, item.transaction, {
      downloadLinks: video.downloadLinks,
      pageTitleCandidates: video.pageTitleCandidates,
      url: video.pageUrl,
    }, video.title, outputRoot, options, video.vhxVideo, video.vimeoConfig);
    const plannedVideo: PlannedVideoDownload = {
      downloads,
      transactionDescription: item.transaction.description,
      videoTitle: video.title,
      videoUrl: item.videoUrl,
    };
    shouldDelayBeforeNextVideoPage = downloads.some((download) => !download.skip);

    for (const download of downloads) {
      addSummaryDownload(summary.required, download);
      addSummaryDownload(download.skip ? summary.alreadyDownloaded : summary.remaining, download);
    }

    printDownloadPlan(plannedVideo.transactionDescription, plannedVideo.videoTitle, plannedVideo.videoUrl, plannedVideo.downloads, options.dryRun);

    if (!options.dryRun) {
      await downloadPlannedVideos(client, [plannedVideo], inProgressPath(outputRoot, options.inProgressPlan), options.delay, false);
    }
  }

  if (options.dryRun) {
    printDownloadSummary(summary, console.log);
  }
}

async function processInteractiveArchive(client: HttpClient, transactions: Transaction[], options: Options): Promise<void> {
  const outputRoot = path.resolve(options.out);
  await ensureDirectory(outputRoot);
  const metadataCache = new MetadataCache(outputRoot);

  const interactiveTransactions = await fetchInteractiveTransactions(client, transactions, outputRoot);
  const selectedItems = new Map<string, SelectedInteractiveItem>();

  while (true) {
    const selection = await selectTransaction(interactiveTransactions, selectedItems);

    if (selection.kind === 'confirm') {
      break;
    }

    await selectItemsForTransaction(client, metadataCache, selection.transaction, selectedItems, outputRoot, options);
  }

  const planned = await Promise.all([...selectedItems.values()].map(async (selected): Promise<PlannedVideoDownload> => {
    if (selected.item.kind === 'zip') {
      return {
        downloads: await planZipDownload(client, selected.transaction, selected.item.link, outputRoot, { ...options, dryRun: true }),
        transactionDescription: selected.transaction.description,
        videoTitle: zipFilename(selected.item.link),
        videoUrl: selected.item.link.url,
      };
    }

    if (!selected.page) {
      throw new Error(`Missing fetched metadata for ${selected.item.url}.`);
    }

    return {
      downloads: await planVideoDownloads(client, selected.transaction, {
        downloadLinks: selected.page.downloadLinks,
        pageTitleCandidates: selected.page.pageTitleCandidates,
        url: selected.page.url,
      }, selected.page.title, outputRoot, { ...options, dryRun: true }, selected.page.vhxVideo, selected.page.vimeoConfig),
      transactionDescription: selected.transaction.description,
      videoTitle: selected.page.title,
      videoUrl: selected.page.url,
    };
  }));
  const summary = createDownloadSummary();

  for (const item of planned) {
    for (const download of item.downloads) {
      addSummaryDownload(summary.required, download);
      addSummaryDownload(download.skip ? summary.alreadyDownloaded : summary.remaining, download);
    }
  }

  console.error('');
  console.error('Download summary for selected items:');
  printDownloadSummary(summary, console.error);

  const confirmedDownload = await confirm({
    message: 'Download selected files now?',
    default: false,
  }, { output: process.stderr });

  if (!confirmedDownload) {
    console.error('Download cancelled.');
    return;
  }

  await downloadPlannedVideos(client, planned, inProgressPath(outputRoot, options.inProgressPlan), options.delay, false);
}

async function selectItemsForTransaction(
  client: HttpClient,
  metadataCache: MetadataCache,
  interactiveTransaction: InteractiveTransaction,
  selectedItems: Map<string, SelectedInteractiveItem>,
  outputRoot: string,
  options: Options,
): Promise<void> {
  const { transaction } = interactiveTransaction;
  const videoUrls = interactiveTransaction.items.filter((item): item is Extract<InteractiveItem, { kind: 'video' }> => item.kind === 'video').map((item) => item.url);
  const videos = await fetchVideosForUrls(client, metadataCache, transaction, videoUrls);
  const fetchedVideos = new Map(videos.map((video) => [video.url, video]));
  const eligibleItems: SelectedInteractiveItem[] = [];

  for (const item of interactiveTransaction.items) {
    const existingSelection = selectedItems.get(item.id);

    if (existingSelection) {
      eligibleItems.push(existingSelection);
      continue;
    }

    if (item.kind === 'zip') {
      const downloads = await planZipDownload(client, transaction, item.link, outputRoot, options);

      if (!downloads.every((download) => download.skip)) {
        eligibleItems.push({ item, transaction });
      }
      continue;
    }

    const page = fetchedVideos.get(item.url);

    if (!page) {
      continue;
    }

    const downloads = await planVideoDownloads(client, transaction, {
      downloadLinks: page.downloadLinks,
      pageTitleCandidates: page.pageTitleCandidates,
      url: page.url,
    }, page.title, outputRoot, options, page.vhxVideo, page.vimeoConfig);

    if (!downloads.some((download) => download.kind === 'video' && download.skip)) {
      eligibleItems.push({ item, page, transaction });
    }
  }

  if (eligibleItems.length === 0) {
    console.error('No eligible downloadable items for this transaction.');
    return;
  }

  const selectedForTransaction = await selectDownloadableItems(eligibleItems, selectedItems);

  if (!selectedForTransaction) {
    return;
  }

  for (const [id, selected] of selectedItems) {
    if (selected.transaction.url === transaction.url) {
      selectedItems.delete(id);
    }
  }

  for (const selected of selectedForTransaction) {
    selectedItems.set(selected.item.id, selected);
  }
}

async function planVideoDownloads(
  client: HttpClient,
  transaction: Transaction,
  videoPage: VideoMetadataForPlanning,
  pageTitle: string,
  outputRoot: string,
  options: Options,
  providedVhxVideo?: VhxVideoResponse,
  providedVimeoConfig?: VimeoConfigResponse,
): Promise<PlannedDownload[]> {
  const links = [...videoPage.downloadLinks];
  const vhxVideo = providedVhxVideo;
  const vimeoConfig = providedVimeoConfig;
  links.push(...extractVhxSubtitleLinks(vhxVideo, selectedSubtitleFormats(options)));

  const selectedVideo = selectHighestResolutionVideo(links);
  const selectedSubtitles = selectSubtitleLinks(links, selectedSubtitleFormats(options));
  const selectedLinks = [
    ...(selectedVideo ? [selectedVideo] : []),
    ...selectedSubtitles,
  ];
  const productDir = path.join(outputRoot, sanitizePathComponent(transaction.description));
  const videoTitle = videoTitleForPath(vimeoConfigTitle(vimeoConfig) ?? vhxVideoTitle(vhxVideo) ?? pageTitleFromCandidates(videoPage.pageTitleCandidates, transaction.description) ?? pageTitle, transaction.description);
  await ensureDirectory(productDir);

  return Promise.all(selectedLinks.map(async (link) => {
    const extension = extensionForDownload(link);
    const filePath = path.join(productDir, `${sanitizePathComponent(videoTitle)}.${extension}`);
    const existingSize = await fileSize(filePath);
    const skip = existingSize !== undefined;

    return {
      extension,
      kind: link.kind === 'subtitle' ? 'subtitle' : 'video',
      label: link.label,
      path: filePath,
      sizeBytes: skip ? existingSize : options.dryRun ? await client.contentLength(link.url, `${link.kind} ${link.label || extension} for ${pageTitle}`) : undefined,
      skip,
      url: link.url,
    };
  }));
}

async function planZipDownload(
  client: HttpClient,
  transaction: Transaction,
  link: DownloadLink,
  outputRoot: string,
  options: Options,
): Promise<PlannedDownload[]> {
  const productDir = path.join(outputRoot, sanitizePathComponent(transaction.description));
  const filename = sanitizePathComponent(zipFilename(link));
  const filePath = path.join(productDir, filename.toLowerCase().endsWith('.zip') ? filename : `${filename}.zip`);
  const existingSize = await fileSize(filePath);

  await ensureDirectory(productDir);

  return [{
    extension: 'zip',
    kind: 'zip',
    label: link.label,
    path: filePath,
    sizeBytes: existingSize ?? (options.dryRun ? await client.contentLength(link.url, `ZIP ${filename}`) : undefined),
    skip: existingSize !== undefined,
    url: link.url,
  }];
}

async function downloadPlannedFiles(client: HttpClient, downloads: PlannedDownload[]): Promise<void> {
  for (const download of downloads) {
    if (download.skip) {
      continue;
    }

    if (await fileSize(download.path) !== undefined) {
      continue;
    }

    await client.downloadToFile(download.url, download.path, `${download.kind} ${download.label || download.extension}`);
  }
}

async function downloadPlannedVideos(
  client: HttpClient,
  planned: PlannedVideoDownload[],
  planPath: string,
  delay: DelayRange | undefined,
  deleteInProgressOnSuccess: boolean,
): Promise<void> {
  let shouldDelayBeforeNextVideoPage = false;

  await ensureDirectory(path.dirname(planPath));
  activeInProgress = { path: planPath, planned };

  try {
    for (const [index, item] of planned.entries()) {
      activeInProgress = { path: planPath, planned: planned.slice(index) };

      if (shouldDelayBeforeNextVideoPage && delay) {
        await waitRandomDelay(delay);
      }

      console.error('');
      console.error(`${index + 1} of ${planned.length}`);
      printDownloadPlan(item.transactionDescription, item.videoTitle, item.videoUrl, item.downloads, false);
      await downloadPlannedFiles(client, item.downloads);
      shouldDelayBeforeNextVideoPage = item.downloads.some((download) => !download.skip);
    }

    activeInProgress = undefined;

    if (deleteInProgressOnSuccess) {
      await deleteInProgressPlan(planPath);
    }
  } catch (error) {
    await saveInProgressPlan(planPath, activeInProgress?.planned ?? planned);
    activeInProgress = undefined;
    throw error;
  }
}

async function fetchInteractiveTransactions(
  client: HttpClient,
  transactions: Transaction[],
  outputRoot: string,
): Promise<InteractiveTransaction[]> {
  const results: InteractiveTransaction[] = [];

  console.error('Scanning transactions for download progress...');

  for (const transaction of transactions) {
    const productPage = await client.get(transaction.url, undefined, `product page for ${transaction.description}`);
    const videoUrls = transaction.description === 'VAULT PICKS HAVE MOVED: Read Description! (12mo)'
      ? []
      : extractVideoUrls(productPage.body, productPage.url);
    const zipLinks = extractZipDownloadLinks(productPage.body, productPage.url);
    const items: InteractiveItem[] = [
      ...videoUrls.map((url) => ({ id: `video:${transaction.url}:${url}`, kind: 'video' as const, url })),
      ...zipLinks.map((link) => ({ id: `zip:${transaction.url}:${link.url}`, kind: 'zip' as const, link })),
    ];

    results.push({
      alreadyDownloadedCount: await countDownloadedItems(outputRoot, transaction),
      items,
      transaction,
    });
  }

  return results;
}

async function selectTransaction(
  transactions: InteractiveTransaction[],
  selectedItems: Map<string, SelectedInteractiveItem>,
): Promise<TransactionMenuSelection> {
  if (transactions.length === 0) {
    throw new Error('No transactions found.');
  }

  return select<TransactionMenuSelection>({
    message: 'Select a transaction',
    pageSize: pageSize(),
    choices: [
      ...transactions.map((item) => ({
        name: `${item.transaction.date}  ${item.transaction.description} (${selectedItemCount(selectedItems, item.transaction)}/${item.alreadyDownloadedCount}/${item.items.length})`,
        value: { kind: 'transaction' as const, transaction: item },
        description: item.transaction.url,
      })),
      ...(selectedItems.size > 0 ? [{
        name: 'Confirm selected download?',
        value: { kind: 'confirm' as const },
        description: `${selectedItems.size} item(s) selected`,
      }] : []),
    ],
  }, { output: process.stderr });
}

async function fetchVideoMetadata(
  client: HttpClient,
  metadataCache: MetadataCache,
  transaction: Transaction,
  videoUrl: string,
): Promise<ResolvedVideoMetadata> {
  const cached = await metadataCache.read(videoUrl);

  if (cached) {
    return {
      ...cached,
      title: videoTitleFromSources(cached.vimeoConfig, cached.vhxVideo, cached.pageTitleCandidates, transaction.description, videoUrl),
    };
  }

  const videoPage = await client.get(videoUrl, undefined, `video page ${videoUrl} from ${transaction.description}`);
  const vhxVideo = await fetchVhxVideo(client, videoPage.body, `${videoUrl} from ${transaction.description}`);
  const vimeoMetadata = await fetchVimeoMetadata(client, videoPage.body, videoPage.url, `${videoUrl} from ${transaction.description}`);
  const metadata: CachedVideoMetadata = {
    downloadLinks: extractDownloadLinks(videoPage.body, videoPage.url),
    fetchedAt: new Date().toISOString(),
    pageTitleCandidates: extractPageTitleCandidates(videoPage.body),
    pageUrl: videoPage.url,
    videoUrl,
    vimeoConfig: vimeoMetadata?.config,
    vhxVideo,
  };

  await metadataCache.write(metadata);

  return {
    ...metadata,
    title: videoTitleFromSources(metadata.vimeoConfig, metadata.vhxVideo, metadata.pageTitleCandidates, transaction.description, videoUrl),
  };
}

async function fetchVideosForUrls(client: HttpClient, metadataCache: MetadataCache, transaction: Transaction, videoUrls: string[]): Promise<VideoPage[]> {
  const videos: VideoPage[] = [];

  console.error(`Found ${videoUrls.length} video page(s).`);

  for (const [index, videoUrl] of videoUrls.entries()) {
    replaceStderrLine(`Fetching title ${index + 1} of ${videoUrls.length}`);
    const metadata = await fetchVideoMetadata(client, metadataCache, transaction, videoUrl);

    videos.push({
      downloadLinks: metadata.downloadLinks,
      pageTitleCandidates: metadata.pageTitleCandidates,
      title: metadata.title,
      url: videoUrl,
      vimeoConfig: metadata.vimeoConfig,
      vhxVideo: metadata.vhxVideo,
    });
  }

  replaceStderrLine(`Fetched ${videoUrls.length} title(s)`);
  process.stderr.write('\n');

  return videos;
}

type DownloadableItemSelectionAction = 'all' | 'clear' | 'custom' | 'cancel';

async function selectDownloadableItems(
  items: SelectedInteractiveItem[],
  selectedItems: Map<string, SelectedInteractiveItem>,
): Promise<SelectedInteractiveItem[] | undefined> {
  console.error('');
  console.error('Downloadable items:');
  items.forEach((item, index) => {
    console.error(`${String(index + 1).padStart(3, ' ')}. ${displayDownloadableItem(item)}`);
  });

  while (true) {
    const action = await select<DownloadableItemSelectionAction>({
      message: 'Select items',
      choices: [
        { name: 'Select all', value: 'all' },
        { name: 'Clear all', value: 'clear' },
        { name: 'Choose items', value: 'custom' },
        { name: 'Cancel', value: 'cancel' },
      ],
    }, { output: process.stderr });

    if (action === 'cancel') {
      return undefined;
    }

    const selected = await selectedDownloadableItemsForAction(action, items, selectedItems);

    console.error('');
    console.error(selected.length === 0 ? 'No items selected.' : 'Selected items:');
    selected.forEach((item, index) => console.error(`${String(index + 1).padStart(3, ' ')}. ${displayDownloadableItem(item)}`));

    const confirmed = await confirm({
      message: 'Use this item selection?',
      default: true,
    }, { output: process.stderr });

    if (confirmed) {
      return selected;
    }
  }
}

async function selectedDownloadableItemsForAction(
  action: DownloadableItemSelectionAction,
  items: SelectedInteractiveItem[],
  selectedItems: Map<string, SelectedInteractiveItem>,
): Promise<SelectedInteractiveItem[]> {
  if (action === 'all') {
    return items;
  }

  if (action === 'clear' || action === 'cancel') {
    return [];
  }

  return checkbox({
    message: 'Choose items',
    pageSize: pageSize(),
    required: false,
    shortcuts: {
      all: 'a',
      invert: 'i',
    },
    choices: items.map((item) => ({
      name: displayDownloadableItem(item),
      value: item,
      description: item.item.kind === 'zip' ? item.item.link.url : item.item.url,
      checked: selectedItems.has(item.item.id),
    })),
  }, { output: process.stderr });
}

function displayDownloadableItem(item: SelectedInteractiveItem): string {
  if (item.item.kind === 'zip') {
    return `ZIP: ${zipFilename(item.item.link)}`;
  }

  return normalizeText(item.page?.title ?? '') || item.transaction.description;
}

function selectedItemCount(selectedItems: Map<string, SelectedInteractiveItem>, transaction: Transaction): number {
  return [...selectedItems.values()].filter((item) => item.transaction.url === transaction.url).length;
}

function pageSize(): number {
  return Math.max(8, Math.min(20, (process.stderr.rows ?? 24) - 6));
}

function replaceStderrLine(message: string): void {
  process.stderr.write(`\r\x1b[2K${message}`);
}

async function fetchVhxVideo(
  client: HttpClient,
  html: string,
  videoDescription: string,
): Promise<VhxVideoResponse | undefined> {
  const videoId = html.match(/window\.VHX\.video\s*=\s*\{[\s\S]*?\bid:\s*"([^"]+)"/)?.[1];
  const token = html.match(/\btoken:\s*"([^"]+)"/)?.[1];

  if (!videoId || !token) {
    return undefined;
  }

  const response = await client.getWithBearer(
    `https://api.vhx.tv/videos/${videoId}`,
    token,
    `VHX video metadata for ${videoDescription} (VHX video id ${videoId})`,
  );

  return JSON.parse(response.body) as VhxVideoResponse;
}

async function fetchVimeoConfig(
  client: HttpClient,
  html: string,
  pageUrl: string,
  videoDescription: string,
): Promise<VimeoConfigResponse | undefined> {
  return (await fetchVimeoMetadata(client, html, pageUrl, videoDescription))?.config;
}

async function fetchVimeoMetadata(
  client: HttpClient,
  html: string,
  pageUrl: string,
  videoDescription: string,
): Promise<VimeoMetadata | undefined> {
  const embedUrl = extractVhxEmbedUrl(html, pageUrl);

  if (!embedUrl) {
    return undefined;
  }

  const embedResponse = await client.getWithHeaders(embedUrl, {
    accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    referer: pageUrl,
  }, `VHX embed page for ${videoDescription}`);
  const configUrl = extractOttConfigUrl(embedResponse.body);

  if (!configUrl) {
    return {};
  }

  const configResponse = await client.getWithHeaders(configUrl, {
    accept: '*/*',
    origin: 'https://embed.vhx.tv',
    referer: 'https://embed.vhx.tv/',
  }, `Vimeo player config for ${videoDescription}`);

  return {
    config: JSON.parse(configResponse.body) as VimeoConfigResponse,
  };
}

function extractVhxEmbedUrl(html: string, pageUrl: string): string | undefined {
  const $ = cheerio.load(html);
  const src = $('iframe[src*="embed.vhx.tv"], iframe[src*="embed"]').first().attr('src');

  return src ? new URL(src, pageUrl).toString() : undefined;
}

function extractOttConfigUrl(html: string): string | undefined {
  const rawJson = html.match(/window\.OTTData\s*=\s*(\{[\s\S]*?\})\s*<\/script>/)?.[1];

  if (!rawJson) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(rawJson) as { config_url?: unknown };

    return typeof parsed.config_url === 'string' ? parsed.config_url : undefined;
  } catch {
    return undefined;
  }
}

function extractVhxSubtitleLinks(parsed: VhxVideoResponse | undefined, formats: Set<SubtitleFormat>): DownloadLink[] {
  if (!parsed) {
    return [];
  }

  const links: DownloadLink[] = [];

  for (const subtitle of parsed._embedded?.subtitles ?? []) {
    const url = subtitle._links?.self?.href;
    const type = parseSubtitleFormat(subtitle.type ?? url ?? '');

    if (url && type && formats.has(type)) {
      links.push({
        kind: 'subtitle',
        label: [subtitle.language, subtitle.type].filter(Boolean).join(' '),
        url,
      });
    }
  }

  for (const subtitle of parsed.tracks?.subtitles ?? []) {
    for (const [type, link] of Object.entries(subtitle._links ?? {})) {
      const format = parseSubtitleFormat(type);

      if (link.href && format && formats.has(format)) {
        links.push({
          kind: 'subtitle',
          label: [subtitle.label, type].filter(Boolean).join(' '),
          url: link.href,
        });
      }
    }
  }

  return dedupeLinks(links);
}

function vhxVideoTitle(parsed: VhxVideoResponse | undefined): string | undefined {
  const title = validTitleCandidate(parsed?.title);

  if (title) {
    return title;
  }

  const name = validTitleCandidate(parsed?.name);

  return name || undefined;
}

function videoTitleFromSources(
  vimeoConfig: VimeoConfigResponse | undefined,
  vhxVideo: VhxVideoResponse | undefined,
  pageTitleCandidates: PageTitleCandidates,
  productName: string,
  fallback: string,
): string {
  return (vimeoConfigTitle(vimeoConfig) ?? vhxVideoTitle(vhxVideo) ?? pageTitleFromCandidates(pageTitleCandidates, productName)) || fallback;
}

function vimeoConfigTitle(parsed: VimeoConfigResponse | undefined): string | undefined {
  const title = validTitleCandidate(parsed?.video?.title);

  if (title) {
    return title;
  }

  const fallbackTitle = validTitleCandidate(parsed?.title) ?? validTitleCandidate(parsed?.clip?.title);

  return fallbackTitle || undefined;
}

function validTitleCandidate(value: string | undefined): string | undefined {
  const title = normalizeText(value ?? '');

  if (!title || title.toLowerCase() === 'untitled') {
    return undefined;
  }

  return title;
}

function selectedSubtitleFormats(options: Options): Set<SubtitleFormat> {
  if (!options.srt && !options.vtt) {
    return new Set(['srt']);
  }

  return new Set([
    ...(options.srt ? ['srt' as const] : []),
    ...(options.vtt ? ['vtt' as const] : []),
  ]);
}

type VhxVideoResponse = {
  name?: string;
  title?: string;
  _embedded?: {
    subtitles?: Array<{
      _links?: {
        self?: {
          href?: string;
        };
      };
      language?: string;
      type?: string;
    }>;
  };
  tracks?: {
    subtitles?: Array<{
      _links?: Record<string, {
        href?: string;
      }>;
      label?: string;
    }>;
  };
};

type VimeoConfigResponse = {
  clip?: {
    title?: string;
  };
  title?: string;
  video?: {
    title?: string;
  };
};

function dedupeLinks(links: DownloadLink[]): DownloadLink[] {
  const seen = new Set<string>();

  return links.filter((link) => {
    if (seen.has(link.url)) {
      return false;
    }

    seen.add(link.url);
    return true;
  });
}

function extractPageTitle(html: string): string {
  const $ = cheerio.load(html);
  const title = $('meta[property="og:title"]').attr('content') ?? $('title').text();

  return normalizeText(title);
}

function extractPageTitleCandidates(html: string): PageTitleCandidates {
  const $ = cheerio.load(html);
  return {
    h1: normalizeText($('h1').first().text()),
    jsonLdTitle: extractJsonLdTitle($),
    ogVideoTitle: normalizeText($('meta[property="og:video:title"]').attr('content') ?? ''),
    pageTitle: extractPageTitle(html),
    siteName: normalizeText($('meta[property="og:site_name"]').attr('content') ?? ''),
    twitterTitle: normalizeText($('meta[name="twitter:title"]').attr('content') ?? ''),
  };
}

function pageTitleFromCandidates(pageTitleCandidates: PageTitleCandidates, productName: string): string {
  const siteName = pageTitleCandidates.siteName;
  const titleCandidates = [
    pageTitleCandidates.jsonLdTitle,
    pageTitleCandidates.ogVideoTitle,
    pageTitleCandidates.twitterTitle,
    pageTitleCandidates.h1,
    pageTitleCandidates.pageTitle,
  ];

  for (const candidate of titleCandidates) {
    const validCandidate = validTitleCandidate(candidate);

    if (!validCandidate) {
      continue;
    }

    const title = videoTitleForPath(validCandidate, productName, siteName);

    if (validTitleCandidate(title)) {
      return title;
    }
  }

  return '';
}

function extractJsonLdTitle($: cheerio.CheerioAPI): string | undefined {
  for (const element of $('script[type="application/ld+json"]').toArray()) {
    const raw = $(element).contents().text();

    try {
      const parsed = JSON.parse(raw) as unknown;
      const title = jsonLdName(parsed);

      if (title) {
        return title;
      }
    } catch {
      continue;
    }
  }

  return undefined;
}

function jsonLdName(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    return value.map(jsonLdName).find(Boolean);
  }

  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const object = value as Record<string, unknown>;

  if (typeof object.name === 'string') {
    return object.name;
  }

  return jsonLdName(object['@graph']);
}

function videoTitleForPath(pageTitle: string, productName: string, siteName?: string): string {
  const normalizedTitle = normalizeText(pageTitle);

  if (!normalizedTitle) {
    return '';
  }

  const withoutRawSuffixes = stripKnownTitleParts(normalizedTitle, [siteName, productName], ' - ');
  const sanitizedTitle = sanitizePathComponent(withoutRawSuffixes);
  const sanitizedProductName = sanitizePathComponent(productName);
  const sanitizedSiteName = siteName ? sanitizePathComponent(siteName) : undefined;
  const withoutSanitizedSuffixes = stripKnownTitleParts(sanitizedTitle, [sanitizedSiteName, sanitizedProductName], '-');

  if (withoutSanitizedSuffixes === sanitizedProductName || withoutSanitizedSuffixes === sanitizedSiteName) {
    return 'untitled';
  }

  return withoutSanitizedSuffixes;
}

function stripKnownTitleParts(title: string, parts: Array<string | undefined>, separator: string): string {
  let result = title;
  let changed = true;

  while (changed) {
    changed = false;

    for (const part of parts) {
      const normalizedPart = normalizeText(part ?? '');

      if (!normalizedPart) {
        continue;
      }

      const suffix = `${separator}${normalizedPart}`;

      if (result.endsWith(suffix)) {
        result = normalizeText(result.slice(0, -suffix.length));
        changed = true;
      }
    }
  }

  return result;
}

async function ensureDirectory(dirPath: string): Promise<void> {
  try {
    await mkdir(dirPath, { recursive: true });
  } catch (error) {
    throw new Error(`Could not create output directory ${dirPath}: ${errorMessage(error)}`);
  }
}

function inProgressPath(outputRoot: string, specifiedPath?: string): string {
  return specifiedPath ? path.resolve(specifiedPath) : path.join(outputRoot, '.in-progress');
}

async function readInProgressPlan(planPath: string): Promise<InProgressPlan | undefined> {
  try {
    const raw = await readFile(planPath, 'utf8');
    const parsed = JSON.parse(raw) as InProgressPlan;

    if (parsed.version !== 1 || !Array.isArray(parsed.planned)) {
      throw new Error('Unsupported .in-progress file format.');
    }

    return parsed;
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      return undefined;
    }

    throw new Error(`Could not read .in-progress: ${errorMessage(error)}`);
  }
}

async function saveInProgressPlan(planPath: string, planned: PlannedVideoDownload[]): Promise<void> {
  if (planned.length === 0) {
    return;
  }

  await ensureDirectory(path.dirname(planPath));
  await writeFile(planPath, serializeInProgressPlan(planned), 'utf8');
  console.error(`\nSaved current download plan to ${planPath}`);
}

function serializeInProgressPlan(planned: PlannedVideoDownload[]): string {
  const payload: InProgressPlan = {
    planned,
    savedAt: new Date().toISOString(),
    version: 1,
  };

  return `${JSON.stringify(payload, null, 2)}\n`;
}

function saveInProgressPlanSync(planPath: string, planned: PlannedVideoDownload[]): void {
  if (planned.length === 0) {
    return;
  }

  writeFileSync(planPath, serializeInProgressPlan(planned), 'utf8');
  console.error(`\nSaved current download plan to ${planPath}`);
}

async function deleteInProgressPlan(planPath: string): Promise<void> {
  await rm(planPath, { force: true });
}

async function offerInProgressPlan(client: HttpClient, options: Options): Promise<boolean> {
  if (options.dryRun) {
    return false;
  }

  const outputRoot = path.resolve(options.out);
  const planPath = inProgressPath(outputRoot, options.inProgressPlan);
  const plan = await readInProgressPlan(planPath);

  if (!plan) {
    return false;
  }

  const usePlan = await confirm({
    message: `Use saved .in-progress plan with ${plan.planned.length} video(s)?`,
    default: true,
  }, { output: process.stderr });

  if (!usePlan) {
    return false;
  }

  const summary = createDownloadSummary();

  for (const item of plan.planned) {
    for (const download of item.downloads) {
      addSummaryDownload(summary.required, download);
      addSummaryDownload(download.skip ? summary.alreadyDownloaded : summary.remaining, download);
    }
  }

  console.error('');
  console.error('Download summary for saved .in-progress plan:');
  printDownloadSummary(summary, console.error);
  await downloadPlannedVideos(client, plan.planned, planPath, options.delay, true);

  return true;
}

async function fileSize(filePath: string): Promise<number | undefined> {
  try {
    const result = await stat(filePath);

    if (!result.isFile()) {
      return undefined;
    }

    return result.size;
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      return undefined;
    }

    throw error;
  }
}

async function countDownloadedItems(outputRoot: string, transaction: Transaction): Promise<number> {
  const productDir = path.join(outputRoot, sanitizePathComponent(transaction.description));

  try {
    const entries = await readdir(productDir, { withFileTypes: true });

    return entries.filter((entry) => entry.isFile() && /\.(mp4|zip)$/i.test(entry.name)).length;
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      return 0;
    }

    throw error;
  }
}

function randomDelaySeconds({ max, min }: DelayRange): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function waitRandomDelay(delay: DelayRange): Promise<void> {
  const seconds = randomDelaySeconds(delay);

  console.error(`Waiting ${seconds}s before next video page...`);
  await sleep(seconds * 1000);
}

async function sleep(milliseconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function isRetryableStatus(status: number): boolean {
  return status >= 500 && status <= 599;
}

function isRetryableFetchError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return true;
  }

  return error.name === 'AbortError' ||
    error.name === 'TimeoutError' ||
    error.name === 'TypeError' ||
    isRetryableStatusCodeMessage(error.message);
}

function isRetryableStatusCodeMessage(message: string): boolean {
  return /\b5\d\d\b/.test(message);
}

function formatRetryDelay(milliseconds: number): string {
  return `${Math.round(milliseconds / 1000)}s`;
}

function hashCacheKey(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function parseContentLength(headers: Headers): number | undefined {
  const value = headers.get('content-length');

  if (!value) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function createDownloadProgressBar(resourceDescription: string, totalBytes: number | undefined): ProgressBar {
  return new ProgressBar(`  ${truncateProgressLabel(resourceDescription)} [:bar] :percent | :sizeDone/:sizeTotal | :speed/s | :timeStatus`, {
    complete: '=',
    incomplete: ' ',
    stream: process.stderr,
    total: totalBytes ?? 1,
    width: 24,
  });
}

function progressTickLength(progress: ProgressBar, chunkLength: number): number {
  return Math.max(0, Math.min(chunkLength, progress.total - progress.curr));
}

function progressTokens(downloadedBytes: number, totalBytes: number | undefined, startedAt: number): Record<string, string> {
  return {
    sizeDone: formatBytes(downloadedBytes),
    sizeTotal: totalBytes === undefined ? 'unknown' : formatBytes(totalBytes),
    speed: formatBytes(bytesPerSecond(downloadedBytes, startedAt)),
    timeStatus: progressTimeStatus(downloadedBytes, totalBytes, startedAt),
  };
}

function finishProgressBar(progress: ProgressBar, downloadedBytes: number, totalBytes: number | undefined, startedAt: number): void {
  if (!progress.complete) {
    progress.tick(progress.total - progress.curr, progressCompleteTokens(downloadedBytes, totalBytes, startedAt));
  }

  progress.terminate();
}

function bytesPerSecond(downloadedBytes: number, startedAt: number): number {
  const elapsedSeconds = Math.max(0.001, (Date.now() - startedAt) / 1000);

  return downloadedBytes / elapsedSeconds;
}

function progressTimeStatus(downloadedBytes: number, totalBytes: number | undefined, startedAt: number): string {
  if (totalBytes !== undefined && downloadedBytes >= totalBytes) {
    return `Time ${formatDuration(Date.now() - startedAt)}`;
  }

  if (totalBytes === undefined) {
    return 'ETA unknown';
  }

  const speed = bytesPerSecond(downloadedBytes, startedAt);

  if (speed <= 0) {
    return 'ETA unknown';
  }

  return `ETA ${formatDuration(((totalBytes - downloadedBytes) / speed) * 1000)}`;
}

function progressCompleteTokens(downloadedBytes: number, totalBytes: number | undefined, startedAt: number): Record<string, string> {
  return {
    ...progressTokens(downloadedBytes, totalBytes, startedAt),
    timeStatus: `Time ${formatDuration(Date.now() - startedAt)}`,
  };
}

function truncateProgressLabel(value: string): string {
  const normalized = normalizeText(value);

  return normalized.length <= 48 ? normalized : `${normalized.slice(0, 45)}...`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}

function extractPageError(html: string): string {
  const $ = cheerio.load(html);
  const candidates = [
    '.alert',
    '.error',
    '.errors',
    '[data-error]',
    '#error_explanation',
    '.signin-flow__error',
  ];

  const message = candidates
    .map((selector) => $(selector).first().text().replace(/\s+/g, ' ').trim())
    .find(Boolean);

  return message ? `Site message: ${message}` : 'No site error message was found on the returned login page.';
}

function extractRedirectUrl(body: string): string | undefined {
  try {
    const parsed = JSON.parse(body) as { redirect_url?: unknown };

    if (typeof parsed.redirect_url === 'string') {
      return new URL(parsed.redirect_url, LOGIN_URL).toString();
    }
  } catch {
    return undefined;
  }

  return undefined;
}

function extractApiTransactions(body: string): Transaction[] {
  const parsed = JSON.parse(body) as unknown;
  const rows = Array.isArray(parsed) ? parsed : [];

  return rows.map((row) => {
    const transaction = row as ApiTransaction;

    return {
      date: String(transaction.date ?? ''),
      description: String(transaction.product_name ?? ''),
      url: String(transaction.product_url ?? ''),
    };
  });
}

function printTransactions(transactions: Transaction[]): void {
  if (transactions.length === 0) {
    console.error('No transactions found.');
    return;
  }

  const rows = [
    ['Date', 'Description', 'URL'],
    ...transactions.map((transaction) => [transaction.date, transaction.description, transaction.url]),
  ];

  const widths = rows[0].map((_, columnIndex) => Math.max(...rows.map((row) => row[columnIndex].length)));

  for (const row of rows) {
    console.error(row.map((value, index) => value.padEnd(widths[index])).join('  '));
  }
}

function printDownloadPlan(
  productName: string,
  videoTitle: string,
  videoUrl: string,
  downloads: PlannedDownload[],
  dryRun: boolean,
): void {
  const output = dryRun ? console.log : console.error;

  output('');
  output(`${productName}`);
  output(`  ${videoTitle}`);
  output(`  ${videoUrl}`);

  if (downloads.length === 0) {
    output('    No selected downloads found.');
    return;
  }

  for (const download of downloads) {
    const verb = download.skip ? 'skip' : dryRun ? 'would download' : 'download';
    const label = download.label ? ` ${download.label}` : '';
    const size = dryRun ? ` (${formatBytes(download.sizeBytes)})` : '';
    output(`    ${verb.padEnd(14)} ${download.kind}${label}${size}`);
    if (dryRun) {
      output(`    source: ${download.url}`);
    }
    output(`    ${download.path}`);
  }
}

async function main(): Promise<void> {
  const options = normalizeOptions(program.opts<CliOptions>());

  if (options.showInProgressPlan) {
    const outputRoot = path.resolve(options.out);
    const planPath = inProgressPath(outputRoot, options.inProgressPlan);
    const plan = await readInProgressPlan(planPath);

    if (!plan) {
      throw new Error(`No saved .in-progress plan found at ${planPath}.`);
    }

    console.log(JSON.stringify(plan, null, 2));
    return;
  }

  if (options.clearCache) {
    await new MetadataCache(path.resolve(options.out)).clear();
  }

  const email = await readEmail();
  const userPassword = await readPassword();
  const client = await login(email, userPassword, options);
  const transactions = await fetchTransactions(client, options);

  if (await offerInProgressPlan(client, options)) {
    return;
  }

  if (options.interactive) {
    await processInteractiveArchive(client, transactions, options);
  } else {
    printTransactions(transactions);
    await processArchive(client, transactions, options);
  }
}

const appStartedAt = Date.now();

process.on('SIGINT', () => {
  if (activeInProgress) {
    saveInProgressPlanSync(activeInProgress.path, activeInProgress.planned);
    activeInProgress = undefined;
  }

  process.exit(130);
});

try {
  await main();
} catch (error) {
  if (activeInProgress) {
    await saveInProgressPlan(activeInProgress.path, activeInProgress.planned);
    activeInProgress = undefined;
  }

  console.error(errorMessage(error));
  process.exitCode = 1;
} finally {
  console.error(`Total time: ${formatDuration(Date.now() - appStartedAt)}`);
}
