import { addHtml, newHtml } from '../../postviewer/src/dom';
import { renderMarkdown } from '../../postviewer/src/markdown';
import { bareHost, handleOf } from './domain';
import type { Feed, FeedItem } from './feed';
import { icon, type IconName } from './icons';
import type { FollowEntry } from './opml';
import { hasContent, SPEC_FILES, WELL_KNOWN, type FileCheck, type FileKey, type FileState, type Profile } from './profile';
import { preferredEmail, type Contact, type ContactEntry } from './vcard';

export const FOLLOWING_PAGE = 50;

/** What differs between the apps showing profiles (sodir.org's Social Browser, Downread). */
export interface ViewOptions {
    /** The app's name, for texts like "Social Browser only uses secure connections". */
    appName: string;
    /** Where the profile of another site opens (the Following tab). */
    profileHref: (host: string) => string;
    /** The card's buttons next to the email button: sodir's Follow split button, Downread's Follow. */
    actions?: (p: Profile) => Node[];
    /** A tab was chosen (sodir puts it in the location hash). */
    onTabChange?: (key: FileKey) => void;
    /** The banner's color (any CSS color, a var() too). Default: one of BANNERS, by domain. */
    bannerColor?: string;
    /** Every post gets a Reply link that emails the author, if the contact card has an email address. */
    replyByEmail?: boolean;
    /** For a profile the user may edit (Downread: their own domain, via PUPS): returns a function
     *  that gets the About panel to add its edit controls to. The About tab then also exists when
     *  about.md is missing, so it can be written. */
    aboutEditor?: (p: Profile) => ((panel: HTMLElement) => void) | undefined;
    /** For a profile whose feed the user writes (Downread: Write post): the controls at the top of
     *  the Posts panel. The Posts tab then also exists when the site has no feed yet. */
    postsActions?: (p: Profile) => Node[] | undefined;
}


// Dark banner colors; a site always gets the same one.
const BANNERS = ['#2F3347', '#5E5226', '#2F4D36', '#4A2B3F', '#23474F', '#5A2E28', '#3B3A5C', '#40392B'];

export function bannerColor(host: string): string {
    let h = 0;
    for (const c of bareHost(host))
        h = (h * 31 + c.charCodeAt(0)) >>> 0;
    return BANNERS[h % BANNERS.length];
}

/** A letter or digit of any script. Built with the constructor: Downread's frontend compiles this
 *  file for ES5, where TypeScript rejects the u flag in a literal. */
const LETTER = new RegExp('[\\p{L}\\p{N}]', 'u');
const initial = (name: string) => (LETTER.exec(name)?.[0] ?? '?').toUpperCase();

/** A site's icon: the given URLs in turn, then the first letter of its name on its banner color.
 *  The page isn't read yet, so the icons it declares are unknown; the usual paths stand in. */
export function avatar(host: string, name: string, cls: string, sources: string[]): HTMLElement {
    const box = newHtml('span', {class: cls});
    const letter = newHtml('span', {class: 'avatar-letter', style: `background:${bannerColor(host)}`}, initial(name));
    if (!sources.length) {
        box.appendChild(letter);
        return box;
    }
    const img = addHtml(box, 'img', {alt: '', loading: 'lazy', decoding: 'async'}) as HTMLImageElement;
    let n = 0;
    img.onerror = () => {
        if (++n < sources.length)
            img.src = sources[n];
        else
            img.replaceWith(letter);
    };
    img.src = sources[0];
    return box;
}

/** A link that opens in a new tab, without referrer or follow. */
export const external = (href: string, attrs: Record<string, string | undefined> = {}, children?: any) =>
    newHtml('a', {href, target: '_blank', rel: 'noopener nofollow', ...attrs}, children);

// Web and email links open in a new tab (webmail opens there; mail apps leave it empty and close it).
const iconLink = (href: string, label: string, name: IconName, cls = 'icon-btn') =>
    /^(https?|mailto):/i.test(href) ? external(href, {class: cls, 'aria-label': label, title: label}, icon(name, 18))
        : newHtml('a', {href, class: cls, 'aria-label': label, title: label}, icon(name, 18));

