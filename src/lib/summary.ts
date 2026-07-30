import { formatBytes } from './format.js';

export type CountedFileType = 'mp4' | 'srt' | 'vtt' | 'zip';

export type SummaryDownload = {
  extension: string;
  sizeBytes?: number;
  skip: boolean;
};

export type DownloadSummary = {
  alreadyDownloaded: DownloadSummaryRow;
  remaining: DownloadSummaryRow;
  required: DownloadSummaryRow;
};

export type DownloadSummaryRow = {
  counts: Record<CountedFileType, number>;
  sizeBytes: number;
  unknownSizes: number;
};

export function createDownloadSummary(): DownloadSummary {
  return {
    alreadyDownloaded: createDownloadSummaryRow(),
    remaining: createDownloadSummaryRow(),
    required: createDownloadSummaryRow(),
  };
}

export function addSummaryDownload(row: DownloadSummaryRow, download: SummaryDownload): void {
  const fileType = countedFileType(download.extension);

  if (fileType) {
    row.counts[fileType] += 1;
  }

  if (download.sizeBytes === undefined) {
    row.unknownSizes += 1;
  } else {
    row.sizeBytes += download.sizeBytes;
  }
}

export function printDownloadSummary(summary: DownloadSummary, output: (message?: unknown) => void): void {
  const rows = [
    ['Section', 'Size', 'MP4', 'ZIP', 'VTT', 'SRT', 'Unknown'],
    downloadSummaryRow('Already downloaded', summary.alreadyDownloaded),
    downloadSummaryRow('Remaining download', summary.remaining),
    downloadSummaryRow('Total required', summary.required),
  ];
  const widths = rows[0].map((_, columnIndex) => Math.max(...rows.map((row) => row[columnIndex].length)));

  output('');
  for (const row of rows) {
    output(row.map((value, index) => value.padEnd(widths[index])).join('  '));
  }
}

function createDownloadSummaryRow(): DownloadSummaryRow {
  return {
    counts: { mp4: 0, srt: 0, vtt: 0, zip: 0 },
    sizeBytes: 0,
    unknownSizes: 0,
  };
}

function countedFileType(extension: string): CountedFileType | undefined {
  const normalized = extension.toLowerCase();

  return normalized === 'mp4' || normalized === 'srt' || normalized === 'vtt' || normalized === 'zip'
    ? normalized
    : undefined;
}

function downloadSummaryRow(label: string, row: DownloadSummaryRow): string[] {
  return [label, formatBytes(row.sizeBytes), String(row.counts.mp4), String(row.counts.zip), String(row.counts.vtt), String(row.counts.srt), String(row.unknownSizes)];
}
