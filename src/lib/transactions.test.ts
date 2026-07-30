import { describe, expect, it } from 'vitest';
import { extractApiTransactions, fetchTransactions } from './transactions.js';

describe('extractApiTransactions', () => {
  it('normalizes the API fields and ignores a non-array response', () => {
    expect(extractApiTransactions('[{"date":"2026-01-02","product_name":"Video","product_url":"https://example.test/v"}]')).toEqual([
      { date: '2026-01-02', description: 'Video', url: 'https://example.test/v' },
    ]);
    expect(extractApiTransactions('{"transactions":[]}')).toEqual([]);
    expect(extractApiTransactions('[{"date":null,"product_name":null,"product_url":null}]')).toEqual([{ date: '', description: '', url: '' }]);
    expect(() => extractApiTransactions('{bad json')).toThrow();
  });

  it('rejects an API response redirected to login', async () => {
    await expect(fetchTransactions({ get: async () => ({ body: '[]', url: 'https://www.gizmoplex.com/login' }) })).rejects.toThrow('redirected to login');
  });

  it('fetches and parses a valid API response', async () => {
    await expect(fetchTransactions({ get: async () => ({ body: '[]', url: 'https://www.gizmoplex.com/customer_settings/transactions' }) })).resolves.toEqual([]);
  });
});
