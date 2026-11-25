import './host.css';
import type { Store } from '../data/store';
import { LEVELS } from '../shared/constants';
import type { FlagList, GameState, Prediction } from '../shared/types';
import { levelColor, sprite } from '../ui/sprites';
import { toast } from '../ui/toast';
import { $, esc } from '../ui/util';

const PAGE = 100;

interface Item { id: string; p: Prediction; flagged: boolean; hidden: boolean; restored: boolean; scrubbed: boolean }

/**
 * Moderation view (#host). No PIN: it is an unlinked address and the group is small and connected.
 * The projector never shows any of this.
 */
export function mountHost(root: HTMLElement, store: Store) {
  const H = { shown: PAGE, isFlagged: undefined as undefined | ((t: unknown) => boolean), checked: false };
  const items = new Map<string, { el: HTMLElement; sig: string }>();

  import('../shared/flagger').then(async (m) => {
    H.isFlagged = m.makeFlagger((await import('../shared/flagwords.json')).default as FlagList);
    render();
  });

  function build() {
    root.innerHTML = `<div class="hostwrap">
      <header class="hosthead"><h1 class="px">HOST VIEW</h1><div class="hcounts" id="hcounts"></div></header>
      <div id="hconn" class="px conn" role="status" hidden></div>
      <section aria-label="Prediction queue"><ul id="queue" class="queue"></ul><p id="qempty" class="empty px" hidden>NO PREDICTIONS YET.</p>
      <button class="big more" id="hmore" hidden></button></section></div>`;
    items.clear();
    $('#queue').addEventListener('click', onClick);
    $('#hmore').addEventListener('click', () => { H.shown += PAGE; render(); });
  }

  async function onClick(e: Event) {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-act]');
    if (!b || b.disabled) return;
    const id = b.dataset.id!;
    b.disabled = true;
    try {
      await (b.dataset.act === 'hide' ? store.hide(id) : store.restore(id));
    } catch (err) {
      console.error(err);
      toast('FAILED. TRY AGAIN');
      b.disabled = false;
    }
  }

  /** Flagged-and-undecided items first (newest first), then everything else newest first. */
  function render() {
    if (!store.isHost || !root.querySelector('#queue')) return;
    const s = store.state;
    const all: Item[] = Object.entries(s.preds).map(([id, p]) => ({
      id, p,
      flagged: !!store.flags[id] || (!!H.isFlagged && H.isFlagged(p.text)),
      hidden: !!s.hidden[id], restored: !!s.restored[id], scrubbed: !!s.scrubbed[id],
    }));
    const pinned = (x: Item) => x.flagged && !x.restored;
    all.sort((a, b) => Number(pinned(b)) - Number(pinned(a)) || b.p.ts - a.p.ts);
    const votes = Object.values(s.votes).reduce((n, v) => n + Object.keys(v).length, 0);
    const review = all.filter((x) => x.flagged && x.hidden && !x.restored).length;
    $('#hcounts').innerHTML = ([
      ['PLAYERS', Object.keys(s.players).length], ['PREDICTIONS', all.length], ['VOTES', votes],
      ['HIDDEN', all.filter((x) => x.hidden).length], ['TO REVIEW', review], ['SCRUBBED', all.filter((x) => x.scrubbed).length],
    ] as const).map(([k, v]) => `<div class="hc${k === 'TO REVIEW' && review ? ' alert' : ''}"><b>${v}</b><span class="px">${k}</span></div>`).join('');
    const hc = $('#hconn');
    hc.hidden = store.connected || !store.everConnected;
    hc.textContent = 'RECONNECTING';

    const visible = all.slice(0, H.shown);
    const want = new Set(visible.map((x) => x.id));
    for (const [id, v] of items) if (!want.has(id)) { v.el.remove(); items.delete(id); }
    const list = $('#queue');
    visible.forEach((x, i) => {
      const sig = [x.flagged, x.hidden, x.restored, x.scrubbed, x.p.text, s.players[x.p.pid]?.name, Object.keys(s.votes[x.id] ?? {}).length, store.connected].join('|');
      let v = items.get(x.id);
      if (!v || v.sig !== sig) {
        const el = document.createElement('li');
        el.innerHTML = itemHtml(x, s);
        el.className = `qi${x.hidden ? ' is-hidden' : ''}${x.flagged && !x.restored ? ' is-flagged' : ''}`;
        const old = v?.el;
        const focus = old?.contains(document.activeElement) ? (document.activeElement as HTMLElement).dataset.act : null;
        v = { el, sig };
        items.set(x.id, v);
        if (old?.parentNode) old.replaceWith(el);
        if (focus) el.querySelector<HTMLElement>('button[data-act]')?.focus();
      }
      if (list.children[i] !== v.el) list.insertBefore(v.el, list.children[i] ?? null);
    });
    $('#qempty').hidden = all.length > 0;
    const more = all.length - visible.length;
    $('#hmore').hidden = more <= 0;
    $('#hmore').textContent = `SHOW ${Math.min(more, PAGE)} MORE`;
  }

  function itemHtml(x: Item, s: GameState) {
    const pl = s.players[x.p.pid], nv = Object.keys(s.votes[x.id] ?? {}).length;
    const dis = store.connected ? '' : ' disabled';
    const chips = [
      x.flagged && !x.restored ? '<span class="hchip flag px">FLAGGED</span>' : '',
      x.hidden ? '<span class="hchip hid px">HIDDEN</span>' : '',
      x.restored ? '<span class="hchip ok px">RESTORED</span>' : '',
      x.scrubbed ? '<span class="hchip px">SCRUBBED</span>' : '',
    ].join('');
    const time = new Date(x.p.ts).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    return `<div class="qh">${sprite(x.p.tag, 2)}<span class="px" style="color:${levelColor(x.p.tag)}">${LEVELS[x.p.tag]?.name ?? x.p.tag}</span>${chips}<time class="px">${time}</time></div>
      <p class="qt">${esc(x.p.text)}</p>
      <div class="qf"><span class="qm">by <b style="color:${esc(pl?.color)};font-weight:normal">${esc(pl?.name ?? '???')}</b> · ▲ ${nv}</span>
      ${x.hidden
        ? `<button class="act restore px" data-act="restore" data-id="${esc(x.id)}"${dis}>RESTORE</button>`
        : `<button class="act hide px" data-act="hide" data-id="${esc(x.id)}"${dis}>HIDE</button>`}</div>`;
  }

  store.on(() => { if (H.checked) render(); });
  setInterval(() => { if (H.checked) render(); }, 2000);
  root.innerHTML = '<div class="hostgate"><p class="px blink" role="status">CHECKING...</p></div>';
  const start = async (): Promise<void> => {
    while (!store.ready && !store.fatal) await new Promise((r) => setTimeout(r, 300));
    if (await store.detectHost()) { H.checked = true; build(); render(); return; }
    root.innerHTML = '<div class="hostgate"><p class="px" role="alert">COULD NOT CONNECT</p><button class="big" id="hretry">RETRY</button></div>';
    $('#hretry').addEventListener('click', () => { root.innerHTML = ''; void start(); });
  };
  void start();
}
