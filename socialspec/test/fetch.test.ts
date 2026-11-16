import { fetchText, fetchViaProxy, isReachable, proxyUrl, SODIR_PROXY, DOWNREAD_PROXY } from '../src/fetch';

const mockFetch = (impl: (url: string, init: RequestInit) => Promise<any>) => {
    const fn = jest.fn(impl);
    (globalThis as any).fetch = fn;
    return fn;
};
const response = (status: number, body = '', url = '') => ({status, ok: status >= 200 && status < 300, url, text: () => Promise.resolve(body), json: () => Promise.resolve().then(() => JSON.parse(body))});

describe('fetchText', () => {
    it('returns the text and the final URL', async () => {
        const fn = mockFetch(() => Promise.resolve(response(200, 'hi', 'https://www.x.org/a')));
        expect(await fetchText('https://x.org/a', 'text/plain')).toEqual({kind: 'ok', url: 'https://www.x.org/a', text: 'hi'});
        expect(fn.mock.calls[0][1]).toMatchObject({headers: {Accept: 'text/plain'}, credentials: 'omit'});
    });

    it('tells missing files from other errors', async () => {
        mockFetch(() => Promise.resolve(response(404)));
        expect(await fetchText('https://x.org/a', '*/*')).toEqual({kind: 'missing', url: 'https://x.org/a', status: 404});
        mockFetch(() => Promise.resolve(response(503)));
        expect(await fetchText('https://x.org/a', '*/*')).toEqual({kind: 'http', url: 'https://x.org/a', status: 503});
    });

    it('detects web pages served instead of files', async () => {
        mockFetch(() => Promise.resolve(response(200, '\n<!DOCTYPE html><html>...')));
        expect((await fetchText('https://x.org/a', '*/*')).kind).toBe('html');
    });

    it('reports failed requests as blocked, and timeouts', async () => {
        mockFetch(() => Promise.reject(new TypeError('Failed to fetch')));
        expect((await fetchText('https://x.org/a', '*/*')).kind).toBe('blocked');
        mockFetch((_, init) => new Promise((_, reject) => init.signal!.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), {name: 'AbortError'})))));
        expect((await fetchText('https://x.org/a', '*/*', 10)).kind).toBe('timeout');
    });
});

describe('fetchViaProxy', () => {
    it('maps URLs to the proxy', () => {
        expect(proxyUrl('https://x.org/.well-known/about.md', SODIR_PROXY)).toBe('https://corsproxy01.sodir.org/proxy/https/x.org/.well-known/about.md');
        expect(proxyUrl('http://x.org/feed?a=1', SODIR_PROXY)).toBe('https://corsproxy01.sodir.org/proxy/http/x.org/feed?a=1');
        expect(proxyUrl('https://x.org/a', DOWNREAD_PROXY)).toBe('https://corsproxy01.downread.com/proxy/https/x.org/a');
    });

    it('returns the file under its own URL', async () => {
        const fn = mockFetch(() => Promise.resolve(response(200, 'hi', 'https://corsproxy01.sodir.org/proxy/https/x.org/a')));
        expect(await fetchViaProxy('https://x.org/a', 'text/plain', SODIR_PROXY)).toEqual({kind: 'ok', url: 'https://x.org/a', text: 'hi'});
        expect(fn.mock.calls[0][0]).toBe('https://corsproxy01.sodir.org/proxy/https/x.org/a');
        expect(fn.mock.calls[0][1]).toMatchObject({headers: {Accept: 'text/plain'}, credentials: 'omit'});
    });

    it('reads the upstream status of 422 answers', async () => {
        mockFetch(() => Promise.resolve(response(422, '{"type":"UpstreamStatus","upstreamStatus":404}')));
        expect(await fetchViaProxy('https://x.org/a', '*/*', SODIR_PROXY)).toEqual({kind: 'missing', url: 'https://x.org/a', status: 404});
        mockFetch(() => Promise.resolve(response(422, '{"type":"UpstreamStatus","upstreamStatus":500}')));
        expect(await fetchViaProxy('https://x.org/a', '*/*', SODIR_PROXY)).toEqual({kind: 'http', url: 'https://x.org/a', status: 500});
        mockFetch(() => Promise.resolve(response(422, 'not json')));
        expect((await fetchViaProxy('https://x.org/a', '*/*', SODIR_PROXY)).kind).toBe('blocked');
    });

    it('can’t tell when the proxy refuses or fails', async () => {
        mockFetch(() => Promise.resolve(response(429, '{"type":"RateLimited"}')));
        expect((await fetchViaProxy('https://x.org/a', '*/*', SODIR_PROXY)).kind).toBe('blocked');
        mockFetch(() => Promise.resolve(response(403, '{"type":"ForbiddenOrigin"}')));
        expect((await fetchViaProxy('https://x.org/a', '*/*', SODIR_PROXY)).kind).toBe('blocked');
        mockFetch(() => Promise.reject(new TypeError('Failed to fetch')));
        expect((await fetchViaProxy('https://x.org/a', '*/*', SODIR_PROXY)).kind).toBe('blocked');
    });

    it('detects web pages served instead of files', async () => {
        mockFetch(() => Promise.resolve(response(200, '<!doctype html><html>')));
        expect((await fetchViaProxy('https://x.org/a', '*/*', SODIR_PROXY)).kind).toBe('html');
    });
});

describe('isReachable', () => {
    it('sends a no-cors request to the site root', async () => {
        const fn = mockFetch(() => Promise.resolve({status: 0, ok: false, type: 'opaque'}));
        expect(await isReachable('https://x.org')).toBe(true);
        expect(fn.mock.calls[0][0]).toBe('https://x.org/');
        expect(fn.mock.calls[0][1]).toMatchObject({mode: 'no-cors'});
        mockFetch(() => Promise.reject(new TypeError('Failed to fetch')));
        expect(await isReachable('https://x.org')).toBe(false);
    });
});
