import { ExternalScriptUrls, type EmbedService, type ExternalScript } from './types';

const scriptReload: Record<ExternalScript, (root?: ParentNode | null) => void> = {
  'x-widget': (root) => (window as any).twttr?.widgets?.load(root || undefined),
  // TikTok's lib.render(nodes) requires the node list — a no-arg call rejects on
  // nodes.length and renders nothing. Mirror embed.js's own bootstrap: pass the
  // not-yet-processed blockquotes (render assigns an id to each node it mounts).
  'tiktok-embed': (root) => {
    const nodes = Array.from((root ?? document).querySelectorAll('blockquote.tiktok-embed')).filter(bq => !bq.id);
    if (nodes.length) (window as any).tiktokEmbed?.lib?.render(nodes);
  },
  'instagram-embed': () => (window as any).instgrm?.Embeds?.process(),
  // Threads' embed.js exposes the same global as Instagram (both are Meta) and
  // re-scans blockquote.text-post-media on process().
  'threads-embed': () => (window as any).instgrm?.Embeds?.process(),
  // Reddit's widgets.js exposes no global and no re-scan API: a one-shot IIFE that
  // converts each .reddit-embed-bq/.reddit-card blockquote into an iframe and removes
  // the blockquote from the DOM. Re-inject the script to process later-mounted
  // blockquotes; already-processed ones are gone, so a re-run can't double-mount.
  // (The unprocessed-blockquote guard also stops the onload→reload call from
  // re-injecting right after the first load.)
  'reddit-embed': () => {
    if (!document.querySelector('blockquote.reddit-embed-bq, blockquote.reddit-card')) return;
    const url = ExternalScriptUrls['reddit-embed'];
    document.querySelector(`script[src="${url}"]`)?.remove();
    const s = document.createElement('script');
    s.src = url;
    s.async = true;
    document.head.appendChild(s);
  },
  // Bluesky's embed.js exposes window.bluesky.scan(node), which turns every
  // [data-bluesky-uri] under node into an embed.bsky.app iframe and resizes it from the
  // iframe's own postMessage. A processed element loses the attribute, so a rescan of the
  // whole document can neither double-mount nor reach a still-gated blockquote.
  'bluesky-embed': (root) => (window as any).bluesky?.scan(root ?? document),
};

const scriptService: Record<ExternalScript, EmbedService> = {
  'x-widget': 'x',
  'tiktok-embed': 'tiktok',
  'instagram-embed': 'instagram',
  'threads-embed': 'threads',
  'reddit-embed': 'reddit',
  'bluesky-embed': 'bluesky',
};

/** Load (or re-run) the vendor scripts a post's embeds need. `isAllowed` is the consent check:
 *  scripts of services without consent are skipped. */
export function loadExternalScripts(scripts: ExternalScript[] | undefined, root: ParentNode | null | undefined,
    isAllowed: (service: EmbedService) => boolean) {
  // Loading a vendor script contacts the third party; scripts of unconsented services are
  // skipped here (single choke point — covers all call sites incl. visibility rehydration).
  // Their gated blockquotes are handled by gateEmbeds/activateEmbeds in embed-consent.ts.
  const permitted = scripts?.filter(s => isAllowed(scriptService[s]));
  if (!permitted?.length) return;
  for (const scriptType of permitted) {
    const url = ExternalScriptUrls[scriptType];
    const reload = scriptReload[scriptType];
    if (document.querySelector(`script[src="${url}"]`)) {
      // Script already loaded (or loading). Re-scan so newly mounted embeds get processed.
      reload?.(root);
      continue;
    }
    const s = document.createElement('script');
    s.src = url;
    s.async = true;
    // On first load twttr/tiktokEmbed/instgrm aren't on window yet — scan once the lib is ready.
    if (reload) s.onload = () => reload(root);
    document.head.appendChild(s);
  }
}
