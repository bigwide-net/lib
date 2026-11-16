import { newHtml } from '../../postviewer/src/dom';
import { loadProfile, type Profile } from '../src/profile';
import { bannerColor, errorKind, FOLLOWING_PAGE, renderPage, tabOfHash, type ViewOptions } from '../src/view';
import { ABOUT, fakeDeps, OPML, RSS, VCARD } from './fixtures';

/** An app's options as the tests use them: sodir's texts and links, a stand-in Follow button. */
const tabChanges: string[] = [];
const VIEW: ViewOptions = {
    appName: 'Social Browser',
    profileHref: host => `/profile.html?d=${host}`,
    actions: p => p.feed ? [newHtml('button', {class: 'pr-follow-btn'}, 'Follow')] : [],
    onTabChange: key => tabChanges.push(key),
};

const FULL = {
    'https://jordandoe.com/.well-known/about.md': ABOUT,
    'https://jordandoe.com/.well-known/following.opml': OPML,
    'https://jordandoe.com/.well-known/contact.vcf': VCARD,
    'https://jordandoe.com/feed.xml': RSS,
};

async function render(files: Record<string, string>, domain = 'jordandoe.com', tab?: any, reachable = true, proxied: Record<string, string> = {}, view = VIEW) {
    document.body.innerHTML = '<main id="m"></main><aside id="a"></aside>';
    const main = document.getElementById('m')!;
    const aside = document.getElementById('a')!;
    const p = await loadProfile(domain, fakeDeps(files, reachable, proxied));
    renderPage(main, aside, domain, p, view, tab);
    return {main, aside, p};
}

const tabLabels = (main: HTMLElement) => Array.from(main.querySelectorAll('[role=tab]')).map(t => t.textContent);
const selected = (main: HTMLElement) => main.querySelector('[role=tab][aria-selected=true]')?.textContent;
const visiblePanel = (main: HTMLElement) => main.querySelector('[role=tabpanel]:not([hidden])') as HTMLElement;

