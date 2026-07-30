import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { MetadataCache, migrateLegacyCachedVideoMetadata } from './metadata-cache.js';

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

async function cache(): Promise<MetadataCache> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'gizmo-cache-'));
  roots.push(root);
  return new MetadataCache(root, async (directory) => { await import('node:fs/promises').then(({ mkdir }) => mkdir(directory, { recursive: true })); }, (html) => ({ pageTitle: html.includes('<title>') ? 'Title' : '' }));
}

describe('metadata cache', () => {
  it('misses absent entries and round-trips valid metadata', async () => {
    const instance = await cache();
    const metadata = { downloadLinks: [], fetchedAt: 'now', pageTitleCandidates: {}, pageUrl: 'https://page', videoUrl: 'https://video' };
    await expect(instance.read(metadata.videoUrl)).resolves.toBeUndefined();
    await instance.write(metadata);
    await expect(instance.read(metadata.videoUrl)).resolves.toEqual(metadata);
  });

  it('ignores URL mismatches and clears cache data', async () => {
    const instance = await cache();
    const metadata = { downloadLinks: [], fetchedAt: 'now', pageTitleCandidates: {}, pageUrl: 'https://page', videoUrl: 'https://video' };
    await instance.write(metadata);
    await expect(instance.read('https://other')).resolves.toBeUndefined();
    const crypto = await import('node:crypto');
    const mismatchPath = path.join(roots[0], '.cache', 'videos', `${crypto.createHash('sha256').update('https://mismatch').digest('hex')}.json`);
    await writeFile(mismatchPath, JSON.stringify({ videoUrl: 'https://different', downloadLinks: [], pageTitleCandidates: {} }), 'utf8');
    await expect(instance.read('https://mismatch')).resolves.toBeUndefined();
    await instance.clear();
    await expect(instance.read(metadata.videoUrl)).resolves.toBeUndefined();
  });

  it('migrates legacy page data into current metadata', () => {
    const migrated = migrateLegacyCachedVideoMetadata({ fetchedAt: 'now', videoPage: { body: '<a href="movie.mp4">movie</a>', status: 200, url: 'https://page' }, videoUrl: 'https://video' }, () => ({ pageTitle: 'Movie' }));
    expect(migrated).toMatchObject({ pageUrl: 'https://page', videoUrl: 'https://video', pageTitleCandidates: { pageTitle: 'Movie' } });
    expect(migrated.downloadLinks).toHaveLength(1);
    expect(migrateLegacyCachedVideoMetadata({ fetchedAt: 'now', videoPage: undefined, videoUrl: 'https://video' }, () => ({ pageTitle: 'unused' }))).toMatchObject({ downloadLinks: [], pageUrl: 'https://video', pageTitleCandidates: {} });
  });

  it('migrates legacy data when reading from disk and rejects incomplete current data', async () => {
    const instance = await cache();
    const root = roots[0];
    const cacheDir = path.join(root, '.cache', 'videos');
    await import('node:fs/promises').then(({ mkdir }) => mkdir(cacheDir, { recursive: true }));
    const crypto = await import('node:crypto');
    const url = 'https://legacy-video';
    const name = crypto.createHash('sha256').update(url).digest('hex');
    await writeFile(path.join(cacheDir, `${name}.json`), JSON.stringify({ fetchedAt: 'now', videoPage: { body: '<title>Legacy</title>', status: 200, url: 'https://page' }, videoUrl: url }), 'utf8');
    await expect(instance.read(url)).resolves.toMatchObject({ videoUrl: url, pageUrl: 'https://page' });
    const incomplete = 'https://incomplete';
    const incompleteName = crypto.createHash('sha256').update(incomplete).digest('hex');
    await writeFile(path.join(cacheDir, `${incompleteName}.json`), JSON.stringify({ videoUrl: incomplete }), 'utf8');
    await expect(instance.read(incomplete)).resolves.toBeUndefined();
  });

  it('reports malformed cache data', async () => {
    const instance = await cache();
    const root = roots[0];
    const cacheDir = path.join(root, '.cache', 'videos');
    await import('node:fs/promises').then(({ mkdir }) => mkdir(cacheDir, { recursive: true }));
    const crypto = await import('node:crypto');
    const name = crypto.createHash('sha256').update('https://video').digest('hex');
    await writeFile(path.join(cacheDir, `${name}.json`), '{bad', 'utf8');
    await expect(instance.read('https://video')).rejects.toThrow('Could not read metadata cache');
    expect(await readFile(path.join(cacheDir, `${name}.json`), 'utf8')).toBe('{bad');
  });
});
