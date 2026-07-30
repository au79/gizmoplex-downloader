import { describe, expect, it, vi } from 'vitest';
import { checkboxIndicator, displayDownloadableItem, displayDownloadableItemDescription, pageSize, printSelectedItemsByTransaction, replaceStderrLine, selectedItemCount, selectedTransactionCount } from './selection-ui.js';
import { displaySelectedItems, fetchInteractiveTransactions, selectDownloadableItems, selectItemsForTransaction, selectTransaction } from './interactive-ui.js';

describe('selection UI', () => {
  it('uses a resolved video title and counts distinct transactions', () => {
    const selected = { item: { id: 'v', kind: 'video' as const, url: 'https://video' }, page: { downloadLinks: [], pageTitleCandidates: {}, title: 'Episode', url: 'https://video' }, transaction: { date: '', description: 'Product', url: 'https://product' } };
    expect(displayDownloadableItem(selected)).toBe('Episode');
    expect(selectedTransactionCount(new Map([['v', selected]]))).toBe(1);
  });

  it('discovers video and ZIP items without requiring a terminal', async () => {
    const transactions = await fetchInteractiveTransactions({ get: async () => ({ body: '<a href="/videos/one">one</a><a href="bonus.zip">zip</a>', url: 'https://www.gizmoplex.com/products/p' }) }, [{ date: '', description: 'Product', url: 'https://www.gizmoplex.com/products/p' }], '/tmp/archive', async () => 2);
    expect(transactions[0]).toMatchObject({ alreadyDownloadedCount: 2, items: [{ kind: 'video' }, { kind: 'zip' }] });
    await expect(fetchInteractiveTransactions({ get: async () => ({ body: '<a href="bonus.zip">zip</a>', url: 'https://page' }) }, [{ date: '', description: 'VAULT PICKS HAVE MOVED: Read Description! (12mo)', url: 'https://product' }], '/tmp/archive', async () => 0)).resolves.toMatchObject({ 0: { items: [{ kind: 'zip' }] } });
  });

  it('supports injectable prompts and cancellation', async () => {
    const selected = await selectDownloadableItems([], new Map(), 0, { checkbox: async () => [], select: async () => 'back' });
    expect(selected).toBeUndefined();
    await expect(selectDownloadableItems([], new Map(), 1, { checkbox: async () => [], select: async () => 'clear' })).resolves.toEqual([]);
  });

  it('renders ZIP selections and grouped summaries', () => {
    const zip = { item: { id: 'z', kind: 'zip' as const, link: { kind: 'zip', label: 'Bonus', url: 'https://zip' } }, transaction: { date: '', description: 'Product', url: 'https://product' } };
    const selected = new Map([['z', zip]]);
    expect(displayDownloadableItem(zip)).toBe('ZIP: Bonus');
    expect(displayDownloadableItemDescription(zip)).toContain('Signed album');
    expect(selectedItemCount(selected, zip.transaction)).toBe(1);
    expect(checkboxIndicator(true)).toContain('●');
    expect(checkboxIndicator(false)).toBe('○');
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    printSelectedItemsByTransaction(selected);
    displaySelectedItems(selected);
    expect(error).toHaveBeenCalledWith('  Product');
    error.mockRestore();
    expect(pageSize()).toBeGreaterThanOrEqual(8);
    const write = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    replaceStderrLine('status');
    expect(write).toHaveBeenCalled();
    write.mockRestore();
  });

  it('supports transaction selection and item replacement with injected prompts', async () => {
    await expect(selectTransaction([], new Map())).rejects.toThrow('No transactions');
    const transaction = { date: '', description: 'Product', url: 'https://product' };
    const item = { id: 'v', kind: 'video' as const, url: 'https://video' };
    const page = { downloadLinks: [], pageTitleCandidates: {}, title: 'Episode', url: 'https://video' };
    const selectedItems = new Map<string, any>([['old', { item, page, transaction }]]);
    const selected = await selectTransaction([{ alreadyDownloadedCount: 0, items: [item], transaction }], selectedItems, { checkbox: async () => [], select: async () => ({ kind: 'confirm' }) });
    expect(selected).toEqual({ kind: 'confirm' });
    await expect(selectTransaction([{ alreadyDownloadedCount: 0, items: [item], transaction }], new Map(), { checkbox: async () => [], select: async () => ({ kind: 'transaction' }) })).resolves.toEqual({ kind: 'transaction' });
    await selectItemsForTransaction({} as any, {} as any, { alreadyDownloadedCount: 0, items: [item], transaction }, selectedItems, '/tmp/archive', {} as any, {
      fetchVideos: async () => [page],
      planVideo: async () => [{ kind: 'video', skip: false }],
      planZip: async () => [],
    }, { checkbox: async (config: any) => [config.choices[0].value], select: async () => 'save' });
    expect(selectedItems.has('v')).toBe(true);
    const zipItem = { id: 'z', kind: 'zip' as const, link: { kind: 'zip', label: 'Bonus', url: 'https://zip' } };
    const zipSelected = new Map<string, any>();
    await selectItemsForTransaction({} as any, {} as any, { alreadyDownloadedCount: 0, items: [zipItem], transaction }, zipSelected, '/tmp/archive', {} as any, {
      fetchVideos: async () => [],
      planVideo: async () => [],
      planZip: async () => [{ kind: 'zip', skip: false }],
    }, { checkbox: async (config: any) => [config.choices[0].value], select: async () => 'save' });
    expect(zipSelected.has('z')).toBe(true);
  });

  it('keeps existing selections and skips ineligible items', async () => {
    const transaction = { date: '', description: 'Product', url: 'https://product' };
    const existing = { id: 'existing', kind: 'video' as const, url: 'https://existing' };
    const missing = { id: 'missing', kind: 'video' as const, url: 'https://missing' };
    const skippedZip = { id: 'zip', kind: 'zip' as const, link: { kind: 'zip' as const, label: 'Already there', url: 'https://zip' } };
    const selectedItems = new Map<string, any>([['existing', { item: existing, transaction }]]);
    await selectItemsForTransaction({} as any, {} as any, { alreadyDownloadedCount: 0, items: [existing, missing, skippedZip], transaction }, selectedItems, '/tmp/archive', {} as any, {
      fetchVideos: async () => [],
      planVideo: async () => [{ kind: 'video', skip: true }],
      planZip: async () => [{ kind: 'zip', skip: true }],
    }, { checkbox: async () => [], select: async () => 'back' });
    expect(selectedItems.has('existing')).toBe(true);
    await selectItemsForTransaction({} as any, {} as any, { alreadyDownloadedCount: 0, items: [missing], transaction }, new Map(), '/tmp/archive', {} as any, {
      fetchVideos: async () => [], planVideo: async () => [{ kind: 'audio', skip: false }], planZip: async () => [],
    }, { checkbox: async () => [], select: async () => 'back' });
    await selectItemsForTransaction({} as any, {} as any, { alreadyDownloadedCount: 0, items: [missing], transaction }, new Map(), '/tmp/archive', {} as any, {
      fetchVideos: async () => [{ downloadLinks: [], pageTitleCandidates: {}, title: 'Episode', url: missing.url } as any], planVideo: async () => [{ kind: 'video', skip: true }], planZip: async () => [],
    }, { checkbox: async () => [], select: async () => 'save' });
    await selectItemsForTransaction({} as any, {} as any, { alreadyDownloadedCount: 0, items: [], transaction }, new Map(), '/tmp/archive', {} as any, {
      fetchVideos: async () => [], planVideo: async () => [], planZip: async () => [],
    }, { checkbox: async () => [], select: async () => 'save' });
    const otherTransaction = { date: '', description: 'Other', url: 'https://other' };
    await selectItemsForTransaction({} as any, {} as any, { alreadyDownloadedCount: 0, items: [missing], transaction }, new Map([['other', { item: missing, transaction: otherTransaction }]]), '/tmp/archive', {} as any, {
      fetchVideos: async () => [], planVideo: async () => [{ kind: 'audio', skip: false }], planZip: async () => [],
    }, { checkbox: async () => [], select: async () => 'save' });
    await selectItemsForTransaction({} as any, {} as any, { alreadyDownloadedCount: 0, items: [missing], transaction }, new Map([['other', { item: missing, transaction: otherTransaction }]]), '/tmp/archive', {} as any, {
      fetchVideos: async () => [{ downloadLinks: [], pageTitleCandidates: {}, title: 'Episode', url: missing.url } as any], planVideo: async () => [{ kind: 'video', skip: false }], planZip: async () => [],
    }, { checkbox: async (config: any) => [config.choices[0].value], select: async () => 'save' });
  });
});
