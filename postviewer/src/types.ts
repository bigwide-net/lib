// The data the renderer works with: a post, as an app reads it from a feed (RSS, Atom or JSON
// Feed). Every field is optional except where noted; apps may keep more fields on their own post
// objects, the renderer ignores them.

/** source:inReplyTo: the item this post replies to. The value is a permalink URL unless
 *  isPermalink is false, then it is an opaque id (e.g. a Bluesky DID), like an RSS 2.0 guid. */
export interface PostInReplyTo {
    /** The permalink URL, or the opaque id when isPermalink is false. */
    value: string;
    /** True when `value` is a permalink URL, false when it is an opaque id. */
    isPermalink: boolean;
    /** The feed containing the post replied to (source:inReplyTo feedUrl, Atom thr:in-reply-to source). */
    feedUrl?: string;
    /** That feed's title (source:inReplyTo feedTitle), shown instead of the raw URL. */
    feedTitle?: string;
}

/** A YouTube video (YouTube's Atom feeds: yt:videoId and media:group). */
export interface YoutubeVideo {
    /** yt:videoId: the id of the embed and watch URLs. */
    videoId: string;
    /** yt:channelId: the owning channel. */
    channelId?: string;
    /** media:statistics views. */
    views?: number;
    /** media:starRating count. */
    ratingCount?: number;
    /** media:starRating average, 0–5. */
    ratingAverage?: number;
}

/** One source of a PostVideo (podcast:source). */
export interface PostVideoSource {
    /** Always http(s). */
    url: string;
    /** Overrides PostVideo.type for this source. */
    contentType?: string;
}

/** The video version of a podcast episode (podcast:alternateEnclosure), e.g. an HLS stream. */
export interface PostVideo {
    /** MIME type, e.g. "application/x-mpegURL" (HLS) or "video/mp4". */
    type: string;
    /** In feed order: the first is the primary one, the rest are mirrors. Never empty. */
    sources: PostVideoSource[];
    /** File size in bytes. */
    length?: number;
    /** Picture height in pixels, e.g. 1080. */
    height?: number;
    /** Human-readable label, e.g. "HD Video Stream". */
    title?: string;
}

/** The scripts of the third-party embeds the renderer can load (loadExternalScripts). */
export const ExternalScriptUrls = {
    'x-widget': 'https://platform.twitter.com/widgets.js',
    'tiktok-embed': 'https://www.tiktok.com/embed.js',
    'instagram-embed': 'https://www.instagram.com/embed.js',
    'threads-embed': 'https://www.threads.com/embed.js',
    'reddit-embed': 'https://embed.reddit.com/widgets.js',
    'bluesky-embed': 'https://embed.bsky.app/static/embed.js',
} as const;

export type ExternalScript = keyof typeof ExternalScriptUrls;

/** Third-party services whose embeds need the visitor's consent before the browser contacts them. */
export const EMBED_SERVICES = ['youtube', 'vimeo', 'jwplayer', 'simplecast', 'captivate', 'x', 'instagram', 'tiktok', 'threads', 'reddit', 'bluesky'] as const;
export type EmbedService = typeof EMBED_SERVICES[number];

/** A post as the renderer shows it. */
export interface Post {
    title?: string;
    /** The post's URL. */
    link?: string;
    /** The body: HTML (sanitized again when rendered). */
    description?: string;
    /** Author name or email, e.g. "Jane <jane@example.com>". */
    author?: string;
    /** Publication date as provided by the feed (ISO 8601). */
    pubDate?: string;
    /** The audio/video enclosure (played by a native player). */
    mediaUrl?: string;
    /** Its MIME type, e.g. "audio/mpeg". */
    mediaType?: string;
    /** Video versions of a podcast episode, best first. */
    videos?: PostVideo[];
    /** The lead image. */
    imageUrl?: string;
    /** Its alt text (plain text). */
    imageAlt?: string;
    /** The embed scripts the body needs (see ExternalScriptUrls). */
    externalScripts?: ExternalScript[];
    /** For posts of YouTube feeds: the video, shown as a player. */
    youtube?: YoutubeVideo;
    /** The post this one replies to. */
    inReplyTo?: PostInReplyTo;
}
