import { newSvg } from '../../postviewer/src/dom';

// Stroke icons on a 24×24 grid, like sodir's macros.njk.
const PATHS = {
    mail: ['M4 6h16v12H4z', 'M4 7l8 6 8-6'],
    message: ['M5 5h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H10l-4 3.5V16H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z', 'M9 10.5h.01M12 10.5h.01M15 10.5h.01'],
    phone: ['M6.5 3.5h3l1.5 4.5-2 1.5a11 11 0 0 0 5.5 5.5l1.5-2 4.5 1.5v3a2 2 0 0 1-2 2A16 16 0 0 1 4.5 5.5a2 2 0 0 1 2-2z'],
    external: ['M7 17L17 7', 'M8 7h9v9'],
    rss: ['M5 19h.01', 'M5 12a7 7 0 0 1 7 7', 'M5 5a14 14 0 0 1 14 14'],
    chat: ['M4 5h16v11H9l-5 4z'],
    link: ['M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1', 'M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1'],
    search: ['M16 16l4.5 4.5', 'M11 4.5a6.5 6.5 0 1 1 0 13 6.5 6.5 0 0 1 0-13z'],
    // A sad face for blocked profiles: worried brows, eyes, a frown and a tear.
    sad: ['M5.8 7.8l3.2-1.3', 'M18.2 7.8L15 6.5', 'M8.6 9.9a.8.8 0 1 1 0 1.6.8.8 0 0 1 0-1.6z', 'M15.4 9.9a.8.8 0 1 1 0 1.6.8.8 0 0 1 0-1.6z',
        'M8.3 17.4c2.1-1.9 5.3-1.9 7.4 0', 'M17.8 13.9c.4.6.6 1 .6 1.3a.6.6 0 0 1-1.2 0c0-.3.2-.7.6-1.3z'],
    offline: ['M3 3l18 18', 'M8.5 16.4a5 5 0 0 1 7 0', 'M5 12.9a10 10 0 0 1 4.6-2.6', 'M14.4 10.3A10 10 0 0 1 19 12.9', 'M2 9.3a15 15 0 0 1 4.3-2.7', 'M10.6 5.1A15 15 0 0 1 22 9.3', 'M12 20h.01'],
    clock: ['M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18z', 'M12 7.5V12l3 2'],
    question: ['M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18z', 'M9.6 9.4a2.5 2.5 0 1 1 3.6 2.3c-.7.4-1.2 1-1.2 1.8v.3', 'M12 17h.01'],
    alert: ['M12 3.5l9.5 16.5h-19z', 'M12 10v4.5', 'M12 17.5h.01'],
    chevron: ['M6 9l6 6 6-6'],
    reply: ['M9 14L4 9l5-5', 'M4 9h10a6 6 0 0 1 6 6v4'],
    pencil: ['M3.75 20.25l1.2-4.8L15.75 4.65a2.4 2.4 0 0 1 3.6 3.6L8.55 19.05z'],
};

export type IconName = keyof typeof PATHS;

export function icon(name: IconName, size = 20, strokeWidth = 2.2): SVGElement {
    const svg = newSvg('svg', {width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
        'stroke-width': strokeWidth, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true'});
    for (const d of PATHS[name])
        svg.appendChild(newSvg('path', {d}));
    return svg;
}
