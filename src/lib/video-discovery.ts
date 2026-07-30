import * as cheerio from 'cheerio';
import { extractDownloadLinks, parseSubtitleFormat } from './links.js';
import type { DownloadLink, SubtitleFormat } from './links.js';
import { normalizeText, sanitizePathComponent } from './format.js';
import type { HttpClient } from './http-client.js';
import type { CachedVideoMetadata, Options, PageTitleCandidates, ResolvedVideoMetadata, Transaction, VideoPage, VhxVideoResponse, VimeoConfigResponse, VimeoMetadata } from '../types.js';
import type { MetadataCache } from './metadata-cache.js';

export async function fetchVideoMetadata(client: HttpClient, metadataCache: MetadataCache, transaction: Transaction, videoUrl: string): Promise<ResolvedVideoMetadata> {
  const cached = await metadataCache.read(videoUrl);
  if (cached) return { ...cached, title: videoTitleFromSources(cached.vimeoConfig, cached.vhxVideo, cached.pageTitleCandidates, transaction.description, videoUrl) };

  const videoPage = await client.get(videoUrl, undefined, `video page ${videoUrl} from ${transaction.description}`);
  const vhxVideo = await fetchVhxVideo(client, videoPage.body, `${videoUrl} from ${transaction.description}`);
  const vimeoMetadata = await fetchVimeoMetadata(client, videoPage.body, videoPage.url, `${videoUrl} from ${transaction.description}`);
  const metadata: CachedVideoMetadata = {
    downloadLinks: extractDownloadLinks(videoPage.body, videoPage.url),
    fetchedAt: new Date().toISOString(),
    pageTitleCandidates: extractPageTitleCandidates(videoPage.body),
    pageUrl: videoPage.url,
    videoUrl,
    vimeoConfig: vimeoMetadata?.config,
    vhxVideo,
  };
  await metadataCache.write(metadata);
  return { ...metadata, title: videoTitleFromSources(metadata.vimeoConfig, metadata.vhxVideo, metadata.pageTitleCandidates, transaction.description, videoUrl) };
}

export async function fetchVideosForUrls(client: HttpClient, metadataCache: MetadataCache, transaction: Transaction, videoUrls: string[], replaceLine: (message: string) => void): Promise<VideoPage[]> {
  const videos: VideoPage[] = [];
  console.error(`Found ${videoUrls.length} video page(s).`);
  for (const [index, videoUrl] of videoUrls.entries()) {
    replaceLine(`Fetching title ${index + 1} of ${videoUrls.length}`);
    const metadata = await fetchVideoMetadata(client, metadataCache, transaction, videoUrl);
    videos.push({ downloadLinks: metadata.downloadLinks, pageTitleCandidates: metadata.pageTitleCandidates, title: metadata.title, url: videoUrl, vimeoConfig: metadata.vimeoConfig, vhxVideo: metadata.vhxVideo });
  }
  replaceLine(`Fetched ${videoUrls.length} title(s)`);
  process.stderr.write('\n');
  return videos;
}

export async function fetchVhxVideo(client: HttpClient, html: string, videoDescription: string): Promise<VhxVideoResponse | undefined> {
  const videoId = html.match(/window\.VHX\.video\s*=\s*\{[\s\S]*?\bid:\s*"([^"]+)"/)?.[1];
  const token = html.match(/\btoken:\s*"([^"]+)"/)?.[1];
  if (!videoId || !token) return undefined;
  const response = await client.getWithBearer(`https://api.vhx.tv/videos/${videoId}`, token, `VHX video metadata for ${videoDescription} (VHX video id ${videoId})`);
  try { return JSON.parse(response.body) as VhxVideoResponse; } catch { return undefined; }
}

export async function fetchVimeoConfig(client: HttpClient, html: string, pageUrl: string, videoDescription: string): Promise<VimeoConfigResponse | undefined> {
  return (await fetchVimeoMetadata(client, html, pageUrl, videoDescription))?.config;
}

