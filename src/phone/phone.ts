import { LEVELS, MAX_PREDICTIONS_PER_PLAYER, PREDICTION_MAX } from '../shared/constants';
import { derive, leaderOf } from '../shared/game';
import { cleanPrediction, hasUrl } from '../shared/text';
import type { FlagList } from '../shared/types';
import { config } from '../config';
import type { Store } from '../data/store';
import { fireFx } from '../ui/fx';
import { SFX } from '../ui/sound';
import { levelColor, sprite } from '../ui/sprites';
import { announce, hideToast, toast } from '../ui/toast';
import { $, esc, pad, radioKeys, vibrate } from '../ui/util';
import { magazineEmpty, rateLimitLeft } from './feed';
import { mountJoin } from './join';
import { ranksHtml } from './ranks';
import { Feed, type Ctx } from './vote';

type Tab = 'fire' | 'vote' | 'ranks';
const TABS: Tab[] = ['fire', 'vote', 'ranks'];

export function mountPhone(root: HTMLElement, store: Store) {
  const P = {
    mode: '' as '' | 'connecting' | 'join' | 'app',
    tag: 3, tab: 'fire' as Tab, busy: false,
    myVotes: null as number | null, lead: undefined as string | undefined, scrubbed: undefined as number | undefined,
    ups: undefined as number | undefined, cybs: undefined as number | undefined, lastCoin: 0, seen: 0,
    ranksSig: '', gameOver: false,
    isFlagged: undefined as undefined | ((t: unknown) => boolean),
  };
  let feed: Feed;
  let join: ReturnType<typeof mountJoin> | null = null;
  let failed = false;

  /** The flag matcher is loaded lazily to keep the first payload small. It only pre-hides until a host decides. */
  import('../shared/flagger').then(async (m) => {
    const list = (await import('../shared/flagwords.json')).default as FlagList;
    P.isFlagged = m.makeFlagger(list);
    render();
  });

  /* ---------- connecting / error ---------- */
  function connecting() {
    P.mode = 'connecting';
    root.innerHTML = `<div class="view" style="padding-top:60px;text-align:center">
      <h1 class="logo">${'PREDICTION'}<span>ENGINE</span></h1>
      <p class="px blink" style="font-size:12px;margin-top:40px;color:var(--c)" role="status">CONNECTING...</p>
      <div id="retry"></div></div>`;
  }
  function connectFailed() {
    failed = true;
    toast('COULD NOT CONNECT TO GAME SERVER', 4000);
    const r = $('#retry');
    if (r && !r.firstChild) {
      r.innerHTML = '<button class="big" style="margin-top:30px" id="retryBtn">RETRY</button>';
      $('#retryBtn').addEventListener('click', () => location.reload());
    }
  }
  const connectTimer = setTimeout(() => { if (!store.ready) connectFailed(); }, config.connectTimeoutMs);

  /* ---------- shell ---------- */
  function buildShell() {
    P.mode = 'app'; join = null;
    root.innerHTML = `
    <div class="topwrap">
      <div class="top"><span id="ph-name"></span><span class="score" id="ph-score" aria-label="Score">000000</span><button id="sndBtn" aria-pressed="${SFX.on}">${SFX.on ? 'SND ON' : 'SND OFF'}</button></div>
      <div id="recon" class="recon px" role="status" hidden>RECONNECTING</div>
    </div>
    <section class="view" id="v-fire" role="tabpanel" aria-labelledby="t-fire"></section>
    <section class="view" id="v-vote" role="tabpanel" aria-labelledby="t-vote" hidden>
      <h2 class="sr-only" id="vote-h" tabindex="-1">Vote</h2>
      <div class="sortbar" role="group" aria-label="Sort predictions"><button data-s="new" class="on" aria-pressed="true">NEWEST</button><button data-s="top" aria-pressed="false">TOP</button><button data-s="unrated" aria-pressed="false">UNRATED</button></div>
      <button class="chip px" id="newchip" hidden></button>
      <div id="feed"></div>
      <p class="empty px" id="feedEmpty" hidden></p>
      <button class="big more" id="moreBtn" hidden></button>
    </section>
    <section class="view" id="v-ranks" role="tabpanel" aria-labelledby="t-ranks" hidden></section>
    <nav class="tabs" role="tablist" aria-label="Game views">${TABS.map((t) =>
      `<button role="tab" id="t-${t}" aria-controls="v-${t}" aria-selected="${t === 'fire'}" data-t="${t}" class="${t === 'fire' ? 'on' : ''}">${t.toUpperCase()}${t === 'vote' ? '<i class="dot" id="newdot" hidden></i>' : ''}</button>`).join('')}</nav>`;
    P.tab = 'fire'; P.ranksSig = ''; P.gameOver = false;
    feed = new Feed($('#feed'), $('#feedEmpty'), $<HTMLButtonElement>('#newchip'), $<HTMLButtonElement>('#moreBtn'));
    buildFire();

    $('#sndBtn').addEventListener('click', (e) => {
      SFX.setOn(!SFX.on);
      const b = e.currentTarget as HTMLElement;
      b.textContent = SFX.on ? 'SND ON' : 'SND OFF';
      b.setAttribute('aria-pressed', String(SFX.on));
      SFX.init(); SFX.blip();
    });
    const tabs = $('.tabs');
    tabs.addEventListener('click', (e) => { const b = (e.target as HTMLElement).closest('button'); if (b) { setTab(b.dataset.t as Tab, true); SFX.init(); SFX.blip(); } });
    tabs.addEventListener('keydown', (e) => {
      const i = TABS.indexOf(P.tab);
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        const t = TABS[(i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length];
        setTab(t, true); $(`#t-${t}`).focus();
      }
    });
    $('.sortbar').addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (!b) return;
      feed.sort = b.dataset.s as typeof feed.sort; feed.shown = 40;
      root.querySelectorAll('.sortbar button').forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', String(x === b)); });
      feed.refresh(ctx());
    });
    $('#newchip').addEventListener('click', () => feed.refresh(ctx()));
    $('#moreBtn').addEventListener('click', () => { feed.shown += 40; feed.refresh(ctx()); });
    $('#feed').addEventListener('click', onFeedClick);
    P.seen = othersCount();
  }

  /** Predictions by other players: the player's own never light the VOTE dot. */
  const othersCount = () => Object.values(store.state.preds).filter((p) => p.pid !== store.me).length;

  function buildFire() {
    $('#v-fire').innerHTML = `
      <h2 class="prefix" id="fire-h" tabindex="-1">IN 2027...</h2>
      <div id="fireForm">
        <textarea id="predInp" class="inp" maxlength="${PREDICTION_MAX}" aria-label="Your prediction, starting In 2027" placeholder="a bank's chatbot asks for a pay rise"></textarea>
        <div class="count" id="cnt" aria-hidden="true">0/${PREDICTION_MAX}</div>
        <p id="fireErr" class="err px" role="alert"></p>
        <span class="field" id="lvLbl">HOW UNHINGED IS IT?</span>
        <div class="levels" role="radiogroup" aria-labelledby="lvLbl">${[1, 2, 3, 4, 5].map((l) =>
          `<button type="button" role="radio" aria-checked="${l === P.tag}" aria-label="${l}, ${LEVELS[l].name}" data-l="${l}" style="--lc:${levelColor(l)}" class="${l === P.tag ? 'on' : ''}">${sprite(l, 3)}${l}</button>`).join('')}</div>
        <div class="lvname" id="lvname"></div>
        <button class="big" id="fireBtn" disabled>FIRE ▲</button>
        <button class="big mag" id="magBtn" data-t="vote" hidden>MAGAZINE EMPTY. GO VOTE</button>
        <div class="fired px" id="ph-fired"></div>
        <p class="fired px hint">The crowd can reclassify your level,<br>even to CYBERBONKERS.<br>2 votes = LEVEL UP. 3 shoot-downs = rocket.<br>Score = votes × 100 × level.</p>
      </div>
      <div class="over" id="gameOver" hidden><b class="px">GAME OVER</b>Predictions closed at midnight on New Year's Eve. Check RANKS for the final scores.</div>`;
    const inp = $<HTMLTextAreaElement>('#predInp');
    const lvl = () => { $('#lvname').textContent = LEVELS[P.tag].name; $('#lvname').style.color = levelColor(P.tag); };
    lvl();
    const lv = $('.levels');
    radioKeys(lv);
    lv.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (!b) return;
      P.tag = +b.dataset.l!;
      lv.querySelectorAll('button').forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-checked', String(x === b)); });
      lvl(); SFX.init(); SFX.level(P.tag);
    });
    inp.addEventListener('input', () => {
      $('#cnt').textContent = `${inp.value.length}/${PREDICTION_MAX}`;
      $('#fireErr').textContent = hasUrl(cleanPrediction(inp.value)) ? 'NO LINKS' : '';
      syncFire();
    });
    $('#magBtn').addEventListener('click', () => setTab('vote', true));
    $('#fireBtn').addEventListener('click', fire);
  }

  async function fire() {
    const inp = $<HTMLTextAreaElement>('#predInp'), btn = $<HTMLButtonElement>('#fireBtn');
    const text = cleanPrediction(inp.value);
    if (text.length < 8 || hasUrl(text) || P.busy || !store.canAct()) return;
    SFX.init();
    P.busy = true; syncFire();
    try {
      await store.submit(text, P.tag);
      fireFx(P.tag, store.state.players[store.me]?.color || '#39ff14');
      inp.value = ''; $('#cnt').textContent = `0/${PREDICTION_MAX}`;
    } catch (e) {
      console.error(e);
      const left = rateLimitLeft(store.state.players[store.me]?.lastPost, store.now());
      toast(left > 0 ? `RELOADING... ${left}s` : 'MISFIRE. TRY AGAIN'); // the text stays
    } finally {
      P.busy = false; syncFire(); btn.blur();
    }
  }

  /** FIRE: disabled while short, linked, busy, offline or reloading; swapped for MAGAZINE EMPTY at the cap. */
  function syncFire() {
    const fireBtn = $<HTMLButtonElement>('#fireBtn'); if (!fireBtn) return;
    const me = store.state.players[store.me];
    const left = rateLimitLeft(me?.lastPost, store.now());
    const empty = magazineEmpty(me);
    const text = cleanPrediction($<HTMLTextAreaElement>('#predInp').value);
    fireBtn.hidden = empty;
    $('#magBtn').hidden = !empty;
    fireBtn.textContent = left > 0 ? `RELOADING... ${left}s` : 'FIRE ▲';
    fireBtn.disabled = text.length < 8 || hasUrl(text) || P.busy || left > 0 || !store.canAct();
    if (left > 0 && P.mode === 'app' && P.tab === 'fire') toast(`RELOADING... ${left}s`, 1200);
    else if (left === 0 && $('#toast').textContent?.startsWith('RELOADING')) hideToast();
  }

  async function onFeedClick(e: Event) {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-act]');
    if (!b || b.disabled) return;
    SFX.init();
    if (store.frozen()) { toast('GAME OVER'); return; }
    const id = b.dataset.id!, act = b.dataset.act!;
    try {
      if (act === 'vote') { const on = b.getAttribute('aria-pressed') !== 'true'; const p = store.vote(id, on); if (on) { SFX.coin(); vibrate(20); } else SFX.blip(); await p; }
      else if (act === 'down') { const on = b.getAttribute('aria-pressed') !== 'true'; const p = store.down(id, on); if (on) { SFX.laser(); vibrate(30); } else SFX.blip(); await p; }
      else { const n = +b.dataset.n!; const p = store.rate(id, n); SFX.level(n); if (n === 6) SFX.start(); await p; }
    } catch (err) {
      console.error(err);
      toast('MISSED. TRY AGAIN'); // RTDB has already reverted the optimistic value
    }
  }

  function setTab(t: Tab, focus = false) {
    P.tab = t;
    TABS.forEach((x) => {
      $(`#v-${x}`).hidden = x !== t;
      const tb = $(`#t-${x}`);
      tb.classList.toggle('on', x === t);
      tb.setAttribute('aria-selected', String(x === t));
    });
    if (t === 'vote') { P.seen = othersCount(); $('#newdot').hidden = true; feed.refresh(ctx()); }
    if (t === 'ranks') P.ranksSig = '';
    render();
    window.scrollTo(0, 0);
    if (focus) $<HTMLElement>(`#${t === 'fire' ? 'fire-h' : t === 'vote' ? 'vote-h' : 'ranks-h'}`)?.focus({ preventScroll: true });
  }

  /* ---------- render ---------- */
  const derived = () => derive(store.state, { isFlagged: P.isFlagged ? (t) => P.isFlagged!(t) : undefined });
  const ctx = (d = derived()): Ctx => ({ s: store.state, preds: d.preds, me: store.me, frozen: store.frozen(), offline: !store.canAct() });

  function render() {
    const s = store.state;
    if (!store.ready) { if (P.mode !== 'connecting') connecting(); if (failed) connectFailed(); return; }
    clearTimeout(connectTimer);
    const me = s.players[store.me];
    if (!me?.name) {
      if (P.mode !== 'join') { P.mode = 'join'; join = mountJoin(root, store); }
      join?.sync();
      return;
    }
    if (P.mode !== 'app') buildShell();

    const d = derived();
    const mine = d.preds.filter((p) => p.pid === store.me);
    const c = ctx(d);
    const nameEl = $('#ph-name');
    nameEl.textContent = me.name; nameEl.style.color = me.color;
    $('#ph-score').textContent = pad(d.scores[store.me] || 0);
    $('#ph-fired').textContent = `SHOTS FIRED: ${me.count ?? Object.values(s.preds).filter((p) => p.pid === store.me).length}`;
    $('#recon').hidden = !(store.everConnected && !store.connected);

    notify(d, mine);
    const over = store.frozen();
    $('#fireForm').hidden = over;
    $('#fire-h').hidden = over;
    $('#gameOver').hidden = !over;
    if (over && !P.gameOver) { P.gameOver = true; announce('Game over'); }
    syncFire();

    if (P.tab !== 'vote' && othersCount() > P.seen) $('#newdot').hidden = false;
    feed.update(c); // keep cards current even when hidden, so opening VOTE is instant
    if (P.tab === 'ranks') {
      const html = ranksHtml(d, store.me);
      if (html !== P.ranksSig) { P.ranksSig = html; $('#v-ranks').innerHTML = html; }
    }
  }

  /** Toasts and sounds for things that happen to the player's own predictions. First pass only sets baselines. */
  function notify(d: ReturnType<typeof derived>, mine: ReturnType<typeof derived>['preds']) {
    const s = store.state;
    const mv = mine.reduce((a, p) => a + p.votes, 0);
    const lead = leaderOf(d.preds);
    const scrubbed = Object.keys(s.scrubbed).filter((id) => s.preds[id]?.pid === store.me).length;
    const ups = mine.filter((p) => p.lvup).length, cybs = mine.filter((p) => p.row === 6).length;
    if (P.myVotes === null) P.myVotes = mv;
    else {
      // Group bursts: at most one coin toast every 3 s. Until then the baseline holds, so the next one reports the total.
      if (mv > P.myVotes && Date.now() - P.lastCoin > 3000) { P.lastCoin = Date.now(); toast(`+${mv - P.myVotes} ▲ ON YOUR PREDICTIONS`); SFX.coin(); P.myVotes = mv; }
      else if (mv < P.myVotes) P.myVotes = mv;
      if (lead && lead.id !== P.lead && lead.pid === store.me) { setTimeout(() => toast('THE MOTHERSHIP HAS ABDUCTED YOUR PREDICTION'), 900); SFX.start(); }
      if (scrubbed > (P.scrubbed ?? 0)) { toast('YOUR PREDICTION WAS SCRUBBED. FIRE A BOLDER ONE.', 3000); SFX.boom(); vibrate([80, 40, 80]); }
      if (ups > (P.ups ?? 0)) { setTimeout(() => toast('LEVEL UP! YOUR PREDICTION IS POWERED UP'), 400); SFX.start(); }
      if (cybs > (P.cybs ?? 0)) { setTimeout(() => toast('THE CROWD DECLARED YOU CYBERBONKERS'), 1200); SFX.start(); }
    }
    P.lead = lead?.id; P.scrubbed = scrubbed; P.ups = ups; P.cybs = cybs;
  }

  store.on(render);
  setInterval(() => {
    if (P.mode === 'app') { render(); } else if (P.mode === 'join') join?.sync();
  }, 1000);
  render();
  return { connectFailed, render };
}
