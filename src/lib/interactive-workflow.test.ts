import { describe, expect, it, vi } from 'vitest';
import { mkdir, writeFile, rm } from 'node:fs/promises';

vi.mock('@inquirer/prompts', () => ({ confirm: vi.fn().mockResolvedValue(false) }));
vi.mock('./interactive-ui.js', () => ({
  displaySelectedItems: vi.fn(),
  fetchInteractiveTransactions: vi.fn().mockResolvedValue([]),
  selectItemsForTransaction: vi.fn(),
  selectTransaction: vi.fn().mockResolvedValue({ kind: 'confirm' }),
}));

import { countDownloadedItems, ensureDirectory, fileSize, processInteractiveArchive } from './interactive-workflow.js';
import { confirm } from '@inquirer/prompts';
import { fetchInteractiveTransactions, selectItemsForTransaction, selectTransaction } from './interactive-ui.js';

describe('interactive archive workflow', () => {
  it('renders an empty selection and stops when confirmation is declined', async () => {
    await expect(processInteractiveArchive({} as any, [], { out: '/tmp/gizmo-interactive', dryRun: false, clearCache: false, interactive: true, showInProgressPlan: false, srt: false, vtt: false, yes: false, timeout: 1000 } as any, undefined, vi.fn())).resolves.toBeUndefined();
  });

  it('surfaces filesystem errors while scanning interactive progress', async () => {
    const transaction = { date: '', description: 'Product', url: 'https://product' };
    vi.mocked(fetchInteractiveTransactions).mockImplementationOnce(async (_client, _transactions, root, count) => {
      await expect(count('/dev/null', transaction)).rejects.toThrow();
      return [];
    });
    await expect(processInteractiveArchive({} as any, [transaction], { out: '/tmp/gizmo-interactive', dryRun: false, clearCache: false, interactive: true, showInProgressPlan: false, srt: false, vtt: false, yes: false, timeout: 1000 } as any, undefined, vi.fn())).resolves.toBeUndefined();
    expect(await fileSize('/dev/null')).toBeUndefined();
    await writeFile('/tmp/gizmo-interactive-file', 'x');
    expect(await fileSize('/tmp/gizmo-interactive-file')).toBe(1);
    await rm('/tmp/gizmo-interactive-file', { force: true });
    await expect(ensureDirectory('/dev/null/child')).rejects.toThrow('Could not create output directory');
    await expect(fileSize('/dev/null/missing')).rejects.toThrow();
    await expect(countDownloadedItems('/dev/null', transaction)).rejects.toThrow();
    await mkdir('/tmp/gizmo-interactive/Product', { recursive: true });
    await writeFile('/tmp/gizmo-interactive/Product/episode.zip', 'x');
    await writeFile('/tmp/gizmo-interactive/Product/notes.txt', 'x');
    expect(await countDownloadedItems('/tmp/gizmo-interactive', transaction)).toBe(1);
    await rm('/tmp/gizmo-interactive/Product', { recursive: true, force: true });
  });

  it('plans selected video items and delegates execution', async () => {
    const transaction = { date: '', description: 'Product', url: 'https://product' };
    const item = { id: 'video:1', kind: 'video' as const, url: 'https://video' };
    const page = { downloadLinks: [{ kind: 'video', label: 'HD', url: 'https://cdn/video.mp4' }], pageTitleCandidates: {}, title: 'Episode', url: 'https://video' };
    vi.mocked(fetchInteractiveTransactions).mockImplementationOnce(async (_client, transactions, root, count) => {
      await count(root, transaction);
      return [{ alreadyDownloadedCount: 0, items: [item], transaction: transactions[0] }];
    });
    vi.mocked(selectTransaction).mockResolvedValueOnce({ kind: 'transaction', transaction: { alreadyDownloadedCount: 0, items: [item], transaction } }).mockResolvedValueOnce({ kind: 'confirm' });
    vi.mocked(selectItemsForTransaction).mockImplementationOnce(async (_client, _cache, _transaction, selected, root, options, dependencies) => {
      const planningClient = { contentLength: async () => undefined } as any;
      await dependencies.planVideo(planningClient, transaction, page, root, options);
      await dependencies.planZip(planningClient, transaction, { kind: 'zip', label: 'Bonus', url: 'https://zip' }, root);
      selected.set(item.id, { item, page, transaction });
    });
    vi.mocked(confirm).mockResolvedValueOnce(true as never);
    const execute = vi.fn().mockResolvedValue(undefined);
    await processInteractiveArchive({ contentLength: async () => 4 } as any, [transaction], { out: '/tmp/gizmo-interactive', dryRun: false, clearCache: false, interactive: true, showInProgressPlan: false, srt: false, vtt: false, yes: false, timeout: 1000 } as any, undefined, execute);
    expect(execute).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ videoTitle: 'Episode' })]), expect.stringContaining('.in-progress'), undefined);
  });

  it('plans selected ZIP items and rejects selected videos without metadata', async () => {
    const transaction = { date: '', description: 'Product', url: 'https://product' };
    const zip = { id: 'zip:1', kind: 'zip' as const, link: { kind: 'zip', label: '', url: 'https://zip' } };
    vi.mocked(fetchInteractiveTransactions).mockResolvedValueOnce([{ alreadyDownloadedCount: 0, items: [zip], transaction }]);
    vi.mocked(selectTransaction).mockResolvedValueOnce({ kind: 'transaction', transaction: { alreadyDownloadedCount: 0, items: [zip], transaction } }).mockResolvedValueOnce({ kind: 'confirm' });
    vi.mocked(selectItemsForTransaction).mockImplementationOnce(async (_client, _cache, _transaction, selected) => { selected.set(zip.id, { item: zip, transaction }); });
    vi.mocked(confirm).mockResolvedValueOnce(true as never);
    const execute = vi.fn().mockResolvedValue(undefined);
    await processInteractiveArchive({ contentLength: async () => undefined } as any, [transaction], { out: '/tmp/gizmo-interactive', dryRun: false, clearCache: false, interactive: true, showInProgressPlan: false, srt: false, vtt: false, yes: false, timeout: 1000 } as any, undefined, execute);
    expect(execute).toHaveBeenCalled();
    expect(execute.mock.calls[0][0][0]).toMatchObject({ videoTitle: 'https://zip' });

    const video = { id: 'video:missing', kind: 'video' as const, url: 'https://missing-video?token=missing-secret' };
    vi.mocked(fetchInteractiveTransactions).mockResolvedValueOnce([{ alreadyDownloadedCount: 0, items: [video], transaction }]);
    vi.mocked(selectTransaction).mockResolvedValueOnce({ kind: 'transaction', transaction: { alreadyDownloadedCount: 0, items: [video], transaction } }).mockResolvedValueOnce({ kind: 'confirm' });
    vi.mocked(selectItemsForTransaction).mockImplementationOnce(async (_client, _cache, _transaction, selected) => { selected.set(video.id, { item: video, transaction }); });
    try {
      await processInteractiveArchive({ contentLength: async () => undefined } as any, [transaction], { out: '/tmp/gizmo-interactive', dryRun: false, clearCache: false, interactive: true, showInProgressPlan: false, srt: false, vtt: false, yes: false, timeout: 1000 } as any, undefined, vi.fn());
      throw new Error('expected missing metadata to fail');
    } catch (error) {
      expect(String(error)).toContain('Missing fetched metadata');
      expect(String(error)).not.toContain('missing-secret');
    }
  });
});
