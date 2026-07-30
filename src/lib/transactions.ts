import type { ApiTransaction, Transaction } from '../types.js';

export const TRANSACTIONS_URL = 'https://www.gizmoplex.com/settings/manage/transactions';
export const TRANSACTIONS_API_URL = 'https://www.gizmoplex.com/customer_settings/transactions';

/** Converts the intentionally small transactions API payload into app data. */
export function extractApiTransactions(body: string): Transaction[] {
  const parsed = JSON.parse(body) as unknown;
  const rows = Array.isArray(parsed) ? parsed : [];

  return rows.map((row) => {
    const transaction = row as ApiTransaction;
    return {
      date: String(transaction.date ?? ''),
      description: String(transaction.product_name ?? ''),
      url: String(transaction.product_url ?? ''),
    };
  });
}

export async function fetchTransactions(client: { get(url: string, accept?: string, resourceDescription?: string): Promise<{ body: string; url: string }> }): Promise<Transaction[]> {
  const response = await client.get(TRANSACTIONS_API_URL, 'application/json', 'Gizmoplex transactions API');
  if (new URL(response.url).pathname.includes('/login')) throw new Error('Transactions API redirected to login.');
  return extractApiTransactions(response.body);
}
