import { addHtml, newHtml, newTxt } from './dom';

/* A small Markdown renderer for untrusted text: sodir's about.md profiles and source:markdown
   comments in Downread. It builds DOM nodes, never HTML strings, so nothing in the text can inject
   markup: raw HTML tags are dropped (their text stays), and links and images only get http(s)
   (links also mailto/tel) URLs, resolved against the base URL.

   Covers ATX and setext headings, paragraphs, hard breaks, emphasis, strong, strikethrough, code
   spans and fences, block quotes, nested lists, rules, inline/reference links and images,
   autolinks and bare URLs, and footnotes. Headings move down one level (# → h2), as the page
   around the text already has its h1. */

interface Ctx {
    base: string;
    refs: Map<string, {url: string, title?: string}>;
    notes: Map<string, string>;
    /** Footnotes in the order they are referenced. */
    noteOrder: string[];
}

const LIST_RE = /^( {0,3})([-*+]|\d{1,9}[.)])(?:([ \t]+)(.*))?$/;
const FENCE_RE = /^( {0,3})(`{3,}|~{3,})\s*([^`\s]*)/;
const HEADING_RE = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/;
const RULE_RE = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
const QUOTE_RE = /^ {0,3}>/;

/** A letter or digit of any script. Built with the constructor: Downread's frontend compiles this
 *  file for ES5, where TypeScript rejects the u flag in a literal (every browser we run on has it). */
const WORD_CHAR = new RegExp('[\\p{L}\\p{N}]', 'u');

const refKey = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();

/** A link or image URL, absolute and of a safe scheme, or undefined. */
export function safeUrl(url: string, base: string, image = false): string | undefined {
    try {
        const u = new URL(url.trim().replace(/^<(.*)>$/, '$1'), base);
        return (image ? /^https?:$/ : /^(https?|mailto|tel):$/).test(u.protocol) ? u.href : undefined;
    } catch {
        return undefined;
    }
}

/** Removes reference and footnote definitions (outside code fences) into ctx. */
function collectDefinitions(lines: string[], ctx: Ctx): string[] {
    const out: string[] = [];
    let fence: string | undefined;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const f = FENCE_RE.exec(line);
        if (f && (!fence || f[2].startsWith(fence)))
            fence = fence ? undefined : f[2];
        if (fence || f) {
            out.push(line);
            continue;
        }
        const note = /^ {0,3}\[\^([^\]]+)\]:\s*(.*)$/.exec(line);
        if (note) {
            let text = note[2];
            while (i + 1 < lines.length && /^( {2,}|\t)\S/.test(lines[i + 1]))
                text += ' ' + lines[++i].trim();
            ctx.notes.set(refKey(note[1]), text);
            continue;
        }
        const ref = /^ {0,3}\[([^\]]+)\]:\s*(<[^>]*>|\S+)(?:\s+(?:"([^"]*)"|'([^']*)'|\(([^)]*)\)))?\s*$/.exec(line);
        if (ref) {
            const key = refKey(ref[1]);
            if (!ctx.refs.has(key))
                ctx.refs.set(key, {url: ref[2], title: ref[3] ?? ref[4] ?? ref[5]});
            continue;
        }
        out.push(line);
    }
    return out;
}

/** Whether a line starts a block that ends a paragraph. */
const interrupts = (line: string) =>
    HEADING_RE.test(line) || FENCE_RE.test(line) || QUOTE_RE.test(line) || RULE_RE.test(line) || /^ {0,3}([-*+]|1[.)])[ \t]+\S/.test(line);

