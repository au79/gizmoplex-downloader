export function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export function sanitizePathComponent(value: string): string {
  const sanitized = normalizeText(value)
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-')
    .replace(/\.+$/g, '')
    .replace(/\s*-\s*/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .trim();

  return sanitized || 'untitled';
}

export function formatBytes(bytes: number | undefined): string {
  if (bytes === undefined || !Number.isFinite(bytes)) {
    return 'unknown size';
  }

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  const precision = unitIndex === 0 || value >= 10 ? 0 : 1;

  return `${value.toFixed(precision)} ${units[unitIndex]}`;
}

export function formatDuration(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${padDurationValue(hours)}h${padDurationValue(minutes)}m${padDurationValue(seconds)}s`;
  }

  if (minutes > 0) {
    return `${padDurationValue(minutes)}m${padDurationValue(seconds)}s`;
  }

  return `${padDurationValue(seconds)}s`;
}

export function redactUrl(value: string): string {
  try {
    const url = new URL(value);
    if (!url.username && !url.password && !url.search && !url.hash) return value;
    url.username = '';
    url.password = '';
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return value;
  }
}

export function redactUrlsInText(value: string): string {
  return value.replace(/https?:\/\/[^\s<>"']+/gi, (url) => redactUrl(url));
}

function padDurationValue(value: number): string {
  return String(value).padStart(2, '0');
}
