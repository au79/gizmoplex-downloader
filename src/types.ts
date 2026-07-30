import type { DelayRange } from './lib/options.js';
import type { DownloadLink } from './lib/links.js';

export type Options = {
  clearCache: boolean;
  delay?: DelayRange;
  dryRun: boolean;
  inProgressPlan?: string;
  interactive: boolean;
  out: string;
  showInProgressPlan: boolean;
  srt: boolean;
  timeout: number;
  vtt: boolean;
  yes: boolean;
};

export type CliOptions = Omit<Options, 'delay'> & { delay?: string };

export type Transaction = { date: string; description: string; url: string };

export type PageTitleCandidates = {
  h1?: string;
  jsonLdTitle?: string;
  ogVideoTitle?: string;
  pageTitle?: string;
  siteName?: string;
  twitterTitle?: string;
};

export type VhxVideoResponse = {
  name?: string;
  title?: string;
  _embedded?: { subtitles?: Array<{ _links?: { self?: { href?: string } }; language?: string; type?: string }> };
  tracks?: { subtitles?: Array<{ _links?: Record<string, { href?: string }>; label?: string }> };
};

export type VimeoConfigResponse = {
  clip?: { title?: string };
  title?: string;
  video?: { title?: string };
};

export type HttpResponse = { body: string; status: number; url: string };

export type VideoPage = {
  downloadLinks: DownloadLink[];
  pageTitleCandidates: PageTitleCandidates;
  title: string;
  url: string;
  vimeoConfig?: VimeoConfigResponse;
  vhxVideo?: VhxVideoResponse;
};

export type CachedVideoMetadata = {
  downloadLinks: DownloadLink[];
  fetchedAt: string;
  pageTitleCandidates: PageTitleCandidates;
  pageUrl: string;
  videoUrl: string;
  vimeoConfig?: VimeoConfigResponse;
  vhxVideo?: VhxVideoResponse;
};

export type LegacyCachedVideoMetadata = {
  fetchedAt: string;
  videoPage?: HttpResponse;
  videoUrl: string;
  vimeoConfig?: VimeoConfigResponse;
  vhxEmbedHtml?: string;
  vhxVideo?: VhxVideoResponse;
};

export type ResolvedVideoMetadata = CachedVideoMetadata & { title: string };
export type VimeoMetadata = { config?: VimeoConfigResponse };

export type InteractiveItem =
  | { id: string; kind: 'video'; url: string }
  | { id: string; kind: 'zip'; link: DownloadLink };

export type InteractiveTransaction = {
  alreadyDownloadedCount: number;
  items: InteractiveItem[];
  transaction: Transaction;
};

export type SelectedInteractiveItem = { item: InteractiveItem; page?: VideoPage; transaction: Transaction };
export type TransactionMenuSelection = { kind: 'confirm' } | { kind: 'transaction'; transaction: InteractiveTransaction };

export type PlannedDownload = {
  expectedSizeBytes?: number;
  extension: string;
  kind: 'video' | 'subtitle' | 'zip';
  label: string;
  path: string;
  sizeBytes?: number;
  skip: boolean;
  url: string;
};

export type PlannedVideoDownload = {
  downloads: PlannedDownload[];
  transactionDescription: string;
  videoTitle: string;
  videoUrl: string;
};

export type InProgressPlan = { planned: PlannedVideoDownload[]; savedAt: string; version: 1 };
export type VideoMetadataForPlanning = { downloadLinks: DownloadLink[]; pageTitleCandidates: PageTitleCandidates; url: string };
export type ApiTransaction = { date?: unknown; product_name?: unknown; product_url?: unknown };
