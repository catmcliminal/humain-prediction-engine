import { config } from '../config';
import type { Store } from '../data/store';
import { ANSWER_WINDOW_MS, FEED_PAGE, LEVELS, POST_INTERVAL_MS, PREDICTION_MAX, RATINGS } from '../shared/constants';
import { loadFlagger } from '../shared/flags';
import { board, deckCards, mythBusters, newest, phoneState, pointsFor, type BoardItem } from '../shared/game';
import { cleanPrediction, predictionError } from '../shared/text';
import type { Answer, StateName, Vote } from '../shared/types';
import { verdictBuzz } from '../ui/juice';
import { SFX } from '../ui/sound';
import { levelColor, ship, sprite } from '../ui/sprites';
import { paint, paintList } from '../ui/paint';
import { announce, toast } from '../ui/toast';
import { $, esc, vibrate } from '../ui/util';
import { mountJoin } from './join';

type Tab = 'write' | 'vote' | 'mine';

export function mountPhone(root: HTMLElement, store: Store) {
  const P = {
    mode: '' as '' | 'join' | 'app',
    tab: 'write' as Tab, busy: false, solo: null as string | null,
    shown: new Set<string>(), buzzed: new Set<string>(), limit: FEED_PAGE, lastState: '' as StateName | '',
    isFlagged: undefined as undefined | ((t: unknown) => boolean),
  };
  let join: ReturnType<typeof mountJoin> | null = null;
  void loadFlagger().then((f) => { P.isFlagged = f; render(); });

  function connecting() {
    root.innerHTML = `<div class="view" style="padding-top:60px;text-align:center">
      <h1 class="logo">PREDICTION<span>ENGINE</span></h1>
      <p class="px blink" style="font-size:12px;margin-top:40px;color:var(--c)" role="status">CONNECTING...</p>
      <div id="retry"></div></div>`;
  }
  function connectFailed() {
    toast('COULD NOT CONNECT TO GAME SERVER', 4000);
    const r = root.querySelector('#retry');
    if (r && !r.firstChild) {
      r.innerHTML = '<button class="big" style="margin-top:30px" id="retryBtn">RETRY</button>';
      $('#retryBtn').addEventListener('click', () => location.reload());
    }
  }
  const connectTimer = setTimeout(() => { if (!store.ready) connectFailed(); }, config.connectTimeoutMs);

  function buildShell() {
    P.mode = 'app'; join = null;
    root.innerHTML = `
    <div class="topwrap">
      <div class="top"><span id="ph-name"></span><span class="score" id="ph-score"></span><button id="sndBtn" aria-pressed="${SFX.on}">${SFX.on ? 'SND ON' : 'SND OFF'}</button></div>
      <div id="recon" class="recon px" role="status" hidden>RECONNECTING</div>
    </div>
    <section class="view" id="v-main"></section>
    <section class="view" id="v-board" hidden>
      <div id="v-write">
        <label class="prefix" for="predInp" style="display:block">IN 2027...</label>
        <textarea id="predInp" class="inp" maxlength="${PREDICTION_MAX}" placeholder="I predict that..."></textarea>
        <div class="count" id="count">0/${PREDICTION_MAX}</div>
        <button class="big" id="fireBtn">FIRE</button>
        <p class="fired" id="fired"></p>
      </div>
      <div id="v-list">
        <p class="sect" id="listHead"></p>
        <button class="chip px" id="newchip" hidden></button>
        <ul id="feed" class="plain"></ul>
        <p class="empty px" id="feedEmpty" hidden></p>
        <button class="big more" id="moreBtn" hidden>SHOW MORE</button>
      </div>
    </section>
    <nav class="tabs" id="tabs" aria-label="Game views" hidden>${(['write', 'vote', 'mine'] as Tab[]).map((t) => `<button data-tab="${t}">${t === 'vote' ? 'RATE' : t === 'write' ? 'PREDICT' : t.toUpperCase()}</button>`).join('')}</nav>`;
    $('#sndBtn').addEventListener('click', () => {
      SFX.setOn(!SFX.on); SFX.init();
      $('#sndBtn').textContent = SFX.on ? 'SND ON' : 'SND OFF';
      $('#sndBtn').setAttribute('aria-pressed', String(SFX.on));
    });
    $('#predInp').addEventListener('input', () => render());
    $('#fireBtn').addEventListener('click', fire);
    $('#newchip').addEventListener('click', () => { P.shown.clear(); render(); scrollTo({ top: 0 }); });
    $('#moreBtn').addEventListener('click', () => { P.limit += FEED_PAGE; render(); });
    $('#tabs').addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-tab]');
      if (!b) return;
      P.tab = b.dataset.tab as Tab; P.shown.clear(); P.limit = FEED_PAGE; render(); scrollTo({ top: 0 });
    });
  }

  root.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-act]');
    if (!b || b.disabled) return;
    const { act, id = '', v = '' } = b.dataset;
    SFX.init();
    if (act === 'answer') {
      SFX.blip(); vibrate(20);
      if (store.state.cards[id]?.deck === 'arrival') P.solo = id;
      store.answer(id, v as Answer).catch((err) => { console.error(err); toast('TOO LATE, OR NOT SENT'); if (P.solo === id) P.solo = null; render(); });
    } else if (act === 'next') { P.solo = null; scrollTo({ top: 0 }); } else if (act === 'vote') {
      SFX.blip();
      store.vote(id, Number(v) as Vote).catch((err) => { console.error(err); toast('RATING NOT COUNTED'); });
    } else if (act === 'tag') {
      SFX.blip();
      store.tag(id, !store.state.tags[id]?.[store.me]).catch((err) => { console.error(err); toast('TAG NOT COUNTED'); });
    }
    render();
  });

  async function fire() {
    const inp = $<HTMLTextAreaElement>('#predInp');
    const text = cleanPrediction(inp.value);
    const bad = predictionError(text);
    if (bad) { toast(bad); return; }
    if (P.busy || !store.canAct()) return;
    P.busy = true; inp.value = '';
    SFX.init(); SFX.start(); vibrate(30);
    try { const live = store.inRoom(); await store.submit(text); toast(live ? 'PREDICTION FIRED' : 'SENT. IT SHOWS ONCE APPROVED', live ? undefined : 3000); } catch (err) {
      console.error(err); inp.value = text; toast('NOT SENT. WAIT A MOMENT AND TRY AGAIN', 3000);
    }
    P.busy = false; render();
  }

  /* ---------- quiz pieces ---------- */
  function myScore() {
    const s = store.state;
    let total = 0;
    for (const [id, a] of Object.entries(s.answers)) {
      const mine = a[store.me], key = s.keys[id], card = s.cards[id];
      if (mine && key && card) total += pointsFor((mine.a === 'real') === key.real, card.deck === 'arrival', mine.ts, s.opened[id]);
    }
    return total;
  }
  const secondsLeft = (id: string) => Math.max(0, Math.ceil(((store.state.opened[id] ?? 0) + ANSWER_WINDOW_MS - store.now()) / 1000));
  const answerButtons = (id: string, off: boolean) => `<div class="ab">${(['real', 'fake'] as Answer[]).map((v) =>
    `<button class="big ans ${v}" data-act="answer" data-id="${id}" data-v="${v}"${off || !store.canAct() ? ' disabled' : ''}>${v.toUpperCase()}</button>`).join('')}</div>`;

  const levelButtons = (id: string, mine: Vote | undefined, off: boolean) => `<p class="px lv-q">HOW WILD IS IT?</p><div class="lvs">${RATINGS.map((n) =>
    `<button class="lv${mine === n ? ' on' : ''}" style="--rc:${levelColor(n)}" aria-pressed="${mine === n}" data-act="vote" data-id="${esc(id)}" data-v="${n}" aria-label="${LEVELS[n - 1]}, ${n} of 5"${off ? ' disabled' : ''}>${sprite(n, 3)}<span>${LEVELS[n - 1]}</span></button>`).join('')}</div>`;

  function reveal(id: string) {
    const s = store.state, key = s.keys[id], mine = s.answers[id]?.[store.me];
    if (!key) return '<p class="px empty" role="status">CHECKING...</p>';
    const ok = mine && (mine.a === 'real') === key.real;
    const pts = mine ? pointsFor(!!ok, s.cards[id].deck === 'arrival', mine.ts, s.opened[id]) : 0;
    const vote = key.seed ? s.votes[key.seed]?.[store.me] : undefined;
    return `<div class="verdict ${key.real ? 'real' : 'fake'}"><b class="px">IT'S ${key.real ? 'REAL' : 'FAKE'}</b>
      <span class="px">${!mine ? 'NO ANSWER' : ok ? `YOU GOT IT +${pts}` : 'NOT THIS TIME'}</span></div>
      <p class="explain">${esc(key.explainer)}</p>
      ${key.source ? `<p class="src"><a href="${esc(key.source)}" target="_blank" rel="noopener">Read the source</a></p>` : ''}
      ${key.seed ? `<div class="follow"><p>Didn't happen in 2026. Will it take place in 2027?</p><p class="seedtext">${esc(key.seedText)}</p>
        ${levelButtons(key.seed, vote, false)}</div>` : ''}`;
  }
  /** Buzz once when the answer to a card on screen arrives. */
  function buzz(state: StateName) {
    const s = store.state;
    const id = state === 'ARRIVAL' ? P.solo : state === 'LIVE_QUIZ' && s.show.card && s.revealed[s.show.card] ? s.show.card : null;
    const mine = id ? s.answers[id]?.[store.me] : undefined, key = id ? s.keys[id] : undefined;
    if (!mine || !key || P.buzzed.has(`${id}:${mine.ts}`)) return;
    P.buzzed.add(`${id}:${mine.ts}`);
    verdictBuzz((mine.a === 'real') === key.real);
  }
  const holding = (title: string, line: string) => `<div class="hold"><h2 class="px">${title}</h2><p>${line}</p><p class="px big-score">${myScore()}</p><p class="px dimtxt">YOUR SCORE</p></div>`;

  function mainHtml(state: StateName) {
    const s = store.state;
    if (state === 'ARRIVAL') {
      const deck = deckCards(s, 'arrival');
      const card = (P.solo && deck.find((c) => c.id === P.solo)) || deck.find((c) => !s.answered[c.id]?.[store.me] && !s.revealed[c.id]);
      if (!card) return holding("YOU'RE IN", 'Watch the big screen. The live round starts soon.');
      const done = !!s.answered[card.id]?.[store.me];
      const n = deck.indexOf(deck.find((c) => c.id === card.id)!) + 1;
      return `<p class="sect">WARM UP ${n} OF ${deck.length}: REAL OR FAKE?</p><p class="headline">${esc(card.text)}</p>
        ${done ? `${reveal(card.id)}<button class="big" data-act="next" style="margin-top:20px">NEXT</button>` : answerButtons(card.id, false)}`;
    }
    if (state === 'PAUSED') return holding('BACK AT 5', 'Grab a drink.');
    if (state === 'LIVE_QUIZ') {
      const id = s.show.card;
      if (!id || !s.cards[id]) return holding('GET READY', 'Eyes on the big screen.');
      const mine = !!s.answered[id]?.[store.me], left = secondsLeft(id);
      let body: string;
      if (s.revealed[id]) body = reveal(id);
      else body = `${answerButtons(id, mine || left === 0)}<p class="px timer" role="timer">${mine ? 'LOCKED IN' : left ? `${left}s` : "TIME'S UP"}</p>`;
      return `<p class="sect">REAL OR FAKE?</p><p class="headline">${esc(s.cards[id].text)}</p>${body}`;
    }
    if (state === 'QUIZ_RESULTS') {
      const ranks = mythBusters(s, P.isFlagged);
      const i = ranks.findIndex((r) => r.pid === store.me);
      return `${holding(i >= 0 ? `YOU CAME #${i + 1}` : 'RESULTS', `Out of ${ranks.length} players.`)}${rankTable(ranks.slice(0, 5))}`;
    }
    return '';
  }
  const rankTable = (rows: ReturnType<typeof mythBusters>) => `<table class="hs"><tbody>${rows.map((r, i) =>
    `<tr class="${r.pid === store.me ? 'me' : ''}"><td class="r">${i + 1}</td><td style="color:${esc(r.color)}">${esc(r.name)}</td><td class="s">${r.points}</td></tr>`).join('')}</tbody></table>`;

  /* ---------- board ---------- */
  function cardHtml(x: BoardItem, frozen: boolean) {
    const mine = x.pid === store.me, my = store.state.votes[x.id]?.[store.me], tagged = !!store.state.tags[x.id]?.[store.me];
    const off = frozen || !store.canAct() ? ' disabled' : '';
    // The header shows the crowd's call: that level's alien, its name, and a five-step meter filled to the average.
    const meter = RATINGS.map((n) => `<i style="--rc:${levelColor(n)};--fill:${Math.round(100 * Math.min(1, Math.max(0, (x.avg ?? 0) - (n - 1))))}%"></i>`).join('');
    return `<article class="pred${x.level ? '' : ' unrated'}"${x.level ? ` style="--lc:${levelColor(x.level)}"` : ''}>
      <header class="pred-head">${sprite(x.level ?? 1, 6)}<div class="pred-call"><b class="px">${x.level ? LEVELS[x.level - 1] : 'UNRATED'}</b>
        <span>${x.level ? `${x.avg!.toFixed(1)} from ${x.total} rating${x.total === 1 ? '' : 's'}` : 'No ratings yet'}</span><div class="meter" aria-hidden="true">${meter}</div></div></header>
      <p class="pred-text">${esc(x.text)}</p>
      <p class="pred-by">${ship(esc(x.color), 2)}<span style="color:${esc(x.color)}">${esc(x.author)}</span>${x.cyber ? `<em class="px cybertxt">CYBERBONKERS ${x.cyber}</em>` : ''}</p>
      ${mine ? `<p class="px pred-mine">${x.pending ? 'WAITING FOR APPROVAL' : 'YOURS'}</p>` : frozen ? '' : `<div class="pred-act">${levelButtons(x.id, my, !!off)}
        <button class="cyb px${tagged ? ' on' : ''}" aria-pressed="${tagged}" data-act="tag" data-id="${esc(x.id)}"${off}>${sprite(6, 3)}CYBERBONKERS</button></div>`}</article>`;
  }

  function renderBoard(frozen: boolean) {
    const s = store.state;
    const tab: Tab = frozen && P.tab === 'write' ? 'vote' : P.tab;
    $('#v-write').hidden = tab !== 'write';
    $('#v-list').hidden = tab === 'write';
    for (const b of $('#tabs').querySelectorAll<HTMLButtonElement>('button')) {
      b.hidden = frozen && b.dataset.tab === 'write';
      b.classList.toggle('on', b.dataset.tab === tab);
      b.setAttribute('aria-current', String(b.dataset.tab === tab));
      if (b.dataset.tab === 'vote') b.textContent = frozen ? 'BOARD' : 'RATE';
    }
    if (tab === 'write') {
      const len = $<HTMLTextAreaElement>('#predInp').value.length;
      $('#count').textContent = `${len}/${PREDICTION_MAX}`;
      const wait = Math.ceil(((s.players[store.me]?.lastPost ?? 0) + POST_INTERVAL_MS - store.now()) / 1000);
      const btn = $<HTMLButtonElement>('#fireBtn');
      btn.disabled = P.busy || !store.canAct() || wait > 0 || len === 0;
      btn.textContent = wait > 0 ? `RELOADING... ${wait}s` : 'FIRE';
      const n = Object.values(s.preds).filter((p) => p.pid === store.me).length;
      $('#fired').textContent = `YOU HAVE MADE ${n} PREDICTION${n === 1 ? '' : 'S'}`;
      return;
    }
    const all = newest(board(s, P.isFlagged, tab === 'mine' ? store.me : undefined));
    const list = tab === 'mine' ? all.filter((x) => x.pid === store.me) : all;
    // New arrivals wait behind a button, so cards never move under a thumb.
    if (!P.shown.size || tab === 'mine') P.shown = new Set(list.map((x) => x.id));
    for (const x of list) if (x.pid === store.me) P.shown.add(x.id);
    const fresh = list.filter((x) => !P.shown.has(x.id)).length;
    const vis = list.filter((x) => P.shown.has(x.id));
    $('#listHead').textContent = frozen ? 'LOCKED. SEE YOU IN 2027.' : tab === 'mine' ? `YOUR PREDICTIONS · QUIZ SCORE ${myScore()}` : 'HOW WILD IS IT FOR 2027?';
    $('#newchip').hidden = !fresh;
    $('#newchip').textContent = `${fresh} NEW. TAP TO SHOW`;
    paintList($('#feed'), vis.slice(0, P.limit).map((x) => ({ id: x.id, html: cardHtml(x, frozen) })));
    $('#feedEmpty').hidden = list.length > 0;
    $('#feedEmpty').textContent = tab === 'mine' ? 'NOTHING FROM YOU YET.' : 'NO PREDICTIONS YET.';
    $('#moreBtn').hidden = vis.length <= P.limit;
  }

  function render() {
    if (!store.ready) { if (P.mode === 'join') join?.sync(); const r = root.querySelector<HTMLElement>('#recon'); if (r) r.hidden = store.connected; return; }
    clearTimeout(connectTimer);
    const me = store.state.players[store.me];
    if (!me?.name || !store.joinVerdict?.ok) {
      if (P.mode !== 'join') { P.mode = 'join'; join = mountJoin(root, store); }
      join!.sync();
      return;
    }
    if (P.mode !== 'app') buildShell();
    const state = phoneState(store.show(), store.inRoom());
    if (state !== P.lastState) { P.lastState = state; P.shown.clear(); scrollTo({ top: 0 }); announce(state.replace('_', ' ').toLowerCase()); }
    paint($('#ph-name'), `${ship(esc(me.color), 2)} <b style="color:${esc(me.color)};font-weight:normal">${esc(me.name)}</b>`);
    $('#ph-score').textContent = `${myScore()}`;
    $('#recon').hidden = store.connected;
    const onBoard = state === 'PREDICT' || state === 'FROZEN';
    $('#v-main').hidden = onBoard;
    $('#v-board').hidden = !onBoard;
    $('#tabs').hidden = !onBoard;
    if (onBoard) renderBoard(state === 'FROZEN');
    else paint($('#v-main'), mainHtml(state));
    buzz(state);
  }

  connecting();
  store.on(render);
  setInterval(() => { if (P.mode === 'app') render(); }, 500);
  return { connectFailed };
}
