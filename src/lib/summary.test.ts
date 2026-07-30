import { describe, expect, it, vi } from 'vitest';
import { addSummaryDownload, createDownloadSummary, printDownloadSummary } from './summary.ts';

describe('download summaries', () => {
  describe('aggregation', () => {
    it('tracks file counts, skipped bytes, and unknown sizes', () => {
      const summary = createDownloadSummary();
      addSummaryDownload(summary.required, { extension: 'mp4', sizeBytes: 10, skip: false });
      addSummaryDownload(summary.required, { extension: 'zip', skip: false });
      addSummaryDownload(summary.required, { extension: 'txt', sizeBytes: 0, skip: false });
      addSummaryDownload(summary.alreadyDownloaded, { extension: 'vtt', sizeBytes: 5, skip: true });

      expect(summary.required).toMatchObject({ counts: { mp4: 1, zip: 1 }, sizeBytes: 10, unknownSizes: 1 });
      expect(summary.alreadyDownloaded).toMatchObject({ counts: { vtt: 1 }, sizeBytes: 5 });
    });
  });

  describe('columnar output', () => {
    it('prints an aligned table including ZIP counts', () => {
      const output = vi.fn();
      printDownloadSummary(createDownloadSummary(), output);

      expect(output).toHaveBeenCalledWith(expect.stringContaining('ZIP'));
      expect(output).toHaveBeenCalledWith(expect.stringContaining('Total required'));
    });
  });
});
