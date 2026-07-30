import { describe, expect, it } from 'vitest';
import { assertDownloadedSize, isVerifiedDownload } from './download-verification.ts';

describe('download verification', () => {
  it('reuses files with matching or unavailable expected sizes', () => {
    expect(isVerifiedDownload(12, 12)).toBe(true);
    expect(isVerifiedDownload(12, undefined)).toBe(true);
    expect(isVerifiedDownload(undefined, 12)).toBe(false);
    expect(isVerifiedDownload(11, 12)).toBe(false);
  });

  it('accepts matching sizes and rejects truncated downloads', () => {
    expect(() => assertDownloadedSize('video', 12, 12)).not.toThrow();
    expect(() => assertDownloadedSize('video', undefined, 11)).not.toThrow();
    expect(() => assertDownloadedSize('video', 12, 11)).toThrow('expected 12 bytes, received 11 bytes');
  });
});
