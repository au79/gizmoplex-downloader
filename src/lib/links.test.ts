import { describe, expect, it } from 'vitest';
import { extensionForDownload, extractDownloadLinks, extractVideoUrls, extractZipDownloadLinks, parseSubtitleFormat, selectHighestResolutionVideo, selectSubtitleLinks, zipFilename } from './links.ts';

describe('link discovery and selection', () => {
  describe('product pages', () => {
    it('finds unique Gizmoplex video pages only', () => {
      const html = '<a href="/videos/one">one</a><a href="/videos/one">duplicate</a><a href="/packages/p/videos/two">two</a><a href="/watch/three">three</a><a href="/movies/four">four</a><a href="/series/five">five</a><a href="https://other.test/videos/no">no</a>';
      expect(extractVideoUrls(html, 'https://www.gizmoplex.com/packages/p')).toEqual([
        'https://www.gizmoplex.com/videos/one',
        'https://www.gizmoplex.com/packages/p/videos/two',
        'https://www.gizmoplex.com/watch/three',
        'https://www.gizmoplex.com/movies/four',
        'https://www.gizmoplex.com/series/five',
      ]);
    });

    it('discovers ZIPs and media anchors', () => {
      const html = String.raw`<a href>empty</a><a href="downloads/bonus.zip">Bonus</a><track src="" label="empty"><track src="captions.vtt" label="English"><a href="movie-1080p.mp4">Movie</a><source src="stream.m3u8"><a href="#">ignore</a> https:\/\/cdn.test\/raw.mp4 https://cdn.test/ignore.css`;
      const links = extractDownloadLinks(html, 'https://www.gizmoplex.com/package/');
      expect(extractZipDownloadLinks(html, 'https://www.gizmoplex.com/package/')).toHaveLength(1);
      expect(selectHighestResolutionVideo(links)?.url).toContain('movie-1080p.mp4');
      expect(links.map((link) => link.kind)).toEqual(expect.arrayContaining(['subtitle', 'stream', 'zip', 'video']));
      expect(links.some((link) => link.url === 'https://cdn.test/raw.mp4')).toBe(true);
    });
  });

  describe('download choices', () => {
    it('selects one subtitle per requested format and derives filenames', () => {
      const links = [
        { kind: 'subtitle', label: 'English SRT', url: 'https://cdn.test/a.srt' },
        { kind: 'subtitle', label: 'Duplicate SRT', url: 'https://cdn.test/b.srt' },
        { kind: 'subtitle', label: 'English VTT', url: 'https://cdn.test/a.vtt' },
      ];
      expect(selectSubtitleLinks(links, new Set(['srt', 'vtt']))).toHaveLength(2);
      expect(parseSubtitleFormat('caption.VTT')).toBe('vtt');
      expect(parseSubtitleFormat('unknown')).toBeUndefined();
      expect(extensionForDownload(links[0])).toBe('srt');
      expect(extensionForDownload({ kind: 'subtitle', label: 'caption', url: 'https://cdn.test/no-extension' })).toBe('srt');
      expect(extensionForDownload({ kind: 'video', label: '', url: 'https://cdn.test/no-extension' })).toBe('mp4');
      expect(zipFilename({ kind: 'zip', label: '', url: 'https://cdn.test/a%20file.zip?token=x' })).toBe('a%20file.zip');
      expect(zipFilename({ kind: 'zip', label: 'Bonus', url: 'https://cdn.test/' })).toBe('Bonus');
      expect(zipFilename({ kind: 'zip', label: '', url: 'https://cdn.test/' })).toBe('download.zip');
      expect(selectHighestResolutionVideo([{ kind: 'video', label: 'source', url: 'https://cdn.test/plain.mp4' }])?.url).toContain('plain.mp4');
      expect(selectHighestResolutionVideo([])).toBeUndefined();
      expect(selectSubtitleLinks([...links, { kind: 'video', label: '', url: 'https://cdn.test/x.mp4' }, { kind: 'subtitle', label: 'unknown', url: 'https://cdn.test/x.txt' }], new Set(['srt']))).toHaveLength(1);
    });
  });
});
