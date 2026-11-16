import { newHtml } from './dom';
import { BLOCKQUOTE_SERVICES, ATTR_SERVICES } from './embed-consent';

export const OFFLINE_EMBED_TEXT = "This embedded content can't be shown while offline.";
export const OFFLINE_MEDIA_TEXT = "This can't be played while offline.";
const OFFLINE_QUOTE_TEXT = 'Embedded content is limited while offline.';

/** Box that stands in for content that needs the network. */
export function createOfflinePlaceholder(text: string): HTMLElement {
  return newHtml('div', { class: 'embedOffline' }, text);
}

/**
 * Prepare third-party embeds under root for offline reading, instead of gateEmbeds:
 * - blockquote embeds (X, Instagram, TikTok, Threads, Reddit, Bluesky) keep their quote — the text
 *   the publisher put in as fallback — but lose the class/attribute their vendor script hydrates,
 *   and get a note that the content is limited;
 * - every iframe, and native audio/video, is replaced by a placeholder.
 * Like gateEmbeds, run it while root is still detached, so nothing is requested.
 */
export function prepareEmbedsOffline(root: ParentNode): void {
  root.querySelectorAll('iframe').forEach(iframe => iframe.replaceWith(createOfflinePlaceholder(OFFLINE_EMBED_TEXT)));
  root.querySelectorAll('video, audio').forEach(media => media.replaceWith(createOfflinePlaceholder(OFFLINE_MEDIA_TEXT)));
  for (const [cls] of BLOCKQUOTE_SERVICES)
    root.querySelectorAll(`blockquote.${cls}`).forEach(bq => {
      bq.classList.remove(cls);
      markLimited(bq);
    });
  for (const [attr] of ATTR_SERVICES)
    root.querySelectorAll(`[${attr}]`).forEach(el => {
      el.removeAttribute(attr);
      markLimited(el);
    });
}

function markLimited(el: Element) {
  el.after(newHtml('div', { class: 'embedOfflineNote' }, OFFLINE_QUOTE_TEXT));
}

/** Cover an element (the YouTube thumbnail) with the offline message; it stays visible below. */
export function createOfflineCover(el: HTMLElement, text: string): HTMLElement {
  return newHtml('div', { class: 'embedGate embedOfflineCover' }, [
    el,
    newHtml('div', { class: 'embedGateOverlay' }, newHtml('span', { class: 'embedGateText' }, text)),
  ]);
}
