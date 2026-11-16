import { newHtml } from './dom';
import { formatPublishedTime, parseAuthor } from './format';
import { renderMarkdown, safeUrl } from './markdown';
import { renderSimpleHtml } from './simple-html';
import { createChevronSvg } from './svg';

// Comments from a comment feed: an RSS 2.0 feed whose items are the replies to a post. Two kinds:
//
// - source:comments feeds (https://source.scripting.com/), from rss.chat and other social-RSS
//   systems:
//     <item>
//       <description>(HTML)</description>
//       <pubDate>…</pubDate>
//       <guid>https://rss.chat/?id=205</guid>
//       <source url="https://rss.chat/users/dave/rss.xml">Dave Winer</source>
//       <source:markdown>(the same text as Markdown)</source:markdown>
//       <source:comments count="2" feedUrl="https://…/comments/205.xml"/>
//     </item>
// - WordPress comment feeds (wfw:commentRss of a post):
//     <item>
//       <title>By: Kim</title>
//       <link>https://…/comment-page-1/#comment-215418</link>
//       <dc:creator>Kim</dc:creator>
//       <pubDate>…</pubDate>
//       <description>(plain text with entities)</description>
//       <content:encoded>(HTML)</content:encoded>
//     </item>
//
// - Atom comment feeds (rel="replies" of an Atom entry, RFC 4685), from WordPress's and Blogger's
//   Atom feeds: <entry> with author/name, published, link rel="alternate", content (html, text or
//   xhtml), and for its own replies rel="replies" with thr:count, or thr:total (Blogger).
//
// - JSON Feed comment feeds: items with authors[].name, date_published, url, content_html or
//   content_text, and from the JSON Feed mapping of the source namespace (bigwide.net RFC-1)
//   _source.markdown (source:markdown) and, for their own replies, _source.comments.
//
// The body is source:markdown if there is one, else the HTML (content:encoded, else description)
// through renderSimpleHtml. The feed is untrusted: both renderers build DOM nodes only and allow
// only safe URLs.

/** The 'source' namespace. Publishers bind it with http or https, with or without the slash. */
const isSourceNs = (ns: string | null) => !!ns && /^https?:\/\/source\.scripting\.com\/?$/.test(ns);
const CONTENT_NS = 'http://purl.org/rss/1.0/modules/content/';
const WFW_NS = 'http://wellformedweb.org/CommentAPI/';
const SLASH_NS = 'http://purl.org/rss/1.0/modules/slash/';
const ATOM_NS = 'http://www.w3.org/2005/Atom';
const THR_NS = 'http://purl.org/syndication/thread/1.0';

/** Comments beyond this are dropped; a comment feed is a conversation, not an archive. */
const MAX_COMMENTS = 200;

export interface FeedComment {
  /** Author's name: the RSS <source> element's text, else <author> / <dc:creator>. */
  author?: string;
  /** The author's own feed (RSS <source url>), http(s) only. */
  authorFeedUrl?: string;
  /** The comment's permalink: <link>, else a permalink <guid>. http(s) only. */
  link?: string;
  /** <pubDate>, as given. */
  pubDate?: string;
  /** source:markdown: the body, when the feed has it. */
  markdown?: string;
  /** The HTML body: content:encoded, else description. Used when there is no Markdown. */
  html?: string;
  /** source:comments @count, else slash:comments: the number of replies to this comment. */
  replyCount?: number;
  /** Replies at all levels: source:comments @total, thr:total, _source.comments.total. Shown
   *  instead of replyCount when the feed gives it. */
  replyTotal?: number;
  /** source:comments @feedUrl, else wfw:commentRss: the feed of those replies. */
  repliesFeedUrl?: string;
}

const text = (el: Element) => el.textContent?.trim() || undefined;
/** An absolute http(s) URL (safeUrl's image rule), or undefined. */
const httpUrl = (url: string | null | undefined, base: string) => url ? safeUrl(url, base, true) : undefined;
const countOf = (s: string | null | undefined) => s && /^\d+$/.test(s.trim()) ? parseInt(s.trim(), 10) : undefined;

