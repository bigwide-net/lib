import { MAX_ITEMS, parseFeed, plainText, truncate } from '../src/feed';

describe('parseFeed', () => {
    it('parses RSS 2.0, including titleless items', () => {
        const f = parseFeed(`<rss version="2.0"><channel><title>Manton Reece</title><description></description>
            <item><title></title><link>https://www.manton.org/2026/10/27/x.html</link><pubDate>Tue, 27 Oct 2026 11:00:00 -0500</pubDate>
            <description>&lt;p&gt;In Sunlit 4.0 &amp;amp; more &lt;em&gt;photos&lt;/em&gt;.&lt;/p&gt;</description></item>
            <item><title>Hello</title><link>/rel.html</link></item>
        </channel></rss>`, 'https://www.manton.org/feed.xml')!;
        expect(f.title).toBe('Manton Reece');
        expect(f.description).toBeUndefined();
        expect(f.items[0]).toEqual({title: undefined, url: 'https://www.manton.org/2026/10/27/x.html',
            date: new Date('2026-10-27T16:00:00Z'), summary: 'In Sunlit 4.0 & more photos.'});
        expect(f.items[1]).toMatchObject({title: 'Hello', url: 'https://www.manton.org/rel.html', date: undefined});
    });

    it('parses Atom', () => {
        const f = parseFeed(`<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><title>HyperTexting</title><subtitle>Notes</subtitle>
            <entry><title type="html">A &lt;b&gt;bold&lt;/b&gt; move</title><link rel="self" href="https://h.com/self"/><link href="https://h.com/a"/>
            <updated>2026-09-12T10:00:00Z</updated><summary>Short.</summary></entry></feed>`, 'https://h.com/atom.xml')!;
        expect(f).toMatchObject({title: 'HyperTexting', description: 'Notes'});
        expect(f.items).toEqual([{title: 'A bold move', url: 'https://h.com/a', date: new Date('2026-09-12T10:00:00Z'), summary: 'Short.'}]);
    });

    it('parses RSS 1.0 (RDF)', () => {
        const f = parseFeed(`<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="http://purl.org/rss/1.0/" xmlns:dc="http://purl.org/dc/elements/1.1/">
            <channel><title>Old</title></channel><item><title>One</title><link>https://o.org/1</link><dc:date>2026-01-02T00:00:00Z</dc:date></item></rdf:RDF>`, 'https://o.org/index.rdf')!;
        expect(f.items).toEqual([{title: 'One', url: 'https://o.org/1', date: new Date('2026-01-02T00:00:00Z'), summary: undefined}]);
    });

    it('parses JSON Feed and limits the items', () => {
        const items = Array.from({length: 30}, (_, i) => ({id: String(i), url: `https://j.org/${i}`, content_html: `<p>Post ${i}</p>`, date_published: '2026-09-30T08:00:00Z'}));
        const f = parseFeed(JSON.stringify({version: 'https://jsonfeed.org/version/1.1', title: 'J', items}), 'https://j.org/feed.json')!;
        expect(f.title).toBe('J');
        expect(f.items).toHaveLength(MAX_ITEMS);
        expect(f.items[0]).toEqual({title: undefined, url: 'https://j.org/0', date: new Date('2026-09-30T08:00:00Z'), summary: 'Post 0'});
    });

    it('returns undefined for other content', () => {
        expect(parseFeed('{"hello": 1}', 'https://x.org/feed')).toBeUndefined();
        expect(parseFeed('<opml version="2.0"/>', 'https://x.org/feed')).toBeUndefined();
        expect(parseFeed('plain text', 'https://x.org/feed')).toBeUndefined();
        expect(parseFeed('<rss><channel>', 'https://x.org/feed')).toBeUndefined();
    });
});

describe('text helpers', () => {
    it('plainText strips tags without running anything', () => {
        expect(plainText('<img src=x onerror="window.hacked=1"><b>Hi</b>\n  there')).toBe('Hi there');
        expect((window as any).hacked).toBeUndefined();
        expect(plainText(undefined)).toBe('');
    });

    it('truncate cuts at a word boundary', () => {
        expect(truncate('short', 10)).toBe('short');
        expect(truncate('one two three four five', 15)).toBe('one two three…');
    });
});
