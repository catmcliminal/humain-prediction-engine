import { SFX } from './sound';
import { reducedMotion, vibrate } from './util';

/** Short celebration effects. Each one builds its own layer, so repainting the page cannot restart or cut it off. */
const add = (el: HTMLElement, ms: number) => { document.body.appendChild(el); setTimeout(() => el.remove(), ms); };

export function burst(x: number, y: number, colors: string[], count = 40, reach = 260) {
  if (reducedMotion()) return;
  for (let i = 0; i < count; i++) {
    const bit = document.createElement('i');
    bit.className = 'spark';
    const a = Math.random() * Math.PI * 2, d = reach * (0.35 + Math.random() * 0.65), size = 8 + Math.random() * 12;
    bit.style.cssText = `left:${x}px;top:${y}px;width:${size}px;height:${size}px;--bc:${colors[i % colors.length]};--dx:${Math.cos(a) * d}px;--dy:${Math.sin(a) * d}px;animation-delay:${Math.random() * 0.12}s`;
    add(bit, 1500);
  }
}

/** Big screen reveal: the answer slams in, with coins for real and an explosion for fake. */
export function slam(real: boolean) {
  if (real) { SFX.coin(); setTimeout(() => SFX.coin(), 220); } else { SFX.boom(); SFX.laser(); }
  if (reducedMotion()) return;
  const el = document.createElement('div');
  el.className = `slam px ${real ? 'real' : 'fake'}`;
  el.setAttribute('aria-hidden', 'true');
  el.textContent = real ? 'REAL' : 'FAKE';
  add(el, 1700);
  const colors = real ? ['#ffe600', '#ffd000', '#fff6a8', '#39ff14'] : ['#ff2bd6', '#ff8a00', '#ff5f5f', '#ffe600'];
  setTimeout(() => burst(innerWidth / 2, innerHeight / 2, colors, 70, Math.min(innerWidth, innerHeight) * 0.6), 260);
}

/** Phone: buzz, sound and a colour flash. iPhones do not vibrate from a web page, so the flash carries it there. */
export function verdictBuzz(right: boolean) {
  if (right) { vibrate([40, 60, 40, 60, 90]); SFX.coin(); } else { vibrate(350); SFX.wrong(); }
  if (reducedMotion()) return;
  const el = document.createElement('div');
  el.className = `flash ${right ? 'ok' : 'no'}`;
  el.setAttribute('aria-hidden', 'true');
  add(el, 800);
  if (right) burst(innerWidth / 2, innerHeight * 0.45, ['#ffe600', '#39ff14', '#fff'], 28, 170);
}
