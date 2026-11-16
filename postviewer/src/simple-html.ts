import { newHtml, newTxt } from './dom';
import { safeUrl } from './markdown';

/* A renderer for the simplest HTML, for untrusted text such as comment bodies from WordPress
   comment feeds. Like markdown.ts it builds DOM nodes, never HTML strings, and has its own small
   tokenizer, so nothing in the text can inject markup.

   Only <p>, <div>, <br> and <a href> are kept, without any attributes but a link's href (http(s),
   mailto or tel, resolved against the base URL). Every other tag is dropped and its text kept,
   except for elements whose content is not text (script, style, ...), which are dropped whole.
   Character references are decoded. */

/** Elements whose whole content is dropped, not just the tags. */
const DROP_CONTENT = new Set(['script', 'style', 'template', 'noscript', 'textarea', 'title', 'iframe', 'object', 'svg', 'math', 'head', 'select']);

/** Deeper nesting is flattened into the innermost kept element. */
const MAX_DEPTH = 20;

const NAMED_ENTITIES: Record<string, string> = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
    hellip: '…', mdash: '—', ndash: '–', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”',
    laquo: '«', raquo: '»', bull: '•', middot: '·', copy: '©', reg: '®', trade: '™',
    euro: '€', pound: '£', yen: '¥', cent: '¢', deg: '°', times: '×', divide: '÷',
    shy: '­', zwj: '‍', zwnj: '‌', thinsp: ' ', ensp: ' ', emsp: ' ',
};

/** Decodes numeric and the common named character references; unknown ones stay as they are. */
export function decodeEntities(s: string): string {
    return s.replace(/&(#\d{1,7}|#[xX][\da-fA-F]{1,6}|[a-zA-Z]{2,8});/g, (ref, body: string) => {
        if (body[0] != '#')
            return NAMED_ENTITIES[body] ?? ref;
        const code = body[1] == 'x' || body[1] == 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
        // Not NUL, not a surrogate, within Unicode.
        return code > 0 && code <= 0x10ffff && (code < 0xd800 || code > 0xdfff) ? String.fromCodePoint(code) : '�';
    });
}

/** The value of attribute `name` in a tag's attribute text, decoded. */
function attr(attrs: string, name: string): string | undefined {
    const m = new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'=<>\`]+))`, 'i').exec(attrs);
    return m ? decodeEntities(m[1] ?? m[2] ?? m[3]) : undefined;
}

/** A start or end tag at lastIndex (sticky; built with the constructor because Downread's frontend
 *  compiles this file for ES5, where TypeScript rejects the y flag in a literal). */
const TAG_RE = new RegExp(String.raw`<(\/?)([a-zA-Z][\w:-]*)((?:\s+[^\s"'>\/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>\x60]+))?)*)\s*\/?>`, 'y');

/** Renders simple HTML into a fragment. Relative links resolve against `base`. */
export function renderSimpleHtml(html: string, base: string): DocumentFragment {
    const frag = document.createDocumentFragment();
    // The open kept elements; stack[0] is the fragment.
    const stack: { name: string, node: Node }[] = [{ name: '', node: frag }];
    const top = () => stack[stack.length - 1].node;
    const isOpen = (name: string) => stack.some(e => e.name == name);
    const close = (name: string) => {
        const i = stack.map(e => e.name).lastIndexOf(name);
        if (i > 0)
            stack.length = i;
    };
    let text = '';
    const flush = () => {
        if (text)
            top().appendChild(newTxt(decodeEntities(text)));
        text = '';
    };

    for (let i = 0; i < html.length;) {
        if (html[i] != '<') {
            const next = html.indexOf('<', i);
            text += html.slice(i, next < 0 ? html.length : next);
            i = next < 0 ? html.length : next;
            continue;
        }
        if (html.startsWith('<!--', i)) {
            const end = html.indexOf('-->', i + 4);
            i = end < 0 ? html.length : end + 3;
            continue;
        }
        if (/^<[!?]/.test(html.slice(i, i + 2))) { // doctype, CDATA, processing instruction
            const end = html.indexOf('>', i);
            i = end < 0 ? html.length : end + 1;
            continue;
        }
        TAG_RE.lastIndex = i;
        const tag = TAG_RE.exec(html);
        if (!tag) { // a lone '<' is text
            text += '<';
            i++;
            continue;
        }
        i = TAG_RE.lastIndex;
        const closing = !!tag[1];
        const name = tag[2].toLowerCase();

        if (DROP_CONTENT.has(name)) {
            if (!closing) {
                const end = html.toLowerCase().indexOf(`</${name}`, i);
                const gt = end < 0 ? -1 : html.indexOf('>', end);
                i = gt < 0 ? html.length : gt + 1;
            }
            continue;
        }
        if (name == 'br') {
            flush();
            top().appendChild(newHtml('br'));
            continue;
        }
        if (name != 'p' && name != 'div' && name != 'a')
            continue;

        flush();
        if (closing) {
            close(name);
            continue;
        }
        // A block ends an open paragraph (a <p> can't contain one); links don't nest.
        if (name != 'a' && stack[stack.length - 1].name == 'p')
            close('p');
        if ((name == 'a' && isOpen('a')) || stack.length > MAX_DEPTH)
            continue;
        const href = name == 'a' ? attr(tag[3], 'href') : undefined;
        const el = name == 'a'
            ? newHtml('a', { href: href && safeUrl(href, base), target: '_blank', rel: 'noopener nofollow ugc' })
            : newHtml(name);
        top().appendChild(el);
        stack.push({ name, node: el });
    }
    flush();
    return frag;
}