const formatDate = (d: Date) => d.toLocaleDateString('en-US', {month: 'short', day: 'numeric', year: 'numeric'});

/* ---------- Tabs ---------- */

/** The start of a text, cut at a word, for a subject line. */
const excerpt = (text: string, max = 60) =>
    text.length <= max ? text : text.slice(0, max).replace(/\s+\S*$/, '') + '…';

/** A mailto: link answering a post: "Re: <title>", the post's address in the body. */
export function replyHref(email: ContactEntry, item: FeedItem): string {
    const subject = `Re: ${item.title ?? excerpt(item.summary ?? 'your post')}`;
    const body = item.url ? `\n\n> ${item.url}\n` : '';
    return `${email.href!.split('?')[0]}?subject=${encodeURIComponent(subject)}${body && `&body=${encodeURIComponent(body)}`}`;
}

function postsPanel(feed: Feed | undefined, email?: ContactEntry, actions?: Node[]): HTMLElement {
    const panel = newHtml('div', {class: 'pr-posts'});
    if (actions?.length)
        addHtml(panel, 'div', {class: 'pr-posts-actions'}, actions);
    if (!feed?.items.length)
        addHtml(panel, 'p', {class: 'pr-empty'}, feed ? 'The feed has no posts yet.' : 'There are no posts yet.');
    if (!feed)
        return panel;
    const list = addHtml(panel, 'ol', {class: 'pr-post-list'});
    for (const item of feed.items) {
        const li = addHtml(list, 'li', {class: 'pr-post'});
        if (item.date)
            addHtml(li, 'time', {class: 'kicker', datetime: item.date.toISOString()}, formatDate(item.date));
        // Posts without a title (microblogs) show their text instead, as Downread does.
        if (item.title)
            addHtml(li, 'h2', {class: 'pr-post-title'}, item.url ? external(item.url, {}, item.title) : item.title);
        if (item.summary)
            addHtml(li, 'p', {class: item.title ? 'pr-post-summary' : 'pr-post-text'}, item.summary);
        // "Open post" at the left, the email reply at the lower right.
        if (!item.title && item.url || email) {
            const foot = addHtml(li, 'div', {class: 'pr-post-foot'});
            if (!item.title && item.url)
                foot.appendChild(external(item.url, {class: 'pr-post-open'}, 'Open post →'));
            if (email)
                foot.appendChild(external(replyHref(email, item), {class: 'pr-post-reply', title: `Reply by email to ${email.value}`}, [icon('reply', 15), 'Reply']));
        }
    }
    addHtml(panel, 'p', {class: 'pr-source'}, ['Latest posts of ', external(feed.url, {}, feed.url)]);
    return panel;
}

function followRow(f: FollowEntry, o: ViewOptions): HTMLElement {
    const li = newHtml('li', {class: 'pr-follow'});
    // Initials only: loading the icons would send the visitor's IP address to every site in the list,
    // sites they didn't choose to visit.
    li.appendChild(avatar(f.host, f.name, 'pr-follow-icon', []));
    addHtml(li, 'a', {class: 'pr-follow-main', href: o.profileHref(f.host)}, [
        newHtml('span', {class: 'pr-follow-name'}, f.name),
        newHtml('span', {class: 'pr-follow-handle'}, f.handle),
    ]);
    const links = addHtml(li, 'span', {class: 'pr-follow-links'});
    if (f.siteUrl)
        links.appendChild(iconLink(f.siteUrl, `Visit ${f.name}`, 'external'));
    if (f.feedUrl)
        links.appendChild(iconLink(f.feedUrl, `Feed of ${f.name}`, 'rss'));
    return li;
}

