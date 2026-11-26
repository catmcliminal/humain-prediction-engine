import { brand } from '../brand.config';
import { CALLSIGN_MAX } from '../shared/constants';
import { callsignOk, cleanCallsign } from '../shared/text';
import { JoinRejected, type Store } from '../data/store';
import { SHIP_COLORS, SHIP_COLOR_NAMES, sprite } from '../ui/sprites';
import { SFX } from '../ui/sound';
import { toast } from '../ui/toast';
import { $, esc, radioKeys } from '../ui/util';

export function mountJoin(root: HTMLElement, store: Store) {
  let color = SHIP_COLORS[0];
  const over = store.frozen();
  root.innerHTML = `<div class="view join" style="padding-top:40px">
    <div class="presents px">${esc(brand.presentsLine)}</div>
    <h1 class="logo">${esc(brand.title.first)}<span>${esc(brand.title.second)}</span></h1>
    <div class="march" aria-hidden="true">${[1, 2, 3, 4, 5].map((l) => sprite(l, 4)).join('')}</div>
    <p class="blurb">2026 was the wildest year of AI developments and hype yet. But what lies ahead? Make your prediction for 2027.</p>
    <label class="field" for="nameInp">ENTER NICKNAME</label>
    <input id="nameInp" class="inp" maxlength="${CALLSIGN_MAX}" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="PLAYER1" aria-describedby="joinErr"${over ? ' disabled' : ''}>
    <p id="joinErr" class="err px" role="alert"></p>
    <span class="field" id="shipLbl" style="margin-top:22px;display:block">PICK YOUR SHIP</span>
    <div class="swatches" role="radiogroup" aria-labelledby="shipLbl">${SHIP_COLORS.map((c, i) =>
      `<button type="button" role="radio" aria-checked="${c === color}" style="--sw:${c}" data-c="${c}" class="${c === color ? 'on' : ''}" aria-label="${SHIP_COLOR_NAMES[i]}"></button>`).join('')}</div>
    <button class="big" id="startBtn" disabled>${over ? 'GAME OVER' : '<span class="blink">PRESS START</span>'}</button>
    <p class="consent">${esc(brand.consentLine)}</p>
  </div>`;

  const inp = $<HTMLInputElement>('#nameInp'), btn = $<HTMLButtonElement>('#startBtn'), err = $('#joinErr');
  const valid = () => callsignOk(cleanCallsign(inp.value));
  const sync = () => { btn.disabled = over || !valid() || !store.canAct(); };
  inp.addEventListener('input', () => { err.textContent = ''; sync(); });
  const sw = root.querySelector('.swatches') as HTMLElement;
  radioKeys(sw);
  sw.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest('button');
    if (!b) return;
    color = b.dataset.c!;
    sw.querySelectorAll('button').forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-checked', String(x === b)); });
    SFX.init(); SFX.blip();
  });
  const go = async () => {
    if (btn.disabled || store.frozen()) return;
    SFX.init(); SFX.start();
    btn.disabled = true;
    try {
      await store.join(cleanCallsign(inp.value), color); // the player record arrives through the listener
    } catch (e) {
      console.error(e);
      if (e instanceof JoinRejected) { err.textContent = e.message; inp.focus(); } else toast('COULD NOT JOIN');
      sync();
    }
  };
  btn.addEventListener('click', go);
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
  return { sync };
}
