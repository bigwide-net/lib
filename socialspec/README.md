# socialspec

SocialSpec profiles (https://socialspec.org/) in the browser: a domain's
`/.well-known/about.md`, `following.opml` and `contact.vcf` plus its feed, loaded and rendered as a
profile card with tabs (Posts, Following, About, Contact). Used by sodir.org's Social Browser,
Downread's profile pages and webpup (which uses the parsers). Source-only TypeScript, like
`postviewer` (whose DOM helpers and Markdown renderer it uses).

- `profile.ts` `loadProfile(domain, createDeps(proxy))`: the files and the feed at the usual
  addresses, in parallel; www.<domain> when nothing could be read; files blocked by CORS checked
  through the app's CORS proxy (`SODIR_PROXY`, `DOWNREAD_PROXY` in `fetch.ts`).
- Parsers: `about.ts`, `opml.ts`, `vcard.ts`, `feed.ts` (simple: titles, dates, excerpts).
- `view.ts`: `profileCard` (`.pr-top`: banner, avatar, actions, name, handle, bio, tab bar;
  `.pr-panels`: the open tab), `errorPage`, `fileList`, `renderPage`. What differs per app comes in
  `ViewOptions`: the app name in texts, profile links, the card's buttons (sodir: the follow
  dialog of `follow`; Downread: follow in Downread), tab changes. Each app styles the `pr-*`
  classes itself.

Downread's frontend compiles these files for ES5: no `u`/`y` regex literals (use `new RegExp`),
no iterating iterators without `Array.from`.

Tests: `test/`, run with `npm test` from the repository root.
