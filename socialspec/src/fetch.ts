/** What fetching a file of a site gave. 'blocked' is a failed request without a response: the
 *  browser hides why, so isReachable() tells a CORS refusal from an unreachable site. */
export type FetchResult =
    | {kind: 'ok', url: string, text: string}
    | {kind: 'missing', url: string, status: number}  // 404 or 410
    | {kind: 'http', url: string, status: number}     // any other error status
    | {kind: 'html', url: string}                     // a web page instead of the file (e.g. a catch-all route)
    | {kind: 'blocked', url: string}
    | {kind: 'timeout', url: string};

export const TIMEOUT_MS = 12000;
const MAX_LENGTH = 3_000_000;

/** Like fetch, but aborts after `ms`. */
async function fetchWithTimeout(url: string, init: RequestInit, ms: number): Promise<Response> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ms);
    try {
        return await fetch(url, {...init, signal: ctrl.signal});
    } finally {
        clearTimeout(timer);
    }
}

export const looksLikeHtml = (text: string) => /^\s*(<!doctype html|<html[\s>])/i.test(text.slice(0, 500));

/** Fetches a text file of another site. Only a CORS-safelisted header (Accept) is sent, so the
 *  request needs no preflight: a plain Access-Control-Allow-Origin on the response is enough. */
export async function fetchText(url: string, accept: string, ms = TIMEOUT_MS): Promise<FetchResult> {
    let res: Response;
    try {
        res = await fetchWithTimeout(url, {headers: {Accept: accept}, credentials: 'omit', cache: 'no-cache'}, ms);
    } catch (e) {
        return {kind: (e as Error)?.name == 'AbortError' ? 'timeout' : 'blocked', url};
    }
    if (res.status == 404 || res.status == 410)
        return {kind: 'missing', url, status: res.status};
    if (!res.ok)
        return {kind: 'http', url, status: res.status};
    return readText(res, url, res.url || url);
}

async function readText(res: Response, url: string, finalUrl: string): Promise<FetchResult> {
    let text: string;
    try {
        text = await res.text();
    } catch {
        return {kind: 'blocked', url};
    }
    if (text.length > MAX_LENGTH || looksLikeHtml(text))
        return {kind: 'html', url};
    return {kind: 'ok', url: finalUrl, text};
}

/** The CORS proxy of sodir.org and Downread, under each app's own name: GET
 *  /proxy/<scheme>/<host>/<path> fetches <scheme>://<host>/<path> and answers with CORS headers.
 *  Rate-limited (20 requests a minute per visitor), so it is only asked about files a site blocks. */
export const SODIR_PROXY = 'https://corsproxy01.sodir.org/proxy/';
export const DOWNREAD_PROXY = 'https://corsproxy01.downread.com/proxy/';

export const proxyUrl = (url: string, proxyBase: string) => {
    const u = new URL(url);
    return `${proxyBase}${u.protocol.slice(0, -1)}/${u.host}${u.pathname}${u.search}`;
};

/** Fetches a file through the CORS proxy, to find out whether a file that the site's CORS
 *  settings hide exists. The result names the file's own URL. The proxy answers 422 with the
 *  upstream status for a non-2xx answer (after at most one redirect); its own refusals (rate
 *  limits, busy, forbidden origin...) say nothing about the file: 'blocked'. */
export async function fetchViaProxy(url: string, accept: string, proxyBase: string, ms = TIMEOUT_MS): Promise<FetchResult> {
    let res: Response;
    try {
        res = await fetchWithTimeout(proxyUrl(url, proxyBase), {headers: {Accept: accept}, credentials: 'omit', cache: 'no-cache'}, ms);
    } catch (e) {
        return {kind: (e as Error)?.name == 'AbortError' ? 'timeout' : 'blocked', url};
    }
    if (res.status == 422) {
        const status = (await res.json().catch(() => undefined))?.upstreamStatus;
        if (typeof status != 'number')
            return {kind: 'blocked', url};
        return status == 404 || status == 410 ? {kind: 'missing', url, status} : {kind: 'http', url, status};
    }
    if (!res.ok)
        return {kind: 'blocked', url};
    return readText(res, url, url);
}

/** Whether the site answers at all. A no-cors request needs no CORS header: it resolves (with an
 *  unreadable response) whenever the server answers, and fails only if the site can't be reached. */
export async function isReachable(origin: string, ms = TIMEOUT_MS): Promise<boolean> {
    try {
        await fetchWithTimeout(origin + '/', {mode: 'no-cors', credentials: 'omit', cache: 'no-cache'}, ms);
        return true;
    } catch {
        return false;
    }
}
