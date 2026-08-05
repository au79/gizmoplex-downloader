import { describe, expect, it, vi } from 'vitest';
import { confirmSufficientDiskSpace, requiredDownloadBytes } from './storage.ts';

const item = (downloads: Array<{ expectedSizeBytes?: number; skip: boolean }>) => [{ downloads } as any];

describe('disk-space checks', () => {
  it('sums only unskipped downloads with known sizes', () => {
    expect(requiredDownloadBytes(item([{ expectedSizeBytes: 10, skip: false }, { expectedSizeBytes: 20, skip: true }, { expectedSizeBytes: 5, skip: false }]))).toBe(15);
  });

  it('returns unknown when an unskipped download has no known size', () => {
    expect(requiredDownloadBytes(item([{ expectedSizeBytes: 10, skip: false }, { skip: false }]))).toBeUndefined();
  });

  it('continues when available space is sufficient', async () => {
    const confirm = vi.fn();
    await expect(confirmSufficientDiskSpace('/archive', item([{ expectedSizeBytes: 10, skip: false }]), false, async () => ({ bavail: 2, bsize: 10 }), confirm as any)).resolves.toBe(true);
    expect(confirm).not.toHaveBeenCalled();
  });

  it('warns and asks before continuing when space is insufficient', async () => {
    const confirm = vi.fn().mockResolvedValue(false);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(confirmSufficientDiskSpace('/archive', item([{ expectedSizeBytes: 25, skip: false }]), false, async () => ({ bavail: 2, bsize: 10 }), confirm as any)).resolves.toBe(false);
    expect(error).toHaveBeenCalledWith(expect.stringContaining('Insufficient free space'));
    expect(confirm).toHaveBeenCalledWith({ message: 'Continue with the download anyway?', default: false }, expect.anything());
    error.mockRestore();
  });

  it('bypasses the insufficient-space prompt with yes', async () => {
    const confirm = vi.fn();
    await expect(confirmSufficientDiskSpace('/archive', item([{ expectedSizeBytes: 25, skip: false }]), true, async () => ({ bavail: 2, bsize: 10 }), confirm as any)).resolves.toBe(true);
    expect(confirm).not.toHaveBeenCalled();
  });

  it('does not check the filesystem when a required size is unknown', async () => {
    const getStats = vi.fn();
    await expect(confirmSufficientDiskSpace('/archive', item([{ skip: false }]), false, getStats, vi.fn() as any)).resolves.toBe(true);
    expect(getStats).not.toHaveBeenCalled();
  });
});
