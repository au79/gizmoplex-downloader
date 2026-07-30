import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFile, rm } from 'node:fs/promises';
import { FetchHttpClient, getSetCookies, login } from './http-client.js';

afterEach(() => vi.unstubAllGlobals());

describe('HTTP client', () => {
  it('extracts modern and fallback cookie headers', () => {
    const modern = new Headers();
    Object.assign(modern, { getSetCookie: () => ['a=1; Path=/', 'b=2'] });
    expect(getSetCookies(modern)).toEqual(['a=1; Path=/', 'b=2']);
    expect(getSetCookies(new Headers({ 'set-cookie': 'a=1; Path=/, b=2; Path=/' }))).toEqual(['a=1; Path=/', 'b=2; Path=/']);
    expect(getSetCookies(new Headers())).toEqual([]);
    const fallback = new Headers({ 'set-cookie': 'c=3' });
    Object.defineProperty(fallback, 'getSetCookie', { value: undefined });
    expect(getSetCookies(fallback)).toEqual(['c=3']);
    const emptyFallback = new Headers();
    Object.defineProperty(emptyFallback, 'getSetCookie', { value: undefined });
    expect(getSetCookies(emptyFallback)).toEqual([]);
  });

  it('stores cookies and follows redirects', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('', { status: 302, headers: { location: '/next', 'set-cookie': 'session=abc; Path=/' } }))
      .mockResolvedValueOnce(new Response('ok', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const client = new FetchHttpClient(1000);
    await expect(client.get('https://example.test/start')).resolves.toMatchObject({ body: 'ok' });
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ headers: expect.objectContaining({ cookie: 'session=abc' }) });
  });

  it('preserves POST methods across 307 redirects and rejects ordinary HTTP errors', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('', { status: 307, headers: { location: '/post-target' } }))
      .mockResolvedValueOnce(new Response('ok', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(new FetchHttpClient(1000).post('https://example.test/post', new URLSearchParams('a=b'), 'https://example.test/form')).resolves.toMatchObject({ body: 'ok' });
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: 'POST' });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 404 })));
    await expect(new FetchHttpClient(1000).get('https://example.test/missing')).rejects.toThrow('Request failed: 404');
  });

  it('logs in and follows the authenticated redirect', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('<form id="login-form-password"><input name="authenticity_token" value="token"></form>', { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ redirect_url: '/account' }), { status: 200 }))
      .mockResolvedValueOnce(new Response('account', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(login('rev@example.test', 'secret', 1000)).resolves.toBeDefined();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('translates login failures', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('<form id="login-form-password"><input name="authenticity_token" value="token"></form>', { status: 200 }))
      .mockResolvedValueOnce(new Response('unauthorized', { status: 401 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(login('rev@example.test', 'bad', 1000)).rejects.toThrow('returned 401');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html></html>', { status: 200 })));
    await expect(login('rev@example.test', 'bad', 1000)).rejects.toThrow('authenticity token');
  });

  it('translates non-auth login errors and missing redirect locations', async () => {
    const loginFailure = vi.fn()
      .mockResolvedValueOnce(new Response('<form id="login-form-password"><input name="authenticity_token" value="token"></form>', { status: 200 }))
      .mockResolvedValueOnce(new Response('<div class="alert">Bad credentials</div>', { status: 422 }));
    vi.stubGlobal('fetch', loginFailure);
    await expect(login('rev@example.test', 'bad', 1000)).rejects.toThrow('Bad credentials');
    const noMessage = vi.fn()
      .mockResolvedValueOnce(new Response('<form id="login-form-password"><input name="authenticity_token" value="token"></form>', { status: 200 }))
      .mockResolvedValueOnce(new Response('<html></html>', { status: 422 }));
    vi.stubGlobal('fetch', noMessage);
    await expect(login('rev@example.test', 'bad', 1000)).rejects.toThrow('No site error message');
    const redirect = vi.fn().mockResolvedValue(new Response('', { status: 302 }));
    vi.stubGlobal('fetch', redirect);
    await expect(new FetchHttpClient(1000).get('https://example.test/start')).rejects.toThrow('did not include a location');
    const invalidRedirect = vi.fn()
      .mockResolvedValueOnce(new Response('<form id="login-form-password"><input name="authenticity_token" value="token"></form>', { status: 200 }))
      .mockResolvedValueOnce(new Response('not-json', { status: 200 }));
    vi.stubGlobal('fetch', invalidRedirect);
    await expect(login('rev@example.test', 'secret', 1000)).resolves.toBeDefined();
  });

  it('retries transient server responses', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('retry', { status: 503 }))
      .mockResolvedValueOnce(new Response('ok', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const pending = new FetchHttpClient(1000).get('https://example.test/retry');
    await vi.advanceTimersByTimeAsync(1000);
    await expect(pending).resolves.toMatchObject({ body: 'ok' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it('exhausts retryable network failures and enforces redirect limits', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network down')));
    const pending = new FetchHttpClient(1000).get('https://example.test/network');
    const rejection = expect(pending).rejects.toThrow('after 10 attempts');
    for (let index = 0; index < 9; index += 1) await vi.advanceTimersByTimeAsync(2 ** index * 1000);
    await rejection;
    vi.useRealTimers();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 302, headers: { location: '/again' } })));
    await expect(new FetchHttpClient(1000).get('https://example.test/redirect')).rejects.toThrow('Too many redirects');
  });

  it('supports bearer/header requests and unknown content lengths', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('{}', { status: 200 }))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }))
      .mockResolvedValueOnce(new Response('', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const client = new FetchHttpClient(1000);
    await expect(client.getWithBearer('https://api.test/video', 'token')).resolves.toBeDefined();
    await expect(client.getWithHeaders('https://api.test/video', { accept: 'application/json' })).resolves.toBeDefined();
    await expect(client.contentLength('https://api.test/video')).resolves.toBeUndefined();
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ headers: expect.objectContaining({ authorization: 'Bearer token' }) });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 200, headers: { 'content-length': '0' } })));
    await expect(client.contentLength('https://api.test/zero')).resolves.toBe(0);
  });

  it('streams downloads through a temporary file and rejects empty bodies', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response('abc', { status: 200, headers: { 'content-length': '3' } }));
    vi.stubGlobal('fetch', fetchMock);
    const client = new FetchHttpClient(1000);
    const filePath = '/tmp/gizmo-http-download';
    try {
      await client.downloadToFile('https://cdn.test/video.mp4', filePath, 'video');
      await expect(readFile(filePath, 'utf8')).resolves.toBe('abc');
    } finally { await rm(filePath, { force: true }); await rm(`${filePath}.part`, { force: true }); }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 200 })));
    await expect(client.downloadToFile('https://cdn.test/empty', filePath)).rejects.toThrow('body was empty');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('wrong', { status: 200, headers: { 'content-length': '10' } })));
    await expect(client.downloadToFile('https://cdn.test/truncated', filePath)).rejects.toThrow('Download size mismatch');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('missing', { status: 404 })));
    await expect(client.downloadToFile('https://cdn.test/missing', filePath)).rejects.toThrow('Download failed: 404');
  });

  it('ignores malformed cookie pairs and reports login responses without site messages', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('<form id="login-form-password"><input name="authenticity_token" value="token"></form>', { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ redirect_url: 42 }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(login('rev@example.test', 'secret', 1000)).resolves.toBeDefined();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 302, headers: { location: '/next', 'set-cookie': '=bad' } })));
    await expect(new FetchHttpClient(1000).get('https://example.test/cookie')).rejects.toThrow('Too many redirects');
  });
});
