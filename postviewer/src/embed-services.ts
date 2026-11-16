import type { EmbedService } from './types';

// The display names of the embed services. A module of its own, without dependencies, so pages that
// only name the services (e.g. RSS Directory's privacy page, in its every-page script) can import it
// without the renderer.
export const SERVICE_NAMES: Record<EmbedService, string> = {
    youtube: 'YouTube',
    vimeo: 'Vimeo',
    jwplayer: 'JW Player',
    simplecast: 'Simplecast',
    captivate: 'Captivate',
    x: 'X (Twitter)',
    instagram: 'Instagram',
    tiktok: 'TikTok',
    threads: 'Threads',
    reddit: 'Reddit',
    bluesky: 'Bluesky',
};