function renderBlocks(lines: string[], ctx: Ctx, parent: Node): void {
    let i = 0;
    while (i < lines.length) {
        const line = lines[i];
        if (!line.trim()) {
            i++;
            continue;
        }

        const fence = FENCE_RE.exec(line);
        if (fence) {
            const code: string[] = [];
            const indent = fence[1].length;
            for (i++; i < lines.length && !lines[i].trim().startsWith(fence[2]); i++)
                code.push(lines[i].replace(new RegExp(`^ {0,${indent}}`), ''));
            i++;
            parent.appendChild(newHtml('pre', {}, newHtml('code', {}, code.join('\n'))));
            continue;
        }

        const heading = HEADING_RE.exec(line);
        if (heading) {
            renderInline(heading[2] ?? '', ctx, addHtml(parent as Element, `h${Math.min(heading[1].length + 1, 6)}`));
            i++;
            continue;
        }

        if (RULE_RE.test(line)) {
            addHtml(parent as Element, 'hr');
            i++;
            continue;
        }

        if (QUOTE_RE.test(line)) {
            const quoted: string[] = [];
            for (; i < lines.length && lines[i].trim() && (QUOTE_RE.test(lines[i]) || !interrupts(lines[i])); i++)
                quoted.push(lines[i].replace(/^ {0,3}> ?/, ''));
            renderBlocks(quoted, ctx, addHtml(parent as Element, 'blockquote'));
            continue;
        }

        if (LIST_RE.test(line)) {
            i = renderList(lines, i, ctx, parent);
            continue;
        }

        if (/^( {4}|\t)/.test(line)) {
            const code: string[] = [];
            for (; i < lines.length && (/^( {4}|\t)/.test(lines[i]) || !lines[i].trim()); i++)
                code.push(lines[i].replace(/^( {4}|\t)/, ''));
            parent.appendChild(newHtml('pre', {}, newHtml('code', {}, code.join('\n').replace(/\n+$/, ''))));
            continue;
        }

        const para = [line];
        for (i++; i < lines.length && lines[i].trim() && !interrupts(lines[i]) && !/^ {0,3}(=+|-+)[ \t]*$/.test(lines[i]); i++)
            para.push(lines[i]);
        const setext = i < lines.length ? /^ {0,3}(=+|-+)[ \t]*$/.exec(lines[i]) : undefined;
        if (setext)
            i++;
        renderInline(para.map(l => l.replace(/^[ \t]+/, '')).join('\n').trim(),
            ctx, addHtml(parent as Element, setext ? (setext[1][0] == '=' ? 'h2' : 'h3') : 'p'));
    }
}

/** Renders the list that starts at lines[start]; returns the index after it. */
function renderList(lines: string[], start: number, ctx: Ctx, parent: Node): number {
    const first = LIST_RE.exec(lines[start])!;
    const ordered = /\d/.test(first[2]);
    const delimiter = first[2].slice(-1);
    const items: string[][] = [];
    let loose = false;
    let contentIndent = Infinity; // of the current item
    let i = start;
    while (i < lines.length) {
        const line = lines[i];
        const m = LIST_RE.exec(line);
        if (m && m[1].length < contentIndent && /\d/.test(m[2]) == ordered && m[2].slice(-1) == delimiter) {
            const spaces = (m[3] ?? ' ').length;
            contentIndent = m[1].length + m[2].length + (spaces > 4 ? 1 : spaces);
            items.push([m[4] ?? '']);
            i++;
            continue;
        }
        if (!line.trim()) {
            // A blank line continues the list only if indented content or another item follows.
            const next = lines.slice(i + 1).find(l => l.trim());
            const nm = next !== undefined ? LIST_RE.exec(next) : undefined;
            const continues = next !== undefined && (next.search(/\S/) >= contentIndent ||
                (nm && /\d/.test(nm[2]) == ordered && nm[2].slice(-1) == delimiter && nm[1].length < contentIndent));
            if (!continues)
                break;
            loose = true;
            items[items.length - 1].push('');
            i++;
            continue;
        }
        if (line.search(/\S/) >= contentIndent)
            items[items.length - 1].push(line.slice(contentIndent));
        else if (lines[i - 1].trim() && !interrupts(line) && !m)
            items[items.length - 1].push(line.trim()); // lazy continuation of a paragraph
        else
            break;
        i++;
    }

    const list = addHtml(parent as Element, ordered ? 'ol' : 'ul');
    const startNum = parseInt(first[2]);
    if (ordered && startNum != 1)
        list.setAttribute('start', String(startNum));
    for (const itemLines of items) {
        const li = addHtml(list, 'li');
        renderBlocks(itemLines, ctx, li);
        // Tight lists: no <p> around the items' text.
        if (!loose)
            for (const p of Array.from(li.children))
                if (p.tagName == 'P')
                    p.replaceWith(...Array.from(p.childNodes));
    }
    return i;
}

