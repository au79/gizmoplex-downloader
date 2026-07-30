import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { resolveDownloadPathCollisions } from './download-paths.ts';

describe('download path collisions', () => {
  it('adds exact-URL hashes to every distinct colliding asset', () => {
    const firstUrl = 'https://cdn.test/file.mp4?Signature=first';
    const secondUrl = 'https://cdn.test/file.mp4?Signature=second';
    const downloads = resolveDownloadPathCollisions([
      { path: '/archive/Title.mp4', url: firstUrl },
      { path: '/archive/Title.mp4', url: secondUrl },
    ]);

    expect(downloads.map((download) => download.path)).toEqual([
      `/archive/Title--${hash(firstUrl)}.mp4`,
      `/archive/Title--${hash(secondUrl)}.mp4`,
    ]);
  });

  it('keeps unique paths and repeated source URLs unchanged', () => {
    const url = 'https://cdn.test/file.mp4';
    const downloads = resolveDownloadPathCollisions([
      { path: '/archive/One.mp4', url },
      { path: '/archive/Two.mp4', url },
      { path: '/archive/One.mp4', url },
    ]);

    expect(downloads.map((download) => download.path)).toEqual([
      '/archive/One.mp4',
      '/archive/Two.mp4',
      '/archive/One.mp4',
    ]);
  });
});

function hash(url: string): string {
  return createHash('sha256').update(url).digest('hex').slice(0, 12);
}
