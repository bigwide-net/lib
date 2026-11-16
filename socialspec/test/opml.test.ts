import { parseOpml } from '../src/opml';

describe('parseOpml', () => {
    it('reads FollowSpec outlines with title and text handle', () => {
        const list = parseOpml(`<?xml version="1.0" encoding="UTF-8"?><opml version="1.0"><head><title>Following</title></head><body>
            <outline text="@herd.works" title="Herd Works" htmlUrl="https://herd.works" xmlUrl="https://herd.works/blog/index.xml" faviconUrl="https://herd.works/favicon_512x512.png?v=1"></outline>
            <outline text="Anil Dash" xmlUrl="https://www.anildash.com/feed.xml" />
        </body></opml>`, 'https://calebhailey.com/.well-known/following.opml')!;
        expect(list).toEqual([
            {name: 'Herd Works', handle: '@herd.works', host: 'herd.works', feedUrl: 'https://herd.works/blog/index.xml',
                siteUrl: 'https://herd.works/'},
            {name: 'Anil Dash', handle: '@anildash.com', host: 'www.anildash.com', feedUrl: 'https://www.anildash.com/feed.xml',
                siteUrl: undefined},
        ]);
    });

    it('reads micro.blog lists: link outlines, network handles in the text, folders, duplicates', () => {
        const list = parseOpml(`<?xml version="1.0"?><opml version="2.0"><body>
            <outline text="Noah Read (@noah)" htmlUrl="https://noahread.net" type="link" url="https://noahread.net"/>
            <outline text="Friends">
                <outline text="Dave Winer (@dave)" htmlUrl="http://scripting.com/" type="rss" xmlUrl="https://dave.micro.blog/feed.xml"/>
                <outline text="Dave again" xmlUrl="https://dave.micro.blog/feed.xml"/>
            </outline>
            <outline text="Bad" xmlUrl="javascript:alert(1)"/>
        </body></opml>`, 'https://www.manton.org/.well-known/following.opml')!;
        expect(list.map(e => [e.name, e.handle, e.feedUrl])).toEqual([
            ['Noah Read', '@noahread.net', undefined],
            ['Dave Winer', '@scripting.com', 'https://dave.micro.blog/feed.xml'],
        ]);
    });

    it('returns undefined for no OPML', () => {
        expect(parseOpml('<rss><channel/></rss>', 'https://x.org/')).toBeUndefined();
        expect(parseOpml('not xml <', 'https://x.org/')).toBeUndefined();
    });
});
