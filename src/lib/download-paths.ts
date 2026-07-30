import { createHash } from 'node:crypto';
import path from 'node:path';

type DownloadPath = {
  path: string;
  url: string;
};

export function resolveDownloadPathCollisions<T extends DownloadPath>(downloads: readonly T[]): T[] {
  const sourceUrlsByPath = new Map<string, Set<string>>();

  for (const download of downloads) {
    const urls = sourceUrlsByPath.get(download.path) ?? new Set<string>();
    urls.add(download.url);
    sourceUrlsByPath.set(download.path, urls);
  }

  return downloads.map((download) => {
    if (sourceUrlsByPath.get(download.path)!.size < 2) {
      return download;
    }

    return { ...download, path: pathWithSourceUrlHash(download.path, download.url) };
  });
}

function pathWithSourceUrlHash(filePath: string, sourceUrl: string): string {
  const parsed = path.parse(filePath);
  const hash = createHash('sha256').update(sourceUrl).digest('hex').slice(0, 12);

  return path.join(parsed.dir, `${parsed.name}--${hash}${parsed.ext}`);
}