function parseComment(item: Element, feedUrl: string): FeedComment {
  const c: FeedComment = {};
  let guid: string | undefined, encoded: string | undefined, description: string | undefined;
  let slashCount: number | undefined, wfwFeedUrl: string | undefined;
  for (const el of Array.from(item.children)) {
    const name = el.localName, ns = el.namespaceURI;
    if (isSourceNs(ns)) {
      if (name == 'markdown')
        c.markdown = text(el);
      else if (name == 'comments') {
        c.replyCount = countOf(el.getAttribute('count'));
        c.replyTotal = countOf(el.getAttribute('total'));
        c.repliesFeedUrl = httpUrl(el.getAttribute('feedUrl'), feedUrl);
      }
    }
    else if (ns == CONTENT_NS && name == 'encoded')
      encoded = text(el);
    else if (ns == WFW_NS && name == 'commentRss')
      wfwFeedUrl = httpUrl(text(el), feedUrl);
    else if (ns == SLASH_NS && name == 'comments')
      slashCount = countOf(text(el));
    else if (ns && name == 'creator')
      c.author ??= text(el);
    else if (ns)
      continue;
    else if (name == 'source') {
      c.author = text(el) ?? c.author;
      c.authorFeedUrl = httpUrl(el.getAttribute('url'), feedUrl);
    }
    else if (name == 'author') {
      // "email (Name)": show the name only; a bare email stays as it is.
      const raw = text(el);
      c.author ??= raw && (parseAuthor(raw).name ?? raw);
    }
    else if (name == 'link')
      c.link = httpUrl(text(el), feedUrl);
    else if (name == 'guid' && el.getAttribute('isPermaLink')?.trim().toLowerCase() != 'false')
      guid = httpUrl(text(el), feedUrl);
    else if (name == 'pubDate')
      c.pubDate = text(el);
    else if (name == 'description')
      description = text(el);
  }
  c.link ??= guid;
  if (!c.markdown && (encoded ?? description))
    c.html = encoded ?? description;
  // source:comments wins, field by field.
  c.replyCount ??= slashCount;
  c.repliesFeedUrl ??= wfwFeedUrl;
  return c;
}

/** Text as HTML for renderSimpleHtml: escaped, line breaks kept. */
const textAsHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br>');

/** An Atom text construct (content, summary) as HTML: type html as is, text escaped, xhtml serialized. */
function atomTextHtml(el: Element): string | undefined {
  const type = el.getAttribute('type')?.trim().toLowerCase() || 'text';
  if (type == 'xhtml') {
    const div = Array.from(el.children).find(c => c.localName == 'div') ?? el;
    const xml = Array.from(div.childNodes).map(n => new XMLSerializer().serializeToString(n)).join('').trim();
    return xml || undefined;
  }
  const value = text(el);
  return value && (type == 'html' || type == 'text/html' ? value : textAsHtml(value));
}

function parseAtomComment(entry: Element, feedUrl: string): FeedComment {
  const c: FeedComment = {};
  let content: string | undefined, summary: string | undefined, updated: string | undefined, total: number | undefined;
  for (const el of Array.from(entry.children)) {
    const name = el.localName, ns = el.namespaceURI;
    if (ns == THR_NS && name == 'total')
      total = countOf(text(el));
    if (ns != ATOM_NS)
      continue;
    if (name == 'author') {
      const authorName = Array.from(el.children).find(n => n.localName == 'name');
      c.author ??= authorName && text(authorName);
    }
    else if (name == 'link') {
      const rel = el.getAttribute('rel')?.trim().toLowerCase() || 'alternate';
      const href = httpUrl(el.getAttribute('href'), feedUrl);
      if (rel == 'alternate')
        c.link ??= href;
      else if (rel == 'replies' && /(atom|rss)\+xml|\/xml/i.test(el.getAttribute('type') ?? '')) {
        c.repliesFeedUrl ??= href;
        c.replyCount ??= countOf(el.getAttributeNS(THR_NS, 'count'));
      }
    }
    else if (name == 'published')
      c.pubDate = text(el);
    else if (name == 'updated')
      updated = text(el);
    else if (name == 'content')
      content = atomTextHtml(el);
    else if (name == 'summary')
      summary = atomTextHtml(el);
  }
  c.pubDate ??= updated;
  c.html = content ?? summary;
  c.replyCount ??= total;
  c.replyTotal = total;
  return c;
}

function parseJsonComment(item: any, feedUrl: string): FeedComment {
  const str = (v: any) => typeof v == 'string' && v.trim() ? v.trim() : undefined;
  const author = Array.isArray(item.authors) ? item.authors.find((a: any) => str(a?.name)) : item.author;
  const source = item._source && typeof item._source == 'object' ? item._source : undefined;
  const comments = source?.comments;
  const markdown = str(source?.markdown);
  const int = (n: any) => Number.isInteger(n) && n >= 0 ? n : undefined;
  const text = str(item.content_text);
  const c: FeedComment = {
    author: str(author?.name),
    link: httpUrl(str(item.url), feedUrl),
    pubDate: str(item.date_published) ?? str(item.date_modified),
    // Markdown wins, as source:markdown does in RSS: the HTML is only for readers without it.
    markdown,
    html: markdown ? undefined : str(item.content_html) ?? (text && textAsHtml(text)) ?? str(item.summary),
  };
  if (comments && typeof comments == 'object') {
    c.replyCount = int(comments.count);
    c.replyTotal = int(comments.total);
    c.repliesFeedUrl = httpUrl(str(comments.feedUrl), feedUrl);
  }
  return c;
}

