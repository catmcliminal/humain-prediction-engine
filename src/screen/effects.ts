import type { BoardItem, Rank } from '../shared/game';
import { burst } from '../ui/juice';
import { SFX } from '../ui/sound';
import { LEVELS } from '../shared/constants';
import { levelColor, mothershipSvg, ship } from '../ui/sprites';
import { esc, reducedMotion } from '../ui/util';

/** The mothership carries the most-backed prediction across the top. A new leader flies in. */
export function mothership(el: HTMLElement) {
  el.innerHTML = `<div class="ms-fly"><div class="ms-drift">${mothershipSvg(7)}<div class="ms-card"></div><div class="ms-flash px" aria-hidden="true">NEW LEADER</div></div></div>`;
  const fly = el.querySelector<HTMLElement>('.ms-fly')!, card = el.querySelector<HTMLElement>('.ms-card')!, flash = el.querySelector<HTMLElement>('.ms-flash')!;
  let id: string | null | undefined, html = '', next = '', busy = false;
  const set = () => { if (next !== html) { html = next; card.innerHTML = html; } };
  return (lead: BoardItem | undefined) => {
    next = lead
      ? `<h3 class="px">WILDEST SO FAR</h3><p class="ms-t">${esc(lead.text)}</p><p class="ms-m"><span style="color:${esc(lead.color)}">${esc(lead.author)}</span><b style="color:${levelColor(lead.level!)}">${LEVELS[lead.level! - 1]} ${lead.avg!.toFixed(1)} · ${lead.total} RATINGS</b></p>`
      : '<h3 class="px">MOTHERSHIP</h3><p class="ms-t dimtxt">Awaiting something unhinged. Rate predictions on your phone.</p>';
    const now = lead?.id ?? null;
    if (id === undefined || id === now || reducedMotion()) { id = now; if (!busy) set(); return; }
    id = now;
    if (busy) return;
    busy = true;
    fly.className = 'ms-fly out';
    setTimeout(() => {
      set();
      fly.className = 'ms-fly pre'; void fly.offsetWidth; fly.className = 'ms-fly in';
      flash.classList.remove('go'); void flash.offsetWidth; flash.classList.add('go');
      SFX.coin();
      setTimeout(() => { fly.className = 'ms-fly'; busy = false; set(); }, 1000);
    }, 700);
  };
}

/**
 * Each new prediction is flown across the screen by its author's ship. `find` is asked again at launch,
 * so anything hidden or flagged in the meantime never flies.
 */
export function flyer(find: (id: string) => BoardItem | undefined) {
  const queue: string[] = [];
  let busy = false;
  const launch = () => {
    const x = find(queue.shift()!);
    if (!x) { if (queue.length) launch(); else busy = false; return; }
    const ms = queue.length > 1 ? 3000 : 4600;
    const el = document.createElement('div');
    el.className = 'flyer';
    el.setAttribute('aria-hidden', 'true');
    el.style.setProperty('--sc', x.color);
    el.style.animationDuration = `${ms}ms`;
    el.innerHTML = `<div class="fl-card"><h3 class="px">INCOMING · ${esc(x.author)}</h3><p>${esc(x.text)}</p></div><div class="fl-ship">${ship(esc(x.color), 11)}</div>`;
    document.body.appendChild(el);
    SFX.laser();
    setTimeout(() => { el.remove(); if (queue.length) launch(); else busy = false; }, ms);
  };
  return {
    add(id: string) {
      if (reducedMotion()) return;
      queue.push(id);
      if (queue.length > 5) queue.shift();
      if (!busy) { busy = true; setTimeout(launch, 1200); }
    },
    clear() { queue.length = 0; document.querySelectorAll('.flyer').forEach((e) => e.remove()); },
  };
}

const STEP = 700, SETTLE = 800;

/** The top 10 counts up from the bottom, then a fanfare for the winner. */
export function results(el: HTMLElement) {
  let since = 0, drawn = '', run = 0;
  const draw = (rows: Rank[], animate: boolean) => {
    const mine = ++run;
    el.innerHTML = `<h2 class="kicker px">MYTH-BUSTER TOP 10</h2><table class="sb">${rows.map((r, i) =>
      `<tr${animate ? ` class="rise" style="animation-delay:${(rows.length - 1 - i) * STEP}ms"` : ''}><td class="r">${i + 1}</td><td class="n" style="color:${esc(r.color)}">${esc(r.name)}</td><td class="s">${animate ? 0 : r.points}</td></tr>`).join('') || '<tr><td class="dimtxt">Waiting for players</td></tr>'}</table>`;
    if (!animate) return;
    const trs = [...el.querySelectorAll('tr')];
    rows.forEach((r, i) => {
      setTimeout(() => {
        if (mine !== run) return;
        const cell = trs[i].querySelector('.s')!, start = performance.now();
        SFX.level(rows.length - 1 - i);
        const tick = (t: number) => {
          if (mine !== run) return;
          const done = Math.min(1, (t - start) / 500);
          cell.textContent = String(Math.round(r.points * done));
          if (done < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
        // A timer settles the final score even if the tab stops drawing frames.
        setTimeout(() => { if (mine === run) cell.textContent = String(r.points); }, 600);
        if (i === 0) setTimeout(() => {
          if (mine !== run) return;
          SFX.fanfare();
          trs[0].classList.add('winner');
          const b = trs[0].getBoundingClientRect();
          burst(b.left + b.width / 2, b.top + b.height / 2, ['#ffe600', '#39ff14', '#00e5ff', '#ff2bd6'], 80, 420);
        }, 650);
      }, (rows.length - 1 - i) * STEP);
    });
  };
  return {
    update(rows: Rank[], now: number) {
      since ||= now;
      if (now - since < SETTLE) return; // let the last scores arrive before counting
      const sig = JSON.stringify(rows.map((r) => [r.pid, r.points]));
      if (sig === drawn) return;
      const first = !drawn;
      drawn = sig;
      draw(rows, first && rows.length > 0 && !reducedMotion());
    },
    reset() { if (!since) return; since = 0; drawn = ''; run++; el.innerHTML = ''; },
  };
}
