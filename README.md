# bigwide lib

Browser libraries of [bigwide.net](https://bigwide.net), written in TypeScript without a framework.
Used by [webpup](https://github.com/bigwide-net/webpup), Downread, sodir.org and RSS Directory.

| Library | What it does |
| --- | --- |
| [`postviewer/`](postviewer/README.md) | Renders feed posts (RSS, Atom, JSON Feed) as DOM: sanitized bodies (DOMPurify), embeds behind consent overlays, audio/video players, image viewer, a Markdown renderer for untrusted text, RFC-4 comment lists, and the CSS. |
| [`socialspec/`](socialspec/README.md) | [SocialSpec](https://socialspec.org) profiles: parsers for `about.md`, `following.opml` and `contact.vcf`, loading a domain's files, and a profile card. |
| `follow/` | The reader-independent follow dialog: pick a feed reader, open the feed in it or copy its URL. `src/follow.ts` (behavior), `css/follow-dialog.css`, and `templates/follow-dialog.njk` (the markup, as a Nunjucks macro). |

## Using it

There is no build step: the packages are TypeScript sources, and the apps compile them with their
own bundler (esbuild and Vite handle them as is). The only runtime dependency is DOMPurify.

```ts
import { createPostParts, createSessionConsent } from '@bigwide/lib/postviewer';
import { parseAbout } from '@bigwide/lib/socialspec';
import { initFollow } from '@bigwide/lib/follow';
```

Either install the repository as a package (`npm install github:bigwide-net/lib`), or check it out
next to your app and point an alias at it, as webpup does (`@lib/*` → `../lib/*` in its
`tsconfig.json`).

## Development

```bash
npm install
npm test            # Jest (jsdom), all three libraries
npm run typecheck
```

## License

MIT
