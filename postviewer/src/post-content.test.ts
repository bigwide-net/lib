import { collapseBrRuns, markRowspanShiftedCells, relaxTableHeights, dedupeAdjacentImages, hydrateAttributedQuotes, hydrateUnsupportedCharts, hydrateInstagramEmbeds, hydrateTikTokEmbeds, hydrateThreadsEmbeds, isPostImageInBody, normalizeAsides, zoomScales, sanitizeHtmlClient, safeSetHTML, postMediaKind } from './post-content';

function makeBody(html: string): HTMLElement {
  const body = document.createElement('div');
  body.innerHTML = html;
  return body;
}

describe('hydrateInstagramEmbeds', () => {
  const PERMALINK = 'https://www.instagram.com/reel/DLbI0a2urYm/?utm_source=ig_embed';

  it('restores the instagram-media class when a publisher renamed it (bro-instagram-media)', () => {
    const body = makeBody(`<blockquote class="bro-instagram-media" data-instgrm-permalink="${PERMALINK}" data-instgrm-version="14">x</blockquote>`);
    hydrateInstagramEmbeds(body);
    const bq = body.querySelector('blockquote')!;
    expect(bq.classList.contains('instagram-media')).toBe(true);
    // Existing token is left intact; embed.js only needs the instagram-media token present.
    expect(bq.classList.contains('bro-instagram-media')).toBe(true);
    // embed.js selects strictly by `.instagram-media` — assert it now matches.
    expect(body.querySelectorAll('blockquote.instagram-media').length).toBe(1);
  });

  it('adds the class when the sanitizer stripped it entirely (no class attribute)', () => {
    const body = makeBody(`<blockquote data-instgrm-permalink="${PERMALINK}" data-instgrm-version="14">x</blockquote>`);
    hydrateInstagramEmbeds(body);
    expect(body.querySelector('blockquote')!.classList.contains('instagram-media')).toBe(true);
  });

  it('is idempotent when the class is already present', () => {
    const body = makeBody(`<blockquote class="instagram-media" data-instgrm-permalink="${PERMALINK}">x</blockquote>`);
    hydrateInstagramEmbeds(body);
    const bq = body.querySelector('blockquote')!;
    expect(bq.className).toBe('instagram-media');
  });

  it('does not touch blockquotes without the Instagram permalink marker', () => {
    const body = makeBody('<blockquote class="some-quote">a regular pull quote</blockquote>');
    hydrateInstagramEmbeds(body);
    const bq = body.querySelector('blockquote')!;
    expect(bq.classList.contains('instagram-media')).toBe(false);
    expect(bq.className).toBe('some-quote');
  });

  it('hydrates every embed when a post contains multiple', () => {
    const body = makeBody(
      `<blockquote class="bro-instagram-media" data-instgrm-permalink="${PERMALINK}/1">x</blockquote>` +
      `<p>between</p>` +
      `<blockquote data-instgrm-permalink="${PERMALINK}/2">y</blockquote>`
    );
    hydrateInstagramEmbeds(body);
    expect(body.querySelectorAll('blockquote.instagram-media').length).toBe(2);
  });
});

