import { createHash } from 'node:crypto';
import path from 'node:path';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { extractDownloadLinks } from './links.js';
import { errorMessage, isNodeError } from './runtime.js';
import { redactUrl } from './format.js';
import type { CachedVideoMetadata, LegacyCachedVideoMetadata, PageTitleCandidates } from '../types.js';

export class MetadataCache {
  private readonly videoCacheDir: string;
  constructor(private readonly outputRoot: string, private readonly ensureDirectory: (path: string) => Promise<void>, private readonly extractPageTitleCandidates: (html: string) => PageTitleCandidates) {
    this.videoCacheDir = path.join(outputRoot, '.cache', 'videos');
  }
  async clear(): Promise<void> { await rm(path.join(this.outputRoot, '.cache'), { force: true, recursive: true }); }
  async read(videoUrl: string): Promise<CachedVideoMetadata | undefined> {
    try {
      const parsed = JSON.parse(await readFile(this.cachePath(videoUrl), 'utf8')) as CachedVideoMetadata | LegacyCachedVideoMetadata;
      if (parsed.videoUrl !== videoUrl) return undefined;
      const migrated = migrateLegacyCachedVideoMetadata(parsed, this.extractPageTitleCandidates);
      if (!migrated.downloadLinks || !migrated.pageTitleCandidates) return undefined;
      if (isLegacyCachedVideoMetadata(parsed)) await this.write(migrated);
      return migrated;
    } catch (error) {
      if (isNodeError(error) && error.code === 'ENOENT') return undefined;
      throw new Error(`Could not read metadata cache for ${redactUrl(videoUrl)}: ${errorMessage(error)}`);
    }
  }
  async write(metadata: CachedVideoMetadata): Promise<void> {
    await this.ensureDirectory(this.videoCacheDir);
    await writeFile(this.cachePath(metadata.videoUrl), `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');
  }
  private cachePath(videoUrl: string): string { return path.join(this.videoCacheDir, `${hashCacheKey(videoUrl)}.json`); }
}

export function migrateLegacyCachedVideoMetadata(value: CachedVideoMetadata | LegacyCachedVideoMetadata, extractPageTitleCandidates: (html: string) => PageTitleCandidates): CachedVideoMetadata {
  if (!isLegacyCachedVideoMetadata(value)) return value;
  const html = value.videoPage?.body ?? '';
  const pageUrl = value.videoPage?.url ?? value.videoUrl;
  return { downloadLinks: html ? extractDownloadLinks(html, pageUrl) : [], fetchedAt: value.fetchedAt, pageTitleCandidates: html ? extractPageTitleCandidates(html) : {}, pageUrl, videoUrl: value.videoUrl, vimeoConfig: value.vimeoConfig, vhxVideo: value.vhxVideo };
}
function isLegacyCachedVideoMetadata(value: CachedVideoMetadata | LegacyCachedVideoMetadata): value is LegacyCachedVideoMetadata { return 'videoPage' in value; }
function hashCacheKey(value: string): string { return createHash('sha256').update(value).digest('hex'); }
