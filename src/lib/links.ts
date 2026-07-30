import * as cheerio from 'cheerio';
import path from 'node:path';
import { normalizeText } from './format.js';

export type DownloadLink = {
  kind: string;
  label: string;
  url: string;
};

export type SubtitleFormat = 'srt' | 'vtt';

export function extractVideoUrls(html: string, pageUrl: string): string[] {
  const $ = cheerio.load(html);
  const seen = new Set<string>();
  const urls: string[] = [];

  $('a[href]').each((_, link) => {
    const href = $(link).attr('href');

    if (!href) {
      return;
    }

    const url = new URL(href, pageUrl);

    if (!isLikelyVideoPage(url)) {
      return;
    }

    const normalizedUrl = url.toString();

    if (!seen.has(normalizedUrl)) {
      urls.push(normalizedUrl);
    }
    seen.add(normalizedUrl);
  });

  return urls;
}

export function extractDownloadLinks(html: string, pageUrl: string): DownloadLink[] {
  const $ = cheerio.load(html);
  const links: DownloadLink[] = [];
  const seen = new Set<string>();

  $('a[href], source[src], track[src]').each((_, element) => {
    const item = $(element);
    const href = item.attr('href') ?? item.attr('src');

    if (!href) {
      return;
    }

    const url = new URL(href, pageUrl).toString();
    const label = normalizeText(item.text()) || normalizeText(item.attr('label') ?? item.attr('title') ?? item.attr('download') ?? '');

    if (url.endsWith('#') || !isLikelyDownloadUrl(url, label) || seen.has(url)) {
      return;
    }

    seen.add(url);
    links.push({ kind: linkKind(url, label), label, url });
  });

  for (const rawUrl of html.match(/https?:\\?\/\\?\/[^"'\\\s<>)]+/g) ?? []) {
    const url = rawUrl.replaceAll('\\/', '/');

    if (!isLikelyDownloadUrl(url, '') || seen.has(url)) {
      continue;
    }

    seen.add(url);
    links.push({ kind: linkKind(url, ''), label: '', url });
  }

  return links;
}

export function extractZipDownloadLinks(html: string, pageUrl: string): DownloadLink[] {
  return extractDownloadLinks(html, pageUrl).filter((link) => link.kind === 'zip');
}

export function selectHighestResolutionVideo(links: DownloadLink[]): DownloadLink | undefined {
  return [...links.filter((link) => link.kind === 'video')]
    .sort((left, right) => videoResolution(right) - videoResolution(left))[0];
}

export function selectSubtitleLinks(links: DownloadLink[], formats: Set<SubtitleFormat>): DownloadLink[] {
  const selectedByFormat = new Map<SubtitleFormat, DownloadLink>();

  for (const link of links) {
    if (link.kind !== 'subtitle') {
      continue;
    }

    const format = parseSubtitleFormat(`${link.label} ${link.url}`);

    if (format && formats.has(format) && !selectedByFormat.has(format)) {
      selectedByFormat.set(format, link);
    }
  }

  return [...selectedByFormat.values()];
}

export function extensionForDownload(link: DownloadLink): string {
  const extension = path.extname(new URL(link.url).pathname).replace(/^\./, '').toLowerCase();

  if (extension) {
    return extension;
  }

  return link.kind === 'subtitle' ? parseSubtitleFormat(`${link.label} ${link.url}`) ?? 'srt' : 'mp4';
}

export function zipFilename(link: DownloadLink): string {
  return path.basename(new URL(link.url).pathname) || link.label || 'download.zip';
}

export function parseSubtitleFormat(value: string): SubtitleFormat | undefined {
  if (/srt/i.test(value)) return 'srt';
  if (/vtt/i.test(value)) return 'vtt';

  return undefined;
}

function isLikelyVideoPage(url: URL): boolean {
  return url.hostname.endsWith('gizmoplex.com') && (
    url.pathname.startsWith('/videos/') ||
    /\/packages\/[^/]+\/videos\/[^/]+/.test(url.pathname) ||
    url.pathname.startsWith('/watch/') ||
    url.pathname.startsWith('/movies/') ||
    url.pathname.startsWith('/series/')
  );
}

function isLikelyDownloadUrl(url: string, label: string): boolean {
  return /download|subtitle|caption|\.zip(?:[?#]|$)|\.srt(?:[?#]|$)|\.vtt(?:[?#]|$)|\.mp4(?:[?#]|$)|\.m4v(?:[?#]|$)|\.mov(?:[?#]|$)|\.m3u8(?:[?#]|$)|\.mpd(?:[?#]|$)/i.test(url) ||
    /download|subtitle|caption/i.test(label);
}

function linkKind(url: string, label: string): string {
  if (/subtitle|caption/i.test(label) || /\.srt(?:[?#]|$)|\.vtt(?:[?#]|$)/i.test(url)) return 'subtitle';
  if (/\.m3u8(?:[?#]|$)|\.mpd(?:[?#]|$)/i.test(url)) return 'stream';
  if (/\.zip(?:[?#]|$)/i.test(url)) return 'zip';

  return 'video';
}

function videoResolution(link: DownloadLink): number {
  const matches = [...`${link.label} ${link.url}`.matchAll(/(?:^|[^0-9])([1-9]\d{2,3})p(?:[^0-9]|$)/gi)]
    .map((match) => Number.parseInt(match[1], 10));

  return Math.max(0, ...matches);
}