describe('profile page', () => {
    it('shows name, handle, bio, actions and all four tabs', async () => {
        const {main, aside} = await render(FULL);
        expect(document.body.dataset.state).toBe('profile');
        expect(document.title).toBe('Jordan Doe (@jordandoe.com) - Social Browser');
        expect(main.querySelector('.pr-name')?.textContent).toBe('Jordan Doe');
        expect(main.querySelector('.pr-handle')?.textContent).toBe('@jordandoe.com');
        expect(main.querySelector('.pr-bio')?.textContent).toBe('Eager explorer.');
        expect(main.querySelector('.pr-actions a[href="mailto:hello@jordandoe.com"]')?.getAttribute('target')).toBe('_blank');
        expect(main.querySelector('.pr-follow-btn')).not.toBeNull();
        expect(tabLabels(main)).toEqual(['Posts', 'Following', 'About', 'Contact']);
        expect(selected(main)).toBe('Posts');
        expect(visiblePanel(main).querySelector('.pr-post-title')?.textContent).toBe('First tomatoes');
        expect(aside.querySelectorAll('.state-ok')).toHaveLength(4);
        expect(aside.querySelector('#cors-help')).toBeNull();
    });

    it('shows only the available tabs and opens the one of the hash', async () => {
        const {main} = await render({
            'https://jordandoe.com/.well-known/about.md': ABOUT,
            'https://jordandoe.com/.well-known/contact.vcf': VCARD,
        }, 'jordandoe.com', tabOfHash('#contact'));
        expect(tabLabels(main)).toEqual(['About', 'Contact']);
        expect(selected(main)).toBe('Contact');
        expect(visiblePanel(main).textContent).toContain('Email · preferred');
        expect(main.querySelector('.pr-follow-btn')).toBeNull();
    });

    it('switches tabs by click and arrow keys', async () => {
        const {main} = await render(FULL);
        const tabs = main.querySelectorAll<HTMLElement>('[role=tab]');
        tabChanges.length = 0;
        tabs[2].click();
        expect(selected(main)).toBe('About');
        expect(visiblePanel(main).querySelector('h4')?.textContent).toBe('About Jordan');
        tabs[2].dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowRight'}));
        expect(selected(main)).toBe('Contact');
        tabs[3].dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowRight'}));
        expect(selected(main)).toBe('Posts');
        // The app learns each choice (sodir puts it in the hash).
        expect(tabChanges).toEqual(['about', 'contact', 'feed']);
    });

    it('lets the app add an editor to the About panel, also when about.md is missing', async () => {
        const decorate = (panel: HTMLElement) => panel.appendChild(newHtml('button', {class: 'edit-about'}, 'Edit'));
        const editable: ViewOptions = {...VIEW, aboutEditor: p => p.domain == 'jordandoe.com' ? decorate : undefined};
        const {main} = await render({'https://jordandoe.com/feed.xml': RSS}, 'jordandoe.com', 'about', true, {}, editable);
        expect(tabLabels(main)).toEqual(['Posts', 'About']);
        expect(visiblePanel(main).querySelector('.pr-empty')?.textContent).toBe('There is no about page yet.');
        expect(visiblePanel(main).querySelector('.edit-about')).not.toBeNull();
        const {main: m2} = await render(FULL, 'jordandoe.com', 'about', true, {}, editable);
        expect(visiblePanel(m2).querySelector('h4')?.textContent).toBe('About Jordan');
        expect(visiblePanel(m2).querySelector('.edit-about')).not.toBeNull();
        // Without the option, a missing about.md has no tab.
        const {main: m3} = await render({'https://jordandoe.com/feed.xml': RSS});
        expect(tabLabels(m3)).toEqual(['Posts']);
    });

    it('lets the app add controls to the Posts panel, also when the site has no feed yet', async () => {
        const write = () => [newHtml('button', {class: 'write-post'}, 'Write post')];
        const writable: ViewOptions = {...VIEW, postsActions: p => p.domain == 'jordandoe.com' ? write() : undefined};
        const {main} = await render({'https://jordandoe.com/feed.xml': RSS}, 'jordandoe.com', 'feed', true, {}, writable);
        expect(visiblePanel(main).querySelector('.pr-posts-actions .write-post')).not.toBeNull();
        expect(visiblePanel(main).querySelectorAll('.pr-post').length).toBeGreaterThan(0);
        const aboutOnly = {'https://jordandoe.com/.well-known/about.md': ABOUT};
        const {main: m2} = await render(aboutOnly, 'jordandoe.com', 'feed', true, {}, writable);
        expect(tabLabels(m2)).toEqual(['Posts', 'About']);
        expect(visiblePanel(m2).querySelector('.pr-empty')?.textContent).toBe('There are no posts yet.');
        expect(visiblePanel(m2).querySelector('.pr-source')).toBeNull();
        // Without the option, a site without a feed has no Posts tab.
        const {main: m3} = await render(aboutOnly, 'jordandoe.com', 'feed');
        expect(tabLabels(m3)).toEqual(['About']);
    });

    it('links followed sites to their profiles and pages long lists', async () => {
        const outlines = Array.from({length: FOLLOWING_PAGE + 5}, (_, i) => `<outline text="Site ${i}" xmlUrl="https://s${i}.org/feed"/>`).join('');
        const {main} = await render({'https://jordandoe.com/.well-known/following.opml': `<opml version="2.0"><body>${outlines}</body></opml>`});
        const panel = visiblePanel(main);
        expect(panel.querySelector('.pr-follow-main')?.getAttribute('href')).toBe('/profile.html?d=s0.org');
        expect(panel.querySelector('.pr-follow-icon img')).toBeNull();
        expect(panel.querySelector('.pr-follow-icon .avatar-letter')?.textContent).toBe('S');
        expect(panel.querySelectorAll('.pr-follow')).toHaveLength(FOLLOWING_PAGE);
        const more = panel.querySelector<HTMLButtonElement>('.pr-more')!;
        expect(more.textContent).toBe('Show more (5 left)');
        more.click();
        expect(panel.querySelectorAll('.pr-follow')).toHaveLength(FOLLOWING_PAGE + 5);
        expect(more.hidden).toBe(true);
    });

    it('opens email links of the contact card in a new tab', async () => {
        const {main} = await render(FULL, 'jordandoe.com', 'contact');
        expect(visiblePanel(main).querySelector('a[href="mailto:hello@jordandoe.com"]')?.getAttribute('target')).toBe('_blank');
    });

    it('adds an email Reply link to every post if the app asks for it', async () => {
        const microblog = RSS.replace('</channel>', '<item><description>Just posted about the tomato harvest of this year, the best one in a decade</description><link>https://jordandoe.com/m</link></item></channel>');
        const {main} = await render({...FULL, 'https://jordandoe.com/feed.xml': microblog}, 'jordandoe.com', undefined, true, {}, {...VIEW, replyByEmail: true});
        const replies = Array.from(main.querySelectorAll<HTMLAnchorElement>('.pr-post .pr-post-reply'));
        expect(replies.map(a => a.getAttribute('target'))).toEqual(['_blank', '_blank']);
        expect(replies[0].getAttribute('href')).toBe('mailto:hello@jordandoe.com?subject=Re%3A%20First%20tomatoes&body=%0A%0A%3E%20https%3A%2F%2Fjordandoe.com%2Ft%0A');
        expect(decodeURIComponent(replies[1].getAttribute('href')!)).toContain('subject=Re: Just posted about the tomato harvest of this year, the best…&');
        // "Open post" of the titleless post shares the line, at the left.
        expect(replies[1].previousElementSibling?.className).toBe('pr-post-open');
    });

    it('has no Reply links without the option or without an email address', async () => {
        const {main} = await render(FULL);
        expect(main.querySelector('.pr-post-reply')).toBeNull();
        const {main: m2} = await render({...FULL, 'https://jordandoe.com/.well-known/contact.vcf': 'BEGIN:VCARD\nFN:Jordan Doe\nEND:VCARD'},
            'jordandoe.com', undefined, true, {}, {...VIEW, replyByEmail: true});
        expect(m2.querySelector('.pr-post-reply')).toBeNull();
    });

    it('falls back to the feed title and the domain for the name', async () => {
        const {main} = await render({'https://jordandoe.com/feed.xml': RSS});
        expect(main.querySelector('.pr-name')?.textContent).toBe('Jordan’s blog');
        expect(main.querySelector('.pr-bio')?.textContent).toBe('A blog');
        const {main: m2} = await render({'https://jordandoe.com/.well-known/about.md': 'Just text'});
        expect(m2.querySelector('.pr-name')?.textContent).toBe('@jordandoe.com');
    });

    it('notes files blocked by CORS next to a profile', async () => {
        const {aside} = await render({'https://jordandoe.com/.well-known/about.md': ABOUT, 'https://jordandoe.com/.well-known/contact.vcf': 'blocked'});
        expect(aside.querySelector('.state-cors')?.textContent).toBe('Blocked (CORS)');
        expect(aside.querySelector('.pr-files-note')).not.toBeNull();
        expect(aside.querySelector('#cors-help')).not.toBeNull();
    });

    it('notifies of files that exist but are blocked by CORS', async () => {
        const {main, aside} = await render({'https://jordandoe.com/.well-known/about.md': ABOUT, 'https://jordandoe.com/.well-known/contact.vcf': 'blocked'},
            'jordandoe.com', undefined, true, {'https://jordandoe.com/.well-known/contact.vcf': VCARD});
        expect(main.querySelector('.pr-notice')?.textContent).toBe('@jordandoe.com publishes contact.vcf, but blocks browser apps from reading it (CORS error), so it is missing here. How to fix it');
        expect(main.querySelector('.pr-card')).not.toBeNull();
        expect(aside.querySelector('.state-cors')?.textContent).toBe('Found, blocked');
        expect(aside.querySelector('.pr-files-note')?.textContent).toContain('Files marked “Found, blocked” exist');
        expect(tabLabels(main)).toEqual(['About']);
    });

    it('never renders markup from the files', async () => {
        const {main} = await render({
            'https://jordandoe.com/.well-known/about.md': '---\nsummary: <img src=x onerror=alert(1)>\n---\n<script>alert(1)</script>[x](javascript:alert(1))',
            'https://jordandoe.com/.well-known/contact.vcf': 'BEGIN:VCARD\nFN:<b>Bold</b>\nEND:VCARD',
        });
        expect(main.querySelector('script, img[onerror], b, a[href^="javascript"]')).toBeNull();
        expect(main.querySelector('.pr-name')?.textContent).toBe('<b>Bold</b>');
    });
});

