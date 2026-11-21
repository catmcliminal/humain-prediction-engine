import { FEED_PAGE, LEVELS } from '../shared/constants';
import type { DerivedPrediction, GameState } from '../shared/types';
import { levelColor, sprite } from '../ui/sprites';
import { esc, radioKeys } from '../ui/util';
import { orderFeed, type Sort } from './feed';

export interface Ctx {
  s: GameState;
  preds: DerivedPrediction[];
  me: string;
  frozen: boolean;
  offline: boolean;
}

/**
 * The VOTE list. Cards are keyed and patched in place: counts change under the thumb but cards never
 * move. The order is a snapshot, refreshed only when the player changes sort, opens the tab, taps
 * LOAD MORE or taps the NEW chip. Hidden cards are removed at once.
 */
export class Feed {
  sort: Sort = 'new';
  shown = FEED_PAGE;
  private order: string[] = [];
  private cards = new Map<string, { el: HTMLElement; sig: string }>();
  private loadMore: HTMLButtonElement;
  private empty: HTMLElement;
  private chip: HTMLButtonElement;
  newCount = 0;

  constructor(private list: HTMLElement, private emptyEl: HTMLElement, chip: HTMLButtonElement, more: HTMLButtonElement) {
    this.loadMore = more;
    this.empty = emptyEl;
    this.chip = chip;
  }

  /** Take a fresh snapshot of the order (sort change, tab open, LOAD MORE, NEW chip). */
  refresh(c: Ctx) {
    this.order = orderFeed(c.preds, this.sort, c.me, c.s.ratings);
    this.update(c);
  }

  update(c: Ctx) {
    const byId = new Map(c.preds.map((p) => [p.id, p]));
    const have = new Set(this.order);
    const fresh = orderFeed(c.preds, this.sort, c.me, c.s.ratings);
    this.newCount = fresh.filter((id) => !have.has(id)).length;
    if (!this.order.length && this.newCount) { this.order = fresh; this.newCount = 0; } // first fill
    // Hidden / removed cards vanish immediately; everything else keeps its place.
    const ids = this.order.filter((id) => byId.has(id));
    const visible = ids.slice(0, this.shown);
    const more = ids.length - visible.length;

    const focused = document.activeElement as HTMLElement | null;
    const keep = focused && this.list.contains(focused)
      ? { id: focused.dataset.id, act: focused.dataset.act, n: focused.dataset.n } : null;

    const wanted = new Set(visible);
    for (const [id, v] of this.cards) if (!wanted.has(id)) { v.el.remove(); this.cards.delete(id); }
    visible.forEach((id, i) => {
      const p = byId.get(id)!;
      const sig = signature(p, c);
      let v = this.cards.get(id);
      if (!v || v.sig !== sig) {
        const el = document.createElement('div');
        el.className = 'vc-wrap';
        el.innerHTML = cardHtml(p, c);
        el.querySelectorAll<HTMLElement>('[role=radiogroup]').forEach(radioKeys);
        const old = v?.el;
        v = { el, sig };
        this.cards.set(id, v);
        if (old?.parentNode) old.replaceWith(el);
      }
      if (this.list.children[i] !== v.el) this.list.insertBefore(v.el, this.list.children[i] ?? null);
    });
    if (keep && !this.list.contains(document.activeElement)) {
      const sel = `[data-id="${CSS.escape(keep.id ?? '')}"]` + (keep.act ? `[data-act="${keep.act}"]` : '') + (keep.n ? `[data-n="${keep.n}"]` : '');
      this.list.querySelector<HTMLElement>(sel)?.focus();
    }
    this.empty.hidden = visible.length > 0;
    this.empty.innerHTML = emptyText(this.sort);
    this.loadMore.hidden = more <= 0;
    this.loadMore.textContent = `LOAD ${Math.min(more, FEED_PAGE)} MORE`;
    this.chip.hidden = this.newCount === 0;
    this.chip.textContent = `↑ ${this.newCount} NEW`;
  }
}