function followingPanel(following: FollowEntry[], o: ViewOptions): HTMLElement {
    const panel = newHtml('div', {class: 'pr-following'});
    if (!following.length) {
        addHtml(panel, 'p', {class: 'pr-empty'}, 'The list is empty: this site follows nobody yet.');
        return panel;
    }
    addHtml(panel, 'div', {class: 'kicker pr-count'}, `Follows ${following.length.toLocaleString('en-US')} site${following.length == 1 ? '' : 's'}`);
    const list = addHtml(panel, 'ul', {class: 'pr-follow-list'});
    // Long lists (some have thousands of entries) are shown a page at a time.
    let shown = 0;
    const more = newHtml('button', {type: 'button', class: 'btn btn-sm pr-more'});
    const showMore = () => {
        for (const f of following.slice(shown, shown + FOLLOWING_PAGE))
            list.appendChild(followRow(f, o));
        shown = Math.min(shown + FOLLOWING_PAGE, following.length);
        more.textContent = `Show more (${(following.length - shown).toLocaleString('en-US')} left)`;
        more.hidden = shown >= following.length;
    };
    more.onclick = showMore;
    showMore();
    panel.appendChild(more);
    return panel;
}

function aboutPanel(p: Profile, o: ViewOptions): HTMLElement | undefined {
    const editor = o.aboutEditor?.(p);
    if (!p.about && !editor)
        return;
    const panel = newHtml('div', {class: 'pr-about md'});
    if (p.about?.markdown)
        panel.appendChild(renderMarkdown(p.about.markdown, `https://${p.host}/`));
    else
        addHtml(panel, 'p', {class: 'pr-empty'}, p.about ? 'The about page is empty.' : 'There is no about page yet.');
    editor?.(panel);
    return panel;
}

const KIND_LABELS: Record<ContactEntry['kind'], string> = {email: 'Email', tel: 'Phone', url: 'Website', impp: 'Chat', social: 'Profile'};
const KIND_ICONS: Record<ContactEntry['kind'], IconName> = {email: 'mail', tel: 'phone', url: 'external', impp: 'chat', social: 'link'};

function contactRow(label: string, value: string, action?: HTMLElement): HTMLElement {
    const row = newHtml('div', {class: 'pr-contact-row'});
    addHtml(row, 'div', {class: 'pr-contact-text'}, [newHtml('div', {class: 'kicker'}, label), newHtml('div', {class: 'pr-contact-value'}, value)]);
    if (action)
        row.appendChild(action);
    return row;
}

function contactPanel(contact: Contact): HTMLElement {
    const panel = newHtml('div', {class: 'pr-contact'});
    if (contact.name)
        panel.appendChild(contactRow('Name', contact.name));
    if (contact.org || contact.title)
        panel.appendChild(contactRow(contact.org ? 'Organization' : 'Title', [contact.title, contact.org].filter(Boolean).join(', ')));
    for (const e of contact.entries) {
        // A social profile's label is its service ("Signal"); other labels qualify the kind ("Email · Work").
        const kind = e.kind == 'social' && e.label ? e.label : KIND_LABELS[e.kind];
        const label = [kind, e.kind != 'social' ? e.label : undefined, e.pref ? 'preferred' : undefined].filter(Boolean).join(' · ');
        panel.appendChild(contactRow(label, e.value, e.href ? iconLink(e.href, `${kind}: ${e.value}`, KIND_ICONS[e.kind]) : undefined));
    }
    if (!panel.children.length)
        addHtml(panel, 'p', {class: 'pr-empty'}, 'The contact card is empty.');
    return panel;
}

export const TABS: {key: FileKey, label: string}[] = [
    {key: 'feed', label: 'Posts'},
    {key: 'following', label: 'Following'},
    {key: 'about', label: 'About'},
    {key: 'contact', label: 'Contact'},
];

/** The tab of a location hash (#posts, #following...). */
export const tabOfHash = (hash: string): FileKey | undefined =>
    ({'#posts': 'feed', '#following': 'following', '#about': 'about', '#contact': 'contact'} as Record<string, FileKey>)[hash];
export const hashOfTab = (key: FileKey) => '#' + (key == 'feed' ? 'posts' : key);

function panelOf(p: Profile, key: FileKey, o: ViewOptions): HTMLElement | undefined {
    switch (key) {
        case 'feed': {
            const actions = o.postsActions?.(p);
            return p.feed || actions ? postsPanel(p.feed, o.replyByEmail ? replyEmail(p) : undefined, actions) : undefined;
        }
        case 'following': return p.following && followingPanel(p.following, o);
        case 'about': return aboutPanel(p, o);
        case 'contact': return p.contact && contactPanel(p.contact);
    }
}

