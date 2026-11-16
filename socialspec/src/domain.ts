const HOST_RE = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]([a-z0-9-]{0,61}[a-z0-9])?$/;

/** The host name in what a visitor typed: a domain, a handle (@example.com) or a URL. Undefined
 *  for anything else, including IP addresses and names without a dot. */
export function parseDomain(input: string | null | undefined): string | undefined {
    const s = input?.trim().replace(/^@/, '');
    if (!s)
        return undefined;
    try {
        const host = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? s : `https://${s}`).hostname.toLowerCase().replace(/\.$/, '');
        return HOST_RE.test(host) ? host : undefined;
    } catch {
        return undefined;
    }
}

/** A host without its www., as the handle and display name of a site. */
export const bareHost = (host: string) => host.replace(/^www\./, '');

/** The handle of a site: @ and its domain (@example.com). */
export const handleOf = (host: string) => '@' + bareHost(host);

/** The host of an http(s) URL, or undefined. */
export function hostOf(url: string | undefined): string | undefined {
    if (!url)
        return undefined;
    try {
        const u = new URL(url);
        return /^https?:$/.test(u.protocol) ? u.hostname.toLowerCase() : undefined;
    } catch {
        return undefined;
    }
}

/** An absolute http(s) URL for `url` (relative to `base`), or undefined. */
export function httpUrl(url: string | undefined, base?: string): string | undefined {
    if (!url)
        return undefined;
    try {
        const u = new URL(url.trim(), base);
        return /^https?:$/.test(u.protocol) ? u.href : undefined;
    } catch {
        return undefined;
    }
}
