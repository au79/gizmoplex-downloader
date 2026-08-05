import { describe, expect, it } from 'vitest';
import { formatBytes, formatDuration, normalizeText, redactUrl, redactUrlsInText, sanitizePathComponent } from './format.ts';

describe('format helpers', () => {
  describe('text and paths', () => {
    it('normalizes whitespace and produces safe path components', () => {
      expect(normalizeText('  one\n two  ')).toBe('one two');
      expect(sanitizePathComponent('  A / B: C... ')).toBe('A-B-C');
      expect(sanitizePathComponent('...')).toBe('untitled');
    });
  });

  describe('sizes and durations', () => {
    it('formats known and unknown byte counts', () => {
      expect(formatBytes(undefined)).toBe('unknown size');
      expect(formatBytes(1024)).toBe('1.0 KB');
      expect(formatBytes(12 * 1024 * 1024)).toBe('12 MB');
    });

    it('formats durations with required seconds', () => {
      expect(formatDuration(52_001)).toBe('53s');
      expect(formatDuration(260_000)).toBe('04m20s');
      expect(formatDuration(3_860_000)).toBe('01h04m20s');
    });
  });

  describe('URLs', () => {
    it('removes signed query data, fragments, and URL credentials', () => {
      expect(redactUrl('https://user:password@example.test/file?X-Amz-Signature=secret&name=keep#fragment')).toBe('https://example.test/file');
      expect(redactUrl('not a url')).toBe('not a url');
      expect(redactUrlsInText('Download https://cdn.test/file?token=secret now')).toBe('Download https://cdn.test/file now');
    });
  });
});
