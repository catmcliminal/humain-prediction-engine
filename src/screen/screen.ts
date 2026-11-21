import qrcode from 'qrcode-generator';
import './screen.css';
import { brand } from '../brand.config';
import type { Store } from '../data/store';
import { FORMATIONS_MIN_RECOMPUTE_MS, LEVELS, LEVEL_CYBER, RAID } from '../shared/constants';
import { formations, type Formation } from '../shared/formations';
import { derive, fleetRows, leaderOf } from '../shared/game';
import type { DerivedPrediction, FlagList, GameState } from '../shared/types';
import { levelColor, mothershipSvg, rocketSvg, sprite } from '../ui/sprites';
import { $, esc, pad, reducedMotion } from '../ui/util';

const ROW_ORDER = [6, 5, 4, 3, 2, 1];

/**
 * The projector view. Read-only: it has no host controls and writes nothing. Scrubs arrive from the
 * Cloud Function as scrubbed/{id}; this view only animates them (and drops the card).
 */
export function mountScreen(root: HTMLElement, store: Store) {
  const R = {
    seen: null as Set<string> | null, scrubbed: null as Set<string> | null, lv: new Set<string>(), cy: new Set<string>(),
    animating: new Set<string>(), queue: [] as { id: string; why: string }[], raiding: false,
    msId: undefined as string | null | undefined, msBusy: false, msHtml: '', tickerKey: '',
    forms: [] as Formation[], formsAt: 0, formsN: -1, last: 0, timer: 0 as unknown as ReturnType<typeof setTimeout>,
    isFlagged: undefined as undefined | ((t: unknown) => boolean),
  };
  const cards = new Map<string, HTMLElement>();
  const sigs = new Map<string, string>();

  root.innerHTML = `
  <header class="sh"><div><div class="presents px">${esc(brand.presentsLine)}</div><h1>${esc(brand.title.first)} <em>${esc(brand.title.second)}</em></h1></div>
    <div class="stats"><div class="stat"><b id="st-p">0</b><span>PLAYERS</span></div><div class="stat"><b id="st-n">0</b><span>PREDICTIONS</span></div><div class="stat"><b id="st-v">0</b><span>VOTES</span></div></div></header>
  <div class="sm"><div class="rowswrap">
    <div id="mother"><div class="ms-label">MOTHERSHIP<i>MOST BACKED<br>PREDICTION</i></div><div class="ms-flash" id="msFlash">NEW LEADER</div><div class="ms-fly" id="msFly"><div class="ms-drift" id="msDrift"></div></div></div>
    <div class="rows" id="rows">${ROW_ORDER.map((l) => `<div class="row r${l}" data-l="${l}" style="--rc:${levelColor(l)}"${l === LEVEL_CYBER ? ' hidden' : ''}>
      <div class="rlabel">${sprite(l, 5)}<span class="${l === 6 ? 'cybertxt' : ''}">${LEVELS[l].name}</span><i data-count>0 SHIPS</i></div>
      <div class="fleet"></div></div>`).join('')}<div class="ground" aria-hidden="true"></div></div></div>
    <aside class="side">
      <div class="join"><div id="qr" aria-hidden="true"></div><p>JOIN ON YOUR PHONE<b id="url"></b></p></div>
      <div><h2 id="sbTitle">HIGH SCORES</h2><table class="sb" id="sb"></table></div>
      <div class="formwrap"><h2>FORMATIONS</h2><div id="forms"></div></div>
    </aside></div>
  <div class="ticker" id="ticker" aria-hidden="true"></div>
  <div id="conn" class="conn px" role="status" hidden></div>`;
  $('#url').textContent = brand.joinUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
  try { $('#qr').innerHTML = qrSvg(brand.joinUrl); } catch { $('#qr').hidden = true; } // the URL text remains

  /* The flag matcher is only used to mirror the phones' pre-hide until a host decides. */
  import('../shared/flagger').then(async (m) => {
    R.isFlagged = m.makeFlagger((await import('../shared/flagwords.json')).default as FlagList);
    schedule();
  });

  const effScrubbed = (s: GameState) => {
    const o: Record<string, boolean> = {};
    for (const id of Object.keys(s.scrubbed)) if (!R.animating.has(id)) o[id] = true; // keep a card until its rocket lands
    return o;
  };

  function render() {
    const s = store.state;
    const conn = $('#conn');
    conn.hidden = store.ready && (store.connected || !store.everConnected);
    conn.textContent = store.ready ? 'RECONNECTING' : store.fatal ?? 'CONNECTING...';
    const d = derive(s, { isFlagged: R.isFlagged ? (t) => R.isFlagged!(t) : undefined });
    const first = R.seen === null && store.ready;
    const scr = effScrubbed(s);
    const lead = leaderOf(d.preds);
    const byId = new Map(d.preds.map((p) => [p.id, p]));

    if (store.ready) detectScrubs(s, byId);
    renderMothership(lead);
    $('#st-p').textContent = String(Object.keys(s.players).length);
    $('#st-n').textContent = String(d.preds.length);
    $('#st-v').textContent = String(d.preds.reduce((a, p) => a + p.votes, 0));

    // formations are recomputed at most every FORMATIONS_MIN_RECOMPUTE_MS
    const t = Date.now();
    if (R.formsN !== d.preds.length && t - R.formsAt > FORMATIONS_MIN_RECOMPUTE_MS) { R.forms = formations(d.preds); R.formsAt = t; R.formsN = d.preds.length; }
    const fOf = new Map<string, Formation>();
    R.forms.forEach((f) => f.ids.forEach((id) => fOf.set(id, f)));

    const rows = fleetRows(d.preds, scr, lead?.id ?? null);
    const keep = new Set<string>();
    for (const l of ROW_ORDER) {
      const rowEl = $(`.row[data-l="${l}"]`), { shown, total } = rows[l];
      rowEl.hidden = l === LEVEL_CYBER && total === 0;
      rowEl.querySelector('[data-count]')!.textContent = `${total} ${total === 1 ? 'SHIP' : 'SHIPS'}`;
      const fleet = rowEl.querySelector('.fleet') as HTMLElement;
      shown.forEach((p, i) => {
        keep.add(p.id);
        let el = cards.get(p.id);
        const sig = cardSig(p, i, s, fOf.get(p.id));
        if (!el) {
          el = document.createElement('div');
          el.dataset.id = p.id;
          cards.set(p.id, el);
          if (!first && R.seen && !R.seen.has(p.id) && !reducedMotion()) { el.classList.add('incoming'); setTimeout(() => el!.classList.remove('incoming'), 1500); }
        }
        if (sigs.get(p.id) !== sig) { sigs.set(p.id, sig); fillCard(el, p, i, s, fOf.get(p.id)); }
        if (fleet.children[i] !== el) fleet.insertBefore(el, fleet.children[i] ?? null);
      });
      let more = fleet.querySelector('.more') as HTMLElement | null;
      if (total > shown.length) {
        if (!more) { more = document.createElement('div'); more.className = 'more'; fleet.appendChild(more); }
        more.textContent = `+${total - shown.length}`;
        if (fleet.lastElementChild !== more) fleet.appendChild(more);
      } else more?.remove();
    }
    for (const [id, el] of cards) if (!keep.has(id)) { el.remove(); cards.delete(id); sigs.delete(id); }
    if (store.ready) { R.seen ??= new Set(); d.preds.forEach((p) => R.seen!.add(p.id)); }

    celebrate(d.preds, first);
    $('#sbTitle').textContent = store.frozen() ? 'FINAL SCORES' : 'HIGH SCORES';
    $('#sb').innerHTML = d.board.slice(0, 10).map((b, i) =>
      `<tr><td class="r">${i + 1}</td><td class="n" style="color:${esc(b.color)}">${esc(b.name)}</td><td class="s">${pad(b.score)}</td></tr>`).join('')
      || '<tr><td class="dimtxt">Waiting for players</td></tr>';
    $('#forms').innerHTML = R.forms.length
      ? R.forms.slice(0, 6).map((f) => `<div class="form"><span class="badge" style="--bc:${f.color}">${f.letter}</span><div>${f.ids.length} ships agree<small>${esc(f.kw.join(' · ') || 'similar ideas')}</small></div></div>`).join('')
      : '<div class="form"><small>When predictions overlap they fly in formation here.</small></div>';
    const latest = [...d.preds].sort((a, b) => b.ts - a.ts).slice(0, 12), key = latest.map((p) => p.id).join();
    if (key !== R.tickerKey) {
      R.tickerKey = key;
      $('#ticker').innerHTML = latest.length
        ? `<div>${latest.map((p) => `<b>INCOMING</b>${esc(p.text)}`).join('')}</div>`
        : '<div><b>INSERT PREDICTION</b>Scan the code to play</div>';
    }
  }

  const cardSig = (p: DerivedPrediction, i: number, s: GameState, f?: Formation) =>
    [p.votes, p.lvup, p.reclass, p.tag, p.row, i === 0 && p.votes > 0, f?.letter, f?.color, s.players[p.pid]?.name, s.players[p.pid]?.color, p.text].join('|');
  function fillCard(el: HTMLElement, p: DerivedPrediction, i: number, s: GameState, f?: Formation) {
    const pl = s.players[p.pid], col = levelColor(p.row);
    el.className = `card${i === 0 && p.votes > 0 ? ' lead' : ''}${p.lvup ? ' lvup' : ''}${p.row === 6 ? ' cyberbox' : ''}${el.classList.contains('incoming') ? ' incoming' : ''}`;
    el.style.setProperty('--rc', col);
    el.innerHTML = `${f ? `<span class="badge" style="--bc:${f.color}">${f.letter}</span>` : ''}
      <div class="ch">${sprite(p.row, 2)}${p.lvup ? '<span class="lvbadge">★ LVL UP</span>' : ''}<span class="who" style="color:${esc(pl?.color)}">${esc(pl?.name || '???')}${p.reclass ? `<span class="was"> · was ${p.tag}</span>` : ''}</span><span class="v">▲ ${p.votes}</span></div>
      <div class="ct">${esc(p.text)}</div>`;
  }

  /* ---------- mothership ---------- */
  const msContent = (lead: DerivedPrediction | null) => {
    if (!lead) return `${mothershipSvg(7)}<div class="ms-beam" style="opacity:.25"></div><div class="ms-empty">AWAITING A WORTHY PREDICTION</div>`;
    const pl = store.state.players[lead.pid], col = levelColor(lead.row);
    return `${mothershipSvg(7)}<div class="ms-beam"></div><div class="ms-card" style="border-color:${col}">
      <div class="ch">${sprite(lead.row, 2)}<span class="${lead.row === 6 ? 'cybertxt' : ''}" style="color:${col}">${LEVELS[lead.row].name}</span><span style="color:${esc(pl?.color)}">${esc(pl?.name || '???')}</span><b>▲ ${lead.votes}</b></div>
      <div class="ct">${esc(lead.text)}</div></div>`;
  };
  const currentLead = () => leaderOf(derive(store.state, { isFlagged: R.isFlagged ? (t) => R.isFlagged!(t) : undefined }).preds);
  /** Only touch the DOM when the content changed, so the ship's lights keep blinking. */
  function setMs(lead: DerivedPrediction | null) {
    const html = msContent(lead);
    if (html !== R.msHtml) { R.msHtml = html; $('#msDrift').innerHTML = html; }
  }
  function renderMothership(lead: DerivedPrediction | null) {
    const id = lead?.id ?? null, fly = $('#msFly');
    if (R.msId === undefined) { if (store.ready) { R.msId = id; setMs(lead); } return; }
    if (id === R.msId) { if (!R.msBusy) setMs(lead); return; }
    R.msId = id;
    if (reducedMotion()) { setMs(lead); return; }
    R.msBusy = true;
    fly.className = 'ms-fly out';
    setTimeout(() => {
      setMs(currentLead());
      fly.className = 'ms-fly pre'; void fly.offsetWidth; fly.className = 'ms-fly in';
      if (id) { const f = $('#msFlash'); f.classList.remove('go'); void f.offsetWidth; f.classList.add('go'); }
      setTimeout(() => { fly.className = 'ms-fly'; R.msBusy = false; }, 1150);
    }, 950);
  }

  /* ---------- LEVEL UP / CYBERBONKERS bursts ---------- */
  function celebrate(preds: DerivedPrediction[], first: boolean) {
    for (const p of preds) {
      const up = p.lvup && !R.lv.has(p.id), cy = p.row === 6 && !R.cy.has(p.id);
      if (p.lvup) R.lv.add(p.id);
      if (p.row === 6) R.cy.add(p.id);
      if (first || !(up || cy) || reducedMotion()) continue;
      const c = cards.get(p.id);
      if (!c) continue;
      const b = c.getBoundingClientRect(), t = document.createElement('div');
      t.className = 'lvburst' + (cy ? ' cybertxt' : '');
      t.textContent = cy ? 'CYBERBONKERS!' : 'LEVEL UP!';
      t.style.left = `${b.left + b.width / 2}px`; t.style.top = `${b.top + b.height / 2}px`;
      document.body.appendChild(t);
      setTimeout(() => t.remove(), 1900);
    }
  }

  /* ---------- rocket raid: animation only, triggered by scrubbed/{id} appearing ---------- */
  function detectScrubs(s: GameState, byId: Map<string, DerivedPrediction>) {
    const now = new Set(Object.keys(s.scrubbed));
    if (R.scrubbed === null) { R.scrubbed = now; return; }
    for (const id of now) {
      if (R.scrubbed.has(id)) continue;
      R.scrubbed.add(id);
      if (reducedMotion() || !cards.has(id)) continue;
      const p = byId.get(id);
      R.animating.add(id);
      R.queue.push({ id, why: p && p.downs >= 1 && p.shot ? 'SHOT DOWN BY THE CROWD' : 'A BORING PREDICTION WAS SCRUBBED' });
    }
    if (!R.raiding) void runRaids();
  }
  async function runRaids() {
    R.raiding = true;
    while (R.queue.length) {
      const { id, why } = R.queue.shift()!;
      const card = cards.get(id);
      if (card) await raid(card, why);
      R.animating.delete(id);
      schedule(true);
    }
    R.raiding = false;
  }
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  async function raid(card: HTMLElement, why: string) {
    const b = card.getBoundingClientRect(), tx = b.left + b.width / 2, ty = b.top + b.height / 2;
    const sx = -120, sy = innerHeight + 40, ang = (Math.atan2(ty - sy, tx - sx) * 180) / Math.PI;
    const rk = document.createElement('div');
    rk.className = 'rocket';
    rk.innerHTML = `<div class="wob">${rocketSvg(7)}</div>`;
    const pos = (x: number, y: number) => `translate(${x - 49}px,${y - 17}px) rotate(${ang}deg)`;
    rk.style.transform = pos(sx, sy);
    document.body.appendChild(rk);
    void rk.offsetWidth;
    rk.style.transition = 'transform 1.7s cubic-bezier(.45,0,.9,.6)';
    rk.style.transform = pos(tx, ty);
    await sleep(1700);
    rk.remove();
    card.classList.add('shatter');
    $('#rows').classList.add('shake');
    const c = getComputedStyle(card).getPropertyValue('--rc') || '#ff2bd6';
    for (let i = 0; i < 26; i++) {
      const bt = document.createElement('i');
      bt.className = 'rbit';
      const a = Math.random() * Math.PI * 2, dd = 50 + Math.random() * 170;
      bt.style.cssText = `left:${tx}px;top:${ty}px;--bc:${i % 3 ? c : '#ffe600'};--dx:${Math.cos(a) * dd}px;--dy:${Math.sin(a) * dd}px`;
      document.body.appendChild(bt);
      setTimeout(() => bt.remove(), 900);
    }
    const m = document.createElement('div');
    m.className = 'raidmsg';
    m.setAttribute('role', 'status');
    m.innerHTML = `RAPID UNSCHEDULED<br>DISASSEMBLY<small>${esc(why)}</small>`;
    document.body.appendChild(m);
    setTimeout(() => m.remove(), 2700);
    await sleep(380);
    $('#rows').classList.remove('shake');
  }

  /* Rendering is throttled: the store can emit many times a second. */
  function schedule(now = false) {
    const wait = now ? 0 : Math.max(0, 200 - (Date.now() - R.last));
    clearTimeout(R.timer);
    R.timer = setTimeout(() => { R.last = Date.now(); render(); }, wait);
  }
  store.on(() => schedule());
  setInterval(() => schedule(), 1000); // freeze flip, reconnect banner, raid-age based changes
  render();
  void RAID; // raids are scheduled by the Cloud Function every RAID.every ms; this view only animates them
}

function qrSvg(text: string) {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  let r = '';
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (qr.isDark(y, x)) r += `<rect x="${x}" y="${y}" width="1.02" height="1.02"/>`;
  return `<svg viewBox="0 0 ${n} ${n}" width="116" height="116" fill="${brand.colors.level1}" shape-rendering="crispEdges">${r}</svg>`;
}
