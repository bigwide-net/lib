import { renderMarkdown, safeUrl } from './markdown';

const BASE = 'https://www.manton.org/';
const html = (md: string) => {
    const div = document.createElement('div');
    div.appendChild(renderMarkdown(md, BASE));
    return div.innerHTML;
};
const LINK = 'target="_blank" rel="noopener nofollow ugc"';

describe('renderMarkdown', () => {
    it('renders headings one level down, paragraphs and rules', () => {
        expect(html('# Title\n\n### About Jordan\nI’m an outdoor enthusiast.\nSecond line.\n\n---\n\nEnd'))
            .toBe('<h2>Title</h2><h4>About Jordan</h4><p>I’m an outdoor enthusiast. Second line.</p><hr><p>End</p>');
    });

    it('renders setext headings', () => {
        expect(html('Big\n===\n\nSmall\n---')).toBe('<h2>Big</h2><h3>Small</h3>');
    });

    it('renders emphasis, strong, strikethrough and code', () => {
        expect(html('*em* **strong** ***both*** _u_ __uu__ ~~del~~ `a*b*` snake_case_name 2*3*4'))
            .toBe('<p><em>em</em> <strong>strong</strong> <strong><em>both</em></strong> <em>u</em> <strong>uu</strong> <del>del</del> <code>a*b*</code> snake_case_name 2<em>3</em>4</p>');
        expect(html('*a **b** c*')).toBe('<p><em>a <strong>b</strong> c</em></p>');
    });

    it('renders inline, reference and auto links, resolved against the site', () => {
        expect(html('[Micro.blog](https://micro.blog/) and [podcasts](/podcasts/ "Pods")'))
            .toBe(`<p><a href="https://micro.blog/" ${LINK}>Micro.blog</a> and <a href="https://www.manton.org/podcasts/" title="Pods" ${LINK}>podcasts</a></p>`);
        expect(html('See [my startup] and [acquired][acq].\n\n[my startup]: https://sensu.io\n[acq]: <https://example.com/news> "News"'))
            .toBe(`<p>See <a href="https://sensu.io/" ${LINK}>my startup</a> and <a href="https://example.com/news" title="News" ${LINK}>acquired</a>.</p>`);
        expect(html('Mail <manton@micro.blog> or visit https://micro.blog/help.'))
            .toBe(`<p>Mail <a href="mailto:manton@micro.blog" ${LINK}>manton@micro.blog</a> or visit <a href="https://micro.blog/help" ${LINK}>https://micro.blog/help</a>.</p>`);
    });

    it('drops unsafe URLs and raw HTML, keeping the text', () => {
        expect(html('[click](javascript:alert(1)) <script>alert(2)</script><b onclick="x()">bold</b> ![x](data:image/png;base64,AAA)'))
            .toBe('<p>click alert(2)bold x</p>');
        expect(html('<!-- hidden -->Visible<br>next')).toBe('<p>Visible<br>next</p>');
    });

    it('renders images', () => {
        expect(html('![Jordan](/img/me.png "Me")')).toBe('<p><img src="https://www.manton.org/img/me.png" alt="Jordan" title="Me" loading="lazy" decoding="async"></p>');
    });

    it('renders tight and loose lists, nested and ordered', () => {
        expect(html('* Tech\n* Automation\n  - Linux\n  - macOS\n* Done')).toBe('<ul><li>Tech</li><li>Automation<ul><li>Linux</li><li>macOS</li></ul></li><li>Done</li></ul>');
        expect(html('3. a\n\n4. b\n\nAfter')).toBe('<ol start="3"><li><p>a</p></li><li><p>b</p></li></ol><p>After</p>');
        expect(html('- one\nlazy\n- two')).toBe('<ul><li>one lazy</li><li>two</li></ul>');
        expect(html('- a\n1. b')).toBe('<ul><li>a</li></ul><ol><li>b</li></ol>');
    });

    it('renders quotes and code blocks', () => {
        expect(html('> Quote\n> **two**\n\n```js\nconst a = 1 < 2;\n```\n\n    indented')).toBe(
            '<blockquote><p>Quote <strong>two</strong></p></blockquote><pre><code>const a = 1 &lt; 2;</code></pre><pre><code>indented</code></pre>');
    });

    it('keeps definitions inside code', () => {
        expect(html('```\n[a]: https://x.org\n```')).toBe('<pre><code>[a]: https://x.org</code></pre>');
    });

    it('renders hard breaks and escapes', () => {
        expect(html('one  \ntwo\\\nthree \\*not em\\*')).toBe('<p>one<br>two<br>three *not em*</p>');
    });

    it('renders footnotes in order of use', () => {
        expect(html('Gadgets [^1] and more[^b].\n\n[^b]: Second.\n[^1]: First [link](/x).'))
            .toBe('<p>Gadgets <sup><a href="#md-fn-1" class="md-fnref">1</a></sup> and more<sup><a href="#md-fn-2" class="md-fnref">2</a></sup>.</p>' +
                `<ol class="md-notes"><li id="md-fn-1">First <a href="https://www.manton.org/x" ${LINK}>link</a>.</li><li id="md-fn-2">Second.</li></ol>`);
    });

    it('leaves unknown references as text', () => {
        expect(html('[not a link] and [x][y]')).toBe('<p>[not a link] and [x][y]</p>');
    });
});

describe('safeUrl', () => {
    it('allows mailto and tel for links only', () => {
        expect(safeUrl('mailto:a@b.org', BASE)).toBe('mailto:a@b.org');
        expect(safeUrl('mailto:a@b.org', BASE, true)).toBeUndefined();
        expect(safeUrl('vbscript:x', BASE)).toBeUndefined();
    });
});