describe('hydrateAttributedQuotes', () => {
  const WP = '<blockquote class="wp-block-quote"><p>So far, it is at or better than Opus.</p><cite>Principal Engineer</cite></blockquote>';

  it('marks a WordPress quote block', () => {
    const body = makeBody(WP);
    hydrateAttributedQuotes(body);
    expect(body.querySelector('blockquote')!.classList.contains('attributedQuote')).toBe(true);
  });

  it('marks a plain blockquote attributed by a cite or footer child', () => {
    const body = makeBody('<blockquote><p>Words.</p><cite>Someone</cite></blockquote><blockquote><p>More.</p><footer>Else</footer></blockquote>');
    hydrateAttributedQuotes(body);
    expect(body.querySelectorAll('blockquote.attributedQuote').length).toBe(2);
  });

  it('leaves unattributed blockquotes alone', () => {
    const body = makeBody('<blockquote><p>Note: a Markdown callout.</p></blockquote>');
    hydrateAttributedQuotes(body);
    expect(body.querySelector('.attributedQuote')).toBeNull();
  });

  it('ignores a cite nested deeper than the blockquote itself', () => {
    const body = makeBody('<blockquote><p>Words <cite>Book</cite></p></blockquote>');
    hydrateAttributedQuotes(body);
    expect(body.querySelector('.attributedQuote')).toBeNull();
  });

  it('skips quotes whose text already starts with a quote mark', () => {
    for (const q of ['"', '\u201c', '\u201e', '\u00ab', "'"]) {
      const body = makeBody(`<blockquote class="wp-block-quote"><p>${q}Already quoted.${q}</p><cite>X</cite></blockquote>`);
      hydrateAttributedQuotes(body);
      expect(body.querySelector('.attributedQuote')).toBeNull();
    }
  });

  it('skips quotes without a paragraph to hang the marks on', () => {
    const body = makeBody('<blockquote class="wp-block-quote">Bare text<cite>X</cite></blockquote>');
    hydrateAttributedQuotes(body);
    expect(body.querySelector('.attributedQuote')).toBeNull();
  });

  it('does not touch social embed blockquotes', () => {
    const body = makeBody('<blockquote class="tiktok-embed" cite="https://www.tiktok.com/@a/video/1"><section><p>caption</p></section></blockquote>');
    hydrateAttributedQuotes(body);
    expect(body.querySelector('.attributedQuote')).toBeNull();
  });
});

describe('hydrateUnsupportedCharts', () => {
  const MSG = 'Chart content can’t be shown here';

  it('fills an empty ghchart mount with a notice', () => {
    const body = makeBody('<div id="uc-gh-chart-hf-terminal" class="ghchart"></div>');
    hydrateUnsupportedCharts(body);
    const div = body.querySelector('div')!;
    expect(div.classList.contains('unsupportedChart')).toBe(true);
    expect(div.textContent).toBe(MSG);
  });

  it('recognizes the mount by its namespaced id when the class was stripped', () => {
    const body = makeBody('<div id="uc-gh-chart-cb-distribution"> </div>');
    hydrateUnsupportedCharts(body);
    expect(body.querySelector('div')!.textContent).toBe(MSG);
  });

  it('leaves a mount alone that already has content', () => {
    const body = makeBody('<div class="ghchart"><img src="https://example.com/fallback.png"></div><div class="ghchart">text</div>');
    hydrateUnsupportedCharts(body);
    expect(body.querySelector('.unsupportedChart')).toBeNull();
    expect(body.querySelector('img')).not.toBeNull();
  });

  it('ignores unrelated empty divs', () => {
    const body = makeBody('<div id="uc-other"></div><div></div>');
    hydrateUnsupportedCharts(body);
    expect(body.querySelector('.unsupportedChart')).toBeNull();
  });
});

describe('collapseBrRuns', () => {
  const brs = (body: HTMLElement) => body.querySelectorAll('br').length;

  it('drops the run of <br> the parser foster-parented out of a table', () => {
    // Rows separated by <br/> as MacRumors ships them: the parser hoists them before the table.
    const body = makeBody('Intro\n<br/>\n<table><br/><tr><br/><th>A</th><br/><th>B</th><br/></tr><br/><tr><br/><td>1</td><br/><td>2</td><br/></tr><br/></table>\n<br/>\n<div class="clear"></div>');
    expect(brs(body)).toBeGreaterThan(8);
    collapseBrRuns(body);
    expect(brs(body)).toBe(0);
    expect(body.querySelectorAll('td').length).toBe(2);
    expect(body.textContent).toContain('Intro');
  });

  it('caps a run between two text runs at two', () => {
    const body = makeBody('One<br/>\n<br/>\n \n<br/>\n<br/>Two');
    collapseBrRuns(body);
    expect(brs(body)).toBe(2);
    expect(body.textContent!.replace(/\s+/g, '')).toBe('OneTwo');
  });

  it('keeps single line breaks between text lines', () => {
    const body = makeBody('<p>line one<br>line two<br>line three<br>line four</p>');
    collapseBrRuns(body);
    expect(brs(body)).toBe(3);
  });

  it('keeps a paragraph break of two <br> and a break after an inline image', () => {
    const body = makeBody('a<br><br>b<img src="https://x.test/i.png"><br>c');
    collapseBrRuns(body);
    expect(brs(body)).toBe(3);
  });

  it('drops runs adjacent to headings and other blocks', () => {
    const body = makeBody('text<br/>\n<br/>\n<h3>Title</h3>\n<br/>\nmore<br/><p>p</p>');
    collapseBrRuns(body);
    expect(brs(body)).toBe(0);
    expect(body.querySelector('h3')!.textContent).toBe('Title');
  });

  it('drops leading and trailing runs of the body but not of a nested element', () => {
    const body = makeBody('<br/><br/>text<br/><p>x<br></p><br/>');
    collapseBrRuns(body);
    expect(body.firstChild!.nodeName).not.toBe('BR');
    expect(body.lastChild!.nodeName).not.toBe('BR');
    expect(body.querySelector('p br')).not.toBeNull();
  });

  it('is a no-op without <br>', () => {
    const body = makeBody('<p>a</p><table><tr><td>1</td></tr></table>');
    const before = body.innerHTML;
    collapseBrRuns(body);
    expect(body.innerHTML).toBe(before);
  });
});

