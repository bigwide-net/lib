import { createComment, createCommentList, parseCommentsFeed, repliesLabel } from './comments';

const FEED_URL = 'https://rss.chat/users/manton/comments/204.xml';

// Trimmed from the real feed above (rss.network binds the namespace with https).
const RSS_CHAT = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:source="https://source.scripting.com/">
  <channel>
    <title>Comments on post 204</title>
    <item>
      <description>&lt;p&gt;hey manton, great to see you here.&lt;/p&gt;</description>
      <pubDate>Wed, 08 Jul 2026 14:42:55 GMT</pubDate>
      <guid>https://rss.chat/?id=205</guid>
      <source url="https://rss.chat/users/dave/rss.xml">Dave Winer</source>
      <source:markdown>hey manton, great to see you here.&#10;&#10;this is the **web** btw.</source:markdown>
      <source:inReplyTo>https://rss.chat/?id=204</source:inReplyTo>
      <source:comments count="2" feedUrl="https://rss.chat/users/dave/comments/205.xml"/>
    </item>
    <item>
      <description>&lt;p&gt;Only HTML&lt;/p&gt;</description>
      <guid isPermaLink="false">opaque-1</guid>
      <author>jo@example.com (Jo)</author>
    </item>
  </channel>
</rss>`;

describe('parseCommentsFeed', () => {
  it('reads author, permalink, date, Markdown and the reply count', () => {
    const [first, second] = parseCommentsFeed(RSS_CHAT, FEED_URL);
    expect(first).toEqual({
      author: 'Dave Winer',
      authorFeedUrl: 'https://rss.chat/users/dave/rss.xml',
      link: 'https://rss.chat/?id=205',
      pubDate: 'Wed, 08 Jul 2026 14:42:55 GMT',
      markdown: 'hey manton, great to see you here.\n\nthis is the **web** btw.',
      replyCount: 2,
      repliesFeedUrl: 'https://rss.chat/users/dave/comments/205.xml',
    });
    // No Markdown: the HTML body instead. A non-permalink guid is no link.
    expect(second).toEqual({ author: 'Jo', html: '<p>Only HTML</p>' });
  });

  it('accepts the namespace bound with http, and ignores other namespaces\' markdown', () => {
    const xml = `<rss xmlns:source="http://source.scripting.com/" xmlns:x="https://example.com/x">
      <channel><item><source:markdown>a</source:markdown><x:markdown>b</x:markdown></item></channel></rss>`;
    expect(parseCommentsFeed(xml, FEED_URL)).toEqual([{ markdown: 'a' }]);
  });

  it('drops unsafe URLs', () => {
    const xml = `<rss xmlns:source="https://source.scripting.com/"><channel><item>
      <link>javascript:alert(1)</link><source url="data:text/html,x">Eve</source>
      <source:comments count="x" feedUrl="javascript:alert(1)"/></item></channel></rss>`;
    expect(parseCommentsFeed(xml, FEED_URL)).toEqual([{ author: 'Eve' }]);
  });

  it('throws on anything but RSS and Atom', () => {
    expect(() => parseCommentsFeed('<html><body>hi</body></html>', FEED_URL)).toThrow();
    expect(() => parseCommentsFeed('<feed xmlns="http://example.com/not-atom"/>', FEED_URL)).toThrow();
    expect(() => parseCommentsFeed('not xml <', FEED_URL)).toThrow();
  });
});

// Trimmed from wilwheaton.net/2026/10/10126/feed/ (newest first, as WordPress writes them).
const WORDPRESS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/"
  xmlns:wfw="http://wellformedweb.org/CommentAPI/" xmlns:slash="http://purl.org/rss/1.0/modules/slash/">
<channel><title>Comments on: Post</title>
  <item>
    <title>By: wabbit89</title>
    <link>https://wilwheaton.net/2026/10/10126/comment-page-1/#comment-215417</link>
    <dc:creator><![CDATA[wabbit89]]></dc:creator>
    <pubDate>Wed, 28 Oct 2026 15:02:35 +0000</pubDate>
    <guid isPermaLink="false">https://wilwheaton.net/?p=10126#comment-215417</guid>
    <description><![CDATA[CUTE! (Yes, I yelled. It&#039;s pretty cute. ;)]]></description>
    <content:encoded><![CDATA[<p>CUTE! (Yes, I yelled. It&#8217;s pretty cute. 😉</p>
]]></content:encoded>
  </item>
  <item>
    <title>By: CarinaV.N</title>
    <link>https://wilwheaton.net/2026/10/10126/comment-page-1/#comment-215413</link>
    <dc:creator><![CDATA[CarinaV.N]]></dc:creator>
    <pubDate>Wed, 28 Oct 2026 05:05:25 +0000</pubDate>
    <description><![CDATA[In reply to &lt;a href=&quot;x&quot;&gt;michaeltoschi&lt;/a&gt;.]]></description>
    <content:encoded><![CDATA[<p>In reply to <a href="https://wilwheaton.net/2026/10/10126/comment-page-1/#comment-215412">michaeltoschi</a>.</p>
<p>Wil, please forgive me.</p>
]]></content:encoded>
    <wfw:commentRss>https://wilwheaton.net/c/215413/feed/</wfw:commentRss>
    <slash:comments>3</slash:comments>
  </item>
</channel></rss>`;

