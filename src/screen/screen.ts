import qrcode from 'qrcode-generator';
import './screen.css';
import { brand } from '../brand.config';
import type { Store } from '../data/store';
import { ANSWER_WINDOW_MS, LEVELS } from '../shared/constants';
import { loadFlagger } from '../shared/flags';
import { board, leader, mostLikely, mythBusters, newest, rising, topCyber, type BoardItem } from '../shared/game';
import type { StateName } from '../shared/types';
import { slam } from '../ui/juice';
import { SFX } from '../ui/sound';
import { levelColor, mothershipSvg, sprite } from '../ui/sprites';
import { paint } from '../ui/paint';
import { $, esc } from '../ui/util';
import { flyer, mothership, results } from './effects';

const ROTATE_MS = 8000;
const PER_PAGE = 4;

/** The projector view. Read-only: it writes nothing. Rotation here never removes anything from the database. */
export function mountScreen(root: HTMLElement, store: Store) {
  let isFlagged: undefined | ((t: unknown) => boolean);
  void loadFlagger().then((f) => { isFlagged = f; render(); });

  root.innerHTML = `
  <header class="sh"><div><div class="presents px">${esc(brand.presentsLine)}</div><h1>${esc(brand.title.first)} <em>${esc(brand.title.second)}</em></h1></div>
    <div class="stats"><div class="stat"><b id="st-p">0</b><span>PLAYERS</span></div><div class="stat"><b id="st-n">0</b><span>PREDICTIONS</span></div><div class="stat"><b id="st-v">0</b><span>RATINGS</span></div></div><button id="snd" class="snd px"></button></header>
  <div class="sm"><div class="main"><div id="mother" hidden></div><div id="stage" class="stage"></div><div id="results" class="stage center wide" hidden></div></div>
    <aside class="side">
      <div class="join"><div id="qr" aria-hidden="true"></div><p>JOIN ON YOUR PHONE<b id="url"></b></p></div>
      <div id="sidebox"></div>
    </aside></div>
  <div id="conn" class="conn px" role="status" hidden></div>`;
  $('#url').textContent = brand.joinUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
  try { $('#qr').innerHTML = qrSvg(brand.joinUrl); } catch { $('#qr').hidden = true; } // the URL text remains

  const drawMother = mothership($('#mother'));
  const board10 = results($('#results'));
  const find = (id: string) => board(store.state, isFlagged).find((x) => x.id === id);
  const ships = flyer(find);
  let seenPreds: Set<string> | undefined;
  const slammed = new Set<string>();

  // Browsers stay silent until someone clicks the page once.
  const sndLabel = () => { $('#snd').textContent = SFX.audible ? 'SOUND ON' : 'CLICK FOR SOUND'; };
  $('#snd').addEventListener('click', () => {
    const wasAudible = SFX.audible;
    SFX.setOn(!wasAudible); SFX.init();
    if (!wasAudible) setTimeout(() => { SFX.start(); sndLabel(); }, 60);
    sndLabel();
  });

  /** One-off effects for things that have just happened. Nothing replays when the page is reloaded. */
  function effects(state: StateName, items: BoardItem[]) {
    const s = store.state, first = !seenPreds;
    seenPreds ??= new Set();
    for (const x of items) {
      if (seenPreds.has(x.id)) continue;
      if (!first && !x.seed && !isFlagged) continue; // wait for the word filter before anything flies
      seenPreds.add(x.id);
      if (!first && !x.seed && state === 'PREDICT') ships.add(x.id);
    }
    if (state !== 'PREDICT') ships.clear();
    for (const id of slammed) if (!s.revealed[id]) slammed.delete(id); // a quiz reset lets a card slam again
    if (first) for (const id of Object.keys(s.revealed)) slammed.add(id);
    const id = s.show.card;
    if (state === 'LIVE_QUIZ' && id && s.revealed[id] && s.keys[id] && !slammed.has(id)) { slammed.add(id); slam(s.keys[id].real); }
  }

  const ranks = (n: number, title: string) => {
    const rows = mythBusters(store.state, isFlagged).slice(0, n);
    return `<h2>${title}</h2><table class="sb">${rows.map((r, i) =>
      `<tr><td class="r">${i + 1}</td><td class="n" style="color:${esc(r.color)}">${esc(r.name)}</td><td class="s">${r.points}</td></tr>`).join('') || '<tr><td class="dimtxt">Waiting for players</td></tr>'}</table>`;
  };
  const predCard = (x: BoardItem) => `<article class="pc"${x.level ? ` style="border-color:${levelColor(x.level)}"` : ''}><p class="pt">${esc(x.text)}</p>
    <p class="pm"><span style="color:${esc(x.color)}">${esc(x.author)}</span>${x.level ? `${sprite(x.level, 3)}<b style="color:${levelColor(x.level)}">${LEVELS[x.level - 1]} ${x.avg!.toFixed(1)} · ${x.total}</b>` : '<b>NOT RATED YET</b>'}${x.cyber ? `<i class="cybertxt px">CB ${x.cyber}</i>` : ''}</p></article>`;
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
    if (state === 'ARRIVAL') return title('JOIN NOW', `${joined} player${joined === 1 ? '' : 's'} in. How much attention were you paying to the AI news in 2026?`);
    if (state === 'PAUSED') return title('BACK AT 5', 'Scan the code to play.');
    if (state === 'LIVE_QUIZ') return quiz();
    if (state === 'PREDICT') return ticker(items);
    const likely = mostLikely(items).slice(0, PER_PAGE);
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
    effects(state, items);
    const onBoard = state === 'PREDICT' || state === 'FROZEN';
    $('#mother').hidden = !onBoard;
    if (onBoard) drawMother(leader(items));
    $('#stage').hidden = state === 'QUIZ_RESULTS';
    $('#results').hidden = state !== 'QUIZ_RESULTS';
    if (state === 'QUIZ_RESULTS') board10.update(mythBusters(s, isFlagged).slice(0, 10), Date.now());
    else { board10.reset(); paint($('#stage'), stage(state, items, joined)); }
    sndLabel();
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