describe('dedupeAdjacentImages', () => {
  const SRC = 'https://www.stuff.tv/wp-content/uploads/2026/05/coffee.jpg?quality=75&w=1024';
  const SET = 'https://www.stuff.tv/c.jpg?w=600 600w, https://www.stuff.tv/c.jpg?w=900 900w';
  const imgs = (body: HTMLElement) => body.querySelectorAll('img').length;

  it('removes the noscript copy that follows the same image', () => {
    const body = makeBody(`<figure><img src="${SRC}" srcset="${SET}" alt="a" width="1024" height="683"><img src="${SRC}" srcset="${SET}" alt="a"><figcaption>Credit</figcaption></figure>`);
    dedupeAdjacentImages(body);
    expect(imgs(body)).toBe(1);
    expect(body.querySelector('img')!.getAttribute('width')).toBe('1024');
    expect(body.querySelector('figcaption')).not.toBeNull();
  });

  it('tolerates whitespace between the copies and collapses several', () => {
    const body = makeBody(`<p><img src="${SRC}">\n  <img src="${SRC}">\n<img src="${SRC}"></p>`);
    dedupeAdjacentImages(body);
    expect(imgs(body)).toBe(1);
  });

  it('treats an identical srcset as the same image even if src differs', () => {
    const body = makeBody(`<img src="${SRC}" srcset="${SET}"><img src="https://www.stuff.tv/c.jpg" srcset="${SET}">`);
    dedupeAdjacentImages(body);
    expect(imgs(body)).toBe(1);
  });

  it('drops a data: placeholder in favour of the real fallback image', () => {
    const body = makeBody(`<img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" alt="x"><img src="${SRC}" alt="x">`);
    dedupeAdjacentImages(body);
    expect(imgs(body)).toBe(1);
    expect(body.querySelector('img')!.getAttribute('src')).toBe(SRC);
  });

  it('keeps different neighbouring images and images separated by content', () => {
    const body = makeBody(`<img src="${SRC}"><img src="https://www.stuff.tv/other.jpg"><img src="${SRC}">text<img src="${SRC}">`);
    dedupeAdjacentImages(body);
    expect(imgs(body)).toBe(4);
  });

  it('runs as part of safeSetHTML', () => {
    const el = document.createElement('div');
    safeSetHTML(el, `<figure><img src="${SRC}"><img src="${SRC}"></figure>`);
    expect(imgs(el)).toBe(1);
  });
});

