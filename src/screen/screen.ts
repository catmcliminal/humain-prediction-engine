import qrcode from 'qrcode-generator';
import './screen.css';
import { brand } from '../brand.config';
import type { Store } from '../data/store';
import { ANSWER_WINDOW_MS } from '../shared/constants';
import { loadFlagger } from '../shared/flags';
import { board, mythBusters, newest, rising, topCyber, type BoardItem } from '../shared/game';
import type { StateName } from '../shared/types';
import { mothershipSvg } from '../ui/sprites';
import { paint } from '../ui/paint';
import { $, esc } from '../ui/util';

const ROTATE_MS = 8000;
const PER_PAGE = 4;

/** The projector view. Read-only: it writes nothing. Rotation here never removes anything from the database. */
export function mountScreen(root: HTMLElement, store: Store) {
  let isFlagged: undefined | ((t: unknown) => boolean);
  void loadFlagger().then((f) => { isFlagged = f; render(); });

  root.innerHTML = `
  <header class="sh"><div><div class="presents px">${esc(brand.presentsLine)}</div><h1>${esc(brand.title.first)} <em>${esc(brand.title.second)}</em></h1></div>
    <div class="stats"><div class="stat"><b id="st-p">0</b><span>PLAYERS</span></div><div class="stat"><b id="st-n">0</b><span>PREDICTIONS</span></div><div class="stat"><b id="st-v">0</b><span>VOTES</span></div></div></header>
  <div class="sm"><div id="stage" class="stage"></div>
    <aside class="side">
      <div class="join"><div id="qr" aria-hidden="true"></div><p>JOIN ON YOUR PHONE<b id="url"></b></p></div>
      <div id="sidebox"></div>
    </aside></div>
  <div id="conn" class="conn px" role="status" hidden></div>`;
  $('#url').textContent = brand.joinUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
  try { $('#qr').innerHTML = qrSvg(brand.joinUrl); } catch { $('#qr').hidden = true; } // the URL text remains

  const ranks = (n: number, title: string) => {
    const rows = mythBusters(store.state, isFlagged).slice(0, n);
    return `<h2>${title}</h2><table class="sb">${rows.map((r, i) =>
      `<tr><td class="r">${i + 1}</td><td class="n" style="color:${esc(r.color)}">${esc(r.name)}</td><td class="s">${r.points}</td></tr>`).join('') || '<tr><td class="dimtxt">Waiting for players</td></tr>'}</table>`;
  };
  const predCard = (x: BoardItem) => `<article class="pc"><p class="pt">${esc(x.text)}</p>
    <p class="pm"><span style="color:${esc(x.color)}">${esc(x.author)}</span><b>${x.pct === null ? 'NO VOTES YET' : `${x.pct}% WILL HAPPEN · ${x.total}`}</b>${x.cyber ? `<i class="cybertxt px">CB ${x.cyber}</i>` : ''}</p></article>`;
  const title = (big: string, small = '') => `<div class="center">${mothershipSvg(14)}<h2 class="mega px">${big}</h2>${small ? `<p class="sub">${small}</p>` : ''}</div>`;

  /** New and rising predictions interleaved, shown a page at a time. */
  function ticker(items: BoardItem[]) {
    const mix = new Map<string, BoardItem>();
    const a = rising(items, store.now()), b = newest(items);
    for (let i = 0; i < b.length; i++) for (const x of [b[i], a[i]]) if (x) mix.set(x.id, x);
    const list = [...mix.values()];
    if (!list.length) return title('WHAT HAPPENS IN 2027?', 'Write your prediction on your phone.');
    const pages = Math.ceil(list.length / PER_PAGE), page = Math.floor(store.now() / ROTATE_MS) % pages;
    return `<h2 class="kicker px">WHAT HAPPENS IN 2027?</h2><div class="grid">${list.slice(page * PER_PAGE, page * PER_PAGE + PER_PAGE).map(predCard).join('')}</div>`;
  }

  function quiz() {
    const s = store.state, id = s.show.card;
    if (!id || !s.cards[id]) return title('GET READY', 'Real or fake? Answer on your phone.');
    const answered = Object.keys(s.answered[id] ?? {}).length;
    const key = s.keys[id];
    let foot: string;
    if (s.revealed[id] && key) {
      const all = Object.values(s.answers[id] ?? {});
      const right = all.filter((x) => (x.a === 'real') === key.real).length;
      foot = `<div class="verdict ${key.real ? 'real' : 'fake'}"><b class="px">${key.real ? 'REAL' : 'FAKE'}</b><span class="px">${all.length ? `${Math.round((100 * right) / all.length)}% GOT IT RIGHT` : 'NO ANSWERS'}</span></div><p class="explain">${esc(key.explainer)}</p>`;
    } else {
      const left = Math.max(0, Math.ceil(((s.opened[id] ?? 0) + ANSWER_WINDOW_MS - store.now()) / 1000));
      foot = `<div class="clock px">${left ? left : "TIME'S UP"}</div><p class="sub">${answered} of ${Object.values(s.players).filter((p) => p.name).length} answered</p>`;
    }
    return `<div class="center"><h2 class="kicker px">REAL OR FAKE?</h2><p class="headline">${esc(s.cards[id].text)}</p>${foot}</div>`;
  }

  function stage(state: StateName, items: BoardItem[], joined: number) {
    if (state === 'ARRIVAL') return title('JOIN NOW', `${joined} player${joined === 1 ? '' : 's'} in. How closely were you watching 2026?`);
    if (state === 'PAUSED') return title('BACK AT 5', 'Scan the code if you have not joined.');
    if (state === 'LIVE_QUIZ') return quiz();
    if (state === 'QUIZ_RESULTS') return `<div class="center wide">${ranks(10, 'MYTH-BUSTER TOP 10')}</div>`;
    if (state === 'PREDICT') return ticker(items);
    const likely = items.filter((x) => x.total >= 3).sort((a, b) => b.pct! - a.pct! || b.total - a.total).slice(0, PER_PAGE);
    return `<h2 class="kicker px">FINAL BOARD: MOST LIKELY</h2><div class="grid">${likely.map(predCard).join('') || '<p class="sub">Locked. See you in 2027.</p>'}</div>`;
  }

  function render() {
    const s = store.state, conn = $('#conn');
    conn.hidden = store.ready && store.connected;
    conn.textContent = store.ready ? 'RECONNECTING' : store.fatal ?? 'CONNECTING...';
    if (!store.ready) return;
    const state = store.show(), items = board(s, isFlagged);
    const joined = Object.values(s.players).filter((p) => p.name).length;
    $('#st-p').textContent = String(joined);
    $('#st-n').textContent = String(items.length);
    $('#st-v').textContent = String(Object.values(s.votes).reduce((n, v) => n + Object.keys(v).length, 0));
    paint($('#stage'), stage(state, items, joined));
    const cyber = topCyber(items);
    paint($('#sidebox'), state === 'PREDICT' || state === 'FROZEN'
      ? `<h2>TOP CYBERBONKERS</h2>${cyber.map((x, i) => `<div class="cbrow"><b class="px">${i + 1}</b><p>${esc(x.text)}</p><span class="px">${x.cyber}</span></div>`).join('') || '<p class="dimtxt">Tag the wildest ones on your phone.</p>'}`
      : state === 'QUIZ_RESULTS' ? '' : ranks(8, 'MYTH-BUSTERS'));
  }

  store.on(render);
  setInterval(render, 500);
  render();
}

function qrSvg(text: string) {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  let r = '';
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (qr.isDark(y, x)) r += `<rect x="${x}" y="${y}" width="1.02" height="1.02"/>`;
  return `<svg viewBox="0 0 ${n} ${n}" width="100%" height="100%" fill="${brand.colors.level1}" shape-rendering="crispEdges">${r}</svg>`;
}
