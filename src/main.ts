import './styles/base.css';
import './styles/phone.css';
import { applyBrand, brand } from './brand.config';
import { Store } from './data/store';
import { starfield } from './ui/starfield';
import { $ } from './ui/util';

applyBrand();
// Fonts come from the brand config; display=swap keeps first paint fast.
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = brand.fonts.googleFontsHref;
document.head.appendChild(link);
starfield();

type View = 'phone' | 'screen' | 'host';
const store = new Store();
const mounted = new Set<View>();
let phone: { connectFailed(): void } | null = null;
let initFailed = false;

/** Each view is loaded on first use, so the phone's first payload stays small. */
async function mount(view: View) {
  if (mounted.has(view)) return;
  mounted.add(view);
  if (view === 'phone') { phone = (await import('./phone/phone')).mountPhone($('#phone'), store); if (initFailed) phone.connectFailed(); }
  else if (view === 'screen') (await import('./screen/screen')).mountScreen($('#screen'), store);
  else (await import('./host/host')).mountHost($('#host'), store);
}
const route = () => {
  const hostPath = /\/host\/?$/.test(location.pathname);
  const view: View = location.hash === '#screen' ? 'screen' : location.hash === '#host' || hostPath ? 'host' : 'phone';
  for (const v of ['phone', 'screen', 'host']) $(`#${v}`).hidden = v !== view;
  document.body.dataset.view = view;
  void mount(view);
};
addEventListener('hashchange', route);
route();
store.init().catch((e) => { console.error(e); initFailed = true; phone?.connectFailed(); });
