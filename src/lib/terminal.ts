import { formatBytes, redactUrl } from './format.js';
import type { PlannedDownload, Transaction } from '../types.js';

export function printTransactions(transactions: Transaction[]): void {
  if (transactions.length === 0) { console.error('No transactions found.'); return; }
  const rows = [['Date', 'Description', 'URL'], ...transactions.map((transaction) => [transaction.date, transaction.description, redactUrl(transaction.url)])];
  const widths = rows[0].map((_, columnIndex) => Math.max(...rows.map((row) => row[columnIndex].length)));
  for (const row of rows) console.error(row.map((value, index) => value.padEnd(widths[index])).join('  '));
}
export function printDownloadPlan(productName: string, videoTitle: string, videoUrl: string, downloads: PlannedDownload[], dryRun: boolean): void {
  const output = dryRun ? console.log : console.error;
  output(''); output(productName); output(`  ${videoTitle}`); output(`  ${redactUrl(videoUrl)}`);
  if (downloads.length === 0) { output('    No selected downloads found.'); return; }
  for (const download of downloads) {
    const verb = download.skip ? 'skip' : dryRun ? 'would download' : 'download';
    const label = download.label ? ` ${download.label}` : '';
    const size = dryRun ? ` (${formatBytes(download.sizeBytes)})` : '';
    output(`    ${verb.padEnd(14)} ${download.kind}${label}${size}`);
    if (dryRun) output(`    source: ${redactUrl(download.url)}`);
    output(`    ${download.path}`);
  }
}
