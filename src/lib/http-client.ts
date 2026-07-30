import * as cheerio from 'cheerio';
import { createWriteStream } from 'node:fs';
import { rename, rm } from 'node:fs/promises';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { assertDownloadedSize } from './download-verification.js';
import { formatRetryDelay, isRetryableFetchError, isRetryableStatus, sleep, errorMessage } from './runtime.js';
import { redactUrl } from './format.js';
import { createDownloadProgressBar, finishProgressBar, parseContentLength, progressTickLength, progressTokens } from './download-execution.js';
import type { HttpResponse } from '../types.js';

export const LOGIN_URL = 'https://www.gizmoplex.com/login';
const MAX_FETCH_ATTEMPTS = 10;
const INITIAL_RETRY_DELAY_MS = 1000;

export interface HttpClient {
  get(url: string, accept?: string, resourceDescription?: string): Promise<HttpResponse>;
  post(url: string, body: URLSearchParams, referer: string): Promise<HttpResponse>;
  getWithBearer(url: string, token: string, resourceDescription?: string): Promise<HttpResponse>;
  getWithHeaders(url: string, headers: HeadersInit, resourceDescription?: string): Promise<HttpResponse>;
  contentLength(url: string, resourceDescription?: string): Promise<number | undefined>;
  downloadToFile(url: string, filePath: string, resourceDescription?: string): Promise<void>;
}

export class FetchHttpClient implements HttpClient {
  private readonly cookies = new Map<string, string>();

  constructor(private readonly timeout: number) {}

  async get(url: string, accept = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', resourceDescription = url): Promise<HttpResponse> {
    return this.request(url, { method: 'GET', headers: { accept } }, resourceDescription);
  }

  async post(url: string, body: URLSearchParams, referer: string): Promise<HttpResponse> {
    return this.request(url, {
      method: 'POST',
      body,
      headers: {
        accept: 'application/json',
        'content-type': 'application/x-www-form-urlencoded',
        origin: new URL(url).origin,
        referer,
        'x-requested-with': 'XMLHttpRequest',
      },
    }, `Gizmoplex login submission for ${referer}`, true);
  }

  async getWithBearer(url: string, token: string, resourceDescription = url): Promise<HttpResponse> {
    return this.request(url, { method: 'GET', headers: { accept: 'application/json', authorization: `Bearer ${token}` } }, resourceDescription);
  }

  async getWithHeaders(url: string, headers: HeadersInit, resourceDescription = url): Promise<HttpResponse> {
    return this.request(url, { method: 'GET', headers }, resourceDescription);
  }

  async contentLength(url: string, resourceDescription = url): Promise<number | undefined> {
    const response = await this.fetchRaw(url, { method: 'HEAD', headers: { accept: '*/*' } }, 0, true, `content length for ${resourceDescription}`);
    const value = response.headers.get('content-length');
    return value ? Number.parseInt(value, 10) : undefined;
  }

