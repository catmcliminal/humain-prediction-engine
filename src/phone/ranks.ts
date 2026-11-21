import { levelColor, sprite } from '../ui/sprites';
import { esc, pad } from '../ui/util';
import { LEVELS } from '../shared/constants';
import type { derive } from '../shared/game';
import { rankText } from './feed';

type Derived = ReturnType<typeof derive>;
const row = (b: Derived['board'][number], i: number, me: string) =>
  `<tr class="${b.pid === me ? 'me' : ''}"><td class="r">${i + 1}</td><td><span style="color:${esc(b.color)}" aria-hidden="true">■</span> ${esc(b.name)}</td><td class="s">${pad(b.score)}</td></tr>`;

export function ranksHtml(d: Derived, me: string) {
  const mine = d.preds.filter((p) => p.pid === me).sort((a, b) => b.points - a.points);
  const rank = d.board.findIndex((b) => b.pid === me) + 1;
  const top = d.board.slice(0, 20);
  return `<h2 class="sect" id="ranks-h" tabindex="-1">HIGH SCORES · YOU ARE ${rankText(rank)}</h2>
    <table class="hs"><caption class="sr-only">High scores</caption>${top.map((b, i) => row(b, i, me)).join('')}${
      rank > 20 && rank <= 100 ? `<tr><td colspan="3" class="gap" aria-hidden="true">...</td></tr>${row(d.board[rank - 1], rank - 1, me)}`
      : rank > 100 ? `<tr><td colspan="3" class="gap" aria-hidden="true">...</td></tr><tr class="me"><td class="r">100+</td><td><span style="color:${esc(d.board[rank - 1].color)}" aria-hidden="true">■</span> ${esc(d.board[rank - 1].name)}</td><td class="s">${pad(d.board[rank - 1].score)}</td></tr>` : ''}</table>
    <h3 class="sect">YOUR FLEET</h3>
    ${mine.length ? mine.map((p) => `<article class="vc${p.lvup ? ' lvup' : ''}" style="border-left-color:${levelColor(p.row)}"><div class="vc-h">${sprite(p.row, 3)}<span class="lv px" style="color:${levelColor(p.row)}">${LEVELS[p.row].name}</span>${p.reclass ? '<span class="rc">RECLASSIFIED</span>' : ''}</div><p class="vc-t">${esc(p.text)}</p><div class="vc-mine px">${p.votes} ▲ · ${p.points.toLocaleString('en-AU')} PTS</div></article>`).join('') : '<p class="empty">Nothing fired yet.</p>'}`;
}
