# postviewer

Renders feed posts as plain DOM: the post card parts (feed name and time, title, byline, YouTube
player, lead image, audio/video player) and the post body. The body is sanitized and repaired:
asides, tables, `<br>` runs and attributed quotes are fixed up, and Substack, Instagram, TikTok and
Threads embeds are rebuilt. Third-party embeds stay behind consent overlays until allowed. Also
includes a small Markdown renderer for untrusted text, RFC-4 comment lists, the full-screen image
viewer and all the CSS.

It has no framework dependency: the only runtime dependency is DOMPurify. Used by
[webpup](https://github.com/bigwide-net/webpup), Downread, sodir.org and RSS Directory.

## Source package

There is no build step: consumers compile the TypeScript themselves (esbuild and Vite handle it as
is), so the renderer can never be a stale build. `src/types.ts` defines the `Post` it renders; apps
map their own post objects onto it and may keep more fields, which the renderer ignores.

## Usage

```ts
import { createPostParts, createSessionConsent, loadExternalScripts } from '@bigwide/lib/postviewer';
import '@bigwide/lib/postviewer/css/postviewer.css';
import '@bigwide/lib/postviewer/css/post-tailwind.css';
import '@bigwide/lib/postviewer/css/post-tailwind-responsive.css';

const consent = createSessionConsent();     // or your own EmbedConsentApi (e.g. stored preferences)
const card = document.createElement('article');
card.className = 'myCard';
card.append(...createPostParts(post, { feedName: feed.title, feedHref: feed.siteUrl, consent }));
container.append(card);
loadExternalScripts(post.externalScripts, card, consent.isAllowed);  // after attaching
```

- **`createPostParts(post, opts)`** returns the parts in order. Titleless (Tweet-style) posts
  have no title element. Wrap the parts in your own card element and add your own actions
  ("Original Post" etc.). `opts.headerActions` goes beside the meta line.
- **`createPostBody(html, consent)`** returns only the body.
- **Detached rendering:** both build the body while it is detached from the document, so an
  unconsented iframe never issues a request.
- **Containers:** give the card (or an ancestor) `container-type: inline-size`, so the
  narrow-column rules and the Tailwind `sm:`/`md:`/`lg:` variants can respond to the post's
  width.
- **Keyboard navigation:** links get the `flowFocussable` class, for apps that move the focus
  between links with the keyboard. It does nothing otherwise.

## Theming

Every color and font in `css/postviewer.css` is a `--pv-*` custom property. The file defines
light defaults with zero specificity (`:where(:root)`), so set your own on `body` or any
ancestor of the posts, and redefine them for dark mode. The list with what each token is used
for is at the top of `postviewer.css`.

Typography tokens:
- `--pv-font-size`: body size; titles and byline scale with it.
- `--pv-body-font`: body font; inherited when unset.
- `--pv-ui-font`: captions, asides and tables.

The image viewer, video players and consent overlays always use fixed dark colors.

## Tailwind utilities

`css/post-tailwind.css` implements the Tailwind classes that feeds use in post bodies and the
sanitizer keeps (`class` is allowed, see `src/sanitize-schema.ts`). After changing it, regenerate the
responsive variants:

```bash
node postviewer/bin/gen-post-tailwind-responsive.mjs
```

## Tests

From the repository root: `npm test` (Jest, jsdom) and `npm run typecheck`.
