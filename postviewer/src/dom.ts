// Minimal DOM builders (newHtml, newSvg). Kept local so the
// renderer has no framework dependency and can run in any client (React or not).

const SVGNS = 'http://www.w3.org/2000/svg';

type Attrs = Record<string, string | number | boolean | undefined | null | Record<string, string>>;
type Child = Node | string;

function newElem(ns: string | undefined, name: string, attrs?: Attrs, children?: Child | Child[]): Element {
  const e = ns ? document.createElementNS(ns, name) : document.createElement(name);
  for (const key in attrs) {
    const value = attrs[key];
    if (key == 'style' && value && typeof value == 'object')
      Object.assign((e as HTMLElement).style, value);
    else if (value != null)
      e.setAttribute(key, String(value));
  }
  for (const child of Array.isArray(children) ? children : children != null ? [children] : [])
    e.append(child);
  return e;
}

export const newHtml = (name: string, attrs?: Attrs, children?: Child | Child[]): HTMLElement =>
  newElem(undefined, name, attrs, children) as HTMLElement;

export const newTxt = (text: string): Text => document.createTextNode(text);

/** newHtml, appended to `parent`. */
export const addHtml = (parent: Element, name: string, attrs?: Attrs, children?: Child | Child[]): HTMLElement =>
  parent.appendChild(newHtml(name, attrs, children));

export const newSvg = (name: string, attrs?: Attrs, children?: Child | Child[]): SVGElement =>
  newElem(SVGNS, name, attrs, children) as SVGElement;
