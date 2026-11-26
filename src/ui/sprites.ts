import { brand } from '../brand.config';

/** Original pixel sprites, one per level (6 = CYBERBONKERS, crowd-only). Do not substitute existing arcade art. */
export const SPRITES: Record<number, string[]> = {
  1: ['...XXX...', '.XXXXXXX.', 'XX.X.X.XX', 'XXXXXXXXX', '..X...X..', '.X.....X.'],
  2: ['..XXXXX..', '.XXXXXXX.', 'XXX...XXX', 'XXX.X.XXX', 'XXXXXXXXX', 'X.X.X.X.X'],
  3: ['....X....', '.XXXXXXX.', '.X.XXX.X.', '.XXXXXXX.', '.XX...XX.', '.XXXXXXX.', '..X...X..'],
  4: ['..XXXXX..', '.XXXXXXX.', 'XX.XXX.XX', 'XXXXXXXXX', 'X.X.X.X.X', '.X.X.X.X.', 'X...X...X'],
  5: ['X..XXX..X', '.XXXXXXX.', 'XXX.X.XXX', 'XXXXXXXXX', '.XX.X.XX.', 'X..X.X..X', 'X.X...X.X'],
  6: ['X.X.XXX.X.X', '.XXXXXXXXX.', 'XX.XXXXX.XX', 'XXXXX.XXXXX', '.XXXXXXXXX.', 'X.XX.X.XX.X', '.X..X.X..X.'],
};
export const SHIP = ['....X....', '...XXX...', 'X..XXX..X', 'X.XXXXX.X', 'XXXXXXXXX', 'XX.X.X.XX'];

const c = brand.colors;
const LEVEL_COLORS: Record<number, string> = { 1: c.level1, 2: c.level2, 3: c.level3, 4: c.level4, 5: c.level5, 6: c.cyber };
export const levelColor = (n: number) => LEVEL_COLORS[n];
/** The six ship colours a player can pick, with the names screen readers announce. */
export const SHIP_COLORS = [c.level1, c.level2, c.level3, c.level4, c.level5, c.ship6].map((x) => x.toLowerCase());
export const SHIP_COLOR_NAMES = ['Green', 'Cyan', 'Yellow', 'Orange', 'Magenta', 'Violet'];

export function bitmap(rows: string[], color: string, px: number, extraClass = '') {
  const w = rows[0].length, h = rows.length;
  let r = '';
  rows.forEach((row, y) => [...row].forEach((ch, x) => { if (ch === 'X') r += `<rect x="${x}" y="${y}" width="1.03" height="1.03"/>`; }));
  return `<svg class="spr ${extraClass}" viewBox="0 0 ${w} ${h}" width="${w * px}" height="${h * px}" fill="${color}" shape-rendering="crispEdges" aria-hidden="true" focusable="false">${r}</svg>`;
}
const cache: Record<string, string> = {};
export const sprite = (lvl: number, px = 4) =>
  (cache[`${lvl}_${px}`] ??= bitmap(SPRITES[lvl], LEVEL_COLORS[lvl], px, lvl === 6 ? 'cyber' : ''));
export const ship = (color: string, px = 4) => bitmap(SHIP, color, px);

/** Big-screen sprites. The rocket is generic: no real company branding. */
export const MOTHERSHIP = ['........XXXXX........', '.....XXXXXXXXXXX.....', '...XXXXX.XXX.XXXXX...', '.XXXXXXXXXXXXXXXXXXX.', 'XXLXXLXXLXXLXXLXXLXXX', '.XXXXXXXXXXXXXXXXXXX.', '...XXX..XXXXX..XXX...', '....X.....X.....X....'];
export function mothershipSvg(px = 7) {
  const cols = [c.level1, c.level2, c.level3, c.level4, c.level5];
  let r = '', k = 0;
  MOTHERSHIP.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch === 'X') r += `<rect x="${x}" y="${y}" width="1.03" height="1.03" fill="#c9c3ff"/>`;
    if (ch === 'L') r += `<rect class="lt" x="${x}" y="${y}" width="1.03" height="1.03" fill="${cols[k++ % 5]}"/>`;
  }));
  const w = MOTHERSHIP[0].length, h = MOTHERSHIP.length;
  return `<svg class="spr ms-ship" viewBox="0 0 ${w} ${h}" width="${w * px}" height="${h * px}" shape-rendering="crispEdges" aria-hidden="true" focusable="false">${r}</svg>`;
}
export const ROCKET = ['T...FXXXXX....', 'TTFFXXXXXXXX..', 'TTXXXXXXOXXXXX', 'TTFFXXXXXXXX..', 'T...FXXXXX....'];
export function rocketSvg(px = 7) {
  const col: Record<string, string> = { X: '#e8f7ff', F: '#ff5f5f', O: '#00e5ff', T: '#ffe600' };
  let r = '';
  ROCKET.forEach((row, y) => [...row].forEach((ch, x) => { if (col[ch]) r += `<rect ${ch === 'T' ? 'class="fl" ' : ''}x="${x}" y="${y}" width="1.03" height="1.03" fill="${col[ch]}"/>`; }));
  return `<svg class="spr" viewBox="0 0 14 5" width="${14 * px}" height="${5 * px}" shape-rendering="crispEdges" aria-hidden="true" focusable="false">${r}</svg>`;
}
