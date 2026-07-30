import { describe, expect, it, vi } from 'vitest';
import { createDownloadProgressBar, downloadPlannedFiles, downloadPlannedVideos, finishProgressBar, parseContentLength, progressCompleteTokens, progressTimeStatus, progressTokens, truncateProgressLabel } from './download-execution.js';

describe('download execution', () => {
  it('does not re-download a verified file', async () => {
    const downloadToFile = vi.fn();
    await downloadPlannedFiles({ downloadToFile }, [{ expectedSizeBytes: 1, extension: 'mp4', kind: 'video', label: '', path: '/tmp/a', sizeBytes: 1, skip: false, url: 'https://a' }], async () => 1);
    expect(downloadToFile).not.toHaveBeenCalled();
  });

  it('downloads missing files and formats progress helpers', async () => {
    const downloadToFile = vi.fn().mockResolvedValue(undefined);
    await downloadPlannedFiles({ downloadToFile }, [{ extension: 'mp4', kind: 'video', label: '', path: '/tmp/a', skip: false, url: 'https://a' }], async () => undefined);
    expect(downloadToFile).toHaveBeenCalledWith('https://a', '/tmp/a', 'video mp4');
    expect(parseContentLength(new Headers({ 'content-length': '10' }))).toBe(10);
    expect(parseContentLength(new Headers({ 'content-length': '0' }))).toBeUndefined();
    expect(parseContentLength(new Headers())).toBeUndefined();
    expect(progressTimeStatus(0, undefined, Date.now())).toBe('ETA unknown');
    expect(progressTokens(10, undefined, Date.now())).toMatchObject({ sizeTotal: 'unknown' });
    expect(progressTimeStatus(0, 100, Date.now() + 1000)).toBe('ETA unknown');
    expect(progressTimeStatus(50, 100, Date.now())).toContain('ETA');
    expect(progressCompleteTokens(10, 10, Date.now())).toMatchObject({ timeStatus: expect.stringContaining('Time') });
    expect(truncateProgressLabel('a'.repeat(60))).toHaveLength(48);
    const progress = { complete: false, curr: 0, total: 1, tick: vi.fn(), terminate: vi.fn() } as any;
    finishProgressBar(progress, 1, 1, Date.now());
    expect(progress.tick).toHaveBeenCalled();
  });

  it('can create a progress bar for unknown lengths', () => {
    const progress = createDownloadProgressBar('resource', undefined);
    expect(progress.total).toBe(1);
    progress.terminate();
  });

  it('sequences planned videos, delays, and cleans up successful plans', async () => {
    const delayed: number[] = [];
    const deleted = vi.fn();
    const active = vi.fn();
    const downloadToFile = vi.fn().mockResolvedValue(undefined);
    const planned = [
      { downloads: [{ extension: 'mp4', kind: 'video' as const, label: '', path: '/tmp/a', skip: false, url: 'https://a' }], transactionDescription: 'Product', videoTitle: 'A', videoUrl: 'https://page/a' },
      { downloads: [{ extension: 'mp4', kind: 'video' as const, label: '', path: '/tmp/b', skip: true, url: 'https://b' }], transactionDescription: 'Product', videoTitle: 'B', videoUrl: 'https://page/b' },
    ];
    await downloadPlannedVideos({ downloadToFile }, planned, '/tmp/plan', { min: 1, max: 1 }, true, { ensureDirectory: async () => undefined, fileSize: async () => undefined, printPlan: () => undefined, waitDelay: async (delay) => delayed.push(delay.min), deletePlan: deleted, savePlan: vi.fn(), setActive: active });
    expect(delayed).toEqual([1]);
    expect(deleted).toHaveBeenCalledWith('/tmp/plan');
    expect(active).toHaveBeenLastCalledWith(undefined);
  });

  it('retains failed plans', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    await expect(downloadPlannedVideos({ downloadToFile: vi.fn().mockRejectedValue(new Error('download failed')) }, [{ downloads: [{ extension: 'mp4', kind: 'video', label: '', path: '/tmp/a', skip: false, url: 'https://a' }], transactionDescription: 'Product', videoTitle: 'A', videoUrl: 'https://page/a' }], '/tmp/plan', undefined, false, { ensureDirectory: async () => undefined, fileSize: async () => undefined, printPlan: () => undefined, waitDelay: async () => undefined, deletePlan: vi.fn(), savePlan: save, setActive: vi.fn() })).rejects.toThrow('download failed');
    expect(save).toHaveBeenCalledWith('/tmp/plan', expect.any(Array));
  });
});
