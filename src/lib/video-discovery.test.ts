import { describe, expect, it } from 'vitest';
import * as cheerio from 'cheerio';
import { extractJsonLdTitle, extractOttConfigUrl, extractPageTitle, extractPageTitleCandidates, extractVhxEmbedUrl, extractVhxSubtitleLinks, fetchVideoMetadata, fetchVhxVideo, fetchVimeoConfig, fetchVimeoMetadata, fetchVideosForUrls, jsonLdName, pageTitleFromCandidates, selectedSubtitleFormats, stripKnownTitleParts, validTitleCandidate, videoTitleForPath, videoTitleFromSources, vhxVideoTitle, vimeoConfigTitle } from './video-discovery.js';

describe('video discovery and title resolution', () => {
  it('extracts VHX embed/config URLs and tolerates malformed config JSON', () => {
    expect(extractVhxEmbedUrl('<iframe src="/embed/123"></iframe>', 'https://page.test/video')).toBe('https://page.test/embed/123');
    expect(extractOttConfigUrl('<script>window.OTTData = {bad}</script>')).toBeUndefined();
    expect(extractOttConfigUrl('<script>window.OTTData = {"config_url":"https://config.test"}</script>')).toBe('https://config.test');
    expect(extractVhxEmbedUrl('<p>no embed</p>', 'https://page.test/video')).toBeUndefined();
    expect(extractOttConfigUrl('<p>no config</p>')).toBeUndefined();
  });

  it('fetches VHX/Vimeo metadata and resolves uncached video pages', async () => {
    const client = {
      get: async () => ({ body: '<title>Episode</title><a href="movie.mp4">movie</a><iframe src="https://embed.vhx.tv/1"></iframe>', status: 200, url: 'https://page/video' }),
      getWithBearer: async () => ({ body: '{"title":"VHX Episode"}', status: 200, url: 'https://api.vhx.tv/videos/1' }),
      getWithHeaders: async (_url: string) => ({ body: '<script>window.OTTData = {"config_url":"https://config"}</script>', status: 200, url: 'https://embed' }),
    };
    await expect(fetchVhxVideo(client as any, 'window.VHX.video = {id: "1", token: "t"}', 'video')).resolves.toMatchObject({ title: 'VHX Episode' });
    await expect(fetchVimeoMetadata(client as any, '<iframe src="https://embed.vhx.tv/1"></iframe>', 'https://page', 'video')).resolves.toEqual({});
    await expect(fetchVimeoMetadata({ ...client, getWithHeaders: async (url: string) => url.includes('embed') ? ({ body: '<script>window.OTTData = {"other":true}</script>', status: 200, url }) : ({ body: '{}', status: 200, url }) } as any, '<iframe src="https://embed.vhx.tv/1"></iframe>', 'https://page', 'video')).resolves.toEqual({});
    await expect(fetchVimeoMetadata({ ...client, getWithHeaders: async (url: string) => url.includes('embed') ? ({ body: '<script>window.OTTData = {"config_url":42}</script>', status: 200, url }) : ({ body: '{}', status: 200, url }) } as any, '<iframe src="https://embed.vhx.tv/1"></iframe>', 'https://page', 'video')).resolves.toEqual({});
    await expect(fetchVimeoConfig(client as any, '<iframe src="https://embed.vhx.tv/1"></iframe>', 'https://page', 'video')).resolves.toBeUndefined();
    const cache = { read: async () => undefined, write: async () => undefined };
    await expect(fetchVideoMetadata(client as any, cache as any, { description: 'Product', date: '', url: 'https://product' }, 'https://page/video')).resolves.toMatchObject({ title: 'Episode', videoUrl: 'https://page/video' });
    await expect(fetchVideosForUrls(client as any, cache as any, { description: 'Product', date: '', url: 'https://product' }, ['https://page/video'], () => undefined)).resolves.toHaveLength(1);
    await expect(fetchVhxVideo(client as any, 'window.VHX.video = {}', 'video')).resolves.toBeUndefined();
    await expect(fetchVhxVideo({ ...client, getWithBearer: async () => ({ body: '{bad}', status: 200, url: 'https://api' }) } as any, 'window.VHX.video = {id: "1", token: "t"}', 'video')).resolves.toBeUndefined();
    await expect(fetchVimeoMetadata(client as any, '<p>no embed</p>', 'https://page', 'video')).resolves.toBeUndefined();
    await expect(fetchVimeoMetadata(client as any, '<iframe src="https://embed.vhx.tv/1"></iframe>', 'https://page', 'video')).resolves.toEqual({});
  });

  it('filters and deduplicates VHX subtitle formats', () => {
    const parsed = { _embedded: { subtitles: [{ language: 'English', type: 'srt', _links: { self: { href: 'https://a' } } }] }, tracks: { subtitles: [{ label: 'English', _links: { vtt: { href: 'https://b' }, srt: { href: 'https://a' } } }] } };
    expect(extractVhxSubtitleLinks(parsed, new Set(['srt', 'vtt']))).toEqual([{ kind: 'subtitle', label: 'English srt', url: 'https://a' }, { kind: 'subtitle', label: 'English vtt', url: 'https://b' }]);
    expect(extractVhxSubtitleLinks(undefined, new Set(['srt']))).toEqual([]);
    expect(extractVhxSubtitleLinks({ tracks: { subtitles: [{ label: 'English' }] } }, new Set(['srt']))).toEqual([]);
    expect(extractVhxSubtitleLinks({ _embedded: { subtitles: [{ _links: {} }] }, tracks: { subtitles: [{ label: 'English', _links: { srt: { href: 'https://track.srt' } } }] } }, new Set(['srt']))).toEqual([{ kind: 'subtitle', label: 'English srt', url: 'https://track.srt' }]);
    expect(extractVhxSubtitleLinks({ _embedded: { subtitles: [{ type: 'srt' }] }, tracks: { subtitles: [{ _links: { srt: {} } }] } }, new Set(['srt']))).toEqual([]);
    expect(extractVhxSubtitleLinks({ _embedded: { subtitles: [{ language: 'English', type: 'ass', _links: { self: { href: 'https://ass' } } }] }, tracks: { subtitles: [{ label: 'English', _links: { ass: { href: 'https://ass' } } }] } }, new Set(['srt']))).toEqual([]);
    expect(extractVhxSubtitleLinks({ _embedded: { subtitles: [{ language: 'English', _links: { self: { href: 'https://sub.srt' } } }, { type: 'srt', _links: {} }] }, tracks: undefined }, new Set(['srt']))).toEqual([{ kind: 'subtitle', label: 'English', url: 'https://sub.srt' }]);
  });

  it('handles JSON-LD variants and title precedence/suffixes', () => {
    expect(jsonLdName([{ '@graph': [{ name: 'Episode' }] }])).toBe('Episode');
    expect(extractJsonLdTitle(cheerio.load('<script type="application/ld+json">{"name":"Episode"}</script>'))).toBe('Episode');
    expect(pageTitleFromCandidates({ pageTitle: 'Episode - Product - Site', siteName: 'Site' }, 'Product')).toBe('Episode');
    expect(videoTitleFromSources({ video: { title: 'Vimeo title' } }, { name: 'VHX title' }, {}, 'Product', 'fallback')).toBe('Vimeo title');
    expect(videoTitleForPath('Product - Site', 'Product', 'Site')).toBe('untitled');
    expect(stripKnownTitleParts('Episode - Product - Site', ['Site', 'Product'], ' - ')).toBe('Episode');
    expect(selectedSubtitleFormats({ srt: false, vtt: false } as any)).toEqual(new Set(['srt']));
    expect(selectedSubtitleFormats({ srt: false, vtt: true } as any)).toEqual(new Set(['vtt']));
    expect(selectedSubtitleFormats({ srt: true, vtt: true } as any)).toEqual(new Set(['srt', 'vtt']));
    expect(validTitleCandidate('untitled')).toBeUndefined();
    expect(validTitleCandidate(' Episode ')).toBe('Episode');
    expect(vhxVideoTitle({ name: 'Name' })).toBe('Name');
    expect(vimeoConfigTitle({ clip: { title: 'Clip' } })).toBe('Clip');
    expect(videoTitleFromSources(undefined, undefined, {}, 'Product', 'fallback')).toBe('fallback');
    expect(extractPageTitle('<title>Page</title>')).toBe('Page');
    expect(extractPageTitleCandidates('<meta property="og:title" content="OG"><meta property="og:video:title" content="Video"><meta property="og:site_name" content="Site"><meta name="twitter:title" content="Twitter"><h1>H1</h1>')).toMatchObject({ ogVideoTitle: 'Video', siteName: 'Site', twitterTitle: 'Twitter', h1: 'H1' });
    expect(pageTitleFromCandidates({}, 'Product')).toBe('');
    expect(pageTitleFromCandidates({ pageTitle: 'Product', siteName: 'Site' }, 'Product')).toBe('');
    expect(jsonLdName({ '@graph': [{ description: 'not a name' }] })).toBeUndefined();
    expect(jsonLdName('not an object')).toBeUndefined();
    expect(extractJsonLdTitle(cheerio.load('<script type="application/ld+json">{bad}</script>'))).toBeUndefined();
    expect(videoTitleForPath('', 'Product')).toBe('');
  });
});
