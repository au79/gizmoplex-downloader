import { isVerifiedDownload } from './download-verification.js';
import { formatBytes, formatDuration, normalizeText } from './format.js';
import type { DelayRange } from './options.js';
import ProgressBar from 'progress';
import path from 'node:path';
import type { PlannedDownload } from '../types.js';
import type { PlannedVideoDownload } from '../types.js';

export async function downloadPlannedFiles(
  client: { downloadToFile(url: string, filePath: string, description?: string): Promise<void> },
  downloads: PlannedDownload[],
  fileSize: (filePath: string) => Promise<number | undefined>,
): Promise<void> {
  for (const download of downloads) {
    if (isVerifiedDownload(await fileSize(download.path), download.expectedSizeBytes)) continue;
    await client.downloadToFile(download.url, download.path, `${download.kind} ${download.label || download.extension}`);
  }
}

export async function downloadPlannedVideos(
  client: { downloadToFile(url: string, filePath: string, description?: string): Promise<void> },
  planned: PlannedVideoDownload[],
  planPath: string,
  delay: DelayRange | undefined,
  deleteInProgressOnSuccess: boolean,
  dependencies: {
    ensureDirectory: (dirPath: string) => Promise<void>;
    fileSize: (filePath: string) => Promise<number | undefined>;
    printPlan: (item: PlannedVideoDownload) => void;
    waitDelay: (delay: DelayRange) => Promise<void>;
    deletePlan: (planPath: string) => Promise<void>;
    savePlan: (planPath: string, planned: PlannedVideoDownload[]) => Promise<void>;
    setActive: (active: { path: string; planned: PlannedVideoDownload[] } | undefined) => void;
  },
): Promise<void> {
  let shouldDelayBeforeNextVideoPage = false;
  let remaining = planned;
  await dependencies.ensureDirectory(path.dirname(planPath));
  dependencies.setActive({ path: planPath, planned });
  try {
    for (const [index, item] of planned.entries()) {
      remaining = planned.slice(index);
      dependencies.setActive({ path: planPath, planned: remaining });
      if (shouldDelayBeforeNextVideoPage && delay) await dependencies.waitDelay(delay);
      console.error('');
      console.error(`${index + 1} of ${planned.length}`);
      dependencies.printPlan(item);
      await downloadPlannedFiles(client, item.downloads, dependencies.fileSize);
      shouldDelayBeforeNextVideoPage = item.downloads.some((download) => !download.skip);
    }
    dependencies.setActive(undefined);
    if (deleteInProgressOnSuccess) await dependencies.deletePlan(planPath);
  } catch (error) {
    await dependencies.savePlan(planPath, remaining);
    dependencies.setActive(undefined);
    throw error;
  }
}

export function parseContentLength(headers: Headers): number | undefined {
  const value = headers.get('content-length');
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

export function createDownloadProgressBar(resourceDescription: string, totalBytes: number | undefined): ProgressBar {
  return new ProgressBar(`  ${truncateProgressLabel(resourceDescription)} [:bar] :percent | :sizeDone/:sizeTotal | :speed/s | :timeStatus`, {
    complete: '=', incomplete: ' ', stream: process.stderr, total: totalBytes ?? 1, width: 24,
  });
}

export function progressTickLength(progress: ProgressBar, chunkLength: number): number {
  return Math.max(0, Math.min(chunkLength, progress.total - progress.curr));
}

export function progressTokens(downloadedBytes: number, totalBytes: number | undefined, startedAt: number): Record<string, string> {
  return { sizeDone: formatBytes(downloadedBytes), sizeTotal: totalBytes === undefined ? 'unknown' : formatBytes(totalBytes), speed: formatBytes(bytesPerSecond(downloadedBytes, startedAt)), timeStatus: progressTimeStatus(downloadedBytes, totalBytes, startedAt) };
}

export function finishProgressBar(progress: ProgressBar, downloadedBytes: number, totalBytes: number | undefined, startedAt: number): void {
  if (!progress.complete) progress.tick(progress.total - progress.curr, progressCompleteTokens(downloadedBytes, totalBytes, startedAt));
  progress.terminate();
}

export function bytesPerSecond(downloadedBytes: number, startedAt: number): number {
  return downloadedBytes / Math.max(0.001, (Date.now() - startedAt) / 1000);
}

export function progressTimeStatus(downloadedBytes: number, totalBytes: number | undefined, startedAt: number): string {
  if (totalBytes !== undefined && downloadedBytes >= totalBytes) return `Time ${formatDuration(Date.now() - startedAt)}`;
  if (totalBytes === undefined) return 'ETA unknown';
  const speed = bytesPerSecond(downloadedBytes, startedAt);
  return speed <= 0 ? 'ETA unknown' : `ETA ${formatDuration(((totalBytes - downloadedBytes) / speed) * 1000)}`;
}

export function progressCompleteTokens(downloadedBytes: number, totalBytes: number | undefined, startedAt: number): Record<string, string> {
  return { ...progressTokens(downloadedBytes, totalBytes, startedAt), timeStatus: `Time ${formatDuration(Date.now() - startedAt)}` };
}

export function truncateProgressLabel(value: string): string {
  const normalized = normalizeText(value);
  return normalized.length <= 48 ? normalized : `${normalized.slice(0, 45)}...`;
}
