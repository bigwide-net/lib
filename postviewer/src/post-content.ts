import { newHtml, newSvg } from './dom';
import DOMPurify from 'dompurify';
import { ALLOWED_TAGS, GLOBAL_ATTRIBUTES, TAG_ATTRIBUTES } from './sanitize-schema';
import type { PostInReplyTo } from './types';

// ── Header image dedupe ────────────────────────────────────────────────

/** Whether the post's header image already appears in the body HTML, so showing it above the
 *  body would duplicate it. Matches by exact filename (if long enough to be distinctive), by
 *  the image's directory plus shared long number sequences (CDN renditions of the same image
 *  under different names), or by any body <img> hosted on the same host as the post image. */
export function isPostImageInBody(imageUrl: string|undefined, description: string|undefined): boolean {
  if (!imageUrl || !description) return false;
  const d = description.toLowerCase();
  const imageFile = imageUrl.split('/').pop()?.split('?')[0]?.toLowerCase();
  if (imageFile && imageFile.length > 8 && d.includes(imageFile)) return true;

  const imageDir = imageUrl.substring(0, imageUrl.lastIndexOf('/') + 1).toLowerCase();
  const imageLongNums = imageFile?.match(/\d{5,}/g) ?? [];
  if (imageDir && imageLongNums.length) {
    let idx = d.indexOf(imageDir);
    while (idx >= 0) {
      const afterDir = d.slice(idx + imageDir.length);
      const end = afterDir.search(/["'\s<>]/);
      const filename = end >= 0 ? afterDir.slice(0, end) : afterDir;
      if (imageLongNums.some(n => filename.includes(n))) return true;
      idx = d.indexOf(imageDir, idx + 1);
    }
  }

  // If the body opens with an image on the same host as the post image, that's most likely a
  // rendition of it under another name. Only a leading image counts: blogs host all their
  // images on one host, and an image further down the body is a different one.
  const getUrlHostname = (url: string) => { try { return new URL(url).hostname; } catch { return ''; } };
  const postImageHost = getUrlHostname(imageUrl);
  const firstImg = /<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/i.exec(description);
  if (!postImageHost || !firstImg || getUrlHostname(firstImg[1]) != postImageHost) return false;
  const textBefore = description.slice(0, firstImg.index).replace(/<[^>]*>/g, '').replace(/&[#\w]+;/g, ' ').trim();
  return textBefore.length < LEADING_IMAGE_MAX_TEXT;
}

/** Most text (in characters) allowed before a body image that still counts as leading the post. */
const LEADING_IMAGE_MAX_TEXT = 80;

// ── Media enclosure player ─────────────────────────────────────────────

const AUDIO_EXT_RE = /\.(mp3|m4a|aac|oga|ogg|opus|wav|flac)$/i;
const VIDEO_EXT_RE = /\.(mp4|m4v|webm|ogv|mov)$/i;

/** Which native player the post's audio/video enclosure (Post.mediaUrl) gets: by MIME type,
 *  else by file extension (feeds often send application/octet-stream or no type at all).
 *  undefined when there is no playable http(s) enclosure, or the body already embeds it. */
export function postMediaKind(post: { mediaUrl?: string; mediaType?: string; description?: string }): 'audio' | 'video' | undefined {
  const { mediaUrl, mediaType, description } = post;
  if (!mediaUrl || !/^https?:\/\//i.test(mediaUrl)) return undefined;
  if (description && (description.includes(mediaUrl) || description.includes(mediaUrl.replace(/&/g, '&amp;')))) return undefined;
  const type = mediaType?.toLowerCase();
  if (type?.startsWith('audio/')) return 'audio';
  if (type?.startsWith('video/')) return 'video';
  const path = mediaUrl.split(/[?#]/)[0];
  return AUDIO_EXT_RE.test(path) ? 'audio' : VIDEO_EXT_RE.test(path) ? 'video' : undefined;
}

/** A native <audio>/<video> player for an enclosure. preload=none: a feed full of podcast
 *  episodes must not start fetching media until the reader presses play. */
export function createMediaPlayer(kind: 'audio' | 'video', src: string, posterUrl?: string): HTMLElement {
  const media = newHtml(kind, { src, controls: 'true', preload: 'none' });
  if (kind == 'video' && posterUrl)
    media.setAttribute('poster', posterUrl);
  return newHtml('div', { class: `postMedia ${kind}` }, media);
}

// ── Digest Post Embed Hydration ────────────────────────────────────────

function formatDigestDate(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[d.getMonth()]} ${d.getDate()}`;
}

export function hydrateDigestPostEmbeds(body: HTMLElement) {
  body.querySelectorAll<HTMLDivElement>('.digest-post-embed[data-attrs]').forEach(el => {
    try {
      const attrs = JSON.parse(el.dataset.attrs!);
      if (!attrs.canonical_url) return;

      const contentChildren: HTMLElement[] = [];
      if (attrs.title)
        contentChildren.push(newHtml('div', { class: 'digest-post-embed-title' }, attrs.title));

      const metaParts: string[] = [];
      if (attrs.publishedBylines?.length)
        metaParts.push(attrs.publishedBylines.map((b: any) => b.name).join(', '));
      if (attrs.post_date)
        metaParts.push(formatDigestDate(attrs.post_date));
      if (metaParts.length)
        contentChildren.push(newHtml('div', { class: 'digest-post-embed-meta' }, metaParts.join(' · ')));

      contentChildren.push(newHtml('div', { class: 'digest-post-embed-cta' }, (attrs.cta || 'Read full story') + ' →'));

      const linkChildren: HTMLElement[] = [];
      if (attrs.cover_image) {
        const cover = newHtml('img', { class: 'digest-post-embed-cover', src: attrs.cover_image, alt: attrs.title || '', loading: 'lazy' }) as HTMLImageElement;
        stabilizeImageDimensions(cover);
        linkChildren.push(cover);
      }
      linkChildren.push(newHtml('div', { class: 'digest-post-embed-content' }, contentChildren));

      el.innerHTML = '';
      el.appendChild(newHtml('a', {
        class: 'digest-post-embed-card flowFocussable',
        href: attrs.canonical_url, target: '_blank', rel: 'noopener noreferrer',
      }, linkChildren));
    } catch {
      // Ignore malformed JSON
    }
  });
}

// ── Image-Only Post (e.g. XKCD): reveal alt/title on click ───────────

/** Checks whether a post description is just a single image with title or alt text. */
export function isImageOnlyPost(description?: string): boolean {
  if (!description) return false;
  const textOnly = description.replace(/<[^>]*>/gi, '').trim();
  if (textOnly) return false;
  const imgs = description.match(/<img\b[^>]*>/gi);
  if (imgs?.length != 1) return false;
  return /(?:title|alt)\s*=\s*"[^"]+"/i.test(imgs[0]);
}

export function hydrateImageOnlyPost(body: HTMLElement) {
  const imgs = body.querySelectorAll('img');
  if (imgs.length != 1) return;
  const textContent = body.textContent?.trim();
  if (textContent) return;

  const img = imgs[0];
  const caption = img.title || img.alt;
  if (!caption) return;

  const wrapper = newHtml('div', { class: 'imgOnlyWrapper' });
  const captionEl = newHtml('div', { class: 'imgOnlyCaption' }, caption);
  img.parentNode!.insertBefore(wrapper, img);
  wrapper.appendChild(img);
  wrapper.appendChild(captionEl);

  wrapper.addEventListener('click', e => {
    e.preventDefault();
    e.stopPropagation();
    wrapper.classList.toggle('imgOnlyCaptionVisible');
  });
}

// ── Ghost Embed Figure: hide redundant fallback <img> after iframe embed ──
// Ghost RSS feeds emit a YouTube/Vimeo iframe inside <figure class="kg-embed-card">
// followed by a thumbnail <img> that duplicates the embedded video poster.

export function hideGhostEmbedFallbackImages(body: HTMLElement) {
  body.querySelectorAll('figure.kg-embed-card').forEach(figure => {
    if (!figure.querySelector('iframe')) return;
    const next = figure.nextElementSibling;
    if (next?.tagName == 'IMG') next.remove();
  });
}

// ── <aside> normalization ──────────────────────────────────────────────
// Feed HTML uses <aside> for material that stands beside the narrative: pull
// quotes, editor's notes, "related reading" link boxes. The UA renders it as a
// plain block, so it reads as the author abruptly changing subject mid-article;
// CSS gives it a callout card instead (.postBody aside). Two shapes have to opt
// out of that card, or the styling is worse than no styling at all:
//  - placeholder asides (ad / newsletter-signup slots whose content is injected
//    by scripts we strip) hold nothing and would render as an empty box;
//  - wrapper asides (some CMSes emit <aside> around the whole entry) would frame
//    the entire post.
// A media-only aside keeps its spacing but drops the padded box, which would
// otherwise inset an image or video for no reason.

const ASIDE_MEDIA = 'img, picture, video, audio, iframe, table';
// Below this length an aside is a callout even if it dominates a very short post.
const ASIDE_WRAPPER_MIN_CHARS = 240;

export function normalizeAsides(body: HTMLElement) {
  const bodyLen = body.textContent?.trim().length ?? 0;
  body.querySelectorAll('aside').forEach(aside => {
    const textLen = aside.textContent?.trim().length ?? 0;
    if (!textLen) {
      if (aside.querySelector(ASIDE_MEDIA)) aside.classList.add('asideMedia');
      else aside.remove();
      return;
    }
    // Nearly the whole post lives in here, so there is nothing left for it to
    // stand aside from — render it as ordinary body content.
    if (aside.parentElement == body && textLen >= ASIDE_WRAPPER_MIN_CHARS && textLen >= bodyLen * 0.6)
      aside.classList.add('asidePlain');
  });
}

// ── <br> Run Collapsing ────────────────────────────────────────────────
// Some publishers (MacRumors) turn every source newline into a <br>, including
// the ones between table rows. The HTML parser foster-parents those out of the
// table, so dozens of <br> pile up in front of it as one run. A run next to a
// block-level sibling, or at either end of the body, adds nothing but blank
// space and is dropped; anywhere else it is capped at two (a paragraph break).
// Done in the DOM rather than CSS: sibling combinators skip text nodes, so
// `br + br + br` would also hide every third break of a line<br>line poem.
const BLOCK_TAGS = new Set(['ADDRESS', 'ARTICLE', 'ASIDE', 'BLOCKQUOTE', 'DD', 'DETAILS', 'DIV', 'DL', 'DT', 'FIELDSET',
  'FIGCAPTION', 'FIGURE', 'FOOTER', 'FORM', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'HEADER', 'HR', 'LI', 'MAIN', 'NAV', 'OL',
  'P', 'PRE', 'SECTION', 'TABLE', 'UL']);
const isBlankText = (n: Node) => n.nodeType == 3 && !/[^\s\u200b-\u200d\ufeff]/.test(n.textContent || '');
const isBlock = (n?: Node) => !!n && n.nodeType == 1 && BLOCK_TAGS.has(n.nodeName);

export function collapseBrRuns(body: HTMLElement) {
  const parents = new Set<Node>();
  body.querySelectorAll('br').forEach(br => parents.add(br.parentNode!));
  parents.forEach(parent => {
    const nodes = Array.from(parent.childNodes);
    for (let i = 0; i < nodes.length; i++) {
      if (nodes[i].nodeName != 'BR') continue;
      const run: ChildNode[] = [];
      let j = i;
      for (; j < nodes.length && (nodes[j].nodeName == 'BR' || isBlankText(nodes[j])); j++)
        if (nodes[j].nodeName == 'BR') run.push(nodes[j]);
      let p = i - 1;
      while (p >= 0 && isBlankText(nodes[p])) p--;
      const prev = nodes[p], next = nodes[j];
      const atBodyEdge = parent == body && (!prev || !next);
      const keep = atBodyEdge || isBlock(prev) || isBlock(next) ? 0 : 2;
      run.slice(keep).forEach(br => br.remove());
      i = j - 1;
    }
  });
}

// ── Rowspan-shifted Table Cells ─────────────────────────────────────────
// Data tables flush their outer cells with the body text by zeroing the padding
// of each row's :first-child/:last-child (css/postviewer.css). Under a rowspan cell
// that is wrong: the row's first <td> sits in column 2, so it would lose its
// padding and stick out against the cells above and below it. CSS can't see
// rowspans, so lay out the grid here and mark the cells whose row edge is not
// the table edge.
export function markRowspanShiftedCells(body: HTMLElement) {
  body.querySelectorAll('table').forEach(table => {
    if (!table.querySelector('[rowspan]')) return;
    const carried: number[] = []; // per column: following rows still covered by a rowspan
    Array.from(table.rows).forEach(row => {
      const covered = (c: number) => carried[c] > 0;
      const cells = Array.from(row.cells);
      const placed: [number, number, number][] = []; // [start column, end column, rowspan]
      let col = 0;
      cells.forEach((cell, i) => {
        while (covered(col)) col++;
        if (!i && col) cell.classList.add('afterRowspan');
        const end = col + Math.max(cell.colSpan, 1);
        placed.push([col, end, cell.rowSpan || table.rows.length]);
        if (i == cells.length - 1 && carried.some((n, c) => n > 0 && c >= end)) cell.classList.add('beforeRowspan');
        col = end;
      });
      carried.forEach((n, c) => carried[c] = Math.max(n - 1, 0));
      placed.forEach(([start, end, rs]) => { for (let c = start; c < end; c++) carried[c] = rs - 1; });
    });
  });
}

// ── Table Heights ───────────────────────────────────────────────────────
// In table layout a <table>'s height is only a minimum, so editors (TinyMCE,
// WordPress) freely stamp the measured `style="height:442px"` on it. Our
// `.postBody table { display: block; overflow-x: auto }` (css/postviewer.css) turns
// that into a fixed height with a vertical scroll box, and once our cell
// padding or a narrower column makes the content taller, the last rows are cut
// off. Turn it back into the minimum it was meant to be.
export function relaxTableHeights(body: HTMLElement) {
  body.querySelectorAll('table').forEach(table => {
    const { height } = table.style;
    if (!height || height == 'auto') return;
    table.style.minHeight = height;
    table.style.height = '';
  });
}

// ── Duplicate Image Removal ────────────────────────────────────────────
// Lazy-loading publishers (stuff.tv) follow each <img> with a <noscript>
// fallback of the same image. The sanitizer drops the noscript tag but keeps
// its children, leaving two identical images side by side — remove the repeat.
// When the visible image is only a data: placeholder (WP Rocket style) and the
// fallback carries the real URL, the placeholder is the one to go. Images that
// differ otherwise are both kept.
export function dedupeAdjacentImages(body: HTMLElement) {
  body.querySelectorAll('img').forEach(img => {
    let prev = img.previousSibling;
    while (prev && isBlankText(prev)) prev = prev.previousSibling;
    if (prev?.nodeName != 'IMG') return;
    const prevImg = prev as HTMLImageElement;
    const src = img.getAttribute('src') || '', prevSrc = prevImg.getAttribute('src') || '';
    const srcset = img.getAttribute('srcset');
    if (src && src == prevSrc || srcset && srcset == prevImg.getAttribute('srcset')) img.remove();
    else if (src && !src.startsWith('data:') && prevSrc.startsWith('data:')) prevImg.remove();
  });
}

// ── Unsupported Chart Placeholders ─────────────────────────────────────
// github.blog ships each chart as an empty `<div class="ghchart">` mount plus
// ~70KB of inline script that draws into it. The sanitizer drops the script,
// so the reader would show a silent gap — say what's missing instead. The id
// selector catches posts stored before the class was allowlisted (ids keep
// the sanitizer's `uc-` namespace prefix).
export function hydrateUnsupportedCharts(body: HTMLElement) {
  body.querySelectorAll<HTMLElement>('div.ghchart, div[id^="uc-gh-chart-"]').forEach(div => {
    if (div.children.length || div.textContent?.trim()) return;
    div.classList.add('unsupportedChart');
    div.replaceChildren('Chart content can’t be shown here');
  });
}

// ── Attributed Quote Marking ───────────────────────────────────────────
// Publishers draw typographic quote marks and an attribution line around an
// attributed quotation (WordPress' quote block, or any blockquote carrying a
// <cite>/<footer>) with their own stylesheet, which the reader never loads.
// Mark such quotes so postviewer.css can add the marks itself — unless the text
// already starts with one, which CSS can't detect and would double up.
const OPENING_QUOTE_CHARS = /^["'‘’‚“”„‹«「]/;

export function hydrateAttributedQuotes(body: HTMLElement) {
  body.querySelectorAll<HTMLElement>('blockquote').forEach(bq => {
    if (!bq.classList.contains('wp-block-quote') && !bq.querySelector(':scope > cite, :scope > footer')) return;
    const text = bq.querySelector(':scope > p')?.textContent?.trim();
    if (!text || OPENING_QUOTE_CHARS.test(text)) return;
    bq.classList.add('attributedQuote');
  });
}

// ── Instagram Embed Class Hydration ────────────────────────────────────
// Instagram's embed.js processes blockquotes selected strictly by the
// `instagram-media` class. Some publishers' RSS/CMS plugins rename it
// (e.g. `bro-instagram-media` from lazy-embed plugins), and our sanitizer
// then drops the unknown class entirely. The canonical `data-instgrm-permalink`
// attribute always survives (it's in the blockquote attribute allowlist), so
// key off it and re-assert the class embed.js needs.

export function hydrateInstagramEmbeds(body: HTMLElement) {
  body.querySelectorAll('blockquote[data-instgrm-permalink]:not(.instagram-media)')
    .forEach(bq => bq.classList.add('instagram-media'));
}

// ── TikTok Embed Video-ID Hydration ────────────────────────────────────
// TikTok's embed.js resolves the video from `data-video-id` on the
// `blockquote.tiktok-embed`. Our sanitizer's blockquote attribute allowlist
// drops `data-video-id`, leaving embed.js with nothing to load ("Video
// currently unavailable"). The `cite` attribute survives and carries the id
// as its last path segment (…/video/<id>), so re-derive it from there.

export function hydrateTikTokEmbeds(body: HTMLElement) {
  body.querySelectorAll<HTMLElement>('blockquote.tiktok-embed:not([data-video-id])').forEach(bq => {
    const cite = bq.getAttribute('cite') || bq.querySelector<HTMLAnchorElement>('a[href*="/video/"]')?.href || '';
    const id = cite.match(/\/video\/(\d+)/)?.[1];
    if (id) bq.setAttribute('data-video-id', id);
  });
}

// ── Threads (WP/iframely) Embed Hydration ──────────────────────────────
// WordPress + iframely emit Threads posts as a responsive-padding wrapper
// around an empty <a href="…/post/<id>"> that only fills once iframely's
// stripped JS runs — leaving us a blank box. Threads' own embed.js instead
// looks for `blockquote.text-post-media[data-text-post-permalink]`, so rebuild
// that blockquote (with a "View on Threads" placeholder) from the permalink.
// loadExternalScripts then loads threads embed.js, which swaps in the iframe.

const THREADS_LOGO_PATH = 'M141.537 88.9883C140.71 88.5919 139.87 88.2104 139.019 87.8451C137.537 60.5382 122.616 44.905 97.5619 44.745C97.4484 44.7443 97.3355 44.7443 97.222 44.7443C82.2364 44.7443 69.7731 51.1409 62.102 62.7807L75.881 72.2328C81.6116 63.5383 90.6052 61.6848 97.2286 61.6848C97.3051 61.6848 97.3819 61.6848 97.4576 61.6855C105.707 61.7381 111.932 64.1366 115.961 68.814C118.893 72.2193 120.854 76.925 121.825 82.8638C114.511 81.6207 106.601 81.2385 98.145 81.7233C74.3247 83.0954 59.0111 96.9879 60.0396 116.292C60.5615 126.084 65.4397 134.508 73.775 140.011C80.8224 144.663 89.899 146.938 99.3323 146.423C111.79 145.74 121.563 140.987 128.381 132.296C133.559 125.696 136.834 117.143 138.28 106.366C144.217 109.949 148.617 114.664 151.047 120.332C155.179 129.967 155.42 145.8 142.501 158.708C131.182 170.016 117.576 174.908 97.0135 175.059C74.2042 174.89 56.9538 167.575 45.7381 153.317C35.2355 139.966 29.8077 120.682 29.6052 96C29.8077 71.3178 35.2355 52.0336 45.7381 38.6827C56.9538 24.4249 74.2039 17.11 97.0132 16.9405C119.988 17.1113 137.539 24.4614 149.184 38.788C154.894 45.8136 159.199 54.6488 162.037 64.9503L178.184 60.6422C174.744 47.9622 169.331 37.0357 161.965 27.974C147.036 9.60668 125.202 0.195148 97.0695 0H96.9569C68.8816 0.19447 47.2921 9.6418 32.7883 28.0793C19.8819 44.4864 13.2244 67.3157 13.0007 95.9325L13 96L13.0007 96.0675C13.2244 124.684 19.8819 147.514 32.7883 163.921C47.2921 182.358 68.8816 191.806 96.9569 192H97.0695C122.03 191.827 139.624 185.292 154.118 170.811C173.081 151.866 172.51 128.119 166.26 113.541C161.776 103.087 153.227 94.5962 141.537 88.9883ZM98.4405 129.507C88.0005 130.095 77.1544 125.409 76.6196 115.372C76.2232 107.93 81.9158 99.626 99.0812 98.6368C101.047 98.5234 102.976 98.468 104.871 98.468C111.106 98.468 116.939 99.0737 122.242 100.233C120.264 124.935 108.662 128.946 98.4405 129.507Z';

export function hydrateThreadsEmbeds(body: HTMLElement) {
  body.querySelectorAll<HTMLElement>('figure.wp-block-embed-threads').forEach(figure => {
    const permalink = figure.querySelector<HTMLAnchorElement>('a[href*="threads."]')?.href;
    const id = permalink?.match(/\/post\/([A-Za-z0-9_-]+)/)?.[1];
    if (!permalink || !id) return;

    const logo = newSvg('svg', { 'aria-label': 'Threads', height: '32px', role: 'img', viewBox: '0 0 192 192', width: '32px' },
      newSvg('path', { d: THREADS_LOGO_PATH }));
    const placeholder = newHtml('a', {
      href: permalink, target: '_blank', rel: 'noopener noreferrer', class: 'flowFocussable',
      style: 'background:#FFFFFF; padding:40px; text-decoration:none; width:100%; display:flex; flex-direction:column; align-items:center; font-family:-apple-system,BlinkMacSystemFont,sans-serif;',
    }, [
      newHtml('div', { style: 'height:32px; width:32px; padding-bottom:20px;' }, logo),
      newHtml('div', { style: 'font-size:15px; line-height:21px; color:#000000; font-weight:600;' }, 'View on Threads'),
    ]);
    const blockquote = newHtml('blockquote', {
      class: 'text-post-media',
      'data-text-post-permalink': permalink,
      'data-text-post-version': '0',
      id: `ig-tp-${id}`,
      style: 'background:#FFF; border:1px solid #00000026; border-radius:16px; max-width:650px; margin:1px auto; min-width:270px; padding:0; width:calc(100% - 2px);',
    }, placeholder);
    figure.replaceChildren(blockquote);
  });
}

// ── Image Viewer ───────────────────────────────────────────────────────

// The viewer's magnification levels for an image whose fit-to-screen scale is
// `fit` (≤ 1): first entry is fit, last is 1 (natural size), with geometric
// steps in between so each "+" enlarges by the same factor. An image no more
// than 80% larger than the viewport gets the single fit↔natural step; beyond
// that the step count grows so no step exceeds an 80% enlargement, capped at 4.
export function zoomScales(fit: number) {
  const steps = fit < 1 ? Math.min(4, Math.ceil(Math.log(1 / fit) / Math.log(1.8))) : 0;
  return Array.from({ length: steps + 1 }, (_, i) => fit ** (1 - i / (steps || 1)));
}

// Full-screen viewer that shows the image inside a scrollable surface (so
// oversized images can be panned), with the alt text underneath and controls
// that fade in on hover. It opens fit-to-screen so the whole image and its alt
// text are visible; +/- then step through up to 4 geometric magnification
// levels between fit and the natural resolution (a single step when natural is
// at most 80% larger than fit, none when it fits anyway — then only the close
// button appears), and touch screens can pinch-zoom continuously across the
// same range. Closes on Escape, on the close button, or on a click of the
// empty backdrop (clicks on the image itself are ignored so they can't dismiss
// it while panning).
export function showImageViewer(imageUrl: string, alt?: string) {
  const img = newHtml('img', { src: imageUrl, class: 'imageZoomImg', alt: alt || '' }) as HTMLImageElement;
  retryNoReferrer(img);
  // The alt caption lives outside the scroll surface, pinned to the bottom of the
  // viewport, so it neither scales with the image nor drifts off-screen when a
  // zoomed image is panned. The scroll surface reserves matching bottom padding
  // (see layoutAlt) so the fit-to-screen image is never hidden behind it.
  const altEl = alt ? newHtml('div', { class: 'imageZoomAlt' }, alt) : undefined;
  const scroll = newHtml('div', { class: 'imageZoomScroll' }, [img]);
  const ctrlBtn = (cls: string, label: string, path: string) =>
    newHtml('button', { class: `imageZoomBtn ${cls} flowFocussable`, 'aria-label': label, title: label },
      newSvg('svg', { viewBox: '0 0 24 24', width: '22', height: '22', 'aria-hidden': 'true' },
        newSvg('path', { d: path, stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round' }))) as HTMLButtonElement;
  const zoomInBtn = ctrlBtn('imageZoomIn', 'Zoom in', 'M12 5 L12 19 M5 12 L19 12');
  const zoomOutBtn = ctrlBtn('imageZoomOut', 'Zoom out', 'M5 12 L19 12');
  const closeBtn = ctrlBtn('imageZoomClose', 'Close image', 'M6 6 L18 18 M18 6 L6 18');
  const controls = newHtml('div', { class: 'imageZoomControls' }, [zoomInBtn, zoomOutBtn, closeBtn]);
  // '.flowFormModal' marks this as a FlowForm modal so its '.flowFocussable' close
  // button paints the standard focus glow and is included in modal focus handling.
  const overlay = newHtml('div', { class: 'imageZoomOverlay flowFormModal' },
    altEl ? [scroll, altEl, controls] : [scroll, controls]);
  document.body.appendChild(overlay);
  const prevOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
  // Move keyboard focus into the viewer and restore it to the triggering element on close.
  const prevFocus = document.activeElement as HTMLElement | null;
  closeBtn.focus();

  // Zoom state: `scale` is the current magnification relative to the natural size;
  // 0 means fit-to-screen (the initial state, rendered via the CSS .imageZoomFit
  // class so it stays responsive on resize). The
  // +/- buttons step through the zoomScales levels, pinching moves continuously
  // between fit and natural. Both zoom buttons keep their place at the ends of the
  // range — only the icon disappears and clicks are ignored — so a repeated tap
  // can't hit a neighbour that shifted underneath (e.g. close). An image whose
  // natural size fits the viewport gets no zoom buttons at all.
  let scale = 0;
  let scales = [1];
  const curScale = () => scale || scales[0];
  // Keep the scroll surface's bottom padding in step with the caption's height (it
  // grows as the viewport narrows), so the fit scale computed below leaves room for
  // it and a zoomed image can still be panned clear of it.
  const layoutAlt = () => {
    if (altEl) scroll.style.paddingBottom = `${altEl.offsetHeight + 16}px`;
  };
  const computeScales = () => {
    const style = getComputedStyle(scroll);
    const availW = scroll.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    const availH = scroll.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
    const fit = img.naturalWidth && img.naturalHeight
      ? Math.min(availW / img.naturalWidth, availH / img.naturalHeight, 1) : 1;
    scales = zoomScales(fit);
  };
  const setIdle = (btn: HTMLButtonElement, idle: boolean) => {
    btn.classList.toggle('imageZoomBtnIdle', idle);
    btn.setAttribute('aria-disabled', String(idle));
  };
  const applyScale = () => {
    if (scale) scale = Math.min(scale, 1);
    // At (or below) the fit scale, hand sizing back to the CSS fit mode.
    if (scale && scale <= scales[0]) scale = 0;
    overlay.classList.toggle('imageZoomFit', !scale);
    img.style.width = scale ? `${img.naturalWidth * scale}px` : '';
    const zoomable = scales.length > 1;
    zoomInBtn.style.display = zoomable ? '' : 'none';
    zoomOutBtn.style.display = zoomable ? '' : 'none';
    setIdle(zoomInBtn, curScale() > 0.995);
    setIdle(zoomOutBtn, !scale);
  };
  // Change the scale while keeping the image point at viewport position (ax, ay)
  // fixed, so zooming magnifies around the viewport centre / pinch midpoint
  // instead of jumping back to the top-left corner.
  const zoomTo = (target: number, ax: number, ay: number) => {
    const ix = (scroll.scrollLeft + ax - img.offsetLeft) / (img.offsetWidth || 1);
    const iy = (scroll.scrollTop + ay - img.offsetTop) / (img.offsetHeight || 1);
    scale = target;
    applyScale();
    scroll.scrollLeft = ix * img.offsetWidth + img.offsetLeft - ax;
    scroll.scrollTop = iy * img.offsetHeight + img.offsetTop - ay;
  };
  // +/- step to the next/previous zoomScales level from wherever the current
  // (possibly pinched) scale sits; at the ends of the range they do nothing.
  const stepZoom = (delta: number) => {
    const cur = curScale();
    const target = delta > 0 ? scales.find(s => s > cur * 1.005)
      : scales.filter(s => s < cur * 0.995).pop();
    if (target != undefined) zoomTo(target, scroll.clientWidth / 2, scroll.clientHeight / 2);
  };
  const onViewportChange = () => { layoutAlt(); computeScales(); applyScale(); };
  onViewportChange();
  if (!img.complete) img.addEventListener('load', onViewportChange, { once: true });
  window.addEventListener('resize', onViewportChange);

  // Pinch-zoom for touch screens: two fingers scale the image continuously around
  // the pinch midpoint. One-finger panning stays native scrolling; preventDefault
  // on the two-finger move (plus touch-action in CSS) keeps the browser from
  // pinch-zooming the page instead.
  let pinchDist = 0, pinchScale = 0;
  const touchInfo = (e: TouchEvent) => {
    const [a, b] = [e.touches[0], e.touches[1]];
    return { dist: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
             x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 };
  };
  scroll.addEventListener('touchstart', e => {
    if (e.touches.length != 2) { pinchDist = 0; return; }
    ({ dist: pinchDist } = touchInfo(e));
    pinchScale = curScale();
  });
  scroll.addEventListener('touchmove', e => {
    if (e.touches.length != 2 || !pinchDist) return;
    e.preventDefault();
    const { dist, x, y } = touchInfo(e);
    const rect = scroll.getBoundingClientRect();
    zoomTo(Math.max(scales[0], Math.min(1, pinchScale * dist / pinchDist)), x - rect.left, y - rect.top);
  }, { passive: false });
  scroll.addEventListener('touchend', e => { if (e.touches.length < 2) pinchDist = 0; });

  const close = () => {
    overlay.remove();
    document.body.style.overflow = prevOverflow;
    document.removeEventListener('keydown', onKey);
    window.removeEventListener('resize', onViewportChange);
    prevFocus?.focus?.();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key != 'Escape') return;
    e.preventDefault();
    e.stopPropagation();
    close();
  };
  zoomInBtn.addEventListener('click', e => { e.stopPropagation(); stepZoom(1); });
  zoomOutBtn.addEventListener('click', e => { e.stopPropagation(); stepZoom(-1); });
  closeBtn.addEventListener('click', e => { e.stopPropagation(); close(); });
  scroll.addEventListener('click', e => { if (e.target == scroll) close(); });
  document.addEventListener('keydown', onKey);
}

// ── Oversized-Image Zoom ───────────────────────────────────────────────
// Content images are laid out to fit the post column, so a high-resolution
// source is downscaled and its detail is lost. When the natural resolution is
// at least 2× the rendered size in either dimension, mark the image zoomable:
// a click opens the full-resolution image in the scrollable viewer above.
const ZOOM_FACTOR = 2;

function evaluateZoomable(img: HTMLImageElement) {
  const rw = img.clientWidth, rh = img.clientHeight;
  const nw = img.naturalWidth, nh = img.naturalHeight;
  if (!rw || !rh || !nw || !nh) return;
  const zoomable = nw >= rw * ZOOM_FACTOR || nh >= rh * ZOOM_FACTOR;
  img.classList.toggle('zoomableImage', zoomable);
  // Join FlowForm keyboard navigation when zoomable: '.flowFocussable' + tabindex make
  // the image reachable by arrow keys and paint the standard focus glow.
  img.classList.toggle('flowFocussable', zoomable);
  if (zoomable) img.tabIndex = 0;
  else img.removeAttribute('tabindex');
}

function wireZoomableImage(img: HTMLImageElement) {
  // Leave the special-cased images alone: digest covers link out, image-only
  // (XKCD-style) posts use the click to reveal their caption, and images inside
  // a link should follow the link. A glyph (feed-glyph: a ™ or emoji the feed ships as a
  // 72x72 PNG) is a character, not a picture — rendered at 1em it looks "oversized" to
  // evaluateZoomable, which would make every one of them a focus stop with a zoom cursor.
  if (img.classList.contains('digest-post-embed-cover') || img.classList.contains('feed-glyph') || img.closest('a')) return;
  if (img.complete) evaluateZoomable(img);
  else img.addEventListener('load', () => evaluateZoomable(img), { once: true });
  if (img.dataset.zoomWired) return;
  img.dataset.zoomWired = '1';
  // Zoomability depends on the RENDERED size, which is only known once the post-column
  // layout has downscaled the image — usually after 'load'. Re-evaluate whenever the
  // rendered box changes (initial layout, window resize, font/width changes) so the
  // zoom cursor and keyboard focus appear immediately, without needing a first click.
  if (typeof ResizeObserver != 'undefined')
    new ResizeObserver(() => evaluateZoomable(img)).observe(img);
  const openViewer = () => showImageViewer(img.currentSrc || img.src, img.alt || img.title);
  img.addEventListener('click', e => {
    // Re-check at click time: the rendered size changes with window width.
    evaluateZoomable(img);
    if (!img.classList.contains('zoomableImage')) return;
    // For image-only (XKCD-style) posts this fires before the wrapper's
    // caption-toggle handler; stopPropagation below suppresses it so an
    // oversized comic opens the viewer (which shows the same alt underneath)
    // instead of just revealing the inline caption. Non-oversized image-only
    // posts fall through above and keep the caption toggle.
    e.preventDefault();
    e.stopPropagation();
    openViewer();
  });
  // Enter/Space open the viewer for a keyboard-focused zoomable image. preventDefault
  // keeps PostViewFocus's global Space-scrolls handler (which ignores non-buttons) from
  // firing, mirroring how the click handler stops the caption toggle.
  img.addEventListener('keydown', e => {
    if (e.key != 'Enter' && e.key != ' ') return;
    evaluateZoomable(img);
    if (!img.classList.contains('zoomableImage')) return;
    e.preventDefault();
    e.stopPropagation();
    openViewer();
  });
}

// ── Browser Sanitizer ──
// Both sanitizers (native Sanitizer API, DOMPurify fallback) are derived from the allowlist in
// sanitize-schema.ts. Apps that also sanitize on the server should use the same lists.

let browserSanitizer: unknown;
function getBrowserSanitizer(): unknown {
  if (browserSanitizer !== undefined) return browserSanitizer;
  if (typeof (globalThis as any).Sanitizer != 'function') { browserSanitizer = null; return null; }
  try {
    browserSanitizer = new (globalThis as any).Sanitizer({
      elements: ALLOWED_TAGS.map(name => TAG_ATTRIBUTES[name] ? { name, attributes: TAG_ATTRIBUTES[name] } : name),
      attributes: GLOBAL_ATTRIBUTES,
      dataAttributes: true,
      comments: false,
    });
  } catch { browserSanitizer = null; }
  return browserSanitizer;
}

// DOMPurify has no per-tag attribute allowlists, so it gets the union of all
// per-tag attributes. That's fine security-wise: none of these attributes is
// dangerous on the "wrong" tag — the dangerous vectors (script/event handlers,
// javascript: URLs) are handled by DOMPurify itself.
const DOMPURIFY_CONFIG = {
  ALLOWED_TAGS: [...ALLOWED_TAGS],
  ALLOWED_ATTR: [...GLOBAL_ATTRIBUTES, ...Array.from(new Set(Object.values(TAG_ATTRIBUTES).flat()))],
  ALLOW_DATA_ATTR: true,
};

/** Client-side sanitization of feed HTML as a string (DOMPurify with the shared allowlist).
 *  Used as the safeSetHTML fallback and for render paths that hand HTML strings to React
 *  (dangerouslySetInnerHTML on the share page). */
export function sanitizeHtmlClient(html: string): string {
  return DOMPurify.sanitize(html, DOMPURIFY_CONFIG);
}

// ── Image Dimension Memory ─────────────────────────────────────────────
// Feeds rarely declare <img> width/height, so a post's layout height is wrong
// until every image has decoded. Virtualization re-creates trimmed posts when
// scrolling up, and each re-created image collapses again until it re-decodes,
// shifting the layout under the scroll position. Remember every image's natural
// size the first time it loads and patch it into later renders: together with
// the CSS `height: auto`, the attributes become an aspect-ratio that reserves
// the final space immediately.
const imageSizeCache = new Map<string, readonly [number, number]>();
const IMAGE_SIZE_CACHE_MAX = 1000;

function recordImageSize(img: HTMLImageElement) {
  const w = img.naturalWidth, h = img.naturalHeight;
  // Skip tiny images (trackers, spacers): patching their size would trigger the
  // margin-stripping CSS rules and change layout relative to the first render.
  if (w <= 8 || h <= 8) return;
  // Record under both src and currentSrc: a fresh element is patched before the
  // browser resolves srcset, so the lookup only knows src.
  const keys = img.currentSrc && img.currentSrc != img.src ? [img.src, img.currentSrc] : [img.src];
  for (const key of keys) {
    if (!key || imageSizeCache.has(key)) continue;
    if (imageSizeCache.size >= IMAGE_SIZE_CACHE_MAX)
      imageSizeCache.delete(imageSizeCache.keys().next().value as string);
    imageSizeCache.set(key, [w, h]);
  }
}

export function stabilizeImageDimensions(img: HTMLImageElement) {
  if (!img.getAttribute('width') && !img.getAttribute('height')) {
    const size = imageSizeCache.get(img.src) ?? imageSizeCache.get(img.currentSrc);
    if (size) {
      img.width = size[0];
      img.height = size[1];
    }
  }
  if (img.complete) recordImageSize(img);
  else img.addEventListener('load', () => recordImageSize(img), { once: true });
}

export function retryNoReferrer(img: HTMLImageElement) {
  img.onerror = () => {
    if (img.referrerPolicy != 'no-referrer') {
      img.referrerPolicy = 'no-referrer';
      const src = img.src; img.src = ''; img.src = src;
    } else
      img.style.display = 'none';
  };
}

export function safeSetHTML(el: HTMLElement, html: string) {
  const sanitizer = getBrowserSanitizer();
  if (sanitizer && 'setHTML' in el) {
    try {
      (el as any).setHTML(html, { sanitizer });
    } catch {
      el.innerHTML = sanitizeHtmlClient(html);
    }
  } else {
    el.innerHTML = sanitizeHtmlClient(html);
  }
  dedupeAdjacentImages(el);
  el.querySelectorAll('img').forEach(img => {
    retryNoReferrer(img);
    stabilizeImageDimensions(img);
    wireZoomableImage(img);
  });
}

// ── Replies (source:inReplyTo) ─────────────────────────────────────────

const REPLY_LABEL_MAX = 80;

/** Where a reply target links to: only permalinks, and only plain http(s). */
export function replyTargetHref(reply: PostInReplyTo): string | undefined {
  return reply.isPermalink && /^https?:\/\//i.test(reply.value) ? reply.value : undefined;
}

/** Link text for a reply target: the title of its feed, else a permalink without scheme and
 *  "www.", else the opaque id. */
export function replyTargetLabel(reply: PostInReplyTo): string {
  const title = reply.feedTitle?.trim();
  if (title) return truncateReplyLabel(title);
  let label = reply.value;
  if (replyTargetHref(reply))
    try {
      const u = new URL(reply.value);
      label = (u.host.replace(/^www\./i, '') + u.pathname.replace(/\/$/, '') + u.search) || reply.value;
    } catch { /* keep the raw value */ }
  return truncateReplyLabel(label);
}

const truncateReplyLabel = (label: string) => label.length > REPLY_LABEL_MAX ? label.slice(0, REPLY_LABEL_MAX - 1) + '…' : label;
