import { describe, expect, it } from 'vitest';
import { parseOptionalDelayRange, parsePositiveInteger } from './options.ts';

describe('option parsing', () => {
  describe('positive integers', () => {
    it('accepts positive values and rejects invalid values', () => {
      expect(parsePositiveInteger('42')).toBe(42);
      expect(() => parsePositiveInteger('0')).toThrow('positive integer');
      expect(() => parsePositiveInteger('nope')).toThrow('positive integer');
    });
  });

  describe('delay ranges', () => {
    it('uses the dry-run default and supports explicit opt-out', () => {
      expect(parseOptionalDelayRange(undefined, true)).toEqual({ min: 1, max: 10 });
      expect(parseOptionalDelayRange(undefined, false)).toBeUndefined();
      expect(parseOptionalDelayRange('', true)).toBeUndefined();
    });

    it('validates ordered positive ranges', () => {
      expect(parseOptionalDelayRange('3-9', false)).toEqual({ min: 3, max: 9 });
      expect(() => parseOptionalDelayRange('9-3', false)).toThrow('min to be <= max');
      expect(() => parseOptionalDelayRange('0-3', false)).toThrow('delay range');
    });
  });
});