describe('hydrateTikTokEmbeds', () => {
  const CITE = 'https://www.tiktok.com/@elevate_utah/video/7638845624514858253';

  it('re-derives data-video-id from the surviving cite attribute', () => {
    const body = makeBody(`<blockquote class="tiktok-embed" cite="${CITE}"><section>x</section></blockquote>`);
    hydrateTikTokEmbeds(body);
    expect(body.querySelector('blockquote')!.getAttribute('data-video-id')).toBe('7638845624514858253');
  });

  it('falls back to a nested /video/ anchor when cite is absent', () => {
    const body = makeBody(`<blockquote class="tiktok-embed"><section><a href="${CITE}?refer=embed">@elevate_utah</a></section></blockquote>`);
    hydrateTikTokEmbeds(body);
    expect(body.querySelector('blockquote')!.getAttribute('data-video-id')).toBe('7638845624514858253');
  });

  it('leaves an existing data-video-id untouched', () => {
    const body = makeBody(`<blockquote class="tiktok-embed" data-video-id="111" cite="${CITE}">x</blockquote>`);
    hydrateTikTokEmbeds(body);
    expect(body.querySelector('blockquote')!.getAttribute('data-video-id')).toBe('111');
  });

  it('does not touch non-TikTok blockquotes', () => {
    const body = makeBody('<blockquote class="some-quote" cite="https://example.com/video/42">a quote</blockquote>');
    hydrateTikTokEmbeds(body);
    expect(body.querySelector('blockquote')!.hasAttribute('data-video-id')).toBe(false);
  });

  it('does nothing when no video id can be derived', () => {
    const body = makeBody('<blockquote class="tiktok-embed" cite="https://www.tiktok.com/@elevate_utah">x</blockquote>');
    hydrateTikTokEmbeds(body);
    expect(body.querySelector('blockquote')!.hasAttribute('data-video-id')).toBe(false);
  });
});

describe('hydrateThreadsEmbeds', () => {
  // Mirrors the WP/iframely shape after sanitization (percentage padding removed,
  // only the recognizable class + permalink anchor survive).
  const WP_THREADS = '<figure class="wp-block-embed-threads"><div><div><div><a href="https://www.threads.com/@allisonjo1/post/DYqIHEaAfAL" rel="noopener noreferrer" target="_blank"></a></div></div></div></figure>';

  it('rebuilds a text-post-media blockquote that threads embed.js can process', () => {
    const body = makeBody(WP_THREADS);
    hydrateThreadsEmbeds(body);
    const bq = body.querySelector('blockquote.text-post-media')!;
    expect(bq).not.toBeNull();
    expect(bq.getAttribute('data-text-post-permalink')).toBe('https://www.threads.com/@allisonjo1/post/DYqIHEaAfAL');
    expect(bq.id).toBe('ig-tp-DYqIHEaAfAL');
    // The empty iframely anchor must be gone, replaced by the placeholder link.
    expect(body.querySelectorAll('a').length).toBe(1);
    expect(body.querySelector('a')!.getAttribute('href')).toBe('https://www.threads.com/@allisonjo1/post/DYqIHEaAfAL');
  });

  it('does not touch figures without a threads permalink', () => {
    const body = makeBody('<figure class="wp-block-embed-threads"><div>no link here</div></figure>');
    hydrateThreadsEmbeds(body);
    expect(body.querySelector('blockquote')).toBeNull();
  });

  it('ignores unrelated figures', () => {
    const body = makeBody('<figure class="wp-block-image"><img src="https://x.example/a.jpg"></figure>');
    hydrateThreadsEmbeds(body);
    expect(body.querySelector('blockquote')).toBeNull();
  });
});

describe('isPostImageInBody', () => {
  const IMG = 'https://cdn.example.com/2026/07/photo-123456789.jpg';

  it('returns false without an image url or body', () => {
    expect(isPostImageInBody(undefined, '<p>x</p>')).toBe(false);
    expect(isPostImageInBody(IMG, undefined)).toBe(false);
    expect(isPostImageInBody(IMG, '')).toBe(false);
  });

  it('matches by exact filename (case-insensitive, ignoring the query string)', () => {
    expect(isPostImageInBody(IMG + '?w=600', `<img src="https://cdn.example.com/2026/07/PHOTO-123456789.jpg">`)).toBe(true);
  });

  it('does not filename-match short, non-distinctive names', () => {
    expect(isPostImageInBody('https://other.example.org/img.jpg', 'the text img.jpg appears here')).toBe(false);
  });

  it('matches a different rendition in the same directory sharing a long number', () => {
    const body = `<img src="https://cdn.example.com/2026/07/thumb-123456789-large.webp">`;
    expect(isPostImageInBody(IMG, body)).toBe(true);
  });

  it('matches a leading body image on the same host', () => {
    expect(isPostImageInBody(IMG, `<img src="https://cdn.example.com/other/rendition.png">`)).toBe(true);
    expect(isPostImageInBody(IMG, `<figure><a href="/x"><img src="https://cdn.example.com/other/rendition.png"></a></figure><p>text</p>`)).toBe(true);
    expect(isPostImageInBody(IMG, `<p>Short intro:</p><img src="https://cdn.example.com/other/rendition.png">`)).toBe(true);
  });

  it('ignores same-host body images that follow real text (blogs host all images in one place)', () => {
    const body = `<p>Rssdirectory.org publishes Downread's library of feeds and offers it as a category-based directory.</p>`
      + `<figure><img src="https://twowavesandadot.blog/static/blog-media/0e9f6c1a-55aa-4f0b-9d1e-2b7c3a4d5e6f.webp"></figure>`;
    expect(isPostImageInBody('https://twowavesandadot.blog/static/blog-media/21ad42ca-3198-4334-a4bd-5835e3c66326.webp', body)).toBe(false);
  });

  it('only looks at the first body image for the host match', () => {
    const body = `<img src="https://elsewhere.example.org/badge.png"><img src="https://cdn.example.com/other/rendition.png">`;
    expect(isPostImageInBody(IMG, body)).toBe(false);
  });

  it('returns false when the body has no related image', () => {
    expect(isPostImageInBody(IMG, `<p>text</p><img src="https://elsewhere.example.org/pic-987.jpg">`)).toBe(false);
  });
});

