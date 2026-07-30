import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { TransactionCache } from './transaction-cache.js';

async function createCache(): Promise<{ cache: TransactionCache; root: string }> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'gizmo-transaction-cache-'));
  return {
    root,
    cache: new TransactionCache(root, async (directory) => mkdir(directory, { recursive: true })),
  };
}

describe('TransactionCache', () => {
  it('returns no value when the cache does not exist', async () => {
    const { cache, root } = await createCache();
    await expect(cache.read()).resolves.toBeUndefined();
    await rm(root, { recursive: true, force: true });
  });

  it('writes and reads distilled transactions', async () => {
    const { cache, root } = await createCache();
    const transactions = [{ date: '2026-01-02', description: 'Video', url: 'https://example.test/video' }];
    await cache.write(transactions);
    await expect(cache.read()).resolves.toEqual(transactions);
    await rm(root, { recursive: true, force: true });
  });

  it('ignores a cache with an invalid shape', async () => {
    const { cache, root } = await createCache();
    const cachePath = path.join(root, '.cache', 'transactions', 'transactions.json');
    await mkdir(path.dirname(cachePath), { recursive: true });
    await writeFile(cachePath, JSON.stringify([null]));
    await expect(cache.read()).resolves.toBeUndefined();
    await rm(root, { recursive: true, force: true });
  });

  it('reports malformed or unreadable cache files', async () => {
    const { cache, root } = await createCache();
    const cachePath = path.join(root, '.cache', 'transactions', 'transactions.json');
    await mkdir(path.dirname(cachePath), { recursive: true });
    await writeFile(cachePath, '{bad json');
    await expect(cache.read()).rejects.toThrow('Could not read transaction cache');
    await rm(cachePath);
    await mkdir(cachePath);
    await expect(cache.read()).rejects.toThrow('Could not read transaction cache');
    await rm(root, { recursive: true, force: true });
  });
});