/** Index of the ] that closes the [ at `open`, or -1. */
function closingBracket(s: string, open: number): number {
    let depth = 0;
    for (let i = open; i < s.length; i++) {
        const c = s[i];
        if (c == '\\')
            i++;
        else if (c == '`') {
            const end = s.indexOf('`', i + 1);
            if (end > 0)
                i = end;
        }
        else if (c == '[')
            depth++;
        else if (c == ']' && !--depth)
            return i;
    }
    return -1;
}

const INLINE_LINK_RE = /^\(\s*(<[^>\n]*>|(?:[^\s()\\]|\\.|\([^\s()]*\))*)(?:\s+(?:"([^"]*)"|'([^']*)'|\(([^)]*)\)))?\s*\)/;

/** The link after the ] at `close` of the text s[open+1..close): inline (url "title"), full
 *  reference [ref], collapsed [] or shortcut. Returns its target and the index after it. */
function linkTarget(s: string, open: number, close: number, ctx: Ctx): {url: string, title?: string, end: number} | undefined {
    const rest = s.slice(close + 1);
    const inline = INLINE_LINK_RE.exec(rest);
    if (inline)
        return {url: inline[1].replace(/\\(.)/g, '$1'), title: inline[2] ?? inline[3] ?? inline[4], end: close + 1 + inline[0].length};
    const full = /^\[([^\]]*)\]/.exec(rest);
    const key = refKey(full?.[1] || s.slice(open + 1, close));
    const ref = ctx.refs.get(key);
    return ref ? {...ref, end: close + 1 + (full?.[0].length ?? 0)} : undefined;
}

function addLink(parent: Node, href: string | undefined, title: string | undefined, render: (a: Node) => void): void {
    if (!href) {
        render(parent);
        return;
    }
    const a = newHtml('a', {href, title, target: '_blank', rel: 'noopener nofollow ugc'});
    render(a);
    parent.appendChild(a);
}