describe('zoomScales', () => {
  it('has no zoom steps when the image fits the viewport', () => {
    expect(zoomScales(1)).toEqual([1]);
  });

  it('uses a single fit-to-natural step when natural is at most 80% larger', () => {
    expect(zoomScales(0.6)).toEqual([0.6, 1]);
    expect(zoomScales(1 / 1.8)).toEqual([1 / 1.8, 1]);
  });

  it('splits into several steps when natural is more than 80% larger', () => {
    const scales = zoomScales(0.5); // natural is 2x the fit size
    expect(scales.length).toBe(3);
    expect(scales[0]).toBeCloseTo(0.5);
    expect(scales[2]).toBe(1);
  });

  it('caps at 4 magnification steps for extremely large images', () => {
    expect(zoomScales(0.1).length).toBe(5);   // 10x still needs only 4 steps
    expect(zoomScales(0.001).length).toBe(5); // 1000x is capped at 4 steps
  });

  it('spaces steps geometrically so each "+" enlarges by the same factor', () => {
    const scales = zoomScales(0.1);
    for (let i = 2; i < scales.length; i++)
      expect(scales[i] / scales[i - 1]).toBeCloseTo(scales[1] / scales[0]);
  });

  it('keeps each step at an enlargement of at most 80% when uncapped', () => {
    for (const fit of [0.9, 0.5, 0.2, 0.11]) {
      const scales = zoomScales(fit);
      for (let i = 1; i < scales.length; i++)
        expect(scales[i] / scales[i - 1]).toBeLessThanOrEqual(1.8 + 1e-9);
    }
  });
});

// jsdom has no native Sanitizer API, so these run the DOMPurify path — exactly the
// fallback that browsers without setHTML() get in production.
describe('sanitizeHtmlClient', () => {
  it('strips script tags but keeps surrounding content', () => {
    expect(sanitizeHtmlClient('<p>before</p><script>window.x=1</script><p>after</p>'))
      .toBe('<p>before</p><p>after</p>');
  });

  it('strips inline event handlers', () => {
    const out = sanitizeHtmlClient('<img src="https://example.com/a.jpg" onerror="alert(1)" alt="a">');
    expect(out).toContain('src="https://example.com/a.jpg"');
    expect(out).not.toContain('onerror');
  });

  it('strips javascript: URLs from links', () => {
    const out = sanitizeHtmlClient('<a href="javascript:alert(1)">x</a>');
    expect(out).not.toContain('javascript:');
  });

  it('removes disallowed tags like form/input/style', () => {
    const out = sanitizeHtmlClient('<form action="https://evil.example"><input name="pw"><style>*{display:none}</style><p>text</p></form>');
    expect(out).not.toContain('<form');
    expect(out).not.toContain('<input');
    expect(out).not.toContain('<style');
    expect(out).toContain('<p>text</p>');
  });

  it('keeps the allowlisted structure the reader depends on', () => {
    const html = '<blockquote class="tiktok-embed" cite="https://www.tiktok.com/@u/video/123" data-video-id="123">'
      + '<a href="https://example.com" target="_blank" rel="noopener noreferrer">link</a></blockquote>'
      + '<img src="https://example.com/a.jpg" alt="a" width="10" height="20" loading="lazy">'
      + '<iframe src="https://www.youtube-nocookie.com/embed/abc" allowfullscreen="true"></iframe>';
    const out = sanitizeHtmlClient(html);
    expect(out).toContain('class="tiktok-embed"');
    expect(out).toContain('data-video-id="123"');       // data attributes survive (embed hydration needs them)
    expect(out).toContain('target="_blank"');
    expect(out).toContain('rel="noopener noreferrer"');
    expect(out).toContain('width="10"');
    expect(out).toContain('<iframe');                    // trusted iframes are allowlisted server-side
  });
});

