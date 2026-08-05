import { checkbox, confirm, select } from '@inquirer/prompts';
import { mkdir, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { extractVideoUrls, extractZipDownloadLinks, zipFilename } from './links.js';
import { redactUrl, sanitizePathComponent } from './format.js';
import { checkboxIndicator, displayDownloadableItem, displayDownloadableItemDescription, pageSize, printSelectedItemsByTransaction, replaceStderrLine, selectedItemCount, selectedTransactionCount } from './selection-ui.js';
import type { HttpClient } from './http-client.js';
import type { MetadataCache } from './metadata-cache.js';
import type { Options, InteractiveItem, InteractiveTransaction, SelectedInteractiveItem, Transaction, TransactionMenuSelection, VideoPage, PlannedVideoDownload } from '../types.js';

export type InteractivePrompts = {
  checkbox: (config: unknown, context: { output: NodeJS.WritableStream }) => Promise<SelectedInteractiveItem[]>;
  select: (config: unknown, context: { output: NodeJS.WritableStream }) => Promise<any>;
};

const defaultPrompts: InteractivePrompts = { checkbox: checkbox as unknown as InteractivePrompts['checkbox'], select: select as unknown as InteractivePrompts['select'] };

export async function fetchInteractiveTransactions(client: Pick<HttpClient, 'get'>, transactions: Transaction[], outputRoot: string, countDownloadedItems: (root: string, transaction: Transaction) => Promise<number>): Promise<InteractiveTransaction[]> {
  const results: InteractiveTransaction[] = [];
  console.error('Scanning transactions for download progress...');
  for (const transaction of transactions) {
    const productPage = await client.get(transaction.url, undefined, `product page for ${transaction.description}`);
    const videoUrls = transaction.description === 'VAULT PICKS HAVE MOVED: Read Description! (12mo)' ? [] : extractVideoUrls(productPage.body, productPage.url);
    const zipLinks = extractZipDownloadLinks(productPage.body, productPage.url);
    results.push({ alreadyDownloadedCount: await countDownloadedItems(outputRoot, transaction), items: [...videoUrls.map((url) => ({ id: `video:${transaction.url}:${url}`, kind: 'video' as const, url })), ...zipLinks.map((link) => ({ id: `zip:${transaction.url}:${link.url}`, kind: 'zip' as const, link }))], transaction });
  }
  return results;
}

export async function selectTransaction(transactions: InteractiveTransaction[], selectedItems: Map<string, SelectedInteractiveItem>, prompts: InteractivePrompts = defaultPrompts): Promise<TransactionMenuSelection> {
  if (transactions.length === 0) throw new Error('No transactions found.');
  return prompts.select({ message: 'Select a transaction', pageSize: pageSize(), choices: [...transactions.map((item) => ({ name: `${item.transaction.date}  ${item.transaction.description} (selected: ${selectedItemCount(selectedItems, item.transaction)}, downloaded: ${item.alreadyDownloadedCount}/${item.items.length})`, value: { kind: 'transaction' as const, transaction: item }, description: redactUrl(item.transaction.url) })), ...(selectedItems.size > 0 ? [{ name: `Review and download selected items (${selectedItems.size})`, value: { kind: 'confirm' as const }, description: `${selectedItems.size} item(s) selected` }] : [])] }, { output: process.stderr });
}

export async function selectDownloadableItems(items: SelectedInteractiveItem[], selectedItems: Map<string, SelectedInteractiveItem>, hiddenDownloadedCount: number, prompts: InteractivePrompts = defaultPrompts): Promise<SelectedInteractiveItem[] | undefined> {
  console.error('');
  console.error('Downloadable items:');
  if (hiddenDownloadedCount > 0) console.error(`Downloaded (hidden): ${hiddenDownloadedCount}`);
  items.forEach((item) => console.error(`${checkboxIndicator(selectedItems.has(item.item.id))} ${displayDownloadableItem(item)}`));
  console.error(`Basket: ${selectedItems.size} item(s) across ${selectedTransactionCount(selectedItems)} transaction(s)`);
  console.error('Clear this transaction: deselect every item, or choose the clear action after editing.');
  const selected = await prompts.checkbox({ message: 'Choose items', pageSize: pageSize(), required: false, shortcuts: { all: 'a', invert: 'i' }, choices: items.map((item) => ({ name: displayDownloadableItem(item), value: item, description: displayDownloadableItemDescription(item), checked: selectedItems.has(item.item.id) })) }, { output: process.stderr });
  const action = await prompts.select({ message: 'Apply item changes', choices: [{ name: 'Save this transaction selection', value: 'save' }, { name: 'Clear this transaction', value: 'clear' }, { name: 'Back without changes', value: 'back' }] }, { output: process.stderr });
  if (action === 'back') return undefined;
  return action === 'clear' ? [] : selected;
}

export async function selectItemsForTransaction(
  client: HttpClient,
  metadataCache: MetadataCache,
  interactiveTransaction: InteractiveTransaction,
  selectedItems: Map<string, SelectedInteractiveItem>,
  outputRoot: string,
  options: Options,
  dependencies: {
    fetchVideos: (client: HttpClient, cache: MetadataCache, transaction: Transaction, urls: string[], replaceLine: (message: string) => void) => Promise<VideoPage[]>;
    planVideo: (client: HttpClient, transaction: Transaction, page: VideoPage, outputRoot: string, options: Options) => Promise<unknown[]>;
    planZip: (client: HttpClient, transaction: Transaction, link: import('./links.js').DownloadLink, outputRoot: string) => Promise<unknown[]>;
  },
  prompts: InteractivePrompts = defaultPrompts,
): Promise<void> {
  const { transaction } = interactiveTransaction;
  const videoItems = interactiveTransaction.items.filter((item): item is Extract<InteractiveItem, { kind: 'video' }> => item.kind === 'video');
  const videos = await dependencies.fetchVideos(client, metadataCache, transaction, videoItems.map((item) => item.url), replaceStderrLine);
  const fetchedVideos = new Map(videos.map((video) => [video.url, video]));
  const eligibleItems: SelectedInteractiveItem[] = [];
  for (const item of interactiveTransaction.items) {
    const existing = selectedItems.get(item.id);
    if (existing) { eligibleItems.push(existing); continue; }
    if (item.kind === 'zip') {
      const downloads = await dependencies.planZip(client, transaction, item.link, outputRoot);
      if (!downloads.every((download: any) => download.skip)) eligibleItems.push({ item, transaction });
      continue;
    }
    const page = fetchedVideos.get(item.url);
    if (!page) continue;
    const downloads = await dependencies.planVideo(client, transaction, page, outputRoot, options);
    if (!downloads.some((download: any) => download.kind === 'video' && download.skip)) eligibleItems.push({ item, page, transaction });
  }
  if (eligibleItems.length === 0) { console.error('No eligible downloadable items for this transaction.'); return; }
  const selected = await selectDownloadableItems(eligibleItems, selectedItems, interactiveTransaction.alreadyDownloadedCount, prompts);
  if (!selected) return;
  for (const [id, item] of selectedItems) if (item.transaction.url === transaction.url) selectedItems.delete(id);
  for (const item of selected) selectedItems.set(item.item.id, item);
}

export function displaySelectedItems(selectedItems: Map<string, SelectedInteractiveItem>): void { printSelectedItemsByTransaction(selectedItems); }
