import { newHtml } from './dom';
import type { EmbedService, ExternalScript } from './types';
import { loadExternalScripts } from './external-scripts';
import { SERVICE_NAMES } from './embed-services';

export { SERVICE_NAMES };

// Vendor script per service, for services whose embeds are hydrated by an external script
// (the iframe-only services YouTube/Vimeo/JW Player/Simplecast/Captivate have no entry).
const serviceScript: Partial<Record<EmbedService, ExternalScript>> = {
    x: 'x-widget',
    instagram: 'instagram-embed',
    tiktok: 'tiktok-embed',
    threads: 'threads-embed',
    reddit: 'reddit-embed',
    bluesky: 'bluesky-embed',
};

// The class each vendor script scans for, re-established by the hydrate* functions in
// post-content.ts. Gating stashes the class away (data-gated-class) so an already-loaded
// vendor global rescanning the document can't hydrate a still-gated blockquote — relevant
// especially for Instagram/Threads, which share the same Meta global.
export const BLOCKQUOTE_SERVICES: [string, EmbedService][] = [
    ['twitter-tweet', 'x'],
    ['instagram-media', 'instagram'],
    ['tiktok-embed', 'tiktok'],
    ['text-post-media', 'threads'],
    ['reddit-embed-bq', 'reddit'],
    ['reddit-card', 'reddit'],
];

// Bluesky is the exception: its embed.js selects on the `data-bluesky-uri` attribute (the at://
// URI it builds the iframe from), not on a class, so gating has to park that attribute instead —
// removing the class alone would leave the blockquote fully hydratable.
export const ATTR_SERVICES: [string, EmbedService][] = [['data-bluesky-uri', 'bluesky']];
const GATED_ATTR = 'data-gated-uri';

// Maps an iframe src to its embed service. Hosts mirror the server-side iframe allowlist
// (TRUSTED_IFRAME_DOMAINS in shared/src/utils/sanitize.ts); unknown hosts return undefined
// and are left untouched.
export function serviceForIframeSrc(src: string): EmbedService|undefined {
    let host: string;
    try { host = new URL(src, 'https://relative.invalid').hostname.toLowerCase(); }
    catch { return undefined; }
    const is = (domain: string) => host == domain || host.endsWith('.' + domain);
    if (is('youtube.com') || is('youtube-nocookie.com')) return 'youtube';
    if (is('twitter.com') || is('x.com')) return 'x';
    if (is('vimeo.com')) return 'vimeo';
    if (is('jwplayer.com')) return 'jwplayer';
    if (is('simplecast.com')) return 'simplecast';
    if (is('captivate.fm')) return 'captivate';
    return undefined;
}

/** Consent source for the gating functions. Where consent lives is the app's decision: a reader
 *  app may keep it in the user's preferences, public pages use createSessionConsent. */
export interface EmbedConsentApi {
    isAllowed(service: EmbedService): boolean;
    grant(service: EmbedService): void;
}

/** Consent for a single page view: nothing is allowed until the visitor clicks an overlay, and
 *  nothing is persisted. Independent of preferences and jurisdiction. */
export function createSessionConsent(): EmbedConsentApi {
    const allowed = new Set<EmbedService>();
    return { isAllowed: s => allowed.has(s), grant: s => { allowed.add(s); } };
}

function createGateOverlay(service: EmbedService, consent: EmbedConsentApi): HTMLElement {
    const button = newHtml('button', { class: 'embedGateBtn', type: 'button' }, `Show and allow ${SERVICE_NAMES[service]}`);
    button.addEventListener('click', e => {
        e.stopPropagation();
        consent.grant(service);
        activateEmbeds(document, service);
    });
    return newHtml('div', { class: 'embedGateOverlay' }, [
        newHtml('span', { class: 'embedGateText' }, `External content from ${SERVICE_NAMES[service]}`),
        button,
    ]);
}

/** Wrap a (possibly detached) element in a consent gate: the element stays visible underneath,
 *  the overlay covers it until the service is allowed. Used directly by the YouTube feed player,
 *  whose click-to-play layer must survive the consent click (it exists for performance, not
 *  privacy — it keeps N mounted videos from loading N players). */
