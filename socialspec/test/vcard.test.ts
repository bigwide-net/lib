import { parseVcard, preferredEmail } from '../src/vcard';

const CALEB = `BEGIN:VCARD\r
VERSION:3.0\r
FN:Caleb Hailey\r
NICKNAME:@calebhailey.com\r
N:;;;;\r
htcontact1.EMAIL;TYPE=PREF:me@calebhailey.com\r
htcontact1.X-ABLabel:Personal\r
X-SOCIALPROFILE;TYPE=Signal;X-USER=calebhailey.01:x-apple:calebhailey.01\r
X-SOCIALPROFILE;TYPE=iMessage;X-USER=me@calebhailey.com:x-apple:me@calebhai\r
 ley.com\r
htcontact5.URL:https://calebhailey.com/\r
htcontact5.X-ABLabel:Website\r
END:VCARD\r
`;

describe('parseVcard', () => {
    it('parses an Apple-style vCard 3.0 with groups, labels and folded lines', () => {
        const c = parseVcard(CALEB)!;
        expect(c.name).toBe('Caleb Hailey');
        expect(c.nickname).toBe('@calebhailey.com');
        expect(c.entries).toEqual([
            {kind: 'email', value: 'me@calebhailey.com', label: 'Personal', pref: true, href: 'mailto:me@calebhailey.com'},
            {kind: 'social', value: 'calebhailey.01', label: 'Signal', pref: false, href: undefined},
            {kind: 'social', value: 'me@calebhailey.com', label: 'iMessage', pref: false, href: undefined},
            {kind: 'url', value: 'calebhailey.com', label: 'Website', pref: false, href: 'https://calebhailey.com/'},
        ]);
    });

    it('parses vCard 4.0 PREF and types', () => {
        const c = parseVcard('BEGIN:VCARD\nVERSION:4.0\nFN:Jordan Doe\nEMAIL;TYPE=work:work@jd.com\nEMAIL;PREF=1:hello@jordandoe.com\nTEL;TYPE=cell,voice:+49 151 2345 678\nURL:jordandoe.com\nIMPP:xmpp:jd@jabber.org\nEND:VCARD')!;
        expect(preferredEmail(c)?.value).toBe('hello@jordandoe.com');
        expect(c.entries[0]).toMatchObject({kind: 'email', label: 'Work', pref: false});
        expect(c.entries[2]).toMatchObject({kind: 'tel', label: 'Cell', href: 'tel:+491512345678'});
        expect(c.entries[3]).toMatchObject({kind: 'url', value: 'jordandoe.com', href: 'https://jordandoe.com/'});
        expect(c.entries[4]).toMatchObject({kind: 'impp', value: 'jd@jabber.org', label: 'Xmpp', href: 'xmpp:jd@jabber.org'});
    });

    it('takes the name from N without FN, unescapes values and reads ORG/TITLE', () => {
        const c = parseVcard('BEGIN:VCARD\nVERSION:3.0\nN:Doe;Jordan;;;\nORG:Acme\\, Inc.;Labs\nTITLE:Chief\\nExplorer\nEND:VCARD')!;
        expect(c.name).toBe('Jordan Doe');
        expect(c.org).toBe('Acme, Inc., Labs');
        expect(c.title).toBe('Chief\nExplorer');
    });

    it('refuses unsafe link schemes', () => {
        const c = parseVcard('BEGIN:VCARD\nURL:javascript:alert(1)\nIMPP:x-evil:foo\nEND:VCARD')!;
        expect(c.entries.map(e => e.href)).toEqual([undefined, undefined]);
    });

    it('falls back to the first email when none is preferred', () => {
        expect(preferredEmail(parseVcard('BEGIN:VCARD\nEMAIL:a@b.org\nEND:VCARD'))?.value).toBe('a@b.org');
        expect(preferredEmail(undefined)).toBeUndefined();
    });

    it('returns undefined for something else', () => {
        expect(parseVcard('<!doctype html><p>hi')).toBeUndefined();
    });
});
