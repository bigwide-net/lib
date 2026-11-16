import { loadProfile } from '../src/profile';
import { ABOUT, fakeDeps, OPML, RSS, VCARD } from './fixtures';

describe('loadProfile', () => {
    it('loads all files and the first feed found', async () => {
        const deps = fakeDeps({
            'https://jordandoe.com/.well-known/about.md': ABOUT,
            'https://jordandoe.com/.well-known/following.opml': OPML,
            'https://jordandoe.com/.well-known/contact.vcf': VCARD,
            'https://jordandoe.com/feed': '<html>not a feed</html>',
            'https://jordandoe.com/rss.xml': RSS,
            'https://jordandoe.com/atom.xml': RSS,
        });
        const p = await loadProfile('jordandoe.com', deps);
        expect(p.host).toBe('jordandoe.com');
        expect(p.about?.summary).toBe('Eager explorer.');
        expect(p.following).toHaveLength(1);
        expect(p.contact?.name).toBe('Jordan Doe');
        expect(p.feed?.url).toBe('https://jordandoe.com/rss.xml');
        expect(Object.values(p.files).map(f => f.state)).toEqual(['ok', 'ok', 'ok', 'ok']);
    });

    it('marks missing, invalid and broken files', async () => {
        const p = await loadProfile('x.org', fakeDeps({
            'https://x.org/.well-known/about.md': ABOUT,
            'https://x.org/.well-known/following.opml': 'garbage',
            'https://x.org/.well-known/contact.vcf': 'http',
        }));
        expect(p.files.following.state).toBe('invalid');
        expect(p.files.contact).toEqual({state: 'http', url: 'https://x.org/.well-known/contact.vcf', status: 500});
        expect(p.files.feed).toEqual({state: 'missing', url: 'https://x.org/feed.xml'});
    });

    it('tells CORS (site reachable) from no connection', async () => {
        const blocked = {'https://x.org/.well-known/about.md': 'blocked', 'https://x.org/.well-known/contact.vcf': 'blocked'};
        const cors = await loadProfile('www.x.org', fakeDeps(blocked, true));
        expect(cors.files.about.state).toBe('missing'); // www.x.org: other URLs
        const p = await loadProfile('x.org', fakeDeps(blocked, true));
        expect(p.files.about.state).toBe('cors');
        expect(p.files.following.state).toBe('missing');
        const down = await loadProfile('x.org', fakeDeps(blocked, false));
        expect(down.files.about.state).toBe('unreachable');
    });

    it('retries www. when nothing could be read, and keeps it only if it helps', async () => {
        const deps = fakeDeps({
            'https://manton.org/.well-known/about.md': 'blocked',
            'https://www.manton.org/.well-known/about.md': ABOUT,
        });
        const p = await loadProfile('manton.org', deps);
        expect(p.host).toBe('www.manton.org');
        expect(p.domain).toBe('manton.org');
        expect(p.about?.summary).toBe('Eager explorer.');

        const failed = await loadProfile('x.org', fakeDeps({'https://x.org/.well-known/about.md': 'blocked'}));
        expect(failed.host).toBe('x.org');
        expect(failed.files.about.state).toBe('cors');
    });

    it('doesn’t retry www. when the site simply has no files', async () => {
        const deps = fakeDeps({});
        await loadProfile('x.org', deps);
        expect(deps.calls.some(u => u.includes('www.'))).toBe(false);
    });

    it('asks the CORS proxy about blocked SocialSpec files only', async () => {
        const deps = fakeDeps({
            'https://x.org/.well-known/about.md': 'blocked',
            'https://x.org/.well-known/following.opml': 'blocked',
            'https://x.org/.well-known/contact.vcf': 'blocked',
            'https://x.org/rss.xml': 'blocked',
            'https://www.x.org/.well-known/about.md': 'blocked',
        }, true, {
            'https://x.org/.well-known/about.md': ABOUT,
            'https://x.org/.well-known/following.opml': 'missing',
            'https://x.org/.well-known/contact.vcf': 'http',
        });
        const p = await loadProfile('x.org', deps);
        expect(deps.proxyCalls.sort()).toEqual(['https://x.org/.well-known/about.md', 'https://x.org/.well-known/contact.vcf', 'https://x.org/.well-known/following.opml']);
        expect(p.files.about).toEqual({state: 'cors', url: 'https://x.org/.well-known/about.md', exists: true});
        expect(p.about).toBeUndefined(); // only what browsers can read is shown
        expect(p.files.following).toEqual({state: 'missing', url: 'https://x.org/.well-known/following.opml'});
        expect(p.files.contact).toEqual({state: 'http', url: 'https://x.org/.well-known/contact.vcf', status: 500});
        expect(p.files.feed.state).toBe('cors');
    });

    it('keeps the CORS state when the proxy can’t tell, and doesn’t ask it without CORS errors', async () => {
        const p = await loadProfile('x.org', fakeDeps({'https://x.org/.well-known/about.md': 'blocked'}));
        expect(p.files.about).toEqual({state: 'cors', url: 'https://x.org/.well-known/about.md'});
        const deps = fakeDeps({'https://x.org/.well-known/about.md': ABOUT});
        await loadProfile('x.org', deps);
        expect(deps.proxyCalls).toEqual([]);
        const down = fakeDeps({'https://x.org/.well-known/about.md': 'blocked'}, false);
        await loadProfile('x.org', down);
        expect(down.proxyCalls).toEqual([]);
    });

    it('reports a blocked feed when no feed address could be read', async () => {
        const p = await loadProfile('x.org', fakeDeps({'https://x.org/.well-known/about.md': ABOUT, 'https://x.org/rss.xml': 'blocked'}));
        expect(p.files.feed).toEqual({state: 'cors', url: 'https://x.org/rss.xml'});
    });
});