describe('error pages', () => {
    it('explains CORS, with the files to open and how to fix it', async () => {
        const {main, aside} = await render({
            'https://jordandoe.com/.well-known/about.md': 'blocked',
            'https://www.jordandoe.com/.well-known/about.md': 'blocked',
        });
        expect(document.body.dataset.state).toBe('error');
        expect(main.querySelector('h1')?.textContent).toBe('Blocked by @jordandoe.com');
        expect(main.querySelectorAll('.pr-raw-links a')).toHaveLength(3);
        expect(main.querySelector('#cors-help')?.textContent).toContain('Access-Control-Allow-Origin: *');
        expect(aside.querySelector('.state-cors')).not.toBeNull();
    });

    it('names the files that exist on the CORS page', async () => {
        const blocked = {'https://jordandoe.com/.well-known/about.md': 'blocked', 'https://jordandoe.com/.well-known/following.opml': 'blocked',
            'https://jordandoe.com/.well-known/contact.vcf': 'blocked'};
        const {main} = await render({...blocked, 'https://www.jordandoe.com/.well-known/about.md': 'blocked'}, 'jordandoe.com', undefined, true,
            {'https://jordandoe.com/.well-known/about.md': ABOUT, 'https://jordandoe.com/.well-known/contact.vcf': VCARD, 'https://jordandoe.com/.well-known/following.opml': 'missing'});
        expect(main.querySelector('h1')?.textContent).toBe('Blocked by @jordandoe.com');
        expect(main.textContent).toContain('@jordandoe.com does publish a profile: Social Browser found about.md and contact.vcf through its CORS proxy.');
        expect([...main.querySelectorAll('.pr-raw-links a')].map(a => a.textContent)).toEqual(['jordandoe.com/.well-known/about.md', 'jordandoe.com/.well-known/contact.vcf']);
        expect(main.querySelector('#cors-help')).not.toBeNull();
        expect(main.querySelector('.pr-notice')).toBeNull();
    });

    it('says a CORS-blocked site without SocialSpec files doesn’t support SocialSpec', async () => {
        const all = Object.fromEntries(['about.md', 'following.opml', 'contact.vcf'].map(f => [`https://jordandoe.com/.well-known/${f}`, 'blocked']));
        const {main} = await render(all, 'jordandoe.com', undefined, true,
            Object.fromEntries(Object.keys(all).map(u => [u, 'missing'])));
        expect(main.querySelector('h1')?.textContent).toBe('@jordandoe.com doesn’t support SocialSpec');
    });

    it('explains an unreachable site', async () => {
        const all = Object.fromEntries(Object.keys(FULL).concat(['https://jordandoe.com/feed.json']).map(u => [u, 'blocked']));
        const {main, aside} = await render(all, 'jordandoe.com', undefined, false);
        expect(main.querySelector('h1')?.textContent).toBe('Can’t reach @jordandoe.com');
        expect(aside.children).toHaveLength(0);
    });

    it('says a site without SocialSpec files doesn’t support SocialSpec', async () => {
        const {main} = await render({'https://jordandoe.com/.well-known/about.md': 'html'});
        expect(main.querySelector('h1')?.textContent).toBe('@jordandoe.com doesn’t support SocialSpec');
        expect(main.querySelector('.kicker')?.textContent).toBe('No SocialSpec');
        expect(main.querySelector('a[href="https://socialspec.org/"]')).not.toBeNull();
    });

    it('explains a site whose files can’t be read', async () => {
        const {main} = await render({'https://jordandoe.com/.well-known/about.md': 'http'});
        expect(main.querySelector('h1')?.textContent).toBe('No readable profile on @jordandoe.com');
    });

    it('classifies timeouts', () => {
        const f = (state: any) => ({state, url: ''});
        const p = {domain: 'x.org', host: 'x.org', files: {feed: f('missing'), following: f('timeout'), about: f('missing'), contact: f('missing')}} as Profile;
        expect(errorKind(p)).toBe('timeout');
    });
});

describe('bannerColor', () => {
    it('is the same for a domain with and without www', () => {
        expect(bannerColor('www.manton.org')).toBe(bannerColor('manton.org'));
        expect(bannerColor('manton.org')).toMatch(/^#[0-9A-F]{6}$/);
    });
});
