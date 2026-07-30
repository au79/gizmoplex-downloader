import { describe, expect, it } from 'vitest';
import { planVideoDownloads, planZipDownload, resolvePlannedDownloadPaths, summaryForPlan } from './archive-planning.js';

const item = { transactionDescription: 'Product', videoTitle: 'Video', videoUrl: 'https://page', downloads: [{ expectedSizeBytes: 10, extension: 'mp4', kind: 'video' as const, label: '', path: '/tmp/video.mp4', sizeBytes: 10, skip: false, url: 'https://file' }] };
describe('archive planning', () => {
  it('updates existing-download status after resolving paths', async () => {
    const [resolved] = await resolvePlannedDownloadPaths([item], async () => 10);
    expect(resolved.downloads[0].skip).toBe(true);
    expect(summaryForPlan([resolved]).alreadyDownloaded.counts.mp4).toBe(1);
  });

  it('plans video and subtitle downloads with expected sizes', async () => {
    const client = { contentLength: async () => 12 };
    const options = { srt: true, vtt: false } as any;
    const planned = await planVideoDownloads(client, { description: 'Product', date: '', url: 'https://product' }, { downloadLinks: [{ kind: 'video', label: '1080p', url: 'https://cdn/video.mp4' }, { kind: 'subtitle', label: 'English', url: 'https://cdn/caption.srt' }], pageTitleCandidates: {}, url: 'https://video' }, 'Episode', '/tmp/archive', options, async () => undefined, async () => undefined);
    expect(planned).toHaveLength(2);
    expect(planned.every((download) => download.expectedSizeBytes === 12)).toBe(true);
  });

  it('plans ZIP downloads and preserves verified status', async () => {
    const planned = await planZipDownload({ contentLength: async () => 20 }, { description: 'Product', date: '', url: 'https://product' }, { kind: 'zip', label: 'Bonus', url: 'https://cdn/bonus.zip' }, '/tmp/archive', async () => undefined, async () => 20);
    expect(planned[0]).toMatchObject({ extension: 'zip', skip: true, path: '/tmp/archive/Product/bonus.zip' });
  });

  it('allows a video page with no selectable media links', async () => {
    await expect(planVideoDownloads({ contentLength: async () => undefined }, { description: 'Product', date: '', url: 'https://product' }, { downloadLinks: [], pageTitleCandidates: {}, url: 'https://video' }, 'Episode', '/tmp/archive', { srt: false, vtt: false } as any, async () => undefined, async () => undefined)).resolves.toEqual([]);
  });

  it('handles unknown content lengths and existing ZIP extensions', async () => {
    const planned = await planVideoDownloads({ contentLength: async () => undefined }, { description: 'Product', date: '', url: 'https://product' }, { downloadLinks: [{ kind: 'video', label: '', url: 'https://cdn/video.mp4' }], pageTitleCandidates: {}, url: 'https://video' }, 'Episode', '/tmp/archive', { srt: false, vtt: false } as any, async () => undefined, async () => 8);
    expect(planned[0]).toMatchObject({ expectedSizeBytes: undefined, sizeBytes: 8, skip: true });
    const zip = await planZipDownload({ contentLength: async () => undefined }, { description: 'Product', date: '', url: 'https://product' }, { kind: 'zip', label: 'archive.zip', url: 'https://cdn/archive.zip' }, '/tmp/archive', async () => undefined, async () => undefined);
    expect(zip[0].path).toBe('/tmp/archive/Product/archive.zip');
  });
});