export async function fetchVimeoMetadata(client: HttpClient, html: string, pageUrl: string, videoDescription: string): Promise<VimeoMetadata | undefined> {
  const embedUrl = extractVhxEmbedUrl(html, pageUrl);
  if (!embedUrl) return undefined;
  const embedResponse = await client.getWithHeaders(embedUrl, { accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', referer: pageUrl }, `VHX embed page for ${videoDescription}`);
  const configUrl = extractOttConfigUrl(embedResponse.body);
  if (!configUrl) return {};
  const configResponse = await client.getWithHeaders(configUrl, { accept: '*/*', origin: 'https://embed.vhx.tv', referer: 'https://embed.vhx.tv/' }, `Vimeo player config for ${videoDescription}`);
  try { return { config: JSON.parse(configResponse.body) as VimeoConfigResponse }; } catch { return {}; }
}

export function extractVhxEmbedUrl(html: string, pageUrl: string): string | undefined {
  const src = cheerio.load(html)('iframe[src*="embed.vhx.tv"], iframe[src*="embed"]').first().attr('src');
  return src ? new URL(src, pageUrl).toString() : undefined;
}

export function extractOttConfigUrl(html: string): string | undefined {
  const rawJson = html.match(/window\.OTTData\s*=\s*(\{[\s\S]*?\})\s*<\/script>/)?.[1];
  if (!rawJson) return undefined;
  try {
    const configUrl = (JSON.parse(rawJson) as { config_url?: unknown }).config_url;
    return typeof configUrl === 'string' ? configUrl : undefined;
  } catch { return undefined; }
}

export function extractVhxSubtitleLinks(parsed: VhxVideoResponse | undefined, formats: Set<SubtitleFormat>): DownloadLink[] {
  if (!parsed) return [];
  const links: DownloadLink[] = [];
  for (const subtitle of parsed._embedded?.subtitles ?? []) {
    const url = subtitle._links?.self?.href;
    const type = parseSubtitleFormat(subtitle.type ?? url ?? '');
    if (url && type && formats.has(type)) links.push({ kind: 'subtitle', label: [subtitle.language, subtitle.type].filter(Boolean).join(' '), url });
  }
  for (const subtitle of parsed.tracks?.subtitles ?? []) for (const [type, link] of Object.entries(subtitle._links ?? {})) {
    const format = parseSubtitleFormat(type);
    if (link.href && format && formats.has(format)) links.push({ kind: 'subtitle', label: [subtitle.label, type].filter(Boolean).join(' '), url: link.href });
  }
  return dedupeLinks(links);
}

export function vhxVideoTitle(parsed: VhxVideoResponse | undefined): string | undefined { return validTitleCandidate(parsed?.title) ?? validTitleCandidate(parsed?.name); }

export function vimeoConfigTitle(parsed: VimeoConfigResponse | undefined): string | undefined {
  return validTitleCandidate(parsed?.video?.title) ?? validTitleCandidate(parsed?.title) ?? validTitleCandidate(parsed?.clip?.title);
}

export function videoTitleFromSources(vimeoConfig: VimeoConfigResponse | undefined, vhxVideo: VhxVideoResponse | undefined, pageTitleCandidates: PageTitleCandidates, productName: string, fallback: string): string {
  return vimeoConfigTitle(vimeoConfig) ?? vhxVideoTitle(vhxVideo) ?? (pageTitleFromCandidates(pageTitleCandidates, productName) || fallback);
}

export function validTitleCandidate(value: string | undefined): string | undefined {
  const title = normalizeText(value ?? '');
  return !title || title.toLowerCase() === 'untitled' ? undefined : title;
}

export function selectedSubtitleFormats(options: Options): Set<SubtitleFormat> {
  if (!options.srt && !options.vtt) return new Set(['srt']);
  return new Set([...(options.srt ? ['srt' as const] : []), ...(options.vtt ? ['vtt' as const] : [])]);
}

export function dedupeLinks(links: DownloadLink[]): DownloadLink[] {
  const seen = new Set<string>();
  return links.filter((link) => !seen.has(link.url) && (seen.add(link.url), true));
}

export function extractPageTitle(html: string): string {
  const $ = cheerio.load(html);
  return normalizeText($('meta[property="og:title"]').attr('content') ?? $('title').text());
}

export function extractPageTitleCandidates(html: string): PageTitleCandidates {
  const $ = cheerio.load(html);
  return { h1: normalizeText($('h1').first().text()), jsonLdTitle: extractJsonLdTitle($), ogVideoTitle: normalizeText($('meta[property="og:video:title"]').attr('content') ?? ''), pageTitle: extractPageTitle(html), siteName: normalizeText($('meta[property="og:site_name"]').attr('content') ?? ''), twitterTitle: normalizeText($('meta[name="twitter:title"]').attr('content') ?? '') };
}

export function pageTitleFromCandidates(candidates: PageTitleCandidates, productName: string): string {
  for (const candidate of [candidates.jsonLdTitle, candidates.ogVideoTitle, candidates.twitterTitle, candidates.h1, candidates.pageTitle]) {
    const valid = validTitleCandidate(candidate);
    if (!valid) continue;
    const title = videoTitleForPath(valid, productName, candidates.siteName);
    if (validTitleCandidate(title)) return title;
  }
  return '';
}

export function extractJsonLdTitle($: cheerio.CheerioAPI): string | undefined {
  for (const element of $('script[type="application/ld+json"]').toArray()) {
    try { const title = jsonLdName(JSON.parse($(element).contents().text()) as unknown); if (title) return title; } catch { /* ignore malformed JSON-LD */ }
  }
  return undefined;
}

export function jsonLdName(value: unknown): string | undefined {
  if (Array.isArray(value)) return value.map(jsonLdName).find(Boolean);
  if (!value || typeof value !== 'object') return undefined;
  const object = value as Record<string, unknown>;
  return typeof object.name === 'string' ? object.name : jsonLdName(object['@graph']);
}

export function videoTitleForPath(pageTitle: string, productName: string, siteName?: string): string {
  const normalizedTitle = normalizeText(pageTitle);
  if (!normalizedTitle) return '';
  const sanitizedTitle = sanitizePathComponent(stripKnownTitleParts(normalizedTitle, [siteName, productName], ' - '));
  const sanitizedProductName = sanitizePathComponent(productName);
  const sanitizedSiteName = siteName ? sanitizePathComponent(siteName) : undefined;
  const result = stripKnownTitleParts(sanitizedTitle, [sanitizedSiteName, sanitizedProductName], '-');
  return result === sanitizedProductName || result === sanitizedSiteName ? 'untitled' : result;
}

export function stripKnownTitleParts(title: string, parts: Array<string | undefined>, separator: string): string {
  let result = title;
  let changed = true;
  while (changed) {
    changed = false;
    for (const part of parts) {
      const normalized = normalizeText(part ?? '');
      const suffix = normalized ? `${separator}${normalized}` : '';
      if (suffix && result.endsWith(suffix)) { result = normalizeText(result.slice(0, -suffix.length)); changed = true; }
    }
  }
  return result;
}