const BARE_URL_RE = /^https?:\/\/[^\s<>"]*[^\s<>".,:;!?'")\]*_~]/;

/** Index of the delimiter run (of exactly delim's length) that closes emphasis opened by `delim`
 *  before `from`, or -1. Code spans in between are skipped. */
function closingDelimiter(s: string, from: number, delim: string): number {
    const re = new RegExp(`\`+|\\${delim[0]}+`, 'g');
    re.lastIndex = from;
    for (let m = re.exec(s); m; m = re.exec(s)) {
        if (m[0][0] == '`') {
            const end = s.indexOf(m[0], re.lastIndex);
            if (end > 0)
                re.lastIndex = end + m[0].length;
            continue;
        }
        const before = s[m.index - 1];
        const after = s[m.index + m[0].length] ?? '';
        if (m[0].length == delim.length && m.index > from && !/\s/.test(before) && before != '\\' && (delim[0] != '_' || !WORD_CHAR.test(after)))
            return m.index;
    }
    return -1;
}

function renderInline(s: string, ctx: Ctx, parent: Node): void {
    let text = '';
    const flush = () => {
        if (text)
            parent.appendChild(newTxt(text));
        text = '';
    };
    for (let i = 0; i < s.length;) {
        const c = s[i];
        const rest = s.slice(i);

        if (c == '\\' && i + 1 < s.length) {
            if (s[i + 1] == '\n') {
                flush();
                parent.appendChild(newHtml('br'));
            }
            else
                text += /[!-\/:-@\[-`{-~]/.test(s[i + 1]) ? s[i + 1] : c + s[i + 1];
            i += 2;
            continue;
        }

        if (c == '\n') {
            const hard = / {2,}$/.test(text);
            text = text.replace(/ +$/, '');
            if (hard) {
                flush();
                parent.appendChild(newHtml('br'));
            }
            else
                text += ' ';
            i++;
            continue;
        }

        if (c == '`') {
            const run = /^`+/.exec(rest)![0];
            const end = s.indexOf(run, i + run.length);
            if (end > 0 && s[end + run.length] != '`') {
                flush();
                const code = s.slice(i + run.length, end).replace(/\n/g, ' ');
                parent.appendChild(newHtml('code', {}, /^ .* $/.test(code) && code.trim() ? code.slice(1, -1) : code));
                i = end + run.length;
                continue;
            }
            text += run;
            i += run.length;
            continue;
        }

        if (c == '[' && s[i + 1] == '^') {
            const close = s.indexOf(']', i);
            const key = close > 0 ? refKey(s.slice(i + 2, close)) : '';
            if (key && ctx.notes.has(key)) {
                flush();
                if (!ctx.noteOrder.includes(key))
                    ctx.noteOrder.push(key);
                const n = ctx.noteOrder.indexOf(key) + 1;
                parent.appendChild(newHtml('sup', {}, newHtml('a', {href: `#md-fn-${n}`, class: 'md-fnref'}, String(n))));
                i = close + 1;
                continue;
            }
        }

        if (c == '[' || (c == '!' && s[i + 1] == '[')) {
            const open = c == '!' ? i + 1 : i;
            const close = closingBracket(s, open);
            const target = close > 0 ? linkTarget(s, open, close, ctx) : undefined;
            if (target) {
                flush();
                const label = s.slice(open + 1, close);
                if (c == '!') {
                    const src = safeUrl(target.url, ctx.base, true);
                    const alt = label.replace(/[\\*_`]/g, '');
                    if (src)
                        parent.appendChild(newHtml('img', {src, alt, title: target.title, loading: 'lazy', decoding: 'async'}));
                    else
                        text += alt;
                }
                else
                    addLink(parent, safeUrl(target.url, ctx.base), target.title, a => renderInline(label, ctx, a));
                i = target.end;
                continue;
            }
        }

        if (c == '<') {
            const auto = /^<((?:https?|mailto):[^\s<>]+|[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+)>/i.exec(rest);
            if (auto) {
                flush();
                const url = /^[^:]+@/.test(auto[1]) ? `mailto:${auto[1]}` : auto[1];
                addLink(parent, safeUrl(url, ctx.base), undefined, a => a.appendChild(newTxt(auto[1].replace(/^mailto:/i, ''))));
                i += auto[0].length;
                continue;
            }
            const tag = /^<\/?([a-zA-Z][\w-]*)(?:\s[^<>]*)?\/?>/.exec(rest);
            if (tag) {
                if (tag[1].toLowerCase() == 'br') {
                    flush();
                    parent.appendChild(newHtml('br'));
                }
                i += tag[0].length;
                continue;
            }
        }

        if (c == 'h' && !WORD_CHAR.test(s[i - 1] ?? '')) {
            const url = BARE_URL_RE.exec(rest);
            if (url) {
                flush();
                addLink(parent, safeUrl(url[0], ctx.base), undefined, a => a.appendChild(newTxt(url[0])));
                i += url[0].length;
                continue;
            }
        }

        if (c == '*' || c == '_' || (c == '~' && s[i + 1] == '~')) {
            const run = c == '~' ? '~~' : /^(\*+|_+)/.exec(rest)![0].slice(0, 3);
            const leftFlanking = s[i + run.length] && !/\s/.test(s[i + run.length]);
            const intraword = c == '_' && WORD_CHAR.test(s[i - 1] ?? '');
            const close = leftFlanking && !intraword ? closingDelimiter(s, i + run.length, run) : -1;
            if (close > 0) {
                flush();
                const inner = s.slice(i + run.length, close);
                const el = c == '~' ? newHtml('del') : run.length == 1 ? newHtml('em') : newHtml('strong');
                if (run.length == 3)
                    renderInline(inner, ctx, el.appendChild(newHtml('em')));
                else
                    renderInline(inner, ctx, el);
                parent.appendChild(el);
                i = close + run.length;
                continue;
            }
            text += run;
            i += run.length;
            continue;
        }

        text += c;
        i++;
    }
    flush();
}

/** Renders Markdown into a fragment. Relative links and images resolve against `base`. */
export function renderMarkdown(md: string, base: string): DocumentFragment {
    const ctx: Ctx = {base, refs: new Map(), notes: new Map(), noteOrder: []};
    const lines = collectDefinitions(md.replace(/\r\n?/g, '\n').replace(/<!--[\s\S]*?-->/g, '').split('\n'), ctx);
    const frag = document.createDocumentFragment();
    renderBlocks(lines, ctx, frag);
    if (ctx.noteOrder.length) {
        const ol = newHtml('ol', {class: 'md-notes'});
        // Notes can reference further notes, which then join the list.
        for (let n = 0; n < ctx.noteOrder.length; n++)
            renderInline(ctx.notes.get(ctx.noteOrder[n])!, ctx, addHtml(ol, 'li', {id: `md-fn-${n + 1}`}));
        frag.appendChild(ol);
    }
    return frag;
}
