import { newHtml } from './dom';
import type { Post, YoutubeVideo } from './types';
import { createEmbedGate, gateEmbeds, type EmbedConsentApi } from './embed-consent';
import { createOfflineCover, createOfflinePlaceholder, prepareEmbedsOffline, OFFLINE_EMBED_TEXT, OFFLINE_MEDIA_TEXT } from './offline-embeds';
import { formatPublishedTime, parseAuthor } from './format';
import { createPlaySvg, createReplySvg } from './svg';
import {
  safeSetHTML, retryNoReferrer, stabilizeImageDimensions, hydrateDigestPostEmbeds, hydrateImageOnlyPost,
  hideGhostEmbedFallbackImages, normalizeAsides, collapseBrRuns, markRowspanShiftedCells, relaxTableHeights,
  hydrateAttributedQuotes, hydrateUnsupportedCharts, hydrateInstagramEmbeds, hydrateTikTokEmbeds, hydrateThreadsEmbeds,
  showImageViewer, isPostImageInBody, postMediaKind, createMediaPlayer, replyTargetHref, replyTargetLabel,
} from './post-content';

const EXT_LINK = { target: '_blank', rel: 'noopener noreferrer' } as const;

/**
 * Render a post's HTML as a detached `div.postBody`: sanitize it, repair what feeds get wrong
 * (the hydrators), and cover unconsented third-party embeds with consent overlays. The body
 * must still be detached when gateEmbeds runs, so a gated iframe never issues a request — which
 * is why this builds it in one go. After attaching it, call
 * `loadExternalScripts(post.externalScripts, body, consent.isAllowed)` to let embed scripts run.
 * `offline`: embeds get their offline version instead (prepareEmbedsOffline); don't load scripts.
 */
export function createPostBody(html: string | undefined, consent: EmbedConsentApi, offline = false): HTMLDivElement {
  const body = newHtml('div', { class: 'postBody' }) as HTMLDivElement;
  safeSetHTML(body, html || '');
  body.querySelectorAll('a[href]').forEach(a => a.classList.add('flowFocussable'));
  hideGhostEmbedFallbackImages(body);
  normalizeAsides(body);
  collapseBrRuns(body);
  markRowspanShiftedCells(body);
  relaxTableHeights(body);
  hydrateAttributedQuotes(body);
  hydrateUnsupportedCharts(body);
  hydrateDigestPostEmbeds(body);
  hydrateImageOnlyPost(body);
  hydrateInstagramEmbeds(body);
  hydrateTikTokEmbeds(body);
  hydrateThreadsEmbeds(body);
  // Must run after the hydrators: they establish the blockquote classes gating selects on.
  if (offline) prepareEmbedsOffline(body);
  else gateEmbeds(body, consent);
  return body;
}

export interface PostPartsOptions {
  /** Shown in the meta line above the title. */
  feedName: string;
  /** Where the feed name links to: an http(s) URL opens in a new tab, a path ('/feed/…') in the
   *  same one. Anything else (none, a newsletter's mailto:) renders the name as plain text. */
  feedHref?: string;
  /** The feed's socialspec handle, without the '@' (e.g. 'tim.example.com'): shown as "@handle" after
   *  the feed name. */
  feedHandle?: string | null;
  /** Where the handle links to: the app's profile page of that domain (a path or an http(s) URL).
   *  Like feedHref, a path opens in place, an http(s) URL in a new tab. Without it the handle is
   *  plain text. */
  feedHandleHref?: string;
  consent: EmbedConsentApi;
  /** Placed beside the meta line in `.postHeader` (the reader's action buttons). */
  headerActions?: HTMLElement;
  /** Render for offline reading: embeds, the YouTube player and audio/video show that they need a
   *  connection (see prepareEmbedsOffline). */
  offline?: boolean;
  /** The app's own player for the post's audio/video (enclosure or podcast:alternateEnclosure
   *  video). Returns a `.postMedia` element, which replaces the native player and the lead image
   *  (the player shows the cover), or undefined to fall back to the native player. */
  mediaPlayer?: (post: Post) => HTMLElement | undefined;
}

/**
 * The parts of a post card, in order: `.postHeader` (feed name and time), `h1.postTitle`,
 * `.postByline`, the YouTube player, `.postImage`, `.postMedia` and `.postBody`. Optional parts
 * are left out, e.g. the title of a titleless (Tweet-style) post. The caller wraps them in its
 * own card element — with `postSiteClass(siteUrl)`, so a site stylesheet applies — and adds its
 * own actions below.
 */
