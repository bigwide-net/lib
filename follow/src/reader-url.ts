/** The feed fields a reader's subscribe URL needs. */
export interface ReaderUrlFeed {
    /** Downread's feed id; feeds outside Downread's catalog have none. */
    id?: string;
    friendlyId?: string;
    url: string;
    /** The site's domain, for apps that follow sites rather than feeds (HyperTexting). */
    site?: string;
}

/** A reader's subscribe URL from its template in the site's site.json5: {url} = URL-encoded feed
 *  URL, {rawUrl} = plain feed URL, {id} = Downread's friendly id (or id; empty without one),
 *  {site} = the site's domain (empty without one, see needsSite). */
export const readerUrl = (template: string, feed: ReaderUrlFeed): string =>
    template.replaceAll('{url}', encodeURIComponent(feed.url)).replaceAll('{rawUrl}', feed.url)
        .replaceAll('{id}', feed.friendlyId || feed.id || '').replaceAll('{site}', feed.site ?? '');

/** Whether a reader follows the site's domain ({site}), so it can't take a feed without one. */
export const needsSite = (template: string) => template.includes('{site}');

/** Whether a reader's URL scheme belongs to an iOS-only app (HyperTexting's htxt:), so that other
 *  systems can't open it. */
export const iosOnly = (template: string) => /^htxt:/i.test(template.trim());

/** The placeholder of custom reader URLs, matched in any case. */
const CUSTOM_PLACEHOLDER = /\{url\}/gi;

/** A custom reader's subscribe URL: {URL} becomes the feed URL, percent-encoded as a parameter
 *  (after '?' or '#'), else (in a path, or after a scheme like feed:) as is, with only the
 *  characters escaped that a URL can't contain or that would end the path early ('#'). */
export const customReaderUrl = (template: string, feedUrl: string): string =>
    template.trim().replace(CUSTOM_PLACEHOLDER, (_match, offset: number, all: string) =>
        /[?#]/.test(all.slice(0, offset)) ? encodeURIComponent(feedUrl) : encodeURI(feedUrl).replaceAll('#', '%23'));

/** Why a custom reader URL can't be used, undefined if it can. Only http(s) URLs are checked
 *  beyond their scheme; others (feed:, an app's own scheme) are taken as they are. */
export function customReaderError(template: string): string | undefined {
    const t = template.trim();
    const scheme = /^([a-z][a-z\d+.-]*):/i.exec(t)?.[1].toLowerCase();
    if (!scheme) return 'This is not a valid URL.';
    if (!new RegExp(CUSTOM_PLACEHOLDER.source, 'i').test(t)) return 'Put {URL} where the feed URL goes.';
    if (scheme != 'http' && scheme != 'https') return undefined;
    // The URL parser would also take 'https:/host' or 'https:///host'.
    if (!/^https?:\/\/[^/?#\\]/i.test(t)) return 'This is not a valid URL.';
    let host: string;
    try {
        host = new URL(customReaderUrl(t, 'https://feed.test/rss')).hostname;
    } catch {
        return 'This is not a valid URL.';
    }
    if (/(^|\.)example\.com$/i.test(host)) return 'Replace the example address with your reader’s.';
    return undefined;
}