function replyEmail(p: Profile): ContactEntry | undefined {
    const email = preferredEmail(p.contact);
    return email?.href ? email : undefined;
}

/** The tab bar and, below it, the panels, into `panels`. */
function tabs(p: Profile, panels: HTMLElement, o: ViewOptions, initialTab?: FileKey): void {
    const available = TABS.map(t => ({...t, panel: panelOf(p, t.key, o)})).filter(t => t.panel);
    const bar = addHtml(panels, 'div', {class: 'pr-tabs', role: 'tablist', 'aria-label': 'Profile'});
    const buttons = available.map(t => addHtml(bar, 'button', {type: 'button', role: 'tab', id: `tab-${t.key}`, 'aria-controls': `panel-${t.key}`}, t.label));
    for (const t of available)
        panels.appendChild(t.panel!).setAttribute('role', 'tabpanel');
    const select = (i: number, focus = false) => {
        available.forEach((t, j) => {
            buttons[j].setAttribute('aria-selected', String(i == j));
            buttons[j].tabIndex = i == j ? 0 : -1;
            Object.assign(t.panel!, {id: `panel-${t.key}`, hidden: i != j});
            t.panel!.setAttribute('aria-labelledby', `tab-${t.key}`);
        });
        if (focus)
            buttons[i].focus();
    };
    buttons.forEach((b, i) => {
        b.onclick = () => {
            select(i);
            o.onTabChange?.(available[i].key);
        };
        b.onkeydown = e => {
            const next = e.key == 'ArrowRight' ? i + 1 : e.key == 'ArrowLeft' ? i - 1 : e.key == 'Home' ? 0 : e.key == 'End' ? buttons.length - 1 : -2;
            if (next == -2)
                return;
            e.preventDefault();
            const j = (next + buttons.length) % buttons.length;
            select(j, true);
            o.onTabChange?.(available[j].key);
        };
    });
    select(Math.max(0, available.findIndex(t => t.key == initialTab)));
}

/* ---------- Profile ---------- */

export const displayName = (p: Profile) => p.contact?.name || p.feed?.title || handleOf(p.domain);

/** The profile: .pr-top (banner, avatar and actions, name, handle and bio) and .pr-panels (the
 *  tab bar and the open tab), so an app can show them as one card or as two. */
export function profileCard(p: Profile, o: ViewOptions, initialTab?: FileKey): HTMLElement {
    const name = displayName(p);
    const card = newHtml('article', {class: 'pr-card'});
    const top = addHtml(card, 'div', {class: 'pr-top'});
    addHtml(top, 'div', {class: 'pr-banner', style: `background:${o.bannerColor ?? bannerColor(p.domain)}`});
    const head = addHtml(top, 'div', {class: 'pr-head'});
    head.appendChild(avatar(p.host, name, 'pr-avatar', [`https://${p.host}/apple-touch-icon.png`, `https://${p.host}/favicon.ico`]));
    const actions = addHtml(head, 'div', {class: 'pr-actions'});
    const email = preferredEmail(p.contact);
    if (email?.href)
        actions.appendChild(iconLink(email.href, `Email ${email.value}`, 'message', 'icon-btn icon-btn-lg'));
    actions.append(...o.actions?.(p) ?? []);

    const id = addHtml(top, 'div', {class: 'pr-id'});
    addHtml(id, 'h1', {class: 'pr-name'}, name);
    id.appendChild(external(`https://${p.domain}/`, {class: 'pr-handle'}, handleOf(p.domain)));
    const bio = p.about?.summary || p.feed?.description;
    if (bio)
        addHtml(id, 'p', {class: 'pr-bio'}, bio);
    tabs(p, addHtml(card, 'div', {class: 'pr-panels'}), o, initialTab);
    return card;
}

/* ---------- File checklist ---------- */

