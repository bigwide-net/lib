import { serviceForIframeSrc, gateEmbeds, activateEmbeds, EmbedConsentApi } from './embed-consent';

describe('serviceForIframeSrc', () => {
  it('maps trusted player hosts to their service', () => {
    expect(serviceForIframeSrc('https://www.youtube-nocookie.com/embed/x')).toBe('youtube');
    expect(serviceForIframeSrc('https://player.vimeo.com/video/1')).toBe('vimeo');
    expect(serviceForIframeSrc('https://cdn.jwplayer.com/players/a.html')).toBe('jwplayer');
    expect(serviceForIframeSrc('https://player.simplecast.com/4a915475?dark=false')).toBe('simplecast');
    expect(serviceForIframeSrc('https://player.captivate.fm/episode/1e7e4153-9ac0-47e8-b381-09ed553dd69a/')).toBe('captivate');
  });

  it('returns undefined for unknown hosts and unparsable srcs', () => {
    expect(serviceForIframeSrc('https://example.com/embed')).toBeUndefined();
    expect(serviceForIframeSrc('http://[bad')).toBeUndefined();
  });
});

// Bluesky's embed.js scans for the `data-bluesky-uri` attribute rather than a class, so gating
// has to park the attribute itself — a gated post that kept it would be hydrated by the very next
// document-wide rescan (which any other post's consent click triggers).
describe('gateEmbeds with an attribute-hydrated embed', () => {
  const consent = (allowed: boolean): EmbedConsentApi => ({ isAllowed: () => allowed, grant: () => {} });
  const URI = 'at://did:plc:nyagv7slglq4adifdfhxkppg/app.bsky.feed.post/3mv6lqzb47s2y';

  const body = () => {
    const el = document.createElement('div');
    el.innerHTML = `<blockquote class="bluesky-embed" data-bluesky-uri="${URI}"><a href="https://bsky.app/x">View post on Bluesky</a></blockquote>`;
    return el;
  };

  it('parks the at:// URI and covers the blockquote when Bluesky is not allowed', () => {
    const el = body();
    gateEmbeds(el, consent(false));
    const bq = el.querySelector('blockquote')!;
    expect(bq.hasAttribute('data-bluesky-uri')).toBe(false);
    expect(bq.getAttribute('data-gated-uri')).toBe(URI);
    expect(bq.closest('.embedGate')?.getAttribute('data-embed-service')).toBe('bluesky');
    expect(el.querySelector('.embedGateOverlay')).not.toBeNull();
  });

  it('leaves the blockquote alone when Bluesky is allowed', () => {
    const el = body();
    gateEmbeds(el, consent(true));
    expect(el.querySelector('blockquote')!.getAttribute('data-bluesky-uri')).toBe(URI);
    expect(el.querySelector('.embedGate')).toBeNull();
  });

  it('puts the attribute back and drops the overlay on consent', () => {
    const el = body();
    gateEmbeds(el, consent(false));
    activateEmbeds(el, 'bluesky');
    const bq = el.querySelector('blockquote')!;
    expect(bq.getAttribute('data-bluesky-uri')).toBe(URI);
    expect(bq.hasAttribute('data-gated-uri')).toBe(false);
    expect(el.querySelector('.embedGateOverlay')).toBeNull();
  });

  it('gates only once when run again over the same body', () => {
    const el = body();
    gateEmbeds(el, consent(false));
    gateEmbeds(el, consent(false));
    expect(el.querySelectorAll('.embedGate').length).toBe(1);
  });
});
