import { describe, expect, it } from 'vitest';
import { errorMessage, formatRetryDelay, isNodeError, isRetryableFetchError, isRetryableStatus, sleep } from './runtime.ts';

describe('runtime helpers', () => {
  it('formats errors and retry delays', () => {
    expect(errorMessage(new Error('nope'))).toBe('nope');
    expect(errorMessage('nope')).toBe('nope');
    expect(isNodeError(Object.assign(new Error('nope'), { code: 'ENOENT' }))).toBe(true);
    expect(isNodeError(new Error('nope'))).toBe(false);
    expect(formatRetryDelay(1500)).toBe('2s');
  });

  it('classifies retryable failures', () => {
    expect(isRetryableStatus(500)).toBe(true);
    expect(isRetryableStatus(400)).toBe(false);
    expect(isRetryableFetchError(new TypeError('network'))).toBe(true);
    expect(isRetryableFetchError(Object.assign(new Error('timeout'), { name: 'TimeoutError' }))).toBe(true);
    expect(isRetryableFetchError(new Error('HTTP 503'))).toBe(true);
    expect(isRetryableFetchError(new Error('bad request'))).toBe(false);
    expect(isRetryableFetchError('network')).toBe(true);
  });

  it('waits for the requested interval', async () => {
    await expect(sleep(0)).resolves.toBeUndefined();
  });
});