const FILE_NAMES: Record<FileKey, [string, string]> = {
    feed: ['Posts', 'feed'],
    following: ['Following', 'following.opml'],
    about: ['About', 'about.md'],
    contact: ['Contact', 'contact.vcf'],
};

export function stateLabel(f: FileCheck, key: FileKey): string {
    const labels: Record<FileState, string> = {
        ok: 'Found',
        missing: key == 'feed' ? 'Not found' : 'Not published',
        cors: f.exists ? 'Found, blocked' : 'Blocked (CORS)',
        unreachable: 'No connection',
        timeout: 'Timed out',
        http: `Error ${f.status}`,
        html: 'Web page, no file',
        invalid: 'Invalid file',
    };
    return labels[f.state];
}

const STATE_HINTS: Partial<Record<FileState, string>> = {
    cors: 'The site doesn’t allow other websites to read it',
    html: 'The address returns a web page instead of the file',
    invalid: 'The file isn’t in the expected format',
};

export function fileList(p: Profile): HTMLElement {
    const box = newHtml('section', {class: 'side-list pr-files', 'aria-label': 'SocialSpec files'});
    addHtml(box, 'div', {class: 'kicker'}, `Files of ${handleOf(p.host)}`);
    for (const t of TABS) {
        const f = p.files[t.key];
        const [label, file] = FILE_NAMES[t.key];
        const row = addHtml(box, 'div', {class: 'pr-file', title: STATE_HINTS[f.state]});
        addHtml(row, 'span', {class: 'pr-file-name'}, [label, newHtml('span', {class: 'pr-file-path'},
            t.key == 'feed' && f.state == 'ok' ? new URL(f.url).pathname : file)]);
        // A missing feed wasn't one address but several guesses: no link.
        const state = newHtml('span', {class: `state state-${f.state}`}, stateLabel(f, t.key));
        row.appendChild(t.key == 'feed' && f.state != 'ok' ? state : external(f.url, {class: 'pr-file-link'}, state));
    }
    const blocked = Object.values(p.files).filter(f => f.state == 'cors');
    if (blocked.length)
        addHtml(box, 'p', {class: 'pr-files-note'}, [blocked.some(f => f.exists)
            ? `Files marked “Found, blocked” exist, but ${handleOf(p.domain)} doesn’t send the CORS header that lets browsers read them. `
            : `Blocked files may exist, but ${handleOf(p.domain)} doesn’t send the CORS header that lets browsers read them. `,
            newHtml('a', {href: '#cors-help'}, 'How to fix it')]);
    return box;
}

/** The SocialSpec files that exist (the CORS proxy found them), but are blocked by CORS. */
export const foundBlocked = (p: Profile) =>
    SPEC_FILES.filter(k => p.files[k].state == 'cors' && p.files[k].exists);

/** "about.md, following.opml and contact.vcf" */
const fileNames = (keys: FileKey[]) =>
    keys.map(k => FILE_NAMES[k][1]).join(', ').replace(/, ([^,]*)$/, ' and $1');

/** Above a profile with files that exist but are blocked: that part of the profile is missing. */
function blockedNotice(p: Profile, keys: FileKey[]): HTMLElement {
    return newHtml('p', {class: 'pr-notice', role: 'status'}, [icon('alert', 20),
        newHtml('span', {}, [`${handleOf(p.domain)} publishes ${fileNames(keys)}, but blocks browser apps from reading ${keys.length == 1 ? 'it' : 'them'} (CORS error), so ${keys.length == 1 ? 'it is' : 'they are'} missing here. `,
            newHtml('a', {href: '#cors-help'}, 'How to fix it')])]);
}

/* ---------- Errors ---------- */

/** 'nospec': none of the SocialSpec files exists (checked through the CORS proxy if the site
 *  blocks them). 'none': the files that exist can't be read, and there's no feed either. */
export type ErrorKind = 'nodomain' | 'invalid' | 'unreachable' | 'nospec' | 'cors' | 'timeout' | 'none';

