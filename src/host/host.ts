import './host.css';
import type { Store } from '../data/store';
import { loadFlagger } from '../shared/flags';
import { awaiting, deckCards } from '../shared/game';
import { STATES, type StateName } from '../shared/types';
import { paint, paintList } from '../ui/paint';
import { toast } from '../ui/toast';
import { $, esc } from '../ui/util';

const PAGE = 100;
const LABEL: Record<StateName, string> = { ARRIVAL: 'ARRIVAL', PAUSED: 'PAUSED', LIVE_QUIZ: 'LIVE QUIZ', QUIZ_RESULTS: 'RESULTS', PREDICT: 'PREDICT', FROZEN: 'FREEZE' };

/** Host panel (/host or #host), unlocked with the host word. The projector never shows any of this. */
export function mountHost(root: HTMLElement, store: Store) {
  let open = false, shown = PAGE, armed = '', isFlagged: undefined | ((t: unknown) => boolean);
  void loadFlagger().then((f) => { isFlagged = f; render(); });

  function gate() {
    root.innerHTML = `<form class="hostgate" id="gate"><h1 class="px">HOST PANEL</h1>
      <label class="field" for="word">HOST WORD</label><input class="inp" id="word" type="password" autocomplete="current-password" autocapitalize="off" required>
      <p class="err px" id="gerr" role="alert"></p><button class="big">UNLOCK</button></form>`;
    $('#gate').addEventListener('submit', async (e) => {
      e.preventDefault();
      if (await store.unlockHost($<HTMLInputElement>('#word').value)) enter();
      else $('#gerr').textContent = 'WRONG WORD, OR NOT CONNECTED';
    });
  }
  function enter() {
    open = true;
    root.innerHTML = `<div class="hostwrap">
      <header class="hosthead"><h1 class="px">HOST PANEL</h1><div class="hcounts" id="hcounts"></div></header>
      <div id="hconn" class="px conn" role="status" hidden>RECONNECTING</div>
      <section><h2 class="sect">WHAT EVERYONE SEES</h2><div class="states" id="states"></div></section>
      <section id="quiz"></section>
      <section><h2 class="sect">PREDICTIONS</h2><ul id="queue" class="queue"></ul><p id="qempty" class="empty px" hidden>NO PREDICTIONS YET.</p>
      <button class="big more" id="hmore" hidden>SHOW MORE</button></section></div>`;
    $('#hmore').addEventListener('click', () => { shown += PAGE; render(); });
    render();
  }

  root.addEventListener('click', async (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-act]');
    if (!b || b.disabled) return;
    const { act, id = '' } = b.dataset;
    // Anything that changes the room or throws away answers needs a second tap.
    const guard = act === 'reset' || (act === 'state' && id === 'FROZEN');
    if (guard && armed !== `${act}${id}`) { armed = `${act}${id}`; render(); setTimeout(() => { armed = ''; render(); }, 4000); return; }
    armed = '';
    try {
      if (act === 'state') await store.setState(id as StateName);
      else if (act === 'show') await store.showCard(id);
      else if (act === 'reveal') await store.reveal(id);
      else if (act === 'reset') await store.resetQuiz();
      else if (act === 'hide') await store.hide(id);
      else if (act === 'restore') await store.restore(id);
    } catch (err) { console.error(err); toast('FAILED. TRY AGAIN'); }
    render();
  });

  function quizHtml(off: string) {
    const s = store.state, cur = s.show.card ?? '';
    const live = deckCards(s, 'live');
    const next = live.find((c) => !s.opened[c.id] && !s.revealed[c.id]);
    const card = s.cards[cur], key = s.keys[cur];
    const players = Object.values(s.players).filter((p) => p.name).length;
    return `<h2 class="sect">LIVE QUIZ</h2>
      ${card ? `<div class="qi"><p class="qt">${esc(card.text)}</p><p class="qm">${key ? `Answer: <b>${key.real ? 'REAL' : 'FAKE'}</b> · ` : ''}${Object.keys(s.answered[cur] ?? {}).length} of ${players} answered${s.revealed[cur] ? ' · revealed' : ''}</p></div>` : '<p class="qm">No card on screen.</p>'}
      <div class="states">
        <button class="act restore px" data-act="reveal" data-id="${esc(cur)}"${!card || s.revealed[cur] ? ' disabled' : off}>REVEAL</button>
        <button class="act restore px" data-act="show" data-id="${esc(next?.id)}"${next ? off : ' disabled'}>${next ? `NEXT CARD (${live.indexOf(next) + 1}/${live.length})` : 'NO CARDS LEFT'}</button>
        <button class="act hide px" data-act="reset"${off}>${armed === 'reset' ? 'TAP AGAIN TO WIPE' : 'RESET QUIZ'}</button></div>
      <details><summary class="px">ALL CARDS</summary><ul class="cardlist">${[...live, ...deckCards(s, 'reserve')].map((c) =>
        `<li><button class="act restore px" data-act="show" data-id="${c.id}"${off}>SHOW</button><span>${c.deck === 'reserve' ? '[reserve] ' : ''}${esc(c.text)}${s.revealed[c.id] ? ' (done)' : ''}</span></li>`).join('')}</ul></details>`;
  }

  function render() {
    if (!open || !root.querySelector('#queue')) return;
    const s = store.state, off = store.connected ? '' : ' disabled', state = store.show();
    $('#hconn').hidden = store.connected;
    const votes = Object.values(s.votes).reduce((n, v) => n + Object.keys(v).length, 0);
    const all = Object.entries(s.preds).map(([id, p]) => ({
      id, p, flagged: !p.seed && (!!store.flags[id] || !!isFlagged?.(p.text)), hidden: !!s.hidden[id], restored: !!s.restored[id], waiting: awaiting(s, id, p),
    }));
    all.sort((a, b) => Number(b.flagged && !b.restored) - Number(a.flagged && !a.restored) || Number(b.waiting) - Number(a.waiting) || b.p.ts - a.p.ts);
    const review = all.filter((x) => x.waiting || (x.flagged && !x.restored)).length;
    const button = (act: 'hide' | 'restore', label: string, id: string) => `<button class="act ${act} px" data-act="${act}" data-id="${esc(id)}"${off}>${label}</button>`;
    paint($('#hcounts'), ([['PLAYERS', Object.values(s.players).filter((p) => p.name).length], ['PREDICTIONS', all.length], ['VOTES', votes], ['TO REVIEW', review]] as const)
      .map(([k, v]) => `<div class="hc${k === 'TO REVIEW' && v ? ' alert' : ''}"><b>${v}</b><span class="px">${k}</span></div>`).join(''));
    paint($('#states'), STATES.map((n) => `<button class="act st px${state === n ? ' on' : ''}" aria-pressed="${state === n}" data-act="state" data-id="${n}"${off}>${armed === `state${n}` ? 'TAP AGAIN' : LABEL[n]}</button>`).join(''));
    const quiz = $('#quiz'), wasOpen = !!quiz.querySelector('details[open]');
    if (paint(quiz, quizHtml(off)) && wasOpen) quiz.querySelector('details')!.open = true;
    paintList($('#queue'), all.slice(0, shown).map((x) => ({
      id: x.id, cls: `qi${x.waiting ? ' is-waiting' : ''}${x.hidden ? ' is-hidden' : ''}${x.flagged && !x.restored ? ' is-flagged' : ''}`,
      html: `<div class="qh">${x.flagged && !x.restored ? '<span class="hchip flag px">FLAGGED</span>' : ''}${x.hidden ? '<span class="hchip hid px">HIDDEN</span>' : ''}${x.waiting ? '<span class="hchip wait px">WAITING</span>' : ''}</div>
        <p class="qt">${esc(x.p.text)}</p><div class="qf"><span class="qm">by ${esc(x.p.seed ? 'humAIn' : s.players[x.p.pid]?.name ?? '???')}</span>
        ${x.hidden ? button('restore', 'RESTORE', x.id) : `${x.waiting ? button('restore', 'APPROVE', x.id) : ''}${button('hide', 'HIDE', x.id)}`}</div>`,
    })));
    $('#qempty').hidden = all.length > 0;
    $('#hmore').hidden = all.length <= shown;
  }

  root.innerHTML = '<div class="hostgate"><p class="px blink" role="status">CHECKING...</p></div>';
  void (async () => {
    while (!store.ready && !store.fatal) await new Promise((r) => setTimeout(r, 300));
    if (await store.unlockHost()) enter(); else gate();
  })();
  store.on(render);
  setInterval(render, 1000);
}
