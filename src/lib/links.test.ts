import { describe, expect, it } from 'vitest';
import { extensionForDownload, extractDownloadLinks, extractVideoUrls, extractZipDownloadLinks, parseSubtitleFormat, selectHighestResolutionVideo, selectSubtitleLinks, zipFilename } from './links.ts';

describe('link discovery and selection', () => {
  describe('product pages', () => {
    it('finds unique Gizmoplex video pages only', () => {
      const html = '<a href="/videos/one">one</a><a href="/videos/one">duplicate</a><a href="https://other.test/videos/no">no</a>';
      expect(extractVideoUrls(html, 'https://www.gizmoplex.com/packages/p')).toEqual(['https://www.gizmoplex.com/videos/one']);
    });

    it('discovers ZIPs and media anchors', () => {
      const html = '<a href="downloads/bonus.zip">Bonus</a><track src="captions.vtt" label="English"><a href="movie-1080p.mp4">Movie</a>';
      const links = extractDownloadLinks(html, 'https://www.gizmoplex.com/package/');
      expect(extractZipDownloadLinks(html, 'https://www.gizmoplex.com/package/')).toHaveLength(1);
      expect(selectHighestResolutionVideo(links)?.url).toContain('movie-1080p.mp4');
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
      expect(extensionForDownload(links[0])).toBe('srt');
      expect(zipFilename({ kind: 'zip', label: '', url: 'https://cdn.test/a%20file.zip?token=x' })).toBe('a%20file.zip');
    });
  });
});