describe('parseCommentsFeed (WordPress)', () => {
  it('takes dc:creator and content:encoded, and sorts the comments oldest first', () => {
    const [first, second] = parseCommentsFeed(WORDPRESS, 'https://wilwheaton.net/2026/10/10126/feed/');
    expect(first.author).toBe('CarinaV.N');
    expect(first.html).toContain('<p>Wil, please forgive me.</p>');
    expect(first.markdown).toBeUndefined();
    expect(first.replyCount).toBe(3);
    expect(first.repliesFeedUrl).toBe('https://wilwheaton.net/c/215413/feed/');
    expect(second.author).toBe('wabbit89');
    expect(second.link).toBe('https://wilwheaton.net/2026/10/10126/comment-page-1/#comment-215417');
  });

  it('renders the HTML with entities decoded and links kept', () => {
    const comments = parseCommentsFeed(WORDPRESS, 'https://wilwheaton.net/2026/10/10126/feed/');
    const body = createComment(comments[1], 'https://wilwheaton.net/').querySelector('.commentBody')!;
    expect(body.textContent!.trim()).toBe('CUTE! (Yes, I yelled. It’s pretty cute. 😉');
    expect(createComment(comments[0], 'https://wilwheaton.net/').querySelector('.commentBody a')!.getAttribute('href'))
      .toBe('https://wilwheaton.net/2026/10/10126/comment-page-1/#comment-215412');
  });

  it('falls back to description, prefers Markdown, and keeps feed order without dates', () => {
    const xml = `<rss xmlns:source="http://source.scripting.com/" xmlns:slash="http://purl.org/rss/1.0/modules/slash/"><channel>
      <item><description>&lt;p&gt;b&lt;/p&gt;</description><slash:comments>5</slash:comments><source:comments count="1"/></item>
      <item><description>&lt;p&gt;html&lt;/p&gt;</description><source:markdown>md</source:markdown></item>
    </channel></rss>`;
    const [b, md] = parseCommentsFeed(xml, FEED_URL);
    expect(b.html).toBe('<p>b</p>');
    expect(b.replyCount).toBe(1); // source:comments wins over slash:comments
    expect(md.markdown).toBe('md');
    expect(md.html).toBeUndefined();
  });
});