export function createPostParts(post: Post, opts: PostPartsOptions): HTMLElement[] {
  const { feedName, feedHref, feedHandle, feedHandleHref, consent, headerActions, offline = false, mediaPlayer } = opts;
  const link = post.link?.trim();

  const feedEl = feedHref && /^https?:\/\//i.test(feedHref)
    ? newHtml('a', { class: 'postFeed flowFocussable', href: feedHref, ...EXT_LINK }, feedName)
    : feedHref?.startsWith('/')
      ? newHtml('a', { class: 'postFeed flowFocussable', href: feedHref }, feedName)
      : newHtml('span', { class: 'postFeed' }, feedName);
  // "name • @handle" is one unit, so it stays on one line when narrow cards stack it above the time.
  const source = feedHandle
    ? newHtml('span', { class: 'postSource' }, [
      feedEl,
      newHtml('span', { class: 'postDivider' }, '•'),
      feedHandleHref && /^https?:\/\//i.test(feedHandleHref)
        ? newHtml('a', { class: 'postHandle flowFocussable', href: feedHandleHref, ...EXT_LINK }, `@${feedHandle}`)
        : feedHandleHref?.startsWith('/')
          ? newHtml('a', { class: 'postHandle flowFocussable', href: feedHandleHref }, `@${feedHandle}`)
          : newHtml('span', { class: 'postHandle' }, `@${feedHandle}`),
    ])
    : feedEl;
  const meta = newHtml('div', { class: 'postMeta' }, [
    source,
    newHtml('span', { class: 'postDivider' }, '•'),
    newHtml('span', { class: 'postTime' }, post.pubDate ? formatPublishedTime(post.pubDate) : ''),
  ]);
  const parts: HTMLElement[] = [newHtml('div', { class: 'postHeader' }, headerActions ? [meta, headerActions] : meta)];

  // Tweet-style posts have no title, so it's simply omitted. Without a post link (e.g. some
  // podcast feeds) the title is plain text instead of a dead link.
  if (post.title)
    parts.push(newHtml('h1', { class: 'postTitle' }, link
      ? newHtml('a', { href: link, ...EXT_LINK, class: 'flowFocussable' }, post.title)
      : post.title));

  const byline = createByline(post);
  if (byline)
    parts.push(byline);

  // For YouTube feed posts, an embedded click-to-play video replaces the static image; the
  // description still renders below in .postBody.
  const ytVideoId = post.youtube?.videoId && YOUTUBE_ID_RE.test(post.youtube.videoId) ? post.youtube.videoId : undefined;
  if (ytVideoId)
    parts.push(...createYoutubeBlock(ytVideoId, post.imageUrl, post.title || '', post.youtube!, consent, offline));

  // The app's player shows the cover itself; its media files are removed from the body.
  const appPlayer = ytVideoId || offline ? undefined : mediaPlayer?.(post);
  if (appPlayer) {
    parts.push(appPlayer);
    const body = createPostBody(post.description, consent, offline);
    removeEmbeddedMedia(body, [post.mediaUrl, ...(post.videos ?? []).flatMap(v => v.sources.map(s => s.url))]);
    parts.push(body);
    return parts;
  }

  // A video enclosure uses the post image as its poster instead of showing it separately.
  const mediaKind = ytVideoId ? undefined : postMediaKind(post);
  const imageFile = post.imageUrl?.split('/').pop()?.split('?')[0]?.toLowerCase();
  if (!ytVideoId && mediaKind != 'video' && imageFile && imageFile.length > 8 && !isPostImageInBody(post.imageUrl, post.description))
    // The image's own alt text where the feed has one; the title says at least what it belongs to.
    parts.push(createLeadImage(post.imageUrl!, post.imageAlt || post.title || ''));
  if (mediaKind)
    parts.push(offline
      ? newHtml('div', { class: `postMedia ${mediaKind}` }, createOfflinePlaceholder(OFFLINE_MEDIA_TEXT))
      : createMediaPlayer(mediaKind, post.mediaUrl!, post.imageUrl));

  parts.push(createPostBody(post.description, consent, offline));
  return parts;
}

/** Removes <audio>/<video> elements of the body that play one of `urls` (the app's player has them). */
function removeEmbeddedMedia(body: HTMLElement, urls: (string | undefined)[]) {
  const known = new Set(urls.filter(Boolean));
  body.querySelectorAll('audio, video').forEach(m => {
    const srcs = [m.getAttribute('src'), ...Array.from(m.querySelectorAll('source')).map(s => s.getAttribute('src'))];
    if (srcs.some(src => src && known.has(src))) (m.closest('figure') ?? m).remove();
  });
}

