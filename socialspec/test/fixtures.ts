import type { FetchResult } from '../src/fetch';
import type { Deps } from '../src/profile';

export const ABOUT = '---\nsummary: Eager explorer.\n---\n### About Jordan\nHi.';
export const OPML = '<opml version="2.0"><body><outline text="Anil Dash" xmlUrl="https://www.anildash.com/feed.xml"/></body></opml>';
export const VCARD = 'BEGIN:VCARD\nVERSION:4.0\nFN:Jordan Doe\nEMAIL;PREF=1:hello@jordandoe.com\nURL:https://jordandoe.com\nEND:VCARD';
export const RSS = '<rss version="2.0"><channel><title>Jordan’s blog</title><description>A blog</description><item><title>First tomatoes</title><link>https://jordandoe.com/t</link><pubDate>Sat, 12 Sep 2026 10:00:00 GMT</pubDate></item></channel></rss>';

type Answers = Record<string, FetchResult['kind'] | string>;

/** A fake fetch answering from a map of URL → result. */
const answer = (files: Answers, fallback: FetchResult['kind'], calls: string[]) => async (url: string): Promise<FetchResult> => {
    calls.push(url);
    const v = files[url] ?? fallback;
    if (v == 'missing')
        return {kind: 'missing', url, status: 404};
    if (v == 'blocked' || v == 'timeout' || v == 'html')
        return {kind: v, url};
    if (v == 'http')
        return {kind: 'http', url, status: 500};
    return {kind: 'ok', url, text: v};
};

/** Deps whose fetchText answers from `files` (default: 404) and whose CORS proxy answers from
 *  `proxied` (default: 'blocked', the proxy can't tell). */
export function fakeDeps(files: Answers, reachable = true, proxied: Answers = {}): Deps & {calls: string[], proxyCalls: string[]} {
    const calls: string[] = [];
    const proxyCalls: string[] = [];
    return {
        calls,
        proxyCalls,
        fetchText: answer(files, 'missing', calls),
        fetchViaProxy: answer(proxied, 'blocked', proxyCalls),
        isReachable: async () => reachable,
    };
}
