import { newSvg } from './dom';

// Curved "reply" arrow, shown before a post's source:inReplyTo link.
export const REPLY_SVG_PATHS = ['M6 3.5 2 7.5l4 4', 'M2.5 7.5H9a4.5 4.5 0 0 1 4.5 4.5v1'];

export function createReplySvg(size: number): SVGElement {
  return newSvg('svg', { width: size, height: size, viewBox: '0 0 16 16', fill: 'none',
    class: 'replyIcon', 'aria-hidden': 'true', style: { display: 'inline-block', verticalAlign: 'middle' } },
    REPLY_SVG_PATHS.map(d => newSvg('path', { d, stroke: 'currentColor', 'stroke-width': '1.5', fill: 'none',
      'stroke-linecap': 'round', 'stroke-linejoin': 'round' })));
}

export function createPlaySvg(size: number): SVGElement {
  return newSvg('svg', { width: size, height: size, viewBox: '0 0 24 24',
    style: { display: 'block' } }, [
    newSvg('path', { d: 'M8 5v14l11-7z', fill: 'currentColor' }),
  ]);
}

/** Downward chevron; disclosure buttons rotate it with CSS. */
export function createChevronSvg(size: number): SVGElement {
  return newSvg('svg', { width: size, height: size, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true',
    style: { display: 'inline-block', verticalAlign: 'middle' } },
    [newSvg('path', { d: 'M3.5 6 L8 10.5 L12.5 6', stroke: 'currentColor', 'stroke-width': '1.8', fill: 'none',
      'stroke-linecap': 'round', 'stroke-linejoin': 'round' })]);
}