/** Why a profile without any readable file has nothing to show. */
export function errorKind(p: Profile): ErrorKind | undefined {
    if (hasContent(p))
        return undefined;
    const states = Object.values(p.files).map(f => f.state);
    const absent = SPEC_FILES.every(k => p.files[k].state == 'missing' || p.files[k].state == 'html');
    return states.every(s => s == 'unreachable') ? 'unreachable'
        : absent ? 'nospec'
        : states.includes('cors') ? 'cors'
        : states.includes('timeout') ? 'timeout'
        : states.includes('unreachable') ? 'unreachable'
        : 'none';
}

function code(text: string): HTMLElement {
    return newHtml('pre', {class: 'code-box'}, newHtml('code', {}, text));
}

/** What a site owner does to let browsers read the files. */
export function corsHelp(host: string): HTMLElement {
    const box = newHtml('section', {class: 'cors-help', id: 'cors-help'});
    addHtml(box, 'h2', {}, 'Is it your site? Allow CORS');
    addHtml(box, 'p', {}, ['SocialSpec asks sites to let browser apps read their files. Send this header with everything under ',
        newHtml('code', {}, '/.well-known/'), ' and with your feed:']);
    box.appendChild(code('Access-Control-Allow-Origin: *'));
    addHtml(box, 'p', {}, `If ${bareHost(host)} redirects (to www. or to https), the redirect needs the header too. Some ways to add it:`);
    const examples: [string, string][] = [
        ['nginx', 'location /.well-known/ {\n    add_header Access-Control-Allow-Origin *;\n}'],
        ['Apache (.htaccess in /.well-known/)', 'Header set Access-Control-Allow-Origin "*"'],
        ['Caddy', 'header /.well-known/* Access-Control-Allow-Origin *'],
        ['Netlify, Cloudflare Pages (_headers file)', '/.well-known/*\n  Access-Control-Allow-Origin: *'],
        ['Cloudflare (any origin)', 'Rules → Transform Rules → Response Header:\nset Access-Control-Allow-Origin to * when\nstarts_with(http.request.uri.path, "/.well-known/")'],
    ];
    for (const [title, snippet] of examples) {
        const d = addHtml(box, 'details', {class: 'cors-example'});
        addHtml(d, 'summary', {}, [newHtml('span', {class: 'cors-example-toggle'}, icon('chevron', 16)), title]);
        d.appendChild(code(snippet));
    }
    addHtml(box, 'p', {}, 'Then check that the header comes back:');
    box.appendChild(code(`curl -sI -H "Origin: https://example.org" https://${host}/.well-known/about.md`));
    return box;
}

/** The box at the top of an error page: an icon, what went wrong and why. */
function errorHead(main: HTMLElement, iconName: IconName, kicker: string, title: string, ...lead: (string | Node)[]): void {
    const head = addHtml(main, 'div', {class: `pr-error-head${iconName == 'search' ? ' pr-error-info' : ''}`, role: 'alert'});
    // The sad face fills its circle: the circle is the face.
    addHtml(head, 'span', {class: 'pr-error-icon'}, iconName == 'sad' ? icon('sad', 56, 1.6) : icon(iconName, 30));
    const text = addHtml(head, 'div', {class: 'pr-error-text'});
    addHtml(text, 'div', {class: 'kicker'}, kicker);
    addHtml(text, 'h1', {class: 'display pr-error-title'}, title);
    if (lead.length)
        addHtml(text, 'p', {}, lead);
}

function retryButton(parent: HTMLElement): void {
    addHtml(parent, 'button', {type: 'button', class: 'btn btn-sm'}, 'Try again').onclick = () => location.reload();
}

function para(parent: HTMLElement, ...children: (string | Node)[]): HTMLElement {
    return addHtml(parent, 'p', {}, children);
}

function publishHelp(main: HTMLElement): void {
    para(main, 'Is it your site? A profile takes three small files in ', newHtml('code', {}, '/.well-known/'), ': ',
        external('https://aboutspec.org/', {}, 'about.md'), ', ',
        external('https://followspec.org/', {}, 'following.opml'), ' and ',
        external('https://contactspec.org/', {}, 'contact.vcf'), '. ',
        external('https://socialspec.org/', {}, 'How to publish a profile'), '.');
}