describe('normalizeAsides', () => {
  const LONG = 'The vote was close. '.repeat(20); // ~400 chars

  it('leaves a callout aside for the CSS card, without touching its content', () => {
    const body = makeBody('<p>Story.</p><aside><h3>Related</h3><p>Another piece</p></aside>');
    normalizeAsides(body);
    const aside = body.querySelector('aside')!;
    expect(aside.className).toBe('');
    expect(aside.querySelector('h3')!.textContent).toBe('Related');
  });

  it('removes an empty ad-slot aside so it cannot render as an empty box', () => {
    const body = makeBody('<p>Story.</p><aside class="ad-slot">\n  \n</aside>');
    normalizeAsides(body);
    expect(body.querySelector('aside')).toBeNull();
    expect(body.querySelector('p')).not.toBeNull();
  });

  it('keeps a text-free aside that carries media, but unframes it', () => {
    const body = makeBody('<p>Story.</p><aside><img src="chart.png"></aside>');
    normalizeAsides(body);
    expect(body.querySelector('aside')!.classList.contains('asideMedia')).toBe(true);
  });

  it('marks a whole-post wrapper plain so the card does not frame the entire post', () => {
    const body = makeBody(`<aside><p>${LONG}</p></aside>`);
    normalizeAsides(body);
    expect(body.querySelector('aside')!.classList.contains('asidePlain')).toBe(true);
  });

  it('still cards a long aside that sits beside a longer article', () => {
    const body = makeBody(`<p>${LONG}${LONG}</p><aside><p>${LONG}</p></aside>`);
    normalizeAsides(body);
    expect(body.querySelector('aside')!.className).toBe('');
  });

  it('cards a short aside even when it dominates a two-line post', () => {
    const body = makeBody('<p>Short.</p><aside><p>Editor\u2019s note: updated.</p></aside>');
    normalizeAsides(body);
    expect(body.querySelector('aside')!.className).toBe('');
  });

  it('cards a nested aside (only top-level wrappers go plain)', () => {
    const body = makeBody(`<div><aside><p>${LONG}</p></aside></div>`);
    normalizeAsides(body);
    expect(body.querySelector('aside')!.className).toBe('');
  });
});

describe('safeSetHTML (DOMPurify fallback path)', () => {
  it('never lets script content reach the element', () => {
    const el = document.createElement('div');
    safeSetHTML(el, '<p>ok</p><script>document.title="pwned"</script><img src="x" onerror="alert(1)">');
    expect(el.querySelector('script')).toBeNull();
    expect(el.querySelector('img')!.getAttribute('onerror')).toBeNull();
    expect(el.querySelector('p')!.textContent).toBe('ok');
  });

  it('keeps allowed post content intact', () => {
    const el = document.createElement('div');
    safeSetHTML(el, '<h2>title</h2><p>text with <a href="https://example.com">a link</a></p>');
    expect(el.querySelector('a')!.getAttribute('href')).toBe('https://example.com');
    expect(el.textContent).toContain('text with a link');
  });
});

describe('glyph images are not zoomable', () => {
  // A ™ the feed ships as a 72x72 PNG renders at 1em; without the feed-glyph opt-out
  // evaluateZoomable sees a heavily downscaled image and turns every one of them into a
  // focus stop with a zoom cursor (see wireZoomableImage).
  const SRC = 'https://s.w.org/images/core/emoji/17.0.2/72x72/2122.png';

  it('leaves a glyph unwired while still wiring a normal image', () => {
    const el = document.createElement('div');
    safeSetHTML(el, `<p>Hilton Honors<img class="feed-glyph" src="${SRC}" alt="™" style="height:1em"> Gold</p>`
      + `<p><img src="https://e.example/photo.jpg" alt="photo"></p>`);
    const [glyph, photo] = Array.from(el.querySelectorAll('img'));
    expect(glyph.dataset.zoomWired).toBeUndefined();
    expect(glyph.hasAttribute('tabindex')).toBe(false);
    expect(photo.dataset.zoomWired).toBe('1');
  });
});

