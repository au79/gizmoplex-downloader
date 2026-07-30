import { describe, expect, it, vi } from 'vitest';
import { printDownloadPlan, printTransactions } from './terminal.js';

describe('printDownloadPlan', () => {
  it('keeps dry-run output on stdout and includes the source', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    printDownloadPlan('Product', 'Episode', 'https://page', [{ extension: 'mp4', kind: 'video', label: '', path: '/tmp/x.mp4', sizeBytes: 12, skip: false, url: 'https://file' }], true);
    expect(log).toHaveBeenCalledWith('    source: https://file');
    log.mockRestore();
  });

  it('renders empty and non-empty transaction tables on stderr', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    printTransactions([]);
    printTransactions([{ date: '2026-01-01', description: 'Product', url: 'https://product' }]);
    expect(error).toHaveBeenCalledWith('No transactions found.');
    expect(error.mock.calls.some(([line]) => String(line).includes('Product'))).toBe(true);
    error.mockRestore();
  });

  it('renders empty plans and operational output on stderr', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    printDownloadPlan('Product', 'Episode', 'https://page', [], false);
    printDownloadPlan('Product', 'Episode', 'https://page', [{ extension: 'mp4', kind: 'video', label: 'HD', path: '/tmp/video.mp4', skip: true, url: 'https://file' }], false);
    expect(error.mock.calls.some(([line]) => String(line).includes('No selected downloads'))).toBe(true);
    expect(error.mock.calls.some(([line]) => String(line).includes('skip'))).toBe(true);
    error.mockRestore();
  });
});