export function createEmbedGate(el: HTMLElement, service: EmbedService, consent: EmbedConsentApi): HTMLElement {
    const gate = newHtml('div', { class: 'embedGate', 'data-embed-service': service });
    gate.append(el, createGateOverlay(service, consent));
    return gate;
}

function wrapWithGate(el: HTMLElement, service: EmbedService, consent: EmbedConsentApi): void {
    const marker = newHtml('span');
    el.replaceWith(marker);
    marker.replaceWith(createEmbedGate(el, service, consent));
}

/** Gate all unconsented third-party embeds under root: strip iframe srcs (so nothing is
 *  requested) and cover iframes and vendor-script blockquotes with a consent overlay.
 *  In the reader this must run while root is still detached from the document, before any
 *  iframe can navigate. Idempotent: already-gated elements are skipped. */
export function gateEmbeds(root: ParentNode, consent: EmbedConsentApi): void {
    root.querySelectorAll('iframe').forEach(el => {
        const iframe = el as HTMLIFrameElement;
        if (iframe.closest('.embedGate')) return;
        const src = iframe.getAttribute('src');
        const service = src ? serviceForIframeSrc(src) : undefined;
        if (!service) return;
        // The document meta referrer is same-origin (no cross-origin Referer, so publishers
        // can't see what the reader is reading), but embed players require referrer info —
        // YouTube shows error 153 without it. 'origin' sends only the page's origin,
        // which reveals nothing about the post being read.
        iframe.setAttribute('referrerpolicy', 'origin');
        if (consent.isAllowed(service)) return;
        iframe.setAttribute('data-embed-src', src!);
        iframe.removeAttribute('src');
        wrapWithGate(iframe, service, consent);
    });
    for (const [cls, service] of BLOCKQUOTE_SERVICES) {
        if (consent.isAllowed(service)) continue;
        root.querySelectorAll(`blockquote.${cls}`).forEach(bq => {
            if (bq.closest('.embedGate')) return;
            bq.classList.remove(cls);
            bq.setAttribute('data-gated-class', cls);
            wrapWithGate(bq as HTMLElement, service, consent);
        });
    }
    for (const [attr, service] of ATTR_SERVICES) {
        if (consent.isAllowed(service)) continue;
        root.querySelectorAll(`[${attr}]`).forEach(el => {
            if (el.closest('.embedGate')) return;
            el.setAttribute(GATED_ATTR, el.getAttribute(attr)!);
            el.removeAttribute(attr);
            wrapWithGate(el as HTMLElement, service, consent);
        });
    }
}

/** Un-gate all embeds of a service under scope: restore iframe srcs and blockquote vendor
 *  classes, drop the overlays, and load/rescan the vendor script if one is needed. Called
 *  with scope = document so a single consent click clears every overlay of that service. */
export function activateEmbeds(scope: ParentNode, service: EmbedService): void {
    let hasScriptEmbeds = false;
    // The gate is per service, so the attribute to put back is the one that service's script scans for.
    const attr = ATTR_SERVICES.find(([, s]) => s == service)?.[0];
    scope.querySelectorAll(`.embedGate[data-embed-service="${service}"]`).forEach(gate => {
        gate.querySelector('.embedGateOverlay')?.remove();
        gate.removeAttribute('data-embed-service'); // now just an inert wrapper
        const iframe = gate.querySelector('iframe[data-embed-src]');
        if (iframe) {
            iframe.setAttribute('src', iframe.getAttribute('data-embed-src')!);
            iframe.removeAttribute('data-embed-src');
        }
        const bq = gate.querySelector('[data-gated-class]');
        if (bq) {
            bq.classList.add(bq.getAttribute('data-gated-class')!);
            bq.removeAttribute('data-gated-class');
            hasScriptEmbeds = true;
        }
        const el = attr ? gate.querySelector(`[${GATED_ATTR}]`) : undefined;
        if (el) {
            el.setAttribute(attr!, el.getAttribute(GATED_ATTR)!);
            el.removeAttribute(GATED_ATTR);
            hasScriptEmbeds = true;
        }
    });
    const script = serviceScript[service];
    if (hasScriptEmbeds && script)
        loadExternalScripts([script], scope, () => true);
}
