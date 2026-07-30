import { describe, expect, it, vi } from 'vitest';
vi.mock('@inquirer/prompts', () => ({ checkbox: vi.fn(), confirm: vi.fn().mockResolvedValue(false), select: vi.fn() }));
import { countDownloadedItems, createInterruptHandler, ensureDirectory, fileSize, processArchive, runApplication } from './coordinator.js';
import { createResumeController } from './in-progress.js';
import { mkdir, writeFile } from 'node:fs/promises';
import { extractVideoUrls } from './links.js';

describe('archive coordinator', () => {
  it('completes an empty dry-run without transport work', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    await processArchive({} as any, [], { out: '/tmp/gizmo-coordinator', dryRun: true, clearCache: false, interactive: false, showInProgressPlan: false, srt: false, vtt: false, yes: false, timeout: 1000 } as any, createResumeController());
    expect(log).toHaveBeenCalledWith('Dry run archive plan:');
    log.mockRestore();
  });

  it('coordinates product discovery, ZIP planning, and dry-run rendering', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const client = { get: async () => ({ body: '<a href="bonus.zip">Bonus</a>', status: 200, url: 'https://product' }), contentLength: async () => 12, downloadToFile: vi.fn() };
    await processArchive(client, [{ date: '', description: 'Product', url: 'https://product' }], { out: '/tmp/gizmo-coordinator', dryRun: true, clearCache: false, interactive: false, showInProgressPlan: false, srt: false, vtt: false, yes: false, timeout: 1000 } as any, createResumeController());
    expect(log.mock.calls.some(([line]) => String(line).includes('source: https://product/bonus.zip'))).toBe(true);
    log.mockRestore();
  });

  it('runs an empty confirmed archive and reports filesystem state', async () => {
    await processArchive({} as any, [], { out: '/tmp/gizmo-coordinator', dryRun: false, clearCache: false, interactive: false, showInProgressPlan: false, srt: false, vtt: false, yes: true, timeout: 1000 } as any, createResumeController());
    expect(await fileSize('/tmp/gizmo-coordinator')).toBeUndefined();
    expect(await countDownloadedItems('/tmp/gizmo-coordinator', { date: '', description: 'Missing', url: 'https://missing' })).toBe(0);
    await mkdir('/tmp/gizmo-coordinator/Product', { recursive: true });
    await writeFile('/tmp/gizmo-coordinator/Product/episode.mp4', 'x');
    await writeFile('/tmp/gizmo-coordinator/Product/notes.txt', 'x');
    expect(await countDownloadedItems('/tmp/gizmo-coordinator', { date: '', description: 'Product', url: 'https://product' })).toBe(1);
    expect(await fileSize('/dev/null')).toBeUndefined();
    await expect(ensureDirectory('/dev/null/child')).rejects.toThrow('Could not create output directory');
    await expect(fileSize('/dev/null/missing')).rejects.toThrow();
    await expect(countDownloadedItems('/dev/null', { date: '', description: 'Broken', url: 'https://broken' })).rejects.toThrow();
  });

  it('shows a saved plan without prompting for credentials', async () => {
    const root = '/tmp/gizmo-coordinator-plan';
    await mkdir(root, { recursive: true });
    await writeFile(`${root}/.in-progress`, JSON.stringify({ version: 1, planned: [], savedAt: 'now' }), 'utf8');
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    await runApplication({ out: root, dryRun: false, clearCache: false, interactive: false, showInProgressPlan: true, srt: false, vtt: false, yes: false, timeout: 1000 } as any);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('"version": 1'));
    log.mockRestore();
  });

  it('reports a missing saved plan before starting the application', async () => {
    await expect(runApplication({ out: '/tmp/gizmo-coordinator-missing-plan', dryRun: false, clearCache: false, interactive: false, showInProgressPlan: true, srt: false, vtt: false, yes: false, timeout: 1000 } as any)).rejects.toThrow('No saved .in-progress plan found');
  });

  it('reports products that contain no downloadable pages', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    await processArchive({ get: async () => ({ body: '<p>No media</p>', status: 200, url: 'https://product' }) } as any, [{ date: '', description: 'Product', url: 'https://product' }], { out: '/tmp/gizmo-coordinator', dryRun: true, clearCache: false, interactive: false, showInProgressPlan: false, srt: false, vtt: false, yes: false, timeout: 1000 } as any, createResumeController());
    expect(log).toHaveBeenCalledWith('  No video pages found.');
    log.mockRestore();
  });

  it('persists the active plan before exiting on interruption', () => {
    const saveSync = vi.fn();
    const exit = vi.fn(() => { throw new Error('exit'); }) as unknown as (code: number) => never;
    expect(() => createInterruptHandler({ saveSync }, exit)()).toThrow('exit');
    expect(saveSync).toHaveBeenCalled();
    expect(exit).toHaveBeenCalledWith(130);
  });

  it('executes multiple planned ZIPs with the configured delay', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const downloadToFile = vi.fn().mockResolvedValue(undefined);
    const client = { get: async () => ({ body: '<a href="one.zip">One</a><a href="two.zip">Two</a>', status: 200, url: 'https://product' }), contentLength: async () => undefined, downloadToFile };
    await processArchive(client, [{ date: '', description: 'Product', url: 'https://product' }], { out: '/tmp/gizmo-coordinator', dryRun: false, clearCache: false, interactive: false, showInProgressPlan: false, srt: false, vtt: false, yes: true, delay: { min: 0, max: 0 }, timeout: 1000 } as any, createResumeController());
    expect(downloadToFile).toHaveBeenCalledTimes(2);
    expect(error.mock.calls.some(([line]) => String(line).includes('Waiting 0s'))).toBe(true);
    error.mockRestore();
  });

  it('queues and plans discovered video pages', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const client = {
      get: async (url: string) => url.includes('/products/')
        ? { body: '<a href="/videos/one">One</a>', status: 200, url: 'https://www.gizmoplex.com/products/p' }
        : { body: '<title>Episode</title><a href="movie.mp4">Movie</a>', status: 200, url: 'https://www.gizmoplex.com/videos/one' },
      contentLength: async () => 4,
      downloadToFile: vi.fn(),
    };
    expect(extractVideoUrls('<a href="/videos/one">One</a>', 'https://www.gizmoplex.com/products/p')).toEqual(['https://www.gizmoplex.com/videos/one']);
    await processArchive(client, [{ date: '', description: 'Product', url: 'https://www.gizmoplex.com/products/p' }], { out: '/tmp/gizmo-coordinator', dryRun: true, clearCache: false, interactive: false, showInProgressPlan: false, srt: false, vtt: false, yes: false, timeout: 1000 } as any, createResumeController());
    expect(log.mock.calls.length).toBeGreaterThan(0);
    log.mockRestore();
  });

  it('does not execute a planned archive when confirmation is declined', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const downloadToFile = vi.fn();
    await processArchive({ get: async () => ({ body: '<a href="one.zip">One</a>', status: 200, url: 'https://product' }), contentLength: async () => undefined, downloadToFile } as any, [{ date: '', description: 'Product', url: 'https://product' }], { out: '/tmp/gizmo-coordinator', dryRun: false, clearCache: false, interactive: false, showInProgressPlan: false, srt: false, vtt: false, yes: false, timeout: 1000 } as any, createResumeController());
    expect(downloadToFile).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith('Download cancelled.');
    error.mockRestore();
  });
});
