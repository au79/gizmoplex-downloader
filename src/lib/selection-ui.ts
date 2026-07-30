import { styleText } from 'node:util';
import { normalizeText } from './format.js';
import { zipFilename } from './links.js';
import type { SelectedInteractiveItem, Transaction } from '../types.js';

export function displayDownloadableItem(item: SelectedInteractiveItem): string { return item.item.kind === 'video' ? normalizeText(item.page?.title ?? '') || item.transaction.description : `ZIP: ${zipFilename(item.item.link)}`; }
export function displayDownloadableItemDescription(item: SelectedInteractiveItem): string { return item.item.kind === 'video' ? item.item.url : `Signed album download: ${zipFilename(item.item.link)}`; }
export function checkboxIndicator(selected: boolean): string { return selected ? styleText('green', '●') : '○'; }
export function selectedItemCount(selectedItems: Map<string, SelectedInteractiveItem>, transaction: Transaction): number { return [...selectedItems.values()].filter((selected) => selected.transaction.url === transaction.url).length; }
export function selectedTransactionCount(selectedItems: Map<string, SelectedInteractiveItem>): number { return new Set([...selectedItems.values()].map((selected) => selected.transaction.url)).size; }
export function printSelectedItemsByTransaction(selectedItems: Map<string, SelectedInteractiveItem>): void {
  const grouped = new Map<string, SelectedInteractiveItem[]>();
  for (const selected of selectedItems.values()) grouped.set(selected.transaction.description, [...(grouped.get(selected.transaction.description) ?? []), selected]);
  console.error('Selected items:');
  for (const [description, items] of grouped) {
    console.error(`  ${description}`);
    for (const item of items) console.error(`    ${checkboxIndicator(true)} ${displayDownloadableItem(item)}`);
  }
  console.error('');
}
export function pageSize(): number { return Math.max(8, Math.min(20, (process.stderr.rows ?? 24) - 6)); }
export function replaceStderrLine(message: string): void { process.stderr.write(`\r\x1b[2K${message}`); }