// The author and, below it, the post this one replies to (source:inReplyTo). Shows the author's
// real name; when an email is also known, a click toggles to "Name <email>" and back.
function createByline(post: Post): HTMLElement | undefined {
  const children: (string | Node)[] = [];
  if (post.author) {
    const { name, email } = parseAuthor(post.author);
    const authorSpan = newHtml('span', { class: 'postAuthor' }, name ?? email ?? post.author);
    if (name && email) {
      authorSpan.classList.add('postAuthorToggle');
      authorSpan.setAttribute('title', 'Click to show the email address');
      let showFull = false;
      authorSpan.addEventListener('click', e => {
        e.preventDefault();
        e.stopPropagation();
        showFull = !showFull;
        authorSpan.textContent = showFull ? `${name} <${email}>` : name;
      });
    }
    children.push('By ', authorSpan);
  }
  if (post.inReplyTo) {
    const href = replyTargetHref(post.inReplyTo);
    const target = href
      ? newHtml('a', { href, ...EXT_LINK, class: 'flowFocussable', title: href }, replyTargetLabel(post.inReplyTo))
      : newHtml('span', { title: post.inReplyTo.value }, replyTargetLabel(post.inReplyTo));
    children.push(newHtml('div', { class: 'postInReplyTo' }, [createReplySvg(14), 'In reply to ', target]));
  }
  return children.length ? newHtml('div', { class: 'postByline' }, children) : undefined;
}

function createLeadImage(src: string, alt: string): HTMLElement {
  const img = newHtml('img', { src, alt, style: { cursor: 'pointer' } }) as HTMLImageElement;
  retryNoReferrer(img);
  stabilizeImageDimensions(img);
  // Reserve the usual (max-height) box until it loads, unless cached dimensions already do.
  if (!img.complete && !img.getAttribute('height')) {
    img.classList.add('postImageLoading');
    img.addEventListener('load', () => img.classList.remove('postImageLoading'), { once: true });
  }
  img.addEventListener('click', () => showImageViewer(src, alt));
  return newHtml('div', { class: 'postImage' }, img);
}

// YouTube video ids are a fixed, URL-safe alphabet; validate before interpolating
// into an embed URL so a malformed id can never break out of the src attribute.
const YOUTUBE_ID_RE = /^[A-Za-z0-9_-]{6,20}$/;

/**
 * Build the click-to-play YouTube embed: a thumbnail with a play overlay that, on
 * click, swaps itself for the privacy-enhanced (youtube-nocookie) iframe. Optionally
 * followed by a small stats line (views, likes).
 */
function createYoutubeBlock(videoId: string, thumbnailUrl: string | undefined, title: string, yt: YoutubeVideo,
    consent: EmbedConsentApi, offline: boolean): HTMLElement[] {
  const player = newHtml('div', { class: 'youtubePlayer' }) as HTMLDivElement;
  const thumb = newHtml('img', {
    class: 'youtubeThumb',
    src: thumbnailUrl || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    alt: title, loading: 'lazy',
  });
  retryNoReferrer(thumb as HTMLImageElement);
  player.append(thumb, newHtml('span', { class: 'youtubePlayButton', 'aria-hidden': 'true' }, createPlaySvg(32)));
  // Offline: the (stored) thumbnail stays, covered by the message instead of a player.
  if (offline) return [createOfflineCover(player, OFFLINE_EMBED_TEXT)];
  player.addEventListener('click', () => {
    const iframe = newHtml('iframe', {
      class: 'youtubeIframe',
      src: `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0&enablejsapi=1`,
      title,
      frameborder: '0',
      // The document meta referrer is same-origin; YouTube errors (153) without referrer
      // info. 'origin' sends only the origin, not what the reader is reading.
      referrerpolicy: 'origin',
      allow: 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share',
      allowfullscreen: 'true',
    }) as HTMLIFrameElement;
    // Belt-and-braces: autoplay=1 alone is unreliable in cross-origin iframes
    // because user-activation doesn't always propagate. Sending the playVideo
    // command via postMessage right after load forces playback inside the
    // ~5s user-activation window from the click that triggered this handler.
    iframe.addEventListener('load', () => {
      iframe.contentWindow?.postMessage('{"event":"command","func":"playVideo","args":""}', '*');
    });
    player.innerHTML = '';
    player.classList.add('playing');
    player.appendChild(iframe);
  });

  // Unconsented: the privacy overlay sits on top of the click-to-play layer. Allowing
  // removes only the overlay (via activateEmbeds) — the thumbnail stays, so a feed full of
  // videos still mounts zero YouTube players until each is clicked.
  const out: HTMLElement[] = [consent.isAllowed('youtube') ? player : createEmbedGate(player, 'youtube', consent)];
  const stats: string[] = [];
  if (yt.views != null) stats.push(`${yt.views.toLocaleString('en-US')} view${yt.views == 1 ? '' : 's'}`);
  if (yt.ratingCount != null) stats.push(`${yt.ratingCount.toLocaleString('en-US')} like${yt.ratingCount == 1 ? '' : 's'}`);
  if (stats.length)
    out.push(newHtml('div', { class: 'youtubeStats' }, stats.join('  ·  ')));
  return out;
}
