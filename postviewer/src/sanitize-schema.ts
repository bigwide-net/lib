// The HTML allowlist for post content: the tags and attributes that survive sanitizing. The
// renderer applies it (post-content.ts: native Sanitizer API, DOMPurify fallback); apps that also
// sanitize on the server should use the same lists. Free of imports, so it can be copied.
// The renderer additionally allows ALL data-* attributes (vendor embed scripts and the hydrators
// rely on them); a server may allow only the data-* attributes listed here.

// HTML tags allowed in article content
export const ALLOWED_TAGS: string[] = [
    // Text structure
    'p', 'br', 'hr',
    // Headings
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    // Lists
    'ul', 'ol', 'li', 'dl', 'dt', 'dd',
    // Text formatting
    'b', 'i', 'u', 's', 'strike', 'strong', 'em', 'mark', 'small', 'del', 'ins', 'sub', 'sup',
    // Links and media
    'a', 'img', 'figure', 'figcaption', 'picture', 'source',
    // Quotes and code
    'blockquote', 'q', 'cite', 'code', 'pre', 'kbd', 'samp', 'var',
    // Tables
    'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'colgroup', 'col',
    // Containers
    'div', 'span', 'article', 'section', 'aside', 'details', 'summary',
    // Time
    'time',
    // Media (for podcasts)
    'audio', 'video', 'track',
    // Embeds (filtered by domain server-side, consent-gated client-side)
    'iframe'
];

// Attributes allowed on every tag
export const GLOBAL_ATTRIBUTES: string[] = ['class', 'id', 'title', 'lang', 'dir', 'style'];

// Additional attributes allowed per tag (on top of GLOBAL_ATTRIBUTES)
export const TAG_ATTRIBUTES: Record<string, string[]> = {
    'a': ['href', 'target', 'rel'],
    'img': ['src', 'alt', 'width', 'height', 'loading', 'srcset', 'sizes'],
    'source': ['src', 'srcset', 'sizes', 'type', 'media'],
    'audio': ['src', 'controls', 'preload'],
    'video': ['src', 'controls', 'width', 'height', 'poster', 'preload'],
    'track': ['src', 'kind', 'srclang', 'label', 'default'],
    'iframe': ['src', 'width', 'height', 'frameborder', 'allowfullscreen', 'allow', 'style'],
    'div': ['data-attrs'],
    'time': ['datetime'],
    // The data-embed-* / data-card-created attributes are read by Reddit's widgets.js
    // (iframe height, theme, comment-embed options) — value-validated by that script.
    // data-bluesky-uri is the at:// URI Bluesky's embed.js builds its iframe URL from (it
    // selects on that attribute, not on the class); the cid and colour mode ride along with it.
    'blockquote': ['cite', 'data-instgrm-captioned', 'data-instgrm-permalink', 'data-instgrm-version', 'data-text-post-permalink', 'data-text-post-version',
        'data-bluesky-uri', 'data-bluesky-cid', 'data-bluesky-embed-color-mode',
        'data-embed-height', 'data-embed-theme', 'data-embed-depth', 'data-embed-showmedia', 'data-embed-showtitle', 'data-embed-showedits', 'data-embed-created', 'data-embed-showusername', 'data-embed-locale', 'data-card-created'],
    'q': ['cite'],
    'ol': ['start', 'type', 'reversed'],
    'li': ['value'],
    // Legacy presentational table attributes — common in newsletter HTML (e.g. TLDR)
    // which is authored for email clients that lack CSS table styling. `width` is
    // value-constrained server-side in transformTags (see sanitizeWidthAttr).
    'table': ['colspan', 'rowspan', 'align', 'valign', 'bgcolor', 'border', 'cellpadding', 'cellspacing', 'width'],
    'thead': ['align', 'valign', 'bgcolor'],
    'tbody': ['align', 'valign', 'bgcolor'],
    'tfoot': ['align', 'valign', 'bgcolor'],
    'tr': ['align', 'valign', 'bgcolor'],
    'td': ['colspan', 'rowspan', 'headers', 'align', 'valign', 'bgcolor', 'width'],
    'th': ['colspan', 'rowspan', 'headers', 'scope', 'align', 'valign', 'bgcolor', 'width'],
    'col': ['span', 'align', 'valign', 'width'],
    'colgroup': ['span', 'align', 'valign', 'width'],
    'details': ['open']
};
