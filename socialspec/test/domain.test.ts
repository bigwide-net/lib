import { bareHost, handleOf, hostOf, httpUrl, parseDomain } from '../src/domain';

describe('parseDomain', () => {
    it.each([
        ['manton.org', 'manton.org'],
        ['  Manton.ORG ', 'manton.org'],
        ['@manton.org', 'manton.org'],
        ['https://www.manton.org/about/', 'www.manton.org'],
        ['http://example.com:8080/x?y', 'example.com'],
        ['example.com/path', 'example.com'],
        ['sub.domain.co.uk.', 'sub.domain.co.uk'],
        ['bücher.de', 'xn--bcher-kva.de'],
    ])('%s → %s', (input, host) => expect(parseDomain(input)).toBe(host));

    it.each(['', '   ', 'localhost', '127.0.0.1', 'not a domain', 'exa_mple.com', 'example.123', undefined, null])('rejects %p', input =>
        expect(parseDomain(input as any)).toBeUndefined());
});

describe('helpers', () => {
    it('strips www for handles', () => {
        expect(bareHost('www.manton.org')).toBe('manton.org');
        expect(handleOf('www.manton.org')).toBe('@manton.org');
    });

    it('hostOf only takes http(s) URLs', () => {
        expect(hostOf('https://Herd.works/blog')).toBe('herd.works');
        expect(hostOf('ftp://example.com')).toBeUndefined();
        expect(hostOf('nonsense')).toBeUndefined();
        expect(hostOf(undefined)).toBeUndefined();
    });

    it('httpUrl resolves relative URLs and refuses other schemes', () => {
        expect(httpUrl('/podcasts/', 'https://www.manton.org/')).toBe('https://www.manton.org/podcasts/');
        expect(httpUrl('javascript:alert(1)', 'https://x.org/')).toBeUndefined();
        expect(httpUrl(undefined)).toBeUndefined();
    });
});
