import { prepareEmbedsOffline } from './offline-embeds';
import { createPostParts } from './post-card';
import { createSessionConsent } from './embed-consent';
import type { Post } from './types';

const body = (html: string) => {
  const div = document.createElement('div');
  div.innerHTML = html;
  prepareEmbedsOffline(div);
  return div;
};

describe('prepareEmbedsOffline', () => {
  it('replaces every iframe with a placeholder, known service or not', () => {
    const div = body('<p>a</p><iframe src="https://www.youtube.com/embed/x"></iframe><iframe src="https://example.com/widget"></iframe>');
    expect(div.querySelector('iframe')).toBeNull();
    expect(Array.from(div.querySelectorAll('.embedOffline')).map(e => e.textContent))
      .toEqual(["This embedded content can't be shown while offline.", "This embedded content can't be shown while offline."]);
  });

  it('replaces audio and video', () => {
    const div = body('<video src="https://a.com/v.mp4"></video><audio src="https://a.com/a.mp3"></audio>');
    expect(div.querySelector('video, audio')).toBeNull();
    expect(div.querySelectorAll('.embedOffline')).toHaveLength(2);
  });

  it('keeps blockquote embeds as quotes, unhydratable, with a note', () => {
    const div = body('<blockquote class="twitter-tweet"><p>Hello world</p></blockquote>'
      + '<blockquote data-bluesky-uri="at://did/post/1"><p>Sky</p></blockquote>');
    const [tweet, sky] = Array.from(div.querySelectorAll('blockquote'));
    expect(tweet.textContent).toBe('Hello world');
    expect(tweet.classList.contains('twitter-tweet')).toBe(false);
    expect(sky.hasAttribute('data-bluesky-uri')).toBe(false);
    expect(tweet.nextElementSibling?.className).toBe('embedOfflineNote');
    expect(sky.nextElementSibling?.textContent).toBe('Embedded content is limited while offline.');
  });

  it('leaves ordinary quotes alone', () => {
    const div = body('<blockquote><p>Just a quote</p></blockquote>');
    expect(div.querySelector('.embedOfflineNote')).toBeNull();
  });
});

describe('createPostParts offline', () => {
  const post = (p: Partial<Post>) => ({ number: 1, contentHash: 'h', title: 'T', ...p } as Post);
  const render = (p: Partial<Post>) => {
    const div = document.createElement('div');
    div.append(...createPostParts(post(p), { feedName: 'F', consent: createSessionConsent(), offline: true }));
    return div;
  };

  it('covers the YouTube player with the offline message and keeps the thumbnail', () => {
    const div = render({ youtube: { videoId: 'abcdefghijk' } as any, imageUrl: 'https://i.ytimg.com/x.jpg' });
    expect(div.querySelector('.embedOfflineCover .youtubeThumb')).not.toBeNull();
    expect(div.querySelector('.embedGateBtn')).toBeNull(); // no consent button offline
    (div.querySelector('.youtubePlayer') as HTMLElement).click();
    expect(div.querySelector('iframe')).toBeNull();
  });

  it('replaces the enclosure player', () => {
    const div = render({ mediaUrl: 'https://a.com/ep.mp3', mediaType: 'audio/mpeg' });
    expect(div.querySelector('audio')).toBeNull();
    expect(div.querySelector('.postMedia .embedOffline')).not.toBeNull();
  });

  it('gates as usual when online', () => {
    const div = document.createElement('div');
    div.append(...createPostParts(post({ description: '<iframe src="https://www.youtube.com/embed/x"></iframe>' }),
      { feedName: 'F', consent: createSessionConsent() }));
    expect(div.querySelector('.embedGate iframe')).not.toBeNull();
    expect(div.querySelector('.embedOffline')).toBeNull();
  });
});