export function errorPage(kind: ErrorKind, domain: string, o: ViewOptions, p?: Profile): HTMLElement {
    const main = newHtml('section', {class: 'pr-error'});
    const app = o.appName;
    const site = handleOf(domain);
    switch (kind) {
        case 'nodomain':
            errorHead(main, 'search', app, 'Which site?', 'Enter a domain name above to see the site’s profile, for example @manton.org.');
            break;
        case 'invalid':
            errorHead(main, 'alert', 'Can’t show this profile', 'Not a domain name',
                `“${domain}” isn’t a domain name. Enter one like @manton.org. A URL or a plain domain like manton.org works too.`);
            break;
        case 'unreachable': {
            errorHead(main, 'offline', 'No connection', `Can’t reach ${site}`, 'Your browser couldn’t connect to the site at all.');
            para(main, 'That can mean:');
            const ul = addHtml(main, 'ul');
            addHtml(ul, 'li', {}, 'The domain is misspelled, or has no website.');
            addHtml(ul, 'li', {}, `The site is down, or has no valid HTTPS certificate. ${app} only uses secure connections.`);
            addHtml(ul, 'li', {}, 'You are offline, or a browser extension or network filter blocks the request.');
            retryButton(main);
            break;
        }
        case 'cors': {
            errorHead(main, 'sad', 'Can’t show this profile', `Blocked by ${site}`,
                'The site answers, but without the CORS header (Access-Control-Allow-Origin) that SocialSpec requires. ' +
                `Without it, your browser doesn’t let other websites read the site’s files, ${app} included.`);
            const found = p ? foundBlocked(p) : [];
            if (found.length)
                para(main, `${site} does publish a profile: ${app} found ${fileNames(found)} through its CORS proxy. ` +
                    `But as long as the site blocks them, no browser app can show ${found.length == 1 ? 'it' : 'them'}. You can open ${found.length == 1 ? 'it' : 'them'} directly:`);
            else
                para(main, 'Whether the site publishes a profile can’t be seen from here. If it does, you can open its files directly:');
            const ul = addHtml(main, 'ul', {class: 'pr-raw-links'});
            for (const k of found.length ? found : ['about', 'following', 'contact'] as const)
                addHtml(ul, 'li', {}, external(`https://${p?.host ?? domain}${WELL_KNOWN[k].path}`, {}, `${p?.host ?? domain}${WELL_KNOWN[k].path}`));
            main.appendChild(corsHelp(p?.host ?? domain));
            break;
        }
        case 'timeout':
            errorHead(main, 'clock', 'Timed out', `${site} is too slow`, 'The site didn’t send its files in time. Try again later.');
            retryButton(main);
            break;
        case 'nospec':
            errorHead(main, 'question', 'No SocialSpec', `${site} doesn’t support SocialSpec`,
                `${site} publishes none of the SocialSpec files, so it has no profile to show.`);
            publishHelp(main);
            break;
        case 'none':
            errorHead(main, 'alert', 'Nothing to show', `No readable profile on ${site}`,
                `None of the SocialSpec files of ${site} could be read, and no feed was found at the usual addresses. The file list says why.`);
            publishHelp(main);
            break;
    }
    return main;
}

/** Puts the page together: the profile, or the error, and the file checklist. */
export function renderPage(main: HTMLElement, aside: HTMLElement, domain: string, p: Profile, o: ViewOptions, initialTab?: FileKey): void {
    main.replaceChildren();
    aside.replaceChildren();
    const kind = errorKind(p);
    const blocked = foundBlocked(p);
    if (!kind && blocked.length)
        main.appendChild(blockedNotice(p, blocked));
    main.appendChild(kind ? errorPage(kind, domain, o, p) : profileCard(p, o, initialTab));
    if (kind != 'unreachable')
        aside.appendChild(fileList(p));
    if (!kind && Object.values(p.files).some(f => f.state == 'cors'))
        aside.appendChild(corsHelp(p.host));
    document.body.dataset.state = kind ? 'error' : 'profile';
    document.title = `${kind ? handleOf(domain) : `${displayName(p)} (${handleOf(domain)})`} - ${o.appName}`;
}