  async downloadToFile(url: string, filePath: string, resourceDescription = url): Promise<void> {
    const response = await this.fetchRaw(url, { method: 'GET', headers: { accept: '*/*' } }, 0, false, `download ${resourceDescription} to ${filePath}`, true);
    if (!response.ok) throw new Error(`Download failed: ${response.status} ${response.statusText} for ${url}`);
    if (!response.body) throw new Error(`Download failed: response body was empty for ${url}`);

    const tempPath = `${filePath}.part`;
    const totalBytes = parseContentLength(response.headers);
    const progress = createDownloadProgressBar(resourceDescription, totalBytes);
    let downloadedBytes = 0;
    const startedAt = Date.now();
    const progressStream = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        downloadedBytes += chunk.length;
        progress.tick(progressTickLength(progress, chunk.length), progressTokens(downloadedBytes, totalBytes, startedAt));
        callback(null, chunk);
      },
    });

    try {
      await pipeline(Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]), progressStream, createWriteStream(tempPath));
      assertDownloadedSize(resourceDescription, totalBytes, downloadedBytes);
      finishProgressBar(progress, downloadedBytes, totalBytes, startedAt);
      await rename(tempPath, filePath);
    } catch (error) {
      progress.terminate();
      await rm(tempPath, { force: true });
      throw error;
    }
  }

  private async request(url: string, init: RequestInit, resourceDescription: string, returnHttpErrors = false, redirectCount = 0): Promise<HttpResponse> {
    const response = await this.fetchRaw(url, init, redirectCount, true, resourceDescription, returnHttpErrors);
    return { body: await response.text(), status: response.status, url: response.url };
  }

  private async fetchRaw(url: string, init: RequestInit, redirectCount = 0, useTimeout = true, resourceDescription = url, returnHttpErrors = false): Promise<Response> {
    if (redirectCount > 10) throw new Error(`Too many redirects while fetching ${resourceDescription} (${redactUrl(url)}).`);
    let retryDelayMs = INITIAL_RETRY_DELAY_MS;
    let lastError: unknown;

    for (let attempt = 1; attempt <= MAX_FETCH_ATTEMPTS; attempt += 1) {
      try {
        const response = await fetch(url, {
          ...init,
          redirect: 'manual',
          headers: { 'user-agent': 'gizmoplex-downloader/1.0', accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', cookie: this.cookieHeader(), ...init.headers },
          signal: useTimeout ? AbortSignal.timeout(this.timeout) : undefined,
        });
        this.storeCookies(response.headers);
        if (response.status >= 300 && response.status < 400) {
          const location = response.headers.get('location');
          if (!location) throw new Error(`Redirect from ${redactUrl(url)} did not include a location while fetching ${resourceDescription}.`);
          const nextUrl = new URL(location, url).toString();
          return this.fetchRaw(nextUrl, response.status === 307 || response.status === 308 ? init : { method: 'GET' }, redirectCount + 1, useTimeout, resourceDescription, returnHttpErrors);
        }
        if (response.ok || response.status === 401) return response;
        if (!isRetryableStatus(response.status)) {
          if (returnHttpErrors) return response;
          throw new Error(`Request failed: ${response.status} ${response.statusText} while fetching ${resourceDescription} (${redactUrl(url)}).`);
        }
        lastError = new Error(`Request failed: ${response.status} ${response.statusText}`);
      } catch (error) {
        lastError = error;
        if (!isRetryableFetchError(error)) throw new Error(`Request failed while fetching ${resourceDescription} (${redactUrl(url)}): ${errorMessage(error)}`);
      }
      if (attempt < MAX_FETCH_ATTEMPTS) {
        console.error(`Fetch attempt ${attempt}/${MAX_FETCH_ATTEMPTS} failed for ${resourceDescription} (${redactUrl(url)}): ${errorMessage(lastError)}. Retrying in ${formatRetryDelay(retryDelayMs)}...`);
        await sleep(retryDelayMs);
        retryDelayMs *= 2;
      }
    }
    throw new Error(`Request failed after ${MAX_FETCH_ATTEMPTS} attempts while fetching ${resourceDescription} (${redactUrl(url)}): ${errorMessage(lastError)}`);
  }

  private cookieHeader(): string { return [...this.cookies.entries()].map(([name, value]) => `${name}=${value}`).join('; '); }

  private storeCookies(headers: Headers): void {
    for (const cookie of getSetCookies(headers)) {
      const [pair] = cookie.split(';', 1);
      const separatorIndex = pair.indexOf('=');
      if (separatorIndex > 0) this.cookies.set(pair.slice(0, separatorIndex), pair.slice(separatorIndex + 1));
    }
  }
}

export function getSetCookies(headers: Headers): string[] {
  const withHelper = headers as Headers & { getSetCookie?: () => string[] };
  if (withHelper.getSetCookie) return withHelper.getSetCookie().flatMap((cookie) => cookie.split(/,(?=\s*[A-Za-z0-9_\-]+=)/).map((part) => part.trim()));
  const header = headers.get('set-cookie');
  return header ? header.split(/,(?=\s*[A-Za-z0-9_\-]+=)/).map((part) => part.trim()) : [];
}

export async function login(email: string, userPassword: string, timeout: number): Promise<HttpClient> {
  const client = new FetchHttpClient(timeout);
  const loginPage = await client.get(LOGIN_URL, undefined, 'Gizmoplex login page');
  const authenticityToken = cheerio.load(loginPage.body)('#login-form-password input[name="authenticity_token"]').attr('value');
  if (!authenticityToken) throw new Error('Could not find login authenticity token.');

  const loginResponse = await client.post(new URL('/login.json', LOGIN_URL).toString(), new URLSearchParams({ email, password: userPassword, authenticity_token: authenticityToken, utf8: '✓' }), LOGIN_URL);
  if (loginResponse.status === 401) throw new Error('Login failed: Gizmoplex returned 401 for the configured email/password.');
  if (loginResponse.status >= 400) throw new Error(`Login failed: Gizmoplex returned ${loginResponse.status}. ${extractPageError(loginResponse.body)}`.trim());
  const redirectUrl = extractRedirectUrl(loginResponse.body);
  if (redirectUrl) await client.get(redirectUrl);
  return client;
}

function extractPageError(html: string): string {
  const $ = cheerio.load(html);
  const message = ['.alert', '.error', '.errors', '[data-error]', '#error_explanation', '.signin-flow__error']
    .map((selector) => $(selector).first().text().replace(/\s+/g, ' ').trim()).find(Boolean);
  return message ? `Site message: ${message}` : 'No site error message was found on the returned login page.';
}

function extractRedirectUrl(body: string): string | undefined {
  try {
    const redirectUrl = (JSON.parse(body) as { redirect_url?: unknown }).redirect_url;
    return typeof redirectUrl === 'string' ? new URL(redirectUrl, LOGIN_URL).toString() : undefined;
  } catch {
    return undefined;
  }
}
