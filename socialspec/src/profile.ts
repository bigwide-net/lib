import { parseAbout, type About } from './about';
import { FEED_PATHS, parseFeed, type Feed } from './feed';
import { fetchText, fetchViaProxy, isReachable, type FetchResult } from './fetch';
import { parseOpml, type FollowEntry } from './opml';
import { parseVcard, type Contact } from './vcard';

/** The SocialSpec files (https://socialspec.org/), and the feed. */
export type FileKey = 'feed' | 'following' | 'about' | 'contact';

/** What became of a file. 'cors': the site answers, but the response has no
 *  Access-Control-Allow-Origin header, so the browser keeps it from the page (whether the file
 *  exists only the CORS proxy can tell: FileCheck.exists). 'unreachable': no answer at all (DNS, TLS, offline). 'html': a web page
 *  came back instead of the file. 'invalid': the file isn't what it should be. */
export type FileState = 'ok' | 'missing' | 'cors' | 'unreachable' | 'timeout' | 'http' | 'html' | 'invalid';

export interface FileCheck {
    state: FileState;
    /** The file's URL (for a feed that wasn't found: the first address tried). */
    url: string;
    /** HTTP status of 'http'. */
    status?: number;
    /** 'cors': true if the CORS proxy found the file. Its content isn't used: SocialSpec requires
     *  sites to allow CORS, and the profile shows what any browser app could read. */
    exists?: boolean;
}

export interface Profile {
    /** The domain asked for. */
    domain: string;
    /** The host the files came from: the domain, or www.<domain> if only that one worked. */
    host: string;
    files: Record<FileKey, FileCheck>;
    about?: About;
    following?: FollowEntry[];
    contact?: Contact;
    feed?: Feed;
}

export const WELL_KNOWN = {
    about: {path: '/.well-known/about.md', accept: 'text/markdown, text/plain;q=0.9, */*;q=0.1'},
    following: {path: '/.well-known/following.opml', accept: 'text/x-opml, application/xml;q=0.9, text/xml;q=0.9, */*;q=0.1'},
    contact: {path: '/.well-known/contact.vcf', accept: 'text/vcard, text/plain;q=0.9, */*;q=0.1'},
};
/** The SocialSpec files, without the feed. */
export const SPEC_FILES = Object.keys(WELL_KNOWN) as (keyof typeof WELL_KNOWN)[];
const FEED_ACCEPT = 'application/rss+xml, application/atom+xml, application/feed+json, application/xml;q=0.9, application/json;q=0.9, */*;q=0.1';

export interface Deps {
    fetchText: typeof fetchText;
    /** fetchViaProxy with the app's proxy. */
    fetchViaProxy: (url: string, accept: string) => Promise<FetchResult>;
    isReachable: typeof isReachable;
}

/** The real requests, with the app's CORS proxy (SODIR_PROXY, DOWNREAD_PROXY). */
export const createDeps = (proxyBase: string): Deps =>
    ({fetchText, fetchViaProxy: (url, accept) => fetchViaProxy(url, accept, proxyBase), isReachable});

const stateOf = (r: FetchResult, reachable: boolean): FileState =>
    r.kind == 'blocked' ? (reachable ? 'cors' : 'unreachable') : r.kind;

export const hasContent = (p: Profile) => Object.values(p.files).some(f => f.state == 'ok');

/** Fetches and parses everything of one host. */
async function loadHost(domain: string, host: string, deps: Deps): Promise<Profile> {
    const origin = `https://${host}`;
    const [about, following, contact, ...feeds] = await Promise.all([
        deps.fetchText(origin + WELL_KNOWN.about.path, WELL_KNOWN.about.accept),
        deps.fetchText(origin + WELL_KNOWN.following.path, WELL_KNOWN.following.accept),
        deps.fetchText(origin + WELL_KNOWN.contact.path, WELL_KNOWN.contact.accept),
        ...FEED_PATHS.map(p => deps.fetchText(origin + p, FEED_ACCEPT)),
    ]);
    // Only asked when a request failed without a response: the browser doesn't say why.
    const reachable = [about, following, contact, ...feeds].some(r => r.kind == 'blocked') ? await deps.isReachable(origin) : true;

    const profile: Profile = {domain, host, files: {} as Record<FileKey, FileCheck>};
    const check = (key: Exclude<FileKey, 'feed'>, r: FetchResult, parse: (text: string, url: string) => any) => {
        const parsed = r.kind == 'ok' ? parse(r.text, r.url) : undefined;
        profile.files[key] = {state: r.kind == 'ok' && !parsed ? 'invalid' : stateOf(r, reachable), url: r.url, status: r.kind == 'http' ? r.status : undefined};
        if (parsed)
            (profile as any)[key] = parsed;
    };
    check('about', about, text => parseAbout(text));
    check('following', following, parseOpml);
    check('contact', contact, text => parseVcard(text));

    // The first address with a valid feed; otherwise say why none was found. Addresses that are
    // no feed (pages, other files) count as missing: they were only guesses.
    for (const r of feeds) {
        const feed = r.kind == 'ok' ? parseFeed(r.text, r.url) : undefined;
        if (feed) {
            profile.feed = feed;
            profile.files.feed = {state: 'ok', url: r.url};
            break;
        }
    }
    if (!profile.feed) {
        const failed = feeds.find(r => r.kind == 'blocked') ?? feeds.find(r => r.kind == 'timeout');
        profile.files.feed = {state: failed ? stateOf(failed, reachable) : 'missing', url: (failed ?? feeds[0]).url};
    }
    return profile;
}

/** What the CORS proxy says about a file blocked by CORS: missing (a 404 without a CORS header
 *  looks like CORS too), there, or broken. Unchanged when the proxy can't tell. */
function viaProxy(f: FileCheck, r: FetchResult): FileCheck {
    switch (r.kind) {
        case 'ok': return {...f, exists: true};
        case 'missing': return {state: 'missing', url: f.url};
        case 'html': return {state: 'html', url: f.url};
        case 'http': return {state: 'http', url: f.url, status: r.status};
        default: return f;
    }
}

/** Asks the CORS proxy about the SocialSpec files blocked by CORS. Feed addresses are only
 *  guesses, and many: they aren't asked, to stay well below the proxy's rate limit. */
async function checkBlocked(profile: Profile, deps: Deps): Promise<Profile> {
    const keys = SPEC_FILES.filter(k => profile.files[k].state == 'cors');
    const results = await Promise.all(keys.map(k => deps.fetchViaProxy(profile.files[k].url, WELL_KNOWN[k].accept)));
    keys.forEach((k, i) => profile.files[k] = viaProxy(profile.files[k], results[i]));
    return profile;
}

/** Loads the profile of a domain. Many sites redirect example.com to www.example.com without a
 *  CORS header on the redirect, so when nothing could be read, www.<domain> is tried directly.
 *  Files still blocked by CORS are then checked through the CORS proxy. */
export async function loadProfile(domain: string, deps: Deps): Promise<Profile> {
    const profile = await loadHost(domain, domain, deps);
    const failed = Object.values(profile.files).some(f => f.state == 'cors' || f.state == 'unreachable' || f.state == 'timeout');
    if (hasContent(profile) || !failed || domain.startsWith('www.'))
        return checkBlocked(profile, deps);
    const www = await loadHost(domain, 'www.' + domain, deps);
    return checkBlocked(hasContent(www) ? www : profile, deps);
}