/** The items of a JSON Feed, or undefined if `body` is not one. */
function jsonFeedItems(body: string): any[] | undefined {
  if (!/^\s*\{/.test(body)) return undefined;
  let feed: any;
  try {
    feed = JSON.parse(body);
  } catch {
    return undefined;
  }
  return feed && typeof feed.version == 'string' && /jsonfeed\.org/.test(feed.version) && Array.isArray(feed.items)
    ? feed.items.filter((i: any) => i && typeof i == 'object')
    : undefined;
}

/**
 * The comments of an RSS, Atom or JSON Feed comment feed, oldest first. WordPress lists the newest
 * first, rss.chat the oldest, so they are sorted by date when every comment has one; otherwise feed order is kept.
 * Throws if `body` is none of them.
 */
export function parseCommentsFeed(body: string, feedUrl: string): FeedComment[] {
  const json = jsonFeedItems(body);
  return sortByDate(json
    ? json.slice(0, MAX_COMMENTS).map(item => parseJsonComment(item, feedUrl))
    : parseXmlComments(body, feedUrl));
}

function parseXmlComments(xml: string, feedUrl: string): FeedComment[] {
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  const root = doc.documentElement;
  const atom = root.localName == 'feed' && root.namespaceURI == ATOM_NS;
  if (doc.getElementsByTagName('parsererror').length || (root.localName != 'rss' && !atom))
    throw new Error('Not an RSS, Atom or JSON feed');
  return atom
    ? Array.from(root.children).filter(e => e.localName == 'entry' && e.namespaceURI == ATOM_NS).slice(0, MAX_COMMENTS)
      .map(entry => parseAtomComment(entry, feedUrl))
    : Array.from(doc.getElementsByTagName('item')).slice(0, MAX_COMMENTS).map(item => parseComment(item, feedUrl));
}

function sortByDate(comments: FeedComment[]): FeedComment[] {
  const times = comments.map(c => c.pubDate ? Date.parse(c.pubDate) : NaN);
  if (times.some(isNaN))
    return comments;
  return comments.map((c, i) => ({ c, t: times[i] })).sort((a, b) => a.t - b.t).map(x => x.c);
}

/** "1 reply", "3 replies"; just "Replies" when the feed gives no count. */
export const repliesLabel = (count?: number): string =>
  count == undefined ? 'Replies' : count == 1 ? '1 reply' : `${count} replies`;

/**
 * The replies line under a comment. With a replies feed and replies to show, it is a disclosure
 * button: data-action="showComments" and data-feed-url are what the reader's click handler opens,
 * the same as the post's "x comments" button. Otherwise plain text.
 */
function createReplies(comment: FeedComment): HTMLElement | undefined {
  const { replyCount, replyTotal, repliesFeedUrl } = comment;
  const shown = replyTotal != undefined && (replyCount == undefined || replyTotal >= replyCount) ? replyTotal : replyCount;
  if (shown == undefined && !repliesFeedUrl) return undefined;
  const label = repliesLabel(shown);
  return newHtml('div', { class: 'commentReplies' }, repliesFeedUrl && shown != 0
    ? newHtml('button', {
      class: 'commentRepliesButton flowFocussable', 'data-action': 'showComments',
      'data-feed-url': repliesFeedUrl, 'data-count': replyCount, 'aria-expanded': 'false',
    }, [createChevronSvg(12), label])
    : label);
}

/** One comment: author and time, the Markdown body, and its replies line. */
export function createComment(comment: FeedComment, feedUrl: string): HTMLElement {
  const date = comment.pubDate && !isNaN(Date.parse(comment.pubDate)) ? formatPublishedTime(comment.pubDate) : undefined;
  const meta = newHtml('div', { class: 'commentMeta' }, [
    newHtml('span', { class: 'commentAuthor' }, comment.author ?? 'Anonymous'),
    ...(date ? [
      newHtml('span', { class: 'postDivider' }, '•'),
      comment.link
        ? newHtml('a', { class: 'commentTime', href: comment.link, target: '_blank', rel: 'noopener noreferrer' }, date)
        : newHtml('span', { class: 'commentTime' }, date),
    ] : []),
  ]);
  const base = comment.link ?? feedUrl;
  const body = newHtml('div', { class: 'commentBody' },
    comment.markdown ? renderMarkdown(comment.markdown, base) : comment.html ? renderSimpleHtml(comment.html, base) : []);
  const article = newHtml('article', { class: 'comment' }, [meta, body]);
  const replies = createReplies(comment);
  if (replies) article.append(replies);
  return article;
}

/** One level of comments; each one's replies open on demand (createReplies). */
export function createCommentList(comments: FeedComment[], feedUrl: string): HTMLElement {
  if (!comments.length)
    return newHtml('div', { class: 'commentList commentListEmpty' }, 'No comments yet.');
  return newHtml('div', { class: 'commentList' }, comments.map(c => createComment(c, feedUrl)));
}
