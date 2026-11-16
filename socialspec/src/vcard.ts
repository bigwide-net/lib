import { httpUrl } from './domain';

/** /.well-known/contact.vcf (ContactSpec): a vCard 3.0 or 4.0. */
export interface ContactEntry {
    kind: 'email' | 'tel' | 'url' | 'impp' | 'social';
    value: string;
    /** "Personal", "Work", "Signal"... from an X-ABLabel of the property's group or its TYPE. */
    label?: string;
    /** TYPE=pref (3.0) or PREF=n (4.0). */
    pref: boolean;
    /** A link that acts on it (mailto:, tel:, https:...), if it has a safe one. */
    href?: string;
}

export interface Contact {
    name?: string;
    nickname?: string;
    org?: string;
    title?: string;
    entries: ContactEntry[];
}

interface Property {
    group?: string;
    name: string;
    params: Record<string, string[]>;
    value: string;
}

// Schemes of IMPP and social profile values that may become links.
const SAFE_SCHEMES = /^(https?|mailto|tel|sms|xmpp|sip|matrix|signal|skype):/i;
// Types that say nothing to a reader.
const IGNORED_TYPES = new Set(['pref', 'internet', 'voice', 'x400', 'other']);

const unescape = (s: string) => s.replace(/\\([nN,;:\\])/g, (_, c) => c == 'n' || c == 'N' ? '\n' : c);

/** "Personal", or the name of an Apple label such as _$!<HomePage>!$_. */
const cleanLabel = (s: string) => s.replace(/^_\$!<(.*)>!\$_$/, '$1').replace(/([a-z])([A-Z])/g, '$1 $2');

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

function parseParams(s: string): Record<string, string[]> {
    const params: Record<string, string[]> = {};
    for (const [p] of Array.from(s.matchAll(/(?:[^;"]|"[^"]*")+/g))) {
        const eq = p.indexOf('=');
        // vCard 2.1 style: a bare value is a type (EMAIL;PREF;INTERNET:...)
        const name = eq < 0 ? 'TYPE' : p.slice(0, eq).toUpperCase();
        const values = eq < 0 ? [p] : p.slice(eq + 1).split(',').map(v => v.replace(/^"(.*)"$/, '$1'));
        (params[name] ??= []).push(...values);
    }
    return params;
}

function parseProperties(text: string): Property[] | undefined {
    // Unfold: a line break followed by a space or tab continues the line.
    const lines = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n').replace(/\n[ \t]/g, '').split('\n');
    const begin = lines.findIndex(l => /^BEGIN:VCARD\s*$/i.test(l));
    if (begin < 0)
        return undefined;
    const props: Property[] = [];
    for (const line of lines.slice(begin + 1)) {
        if (/^END:VCARD\s*$/i.test(line))
            break;
        const m = /^(?:([\w-]+)\.)?([\w-]+)((?:;(?:[^:;"]|"[^"]*")*)*):(.*)$/.exec(line);
        if (m)
            props.push({group: m[1]?.toLowerCase(), name: m[2].toUpperCase(), params: parseParams(m[3].slice(1)), value: m[4]});
    }
    return props;
}

const telHref = (tel: string) => {
    const digits = tel.replace(/[^\d+]/g, '');
    return digits.length > 2 ? `tel:${digits}` : undefined;
};

/** Parses the first vCard of a file; undefined if there is none. */
export function parseVcard(text: string): Contact | undefined {
    const props = parseProperties(text);
    if (!props)
        return undefined;
    const labels = new Map<string, string>();
    for (const p of props)
        if (p.name == 'X-ABLABEL' && p.group)
            labels.set(p.group, cleanLabel(unescape(p.value).trim()));

    const contact: Contact = {entries: []};
    const add = (p: Property, kind: ContactEntry['kind'], value: string, href: string | undefined, typeLabel?: string) => {
        const types = (p.params.TYPE ?? []).map(t => t.toLowerCase());
        const label = (p.group && labels.get(p.group)) || typeLabel ||
            types.filter(t => !IGNORED_TYPES.has(t)).map(capitalize).join(', ') || undefined;
        if (value)
            contact.entries.push({kind, value, label, pref: types.includes('pref') || !!p.params.PREF, href});
    };

    for (const p of props) {
        const value = unescape(p.value).trim();
        switch (p.name) {
            case 'FN': contact.name ||= value; break;
            case 'N': {
                const [family, given] = value.split(';');
                contact.name ||= [given, family].filter(Boolean).join(' ') || undefined;
                break;
            }
            case 'NICKNAME': contact.nickname ||= value.split(',')[0].trim() || undefined; break;
            case 'ORG': contact.org ||= value.split(';').filter(Boolean).join(', ') || undefined; break;
            case 'TITLE': contact.title ||= value || undefined; break;
            case 'EMAIL': add(p, 'email', value.replace(/^mailto:/i, ''), `mailto:${value.replace(/^mailto:/i, '')}`); break;
            case 'TEL': add(p, 'tel', value.replace(/^tel:/i, ''), telHref(value.replace(/^tel:/i, ''))); break;
            case 'URL': {
                const href = httpUrl(/^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`);
                add(p, 'url', value.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, ''), href);
                break;
            }
            case 'IMPP': {
                const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(value)?.[1];
                add(p, 'impp', value.replace(/^[a-z][a-z0-9+.-]*:/i, ''), SAFE_SCHEMES.test(value) ? value : undefined, scheme && capitalize(scheme));
                break;
            }
            case 'X-SOCIALPROFILE': {
                const user = p.params['X-USER']?.[0];
                const service = p.params.TYPE?.find(t => t.toLowerCase() != 'pref');
                add(p, 'social', user || value, httpUrl(value) ?? (SAFE_SCHEMES.test(value) ? value : undefined), service);
                break;
            }
        }
    }
    return contact;
}

/** The preferred email address, or the first. */
export const preferredEmail = (c: Contact | undefined) =>
    c?.entries.find(e => e.kind == 'email' && e.pref) ?? c?.entries.find(e => e.kind == 'email');
