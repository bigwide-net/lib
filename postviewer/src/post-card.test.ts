import { createPostParts, createPostBody } from './post-card';
import { createSessionConsent, type EmbedConsentApi } from './embed-consent';
import type { Post } from './types';

const allowAll: EmbedConsentApi = { isAllowed: () => true, grant: () => {} };

const post = (p: Partial<Post>): Post => ({ title: 'Hello', link: 'https://example.com/p/1', description: '<p>Body</p>', pubDate: '2026-01-02T10:00:00Z', ...p } as Post);

const classes = (parts: HTMLElement[]) => parts.map(p => p.className);

describe('createPostParts', () => {
  it('renders header, linked title and body in order', () => {
    const parts = createPostParts(post({}), { feedName: 'Feed', consent: allowAll });
    expect(classes(parts)).toEqual(['postHeader', 'postTitle', 'postBody']);
    expect(parts[1].querySelector('a')!.getAttribute('href')).toBe('https://example.com/p/1');
    expect(parts[1].querySelector('a')!.getAttribute('target')).toBe('_blank');
    expect(parts[2].innerHTML).toBe('<p>Body</p>');
  });

  it('shows the socialspec handle after the feed name, kept together as one unit', () => {
    const meta = createPostParts(post({}), { feedName: 'RSS Chat', feedHandle: 'rss.chat', consent: allowAll })[0].querySelector('.postMeta')!;
    const source = meta.querySelector(':scope > .postSource')!;
    expect(Array.from(source.children).map(c => c.className)).toEqual(['postFeed', 'postDivider', 'postHandle']);
    expect(source.querySelector('.postHandle')!.textContent).toBe('@rss.chat');
    expect(Array.from(meta.children).map(c => c.className)).toEqual(['postSource', 'postDivider', 'postTime']);
  });

  it('links the handle to the profile page when the app has one', () => {
    const meta = createPostParts(post({}), { feedName: 'F', feedHandle: 'rss.chat', feedHandleHref: '/a/profile/rss.chat', consent: allowAll })[0];
    const a = meta.querySelector<HTMLAnchorElement>('a.postHandle')!;
    expect(a.getAttribute('href')).toBe('/a/profile/rss.chat');
    expect(a.textContent).toBe('@rss.chat');
    expect(a.getAttribute('target')).toBeNull();
    // An absolute URL (another site's profile page) opens in a new tab.
    const ext = createPostParts(post({}), { feedName: 'F', feedHandle: 'rss.chat', feedHandleHref: 'https://sodir.org/profile.html?d=rss.chat', consent: allowAll })[0]
      .querySelector<HTMLAnchorElement>('a.postHandle')!;
    expect(ext.getAttribute('target')).toBe('_blank');
    expect(ext.getAttribute('rel')).toBe('noopener noreferrer');
    // Only paths and http(s) URLs.
    const bad = createPostParts(post({}), { feedName: 'F', feedHandle: 'x.org', feedHandleHref: 'javascript:alert(1)', consent: allowAll })[0];
    expect(bad.querySelector('a.postHandle')).toBeNull();
  });

  it('has no handle part without one', () => {
    const meta = createPostParts(post({}), { feedName: 'F', feedHandle: null, consent: allowAll })[0].querySelector('.postMeta')!;
    expect(Array.from(meta.children).map(c => c.className)).toEqual(['postFeed', 'postDivider', 'postTime']);
  });

  it('omits the title of a titleless post and shows an unlinked title without a link', () => {
    expect(classes(createPostParts(post({ title: undefined }), { feedName: 'F', consent: allowAll }))).toEqual(['postHeader', 'postBody']);
    const title = createPostParts(post({ link: undefined }), { feedName: 'F', consent: allowAll })[1];
    expect(title.querySelector('a')).toBeNull();
    expect(title.textContent).toBe('Hello');
  });

  it('links the feed name by href kind', () => {
    const feedEl = (feedHref?: string) => createPostParts(post({}), { feedName: 'F', feedHref, consent: allowAll })[0].querySelector('.postFeed')!;
    expect(feedEl('https://site.example/').getAttribute('target')).toBe('_blank');
    expect(feedEl('/feed/abc').tagName).toBe('A');
    expect(feedEl('/feed/abc').getAttribute('target')).toBeNull();
    expect(feedEl('mailto:news@example.com').tagName).toBe('SPAN');
    expect(feedEl(undefined).tagName).toBe('SPAN');
  });

  it('places header actions beside the meta line', () => {
    const actions = document.createElement('div');
    actions.className = 'postActions';
    const header = createPostParts(post({}), { feedName: 'F', consent: allowAll, headerActions: actions })[0];
    expect(Array.from(header.children).map(c => c.className)).toEqual(['postMeta', 'postActions']);
  });

  it('renders the byline with a toggleable email and the reply target', () => {
    const parts = createPostParts(post({ author: 'Jane <jane@example.com>', inReplyTo: { value: 'https://www.other.example/post/', isPermalink: true } as Post['inReplyTo'] }),
      { feedName: 'F', consent: allowAll });
    const byline = parts.find(p => p.className == 'postByline')!;
    const author = byline.querySelector('.postAuthor')!;
    expect(author.textContent).toBe('Jane');
    (author as HTMLElement).click();
    expect(author.textContent).toBe('Jane <jane@example.com>');
    expect(byline.querySelector('.postInReplyTo a')!.textContent).toBe('other.example/post');
  });

  it('labels the reply target with its feed title but still links to the post', () => {
    const inReplyTo = { value: 'https://demo.rss.chat/?id=798', isPermalink: true, feedUrl: 'https://demo.rss.chat/users/dave/rss.xml', feedTitle: 'Dave Winer' };
    const byline = createPostParts(post({ inReplyTo }), { feedName: 'F', consent: allowAll }).find(p => p.className == 'postByline')!;
    const link = byline.querySelector('.postInReplyTo a')!;
    expect(link.textContent).toBe('Dave Winer');
    expect(link.getAttribute('href')).toBe('https://demo.rss.chat/?id=798');
    expect(link.getAttribute('title')).toBe('https://demo.rss.chat/?id=798');
  });

  it('shows the lead image unless the body already contains it', () => {
    const imageUrl = 'https://cdn.example/images/lead-photo.jpg';
    expect(classes(createPostParts(post({ imageUrl }), { feedName: 'F', consent: allowAll }))).toContain('postImage');
    expect(classes(createPostParts(post({ imageUrl, description: `<img src="${imageUrl}">` }), { feedName: 'F', consent: allowAll }))).not.toContain('postImage');
  });

  it('gates the YouTube player without consent and drops the gate with it', () => {
    const youtube = { videoId: 'dQw4w9WgXcQ', views: 1 } as Post['youtube'];
    const gated = createPostParts(post({ youtube }), { feedName: 'F', consent: createSessionConsent() });
    expect(gated.some(p => p.classList.contains('embedGate') && p.querySelector('.youtubePlayer'))).toBe(true);
    const open = createPostParts(post({ youtube }), { feedName: 'F', consent: allowAll });
    expect(open.some(p => p.classList.contains('youtubePlayer'))).toBe(true);
    expect(open.find(p => p.classList.contains('youtubeStats'))!.textContent).toBe('1 view');
  });
});

