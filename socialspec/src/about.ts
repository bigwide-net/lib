/** /.well-known/about.md (AboutSpec): Markdown with an optional front matter block. */
export interface About {
    /** The one-line bio (front matter `summary`). */
    summary?: string;
    /** All front matter fields, as plain strings. */
    fields: Record<string, string>;
    /** The Markdown after the front matter. */
    markdown: string;
}

const unquote = (s: string) => s.replace(/^(["'])(.*)\1$/, '$2');

/** Parses the simple YAML that front matter uses: `key: value` lines, quoted values and folded
 *  (`>`) or literal (`|`) blocks of indented lines. Lists and nested maps are skipped. */
export function parseFrontMatter(yaml: string): Record<string, string> {
    const fields: Record<string, string> = {};
    const lines = yaml.split('\n');
    for (let i = 0; i < lines.length; i++) {
        const m = /^([A-Za-z_][\w-]*)\s*:\s*(.*?)\s*$/.exec(lines[i]);
        if (!m)
            continue;
        const [, key, value] = m;
        if (!/^[>|][+-]?$/.test(value) && value) {
            fields[key] = unquote(value);
            continue;
        }
        const block: string[] = [];
        while (i + 1 < lines.length && (/^\s+\S/.test(lines[i + 1]) || !lines[i + 1].trim()))
            block.push(lines[++i].trim());
        const text = value.startsWith('|') ? block.join('\n') : block.join(' ').replace(/\s+/g, ' ');
        if (text.trim() && !block[0]?.startsWith('- '))
            fields[key] = text.trim();
    }
    return fields;
}

const FRONT_MATTER = /^---[ \t]*\n([\s\S]*?)\n(?:---|\.\.\.)[ \t]*(?:\n|$)/;

/** An about.md split into its front matter block (verbatim, with its delimiters and a final line
 *  break; '' if there is none) and the Markdown after it, so an editor can change the text and
 *  keep the rest. */
export function splitAbout(text: string): {frontMatter: string, markdown: string} {
    const md = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
    const m = FRONT_MATTER.exec(md);
    return {frontMatter: m ? m[0].replace(/\n?$/, '\n') : '', markdown: (m ? md.slice(m[0].length) : md).trim()};
}

/** The about.md of splitAbout's parts. */
export const joinAbout = (frontMatter: string, markdown: string) =>
    (frontMatter && markdown.trim() ? frontMatter + '\n' : frontMatter) + (markdown.trim() ? markdown.trim() + '\n' : '');

export function parseAbout(text: string): About {
    const {frontMatter, markdown} = splitAbout(text);
    const m = FRONT_MATTER.exec(frontMatter);
    const fields = m ? parseFrontMatter(m[1]) : {};
    return {summary: fields.summary?.trim() || undefined, fields, markdown};
}
