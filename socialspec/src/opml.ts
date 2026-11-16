import { bareHost, handleOf, hostOf, httpUrl } from './domain';

/** One site of /.well-known/following.opml (FollowSpec). */
export interface FollowEntry {
    name: string;
    /** @ and the site's domain. */
    handle: string;
    /** The host whose profile it is (of its site, else of its feed). */
    host: string;
    feedUrl?: string;
    siteUrl?: string;
}

/** Parses an OPML subscription list: every outline with a feed (xmlUrl) or a site (htmlUrl, or
 *  url of type="link" outlines), in any folder. Undefined if the text is no OPML. */
export function parseOpml(text: string, base: string): FollowEntry[] | undefined {
    const doc = new DOMParser().parseFromString(text.replace(/^﻿/, ''), 'text/xml');
    if (doc.getElementsByTagName('parsererror').length || doc.documentElement?.localName.toLowerCase() != 'opml')
        return undefined;
    const entries: FollowEntry[] = [];
    const seen = new Set<string>();
    for (const o of Array.from(doc.getElementsByTagName('outline'))) {
        const attr = (name: string) => o.getAttribute(name)?.trim() || undefined;
        const feedUrl = httpUrl(attr('xmlUrl'), base);
        const siteUrl = httpUrl(attr('htmlUrl') ?? attr('url'), base);
        const host = hostOf(siteUrl) ?? hostOf(feedUrl);
        const key = feedUrl ?? siteUrl;
        if (!host || !key || seen.has(key))
            continue;
        seen.add(key);
        const text = attr('text');
        // "Dave Winer (@dave)": the handle of another network, not the site's.
        const textName = text?.startsWith('@') ? undefined : text?.replace(/\s*\(@[^)]*\)$/, '');
        entries.push({
            name: attr('title') ?? textName ?? bareHost(host),
            handle: handleOf(host),
            host,
            feedUrl,
            siteUrl,
        });
    }
    return entries;
}