describe('postMediaKind', () => {
  it('classifies by MIME type', () => {
    expect(postMediaKind({ mediaUrl: 'https://e.com/ep', mediaType: 'audio/mpeg' })).toBe('audio');
    expect(postMediaKind({ mediaUrl: 'https://e.com/clip', mediaType: 'Video/MP4' })).toBe('video');
  });

  it('falls back to the file extension for missing or generic types', () => {
    expect(postMediaKind({ mediaUrl: 'https://e.com/ep.mp3?x=1' })).toBe('audio');
    expect(postMediaKind({ mediaUrl: 'https://e.com/clip.webm', mediaType: 'application/octet-stream' })).toBe('video');
    expect(postMediaKind({ mediaUrl: 'https://e.com/doc.pdf', mediaType: 'application/pdf' })).toBeUndefined();
  });

  it('rejects non-http URLs and a missing enclosure', () => {
    expect(postMediaKind({ mediaUrl: 'javascript:alert(1)', mediaType: 'audio/mpeg' })).toBeUndefined();
    expect(postMediaKind({})).toBeUndefined();
  });

  it('skips media the body already embeds', () => {
    const mediaUrl = 'https://e.com/ep.mp3?a=1&b=2';
    expect(postMediaKind({ mediaUrl, description: '<audio src="https://e.com/ep.mp3?a=1&amp;b=2"></audio>' })).toBeUndefined();
  });
});

describe('markRowspanShiftedCells', () => {
  const mark = (html: string) => {
    const body = document.createElement('div');
    body.innerHTML = `<table><tbody>${html}</tbody></table>`;
    markRowspanShiftedCells(body);
    return Array.from(body.querySelectorAll('tr')).map(tr => Array.from(tr.children).map(c => c.className).join('|'));
  };

  it('marks first cells of rows covered by a rowspan in the first column', () => {
    expect(mark(`
      <tr><th></th><th>Head</th></tr>
      <tr><th rowspan="3">Cards</th><td>a</td></tr>
      <tr><td>b</td></tr>
      <tr><td>c</td></tr>
      <tr><th>Obstacle</th><td>d</td></tr>`))
      .toEqual(['|', '|', 'afterRowspan', 'afterRowspan', '|']);
  });

  it('marks last cells of rows covered by a rowspan in the last column', () => {
    expect(mark(`
      <tr><td>a</td><td>b</td><td rowspan="2">c</td></tr>
      <tr><td>d</td><td>e</td></tr>
      <tr><td>f</td><td>g</td><td>h</td></tr>`))
      .toEqual(['||', '|beforeRowspan', '||']);
  });

  it('accounts for colspans and leaves middle-column rowspans alone', () => {
    expect(mark(`
      <tr><td colspan="2" rowspan="2">a</td><td>b</td></tr>
      <tr><td>c</td></tr>
      <tr><td>d</td><td rowspan="2">e</td><td>f</td></tr>
      <tr><td>g</td><td>h</td></tr>`))
      .toEqual(['|', 'afterRowspan', '||', '|']);
  });

  it('ignores tables without rowspans', () => {
    expect(mark('<tr><td>a</td></tr><tr><td>b</td></tr>')).toEqual(['', '']);
  });
});

describe('relaxTableHeights', () => {
  it('turns a fixed table height into a minimum and leaves other tables alone', () => {
    const body = document.createElement('div');
    body.innerHTML = '<table style="height:442px;width:50%"><tr><td>a</td></tr></table><table><tr><td style="height:52px">b</td></tr></table>';
    relaxTableHeights(body);
    const [fixed, plain] = Array.from(body.querySelectorAll('table'));
    expect(fixed.style.height).toBe('');
    expect(fixed.style.minHeight).toBe('442px');
    expect(fixed.style.width).toBe('50%');
    expect(plain.getAttribute('style')).toBeNull();
    expect(plain.querySelector('td')!.style.height).toBe('52px');
  });
});
