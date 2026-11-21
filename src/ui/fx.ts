import { SFX } from './sound';
import { levelColor, ship, sprite } from './sprites';
import { $, reducedMotion, vibrate } from './util';
import { announce } from './toast';

/** Fire animation. With reduced motion it shortens to the message only. */
export function fireFx(tag: number, color: string) {
  const fx = $('#fx');
  announce('Prediction launched');
  if (reducedMotion()) {
    fx.innerHTML = '<div class="fx-msg px" style="opacity:1">PREDICTION<br><br>LAUNCHED</div>';
    fx.className = 'go';
    setTimeout(() => { fx.className = ''; fx.innerHTML = ''; }, 900);
    return;
  }
  const c = levelColor(tag);
  fx.innerHTML = `<div class="fx-target">${sprite(tag, 9)}</div><div class="fx-beam"></div><div class="fx-ship">${ship(color, 7)}</div><div class="fx-msg px">PREDICTION<br><br>LAUNCHED</div>`;
  fx.className = 'go';
  SFX.laser();
  setTimeout(() => {
    fx.classList.add('hit');
    SFX.boom();
    for (let i = 0; i < 18; i++) {
      const b = document.createElement('i');
      b.className = 'bit';
      const a = Math.random() * Math.PI * 2, d = 60 + Math.random() * 120;
      b.style.cssText = `--bc:${c};--dx:${Math.cos(a) * d}px;--dy:${Math.sin(a) * d}px`;
      fx.appendChild(b);
    }
    vibrate([30, 40, 60]);
  }, 420);
  setTimeout(() => { fx.className = ''; fx.innerHTML = ''; }, 1700);
}