describe('createPostBody', () => {
  it('sanitizes, makes links focussable and gates unconsented iframes', () => {
    const body = createPostBody('<p><a href="https://x.example">x</a></p><script>bad()</script>'
      + '<iframe src="https://www.youtube.com/embed/abc"></iframe>', createSessionConsent());
    expect(body.querySelector('script')).toBeNull();
    expect(body.querySelector('a')!.classList.contains('flowFocussable')).toBe(true);
    const iframe = body.querySelector('iframe')!;
    expect(iframe.getAttribute('src')).toBeNull();
    expect(iframe.getAttribute('data-embed-src')).toBe('https://www.youtube.com/embed/abc');
    expect(iframe.closest('.embedGate')).not.toBeNull();
  });

  it('leaves consented iframes alone', () => {
    const body = createPostBody('<iframe src="https://www.youtube.com/embed/abc"></iframe>', allowAll);
    expect(body.querySelector('iframe')!.getAttribute('src')).toBe('https://www.youtube.com/embed/abc');
    expect(body.querySelector('.embedGate')).toBeNull();
  });

  it('runs the hydrators (e.g. TikTok video ids)', () => {
    const body = createPostBody('<blockquote class="tiktok-embed" cite="https://www.tiktok.com/@a/video/123"><p>t</p></blockquote>', allowAll);
    expect(body.querySelector('blockquote')!.getAttribute('data-video-id')).toBe('123');
  });
});
