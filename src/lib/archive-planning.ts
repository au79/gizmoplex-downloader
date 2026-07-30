import { resolveDownloadPathCollisions } from './download-paths.js';
import { isVerifiedDownload } from './download-verification.js';
import { addSummaryDownload, createDownloadSummary } from './summary.js';
import { extensionForDownload, selectHighestResolutionVideo, selectSubtitleLinks, zipFilename } from './links.js';
import { sanitizePathComponent } from './format.js';
import { extractVhxSubtitleLinks, pageTitleFromCandidates, selectedSubtitleFormats, videoTitleForPath, vhxVideoTitle, vimeoConfigTitle } from './video-discovery.js';
import type { HttpClient } from './http-client.js';
import type { Options, PlannedDownload, PlannedVideoDownload, Transaction, VideoMetadataForPlanning, VhxVideoResponse, VimeoConfigResponse } from '../types.js';
import path from 'node:path';

export async function planVideoDownloads(
  client: Pick<HttpClient, 'contentLength'>,
  transaction: Transaction,
  videoPage: VideoMetadataForPlanning,
  pageTitle: string,
  outputRoot: string,
  options: Options,
  ensureDirectory: (dirPath: string) => Promise<void>,
  fileSize: (filePath: string) => Promise<number | undefined>,
  providedVhxVideo?: VhxVideoResponse,
  providedVimeoConfig?: VimeoConfigResponse,
): Promise<PlannedDownload[]> {
  const formats = selectedSubtitleFormats(options);
  const links = [...videoPage.downloadLinks, ...extractVhxSubtitleLinks(providedVhxVideo, formats)];
  const selectedVideo = selectHighestResolutionVideo(links);
  const selectedLinks = [...(selectedVideo ? [selectedVideo] : []), ...selectSubtitleLinks(links, formats)];
  const productDir = path.join(outputRoot, sanitizePathComponent(transaction.description));
  const videoTitle = videoTitleForPath(vimeoConfigTitle(providedVimeoConfig) ?? vhxVideoTitle(providedVhxVideo) ?? (pageTitleFromCandidates(videoPage.pageTitleCandidates, transaction.description) || pageTitle), transaction.description);
  await ensureDirectory(productDir);
  return Promise.all(selectedLinks.map(async (link) => {
    const extension = extensionForDownload(link);
    const filePath = path.join(productDir, `${sanitizePathComponent(videoTitle)}.${extension}`);
    const existingSize = await fileSize(filePath);
    const expectedSizeBytes = await client.contentLength(link.url, `${link.kind} ${link.label || extension} for ${pageTitle}`);
    return { expectedSizeBytes, extension, kind: link.kind === 'subtitle' ? 'subtitle' : 'video', label: link.label, path: filePath, sizeBytes: expectedSizeBytes ?? existingSize, skip: isVerifiedDownload(existingSize, expectedSizeBytes), url: link.url };
  }));
}

export async function planZipDownload(
  client: Pick<HttpClient, 'contentLength'>,
  transaction: Transaction,
  link: import('./links.js').DownloadLink,
  outputRoot: string,
  ensureDirectory: (dirPath: string) => Promise<void>,
  fileSize: (filePath: string) => Promise<number | undefined>,
): Promise<PlannedDownload[]> {
  const productDir = path.join(outputRoot, sanitizePathComponent(transaction.description));
  const filename = sanitizePathComponent(zipFilename(link));
  const filePath = path.join(productDir, filename.toLowerCase().endsWith('.zip') ? filename : `${filename}.zip`);
  const existingSize = await fileSize(filePath);
  const expectedSizeBytes = await client.contentLength(link.url, `ZIP ${filename}`);
  await ensureDirectory(productDir);
  return [{ expectedSizeBytes, extension: 'zip', kind: 'zip', label: link.label, path: filePath, sizeBytes: expectedSizeBytes ?? existingSize, skip: isVerifiedDownload(existingSize, expectedSizeBytes), url: link.url }];
}

export async function resolvePlannedDownloadPaths(planned: PlannedVideoDownload[], fileSize: (filePath: string) => Promise<number | undefined>): Promise<PlannedVideoDownload[]> {
  const resolvedDownloads = resolveDownloadPathCollisions(planned.flatMap((item) => item.downloads));
  let index = 0;
  return Promise.all(planned.map(async (item) => ({
    ...item,
    downloads: await Promise.all(item.downloads.map(async () => {
      const download = resolvedDownloads[index++];
      const existingSize = await fileSize(download.path);
      return { ...download, sizeBytes: download.expectedSizeBytes ?? existingSize, skip: isVerifiedDownload(existingSize, download.expectedSizeBytes) };
    })),
  })));
}

export function summaryForPlan(planned: PlannedVideoDownload[]) {
  const summary = createDownloadSummary();
  for (const item of planned) for (const download of item.downloads) {
    addSummaryDownload(summary.required, download);
    addSummaryDownload(download.skip ? summary.alreadyDownloaded : summary.remaining, download);
  }
  return summary;
}
