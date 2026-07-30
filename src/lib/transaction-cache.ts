import path from 'node:path';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { errorMessage, isNodeError } from './runtime.js';
import type { Transaction } from '../types.js';

const CACHE_FILENAME = 'transactions.json';

export class TransactionCache {
  private readonly cacheDir: string;

  constructor(private readonly outputRoot: string, private readonly ensureDirectory: (path: string) => Promise<void>) {
    this.cacheDir = path.join(outputRoot, '.cache', 'transactions');
  }

  async read(): Promise<Transaction[] | undefined> {
    try {
      const parsed = JSON.parse(await readFile(this.cachePath(), 'utf8')) as unknown;
      if (!Array.isArray(parsed) || !parsed.every(isTransaction)) return undefined;
      return parsed;
    } catch (error) {
      if (isNodeError(error) && error.code === 'ENOENT') return undefined;
      throw new Error(`Could not read transaction cache: ${errorMessage(error)}`);
    }
  }

  async write(transactions: Transaction[]): Promise<void> {
    await this.ensureDirectory(this.cacheDir);
    const temporaryPath = `${this.cachePath()}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(transactions, null, 2)}\n`, 'utf8');
    await rename(temporaryPath, this.cachePath());
  }

  private cachePath(): string {
    return path.join(this.cacheDir, CACHE_FILENAME);
  }
}

function isTransaction(value: unknown): value is Transaction {
  if (!value || typeof value !== 'object') return false;
  const transaction = value as Partial<Transaction>;
  return typeof transaction.date === 'string'
    && typeof transaction.description === 'string'
    && typeof transaction.url === 'string';
}
