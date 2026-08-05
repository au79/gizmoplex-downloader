import { confirm } from '@inquirer/prompts';
import { statfs } from 'node:fs/promises';
import { formatBytes } from './format.js';
import type { PlannedVideoDownload } from '../types.js';

type FileSystemStats = { bavail: number; bsize: number };

export function requiredDownloadBytes(planned: PlannedVideoDownload[]): number | undefined {
  let total = 0;

  for (const item of planned) {
    for (const download of item.downloads) {
      if (download.skip) continue;
      if (download.expectedSizeBytes === undefined) return undefined;
      total += download.expectedSizeBytes;
    }
  }

  return total;
}

export async function confirmSufficientDiskSpace(
  outputRoot: string,
  planned: PlannedVideoDownload[],
  yes: boolean,
  getFileSystemStats: (path: string) => Promise<FileSystemStats> = statfs,
  confirmContinue: typeof confirm = confirm,
): Promise<boolean> {
  const requiredBytes = requiredDownloadBytes(planned);
  if (requiredBytes === undefined) return true;

  const fileSystem = await getFileSystemStats(outputRoot);
  const availableBytes = fileSystem.bavail * fileSystem.bsize;
  if (availableBytes >= requiredBytes) return true;

  console.error(`Insufficient free space: ${formatBytes(availableBytes)} available, ${formatBytes(requiredBytes)} required for the planned download.`);
  if (yes) return true;
  return confirmContinue({ message: 'Continue with the download anyway?', default: false }, { output: process.stderr });
}