describe('parseCommentsFeed (Atom)', () => {
  // Shaped like Blogger's comment feeds (newest first, count in thr:total) and WordPress's
  // /feed/atom/ comment feeds (thr:count on the replies link).
  const ATOM = `<?xml version='1.0' encoding='UTF-8'?>
<feed xmlns='http://www.w3.org/2005/Atom' xmlns:thr='http://purl.org/syndication/thread/1.0'>
  <id>tag:blogger.com,1999:blog-1.post2909comments</id><title>Comments</title>
  <entry>
    <id>tag:blogger.com,1999:blog-1.post-22</id>
    <published>2026-10-20T10:00:00.000+01:00</published>
    <title type='text'>Agreed!</title>
    <content type='html'>Agreed!&lt;br /&gt;See &lt;a href="https://example.com/x"&gt;this&lt;/a&gt;.</content>
    <link rel='alternate' type='text/html' href='https://b.blogspot.com/2026/10/post.html?showComment=22#c22'/>
    <author><name>Anonymous</name><uri>https://www.blogger.com/profile/1</uri></author>
    <thr:in-reply-to href='https://b.blogspot.com/2026/10/post.html' ref='tag:blogger.com,1999:blog-1.post-2909'/>
  </entry>
  <entry>
    <id>urn:c1</id>
    <updated>2026-10-19T08:00:00Z</updated>
    <content type='text'>First &lt;3 line
second line</content>
    <link href='https://e.com/p/1/#comment-1'/>
    <link rel='replies' type='application/atom+xml' href='https://e.com/comment-1/feed/atom/' thr:count='2'/>
    <author><name>Kim</name></author>
  </entry>
  <entry>
    <id>urn:c0</id>
    <published>2026-10-18T08:00:00Z</published>
    <content type='xhtml'><div xmlns='http://www.w3.org/1999/xhtml'><p>Hello <em>there</em></p></div></content>
    <thr:total>4</thr:total>
  </entry>
</feed>`;

  it('reads entries oldest first: author, date, permalink, body and replies', () => {
    const [xhtml, text, html] = parseCommentsFeed(ATOM, 'https://e.com/comments/feed/atom/');
    expect(html).toEqual({
      author: 'Anonymous',
      pubDate: '2026-10-20T10:00:00.000+01:00',
      link: 'https://b.blogspot.com/2026/10/post.html?showComment=22#c22',
      html: 'Agreed!<br />See <a href="https://example.com/x">this</a>.',
    });
    // Without <published>, <updated>; a link without rel is the alternate one.
    expect(text).toMatchObject({ author: 'Kim', pubDate: '2026-10-19T08:00:00Z', link: 'https://e.com/p/1/#comment-1',
      replyCount: 2, repliesFeedUrl: 'https://e.com/comment-1/feed/atom/' });
    expect(xhtml.replyCount).toBe(4);
    expect(xhtml.author).toBeUndefined();
  });

  it('renders html, text and xhtml content', () => {
    const [xhtml, text, html] = parseCommentsFeed(ATOM, 'https://e.com/comments/feed/atom/')
      .map(c => createComment(c, 'https://e.com/').querySelector('.commentBody')!.innerHTML);
    expect(html).toBe('Agreed!<br>See <a href="https://example.com/x" target="_blank" rel="noopener nofollow ugc">this</a>.');
    expect(text).toBe('First &lt;3 line<br>second line');
    expect(xhtml).toBe('<p>Hello there</p>');
  });
});

describe('parseCommentsFeed (JSON Feed)', () => {
  const JSON_FEED = JSON.stringify({
    version: 'https://jsonfeed.org/version/1.1',
    title: 'Comments on post 42',
    items: [
      { id: 'c2', url: 'https://example.com/c/2', date_published: '2026-10-29T10:00:00Z', authors: [{ name: 'Bo' }],
        content_text: 'Plain <text>\nsecond line' },
      { id: 'c1', url: 'https://example.com/c/1', date_published: '2026-10-29T09:00:00Z', authors: [{}, { name: 'Ann' }],
        content_html: '<p>Hi <b>there</b></p>',
        _source: { about: 'http://source.scripting.com/', comments: { count: 3, total: 7, feedUrl: '/c/1/comments.json' } } },
      'junk',
    ],
  });

  it('reads items oldest first: author, permalink, date, body and replies', () => {
    const [ann, bo] = parseCommentsFeed(JSON_FEED, 'https://example.com/p/42/comments.json');
    expect(ann).toEqual({ author: 'Ann', link: 'https://example.com/c/1', pubDate: '2026-10-29T09:00:00Z',
      html: '<p>Hi <b>there</b></p>', replyCount: 3, replyTotal: 7, repliesFeedUrl: 'https://example.com/c/1/comments.json' });
    expect(bo.author).toBe('Bo');
    expect(createComment(bo, 'https://example.com/').querySelector('.commentBody')!.innerHTML).toBe('Plain &lt;text&gt;<br>second line');
  });

  it('prefers _source.markdown over the HTML', () => {
    const json = JSON.stringify({ version: 'https://jsonfeed.org/version/1.1', items: [
      { id: '1', content_html: '<p>hello <b>there</b></p>', _source: { about: 'http://source.scripting.com/', markdown: 'hello **there**' } },
      { id: '2', content_html: '<p>html only</p>', _source: { markdown: 42 } },
    ] });
    const [md, html] = parseCommentsFeed(json, FEED_URL);
    expect(md).toMatchObject({ markdown: 'hello **there**', html: undefined });
    expect(createComment(md, FEED_URL).querySelector('.commentBody')!.innerHTML).toBe('<p>hello <strong>there</strong></p>');
    expect(html).toMatchObject({ markdown: undefined, html: '<p>html only</p>' });
  });

  it('throws on JSON that is not a JSON Feed', () => {
    expect(() => parseCommentsFeed('{"items": []}', FEED_URL)).toThrow();
    expect(() => parseCommentsFeed('{not json', FEED_URL)).toThrow();
  });
});

