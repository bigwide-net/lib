import { decodeEntities, renderSimpleHtml } from './simple-html';

const BASE = 'https://wilwheaton.net/2026/10/10126/';
const html = (s: string) => {
  const div = document.createElement('div');
  div.appendChild(renderSimpleHtml(s, BASE));
  return div.innerHTML;
};
const A = 'target="_blank" rel="noopener nofollow ugc"';

describe('renderSimpleHtml', () => {
  it('keeps p, div, br and a, without attributes but a resolved href', () => {
    expect(html('<p class="x" style="color:red">One<br/>two</p><div id="d">three <a href="/p" onclick="x()" title="t">link</a></div>'))
      .toBe(`<p>One<br>two</p><div>three <a href="https://wilwheaton.net/p" ${A}>link</a></div>`);
  });

  it('drops other tags but keeps their text', () => {
    expect(html('<p>a <b>bold</b> <img src="x.png" onerror="alert(1)"> <span style="x">c</span><h1>H</h1></p>'))
      .toBe('<p>a bold  cH</p>');
  });

  it('drops script, style and similar elements with their content', () => {
    expect(html('<p>a<script>alert("<p>x</p>")</script><style>p{color:red}</style><iframe src="x">no</iframe>b</p>'))
      .toBe('<p>ab</p>');
  });

  it('keeps only safe link targets', () => {
    expect(html('<a href="javascript:alert(1)">x</a> <a href="mailto:a@b.c">m</a> <a href=data:text/html,x>d</a>'))
      .toBe(`<a ${A}>x</a> <a href="mailto:a@b.c" ${A}>m</a> <a ${A}>d</a>`);
  });

  it('decodes character references and treats a stray < as text', () => {
    expect(html('<p>It&#8217;s &amp; &lt;b&gt; 3 &lt; 4 &#x1F609; &bogus; a < b</p>'))
      .toBe('<p>It’s &amp; &lt;b&gt; 3 &lt; 4 😉 &amp;bogus; a &lt; b</p>');
  });

  it('repairs nesting: blocks end a paragraph, links don\'t nest, stray end tags are ignored', () => {
    expect(html('<p>a<div>b</div></span></p><a href="/1">x<a href="/2">y</a>z')).toBe(
      `<p>a</p><div>b</div><a href="https://wilwheaton.net/1" ${A}>xy</a>z`);
  });

  it('skips comments, doctypes and CDATA markers', () => {
    expect(html('<!-- <p>hidden</p> --><!DOCTYPE html><p>shown</p>')).toBe('<p>shown</p>');
  });

  it('limits the nesting depth', () => {
    const div = document.createElement('div');
    div.appendChild(renderSimpleHtml('<div>'.repeat(100) + 'deep', BASE));
    expect(div.querySelectorAll('div').length).toBe(20);
    expect(div.textContent).toBe('deep');
  });
});

describe('decodeEntities', () => {
  it('rejects invalid code points', () => {
    expect(decodeEntities('&#0;&#xD800;&#x110000;')).toBe('���');
  });
});