const emptyText = (sort: Sort) =>
  sort === 'unrated' ? 'ALL RATED.<br>NICE SHOOTING.' : 'NO PREDICTIONS YET.<br>FIRE THE FIRST ONE.';

function signature(p: DerivedPrediction, c: Ctx) {
  const me = c.me;
  return [
    p.votes, p.downs, p.nr, p.crowd, p.row, p.lvup, p.reclass, p.points, !!c.s.scrubbed[p.id],
    !!c.s.votes[p.id]?.[me], !!c.s.downs[p.id]?.[me], c.s.ratings[p.id]?.[me] ?? 0,
    c.s.players[p.pid]?.name, c.frozen, c.offline,
  ].join('|');
}

export function cardHtml(p: DerivedPrediction, c: Ctx) {
  const { s, me } = c;
  const pl = s.players[p.pid];
  const mine = p.pid === me;
  const iv = !!s.votes[p.id]?.[me], idn = !!s.downs[p.id]?.[me], myR = s.ratings[p.id]?.[me];
  const col = levelColor(p.row);
  const dis = c.offline ? ' disabled' : '';
  const controls = mine
    ? `<div class="vc-mine px">YOUR SHIP · ${p.votes} ▲ · ${p.points.toLocaleString('en-AU')} PTS</div>`
    : c.frozen
      ? `<div class="vc-mine px dimtxt">${p.votes} ▲ · ${p.points.toLocaleString('en-AU')} PTS</div>`
      : `<div class="vc-a">
          <div class="vc-btns">
            <button class="up${iv ? ' on' : ''}" data-act="vote" data-id="${esc(p.id)}" aria-pressed="${iv}" aria-label="Upvote, ${p.votes} ${p.votes === 1 ? 'vote' : 'votes'}"${dis}>▲ ${p.votes}</button>
            <button class="dn${idn ? ' on' : ''}" data-act="down" data-id="${esc(p.id)}" aria-pressed="${idn}" aria-label="Shoot down as boring, ${p.downs} ${p.downs === 1 ? 'shoot-down' : 'shoot-downs'}"${dis}>⌖ ${p.downs}</button>
          </div>
          <div class="rate">
            <span class="px" id="rl-${esc(p.id)}">HOW UNHINGED?</span>
            <div class="rbtns" role="radiogroup" aria-labelledby="rl-${esc(p.id)}">${[1, 2, 3, 4, 5, 6].map((n) =>
              `<button role="radio" aria-checked="${myR === n}" data-act="rate" data-id="${esc(p.id)}" data-n="${n}" style="--rc:${levelColor(n)}" class="${n === 6 ? 'r6 ' : ''}${myR === n ? 'on' : ''}" aria-label="${n === 6 ? 'Rate 6 of 6, CYBERBONKERS' : `Rate unhinged ${n} of 6`}"${dis}>${n === 6 ? 'CB!' : n}</button>`).join('')}</div>
            <div class="rname px">${myR ? 'YOU SAID: ' + LEVELS[myR].name : '6 = CYBERBONKERS'}</div>
          </div>
        </div>`;
  return `<article class="vc${p.lvup ? ' lvup' : ''}" style="border-left-color:${col}">
    <div class="vc-h">${sprite(p.row, 3)}<span class="lv px${p.row === 6 ? ' cybertxt' : ''}" style="color:${col}">${LEVELS[p.row].name}</span>${p.lvup ? '<span class="lvbadge px">★ LVL UP</span>' : ''}${p.reclass ? '<span class="rc">RECLASSIFIED</span>' : ''}${s.scrubbed[p.id] ? '<span class="scrubtag px">SCRUBBED</span>' : ''}</div>
    <p class="vc-t">${esc(p.text)}</p>
    <div class="vc-m">by <b style="color:${esc(pl?.color)};font-weight:normal">${esc(pl?.name || '???')}</b> · tagged ${p.tag}${p.nr ? ` · crowd ${(p.crowd as number).toFixed(1)} (${p.nr})` : ''}</div>
    ${controls}
  </article>`;
}