describe('createComment', () => {
  it('renders the Markdown body, never the HTML, and the number of replies', () => {
    const el = createComment(parseCommentsFeed(RSS_CHAT, FEED_URL)[0], FEED_URL);
    expect(el.querySelector('.commentAuthor')!.textContent).toBe('Dave Winer');
    expect(el.querySelector<HTMLAnchorElement>('a.commentTime')!.href).toBe('https://rss.chat/?id=205');
    expect(el.querySelector('.commentBody')!.innerHTML)
      .toBe('<p>hey manton, great to see you here.</p><p>this is the <strong>web</strong> btw.</p>');
    expect(el.querySelector('.commentReplies')!.textContent).toBe('2 replies');
  });

  it('renders an HTML body as simple HTML, and leaves out a missing date and replies', () => {
    const el = createComment({ author: 'Jo', html: '<p>Hi <b>there</b> <a href="/x" style="color:red">you</a></p>' }, FEED_URL);
    expect(el.querySelector('.commentBody')!.innerHTML)
      .toBe('<p>Hi there <a href="https://rss.chat/x" target="_blank" rel="noopener nofollow ugc">you</a></p>');
    expect(el.querySelector('.commentTime')).toBeNull();
    expect(el.querySelector('.commentReplies')).toBeNull();
  });

  it('does not let Markdown inject markup', () => {
    const el = createComment({ markdown: '<img src=x onerror=alert(1)> [a](javascript:alert(1))' }, FEED_URL);
    expect(el.querySelector('img, [onerror]')).toBeNull();
    expect(el.querySelector('a')).toBeNull();
    expect(el.querySelector('.commentAuthor')!.textContent).toBe('Anonymous');
  });
});

describe('replies line', () => {
  const REPLIES = 'https://rss.chat/users/dave/comments/205.xml';
  const replies = (c: object) => createComment({ markdown: 'x', ...c }, FEED_URL).querySelector('.commentReplies');

  it('is a disclosure button that opens the replies feed', () => {
    const button = replies({ replyCount: 1, repliesFeedUrl: REPLIES })!.querySelector('button')!;
    expect(button.textContent).toBe('1 reply');
    expect(button.dataset).toMatchObject({ action: 'showComments', feedUrl: REPLIES });
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(button.querySelector('svg')).not.toBeNull();
    // A feed without a count can still be opened.
    expect(replies({ repliesFeedUrl: REPLIES })!.querySelector('button')!.textContent).toBe('Replies');
  });

  it('shows all replies (total) when the feed gives them, not just the direct ones', () => {
    const button = replies({ replyCount: 2, replyTotal: 31, repliesFeedUrl: REPLIES })!.querySelector<HTMLElement>('button')!;
    expect(button.textContent).toBe('31 replies');
    expect(button.dataset.count).toBe('2');
    // A total below the direct replies is bogus: the count is shown.
    expect(replies({ replyCount: 5, replyTotal: 3, repliesFeedUrl: REPLIES })!.textContent).toBe('5 replies');
  });

  it('reads the total from every format', () => {
    const rss = `<rss xmlns:source="http://source.scripting.com/"><channel><item><source:comments count="2" total="9" feedUrl="https://e.com/c.xml"/></item></channel></rss>`;
    expect(parseCommentsFeed(rss, FEED_URL)[0]).toMatchObject({ replyCount: 2, replyTotal: 9 });
    const json = JSON.stringify({ version: 'https://jsonfeed.org/version/1.1', items: [{ id: '1', _source: { about: 'http://source.scripting.com/', comments: { count: 1, total: 4 } } }] });
    expect(parseCommentsFeed(json, FEED_URL)[0]).toMatchObject({ replyCount: 1, replyTotal: 4 });
  });

  it('is plain text with no replies or no feed to open', () => {
    for (const c of [{ replyCount: 0, repliesFeedUrl: REPLIES }, { replyCount: 2 }]) {
      const el = replies(c)!;
      expect(el.querySelector('button')).toBeNull();
      expect(el.textContent).toBe(repliesLabel(c.replyCount));
    }
    expect(replies({})).toBeNull();
  });
});

describe('createCommentList', () => {
  it('lists the comments, or says there are none', () => {
    expect(createCommentList(parseCommentsFeed(RSS_CHAT, FEED_URL), FEED_URL).querySelectorAll('.comment').length).toBe(2);
    expect(createCommentList([], FEED_URL).textContent).toBe('No comments yet.');
  });

  it('counts replies in singular and plural', () => {
    expect(repliesLabel(1)).toBe('1 reply');
    expect(repliesLabel(3)).toBe('3 replies');
    expect(repliesLabel(undefined)).toBe('Replies');
  });
});
