import { httpUrl } from './domain';

/** The site's own feed, for the Posts tab. Deliberately simple: titles, dates and a plain text
 *  excerpt. Downread's post renderer will replace it. */
export interface FeedItem {
    title?: string;
    url?: string;
    date?: Date;
    summary?: string;
}

export interface Feed {
    url: string;
    title?: string;
    description?: string;
    items: FeedItem[];
}

export const MAX_ITEMS = 20;
const SUMMARY_LENGTH = 280;

/** The addresses tried for the feed, best first. The site's HTML page isn't read yet, so its
 *  <link rel="alternate"> isn't known; these are the paths feeds most often have. */
export const FEED_PATHS = ['/feed.xml', '/feed.json', '/feed', '/feed/', '/rss.xml', '/atom.xml', '/index.xml', '/rss', '/feeds/main.xml'];

/** Plain text of HTML, in one line. DOMParser documents run no scripts and load nothing. */
export function plainText(html: string | undefined): string {
    if (!html)
        return '';
    const text = /[<&]/.test(html) ? new DOMParser().parseFromString(html, 'text/html').body.textContent ?? '' : html;
    return text.replace(/\s+/g, ' ').trim();
}

/** Shortens text to about `max` characters, at a word boundary. */
export function truncate(text: string, max = SUMMARY_LENGTH): string {
    if (text.length <= max)
        return text;
    const cut = text.slice(0, max);
    const space = cut.lastIndexOf(' ');
    return (space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,.;:–-]+$/, '') + '…';
}

function toDate(s: string | undefined): Date | undefined {
    const d = s ? new Date(s.trim()) : undefined;
    return d && !isNaN(d.getTime()) ? d : undefined;
}

const item = (title: string | undefined, url: string | undefined, date: string | undefined, html: string | undefined, base: string): FeedItem => ({
    title: plainText(title) || undefined,
    url: httpUrl(url, base),
    date: toDate(date),
    summary: truncate(plainText(html)) || undefined,
});

function parseJsonFeed(text: string, url: string): Feed | undefined {
    let json: any;
    try {
        json = JSON.parse(text);
    } catch {
        return undefined;
    }
    if (!Array.isArray(json?.items))
        return undefined;
    return {
        url,
        title: typeof json.title == 'string' ? json.title.trim() || undefined : undefined,
        description: typeof json.description == 'string' ? plainText(json.description) || undefined : undefined,
        items: json.items.slice(0, MAX_ITEMS).map((i: any) =>
            item(i.title, i.url ?? i.external_url, i.date_published ?? i.date_modified, i.summary ?? i.content_text ?? i.content_html, url)),
    };
}

/** Children of an element by local name, whatever their namespace. */
const children = (e: Element, name: string) => Array.from(e.children).filter(c => c.localName == name);
const childText = (e: Element, ...names: string[]) => {
    for (const n of names) {
        const t = children(e, n)[0]?.textContent?.trim();
        if (t)
            return t;
    }
    return undefined;
};

function atomLink(e: Element): string | undefined {
    const links = children(e, 'link');
    return (links.find(l => (l.getAttribute('rel') ?? 'alternate') == 'alternate') ?? links[0])?.getAttribute('href') ?? undefined;
}

function parseXmlFeed(text: string, url: string): Feed | undefined {
    const doc = new DOMParser().parseFromString(text, 'text/xml');
    const root = doc.documentElement;
    if (!root || doc.getElementsByTagName('parsererror').length)
        return undefined;
    if (root.localName == 'feed') {
        return {
            url,
            title: plainText(childText(root, 'title')) || undefined,
            description: plainText(childText(root, 'subtitle')) || undefined,
            items: children(root, 'entry').slice(0, MAX_ITEMS).map(e =>
                item(childText(e, 'title'), atomLink(e), childText(e, 'published', 'updated'), childText(e, 'summary', 'content'), url)),
        };
    }
    // RSS 2.0 (items in <channel>) and RSS 1.0 (rdf:RDF, items next to <channel>)
    const channel = children(root, 'channel')[0];
    if (!channel || (root.localName != 'rss' && root.localName != 'RDF'))
        return undefined;
    const items = children(channel, 'item').concat(children(root, 'item'));
    return {
        url,
        title: plainText(childText(channel, 'title')) || undefined,
        description: plainText(childText(channel, 'description')) || undefined,
        items: items.slice(0, MAX_ITEMS).map(i =>
            item(childText(i, 'title'), childText(i, 'link'), childText(i, 'pubDate', 'date'), childText(i, 'description', 'encoded'), url)),
    };
}

/** Parses RSS 1.0/2.0, Atom or JSON Feed; undefined if the text is none of them. */
export function parseFeed(text: string, url: string): Feed | undefined {
    const t = text.replace(/^﻿/, '').trim();
    return t.startsWith('{') ? parseJsonFeed(t, url) : t.startsWith('<') ? parseXmlFeed(t, url) : undefined;
}
