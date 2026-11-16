import { joinAbout, parseAbout, parseFrontMatter, splitAbout } from '../src/about';

describe('parseAbout', () => {
    it('reads the summary from the front matter', () => {
        const a = parseAbout('---\nsummary: Eager explorer, eternal optimist.\n---\n\n### About me\n\nHi.\n');
        expect(a.summary).toBe('Eager explorer, eternal optimist.');
        expect(a.markdown).toBe('### About me\n\nHi.');
    });

    it('works without front matter', () => {
        const a = parseAbout('I created [Micro.blog](https://micro.blog/).\n\n---\n\nMore.');
        expect(a.summary).toBeUndefined();
        expect(a.fields).toEqual({});
        expect(a.markdown).toContain('---');
    });

    it('handles CRLF, BOM and other fields', () => {
        const a = parseAbout('﻿---\r\ncreated_at: 2024-12-31T15:22:00-08:00\r\ntitle: "About Me"\r\nlayout: post\r\n---\r\nText');
        expect(a.fields).toEqual({created_at: '2024-12-31T15:22:00-08:00', title: 'About Me', layout: 'post'});
        expect(a.summary).toBeUndefined();
        expect(a.markdown).toBe('Text');
    });
});

describe('splitAbout / joinAbout', () => {
    it('keeps the front matter verbatim and edits only the text', () => {
        const text = '---\nsummary: Eager explorer.\ntitle: "About Me"\n---\n\n### About me\n\nHi.\n';
        const {frontMatter, markdown} = splitAbout(text);
        expect(frontMatter).toBe('---\nsummary: Eager explorer.\ntitle: "About Me"\n---\n');
        expect(markdown).toBe('### About me\n\nHi.');
        expect(joinAbout(frontMatter, markdown)).toBe(text);
        expect(joinAbout(frontMatter, 'New text.  ')).toBe('---\nsummary: Eager explorer.\ntitle: "About Me"\n---\n\nNew text.\n');
    });

    it('works without front matter, and for empty texts', () => {
        expect(splitAbout('Just text\r\n')).toEqual({frontMatter: '', markdown: 'Just text'});
        expect(joinAbout('', 'Just text')).toBe('Just text\n');
        expect(joinAbout('', '  ')).toBe('');
        expect(joinAbout('---\nsummary: x\n---\n', '')).toBe('---\nsummary: x\n---\n');
        // A front matter block ending the file gets its line break.
        expect(splitAbout('---\nsummary: x\n---')).toEqual({frontMatter: '---\nsummary: x\n---\n', markdown: ''});
    });
});

describe('parseFrontMatter', () => {
    it('reads folded and literal blocks and skips lists', () => {
        expect(parseFrontMatter("summary: >\n  Two\n  lines\nnote: |\n  a\n  b\ntags:\n  - x\n  - y\nq: 'single'")).toEqual({
            summary: 'Two lines', note: 'a\nb', q: 'single',
        });
    });
});
