import './styles/base.css';
import './styles/phone.css';
import { applyBrand, brand } from './brand.config';
import { Store } from './data/store';
import { mountPhone } from './phone/phone';
import { starfield } from './ui/starfield';
import { $ } from './ui/util';

applyBrand();
// Fonts come from the brand config; display=swap keeps first paint fast.
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = brand.fonts.googleFontsHref;
document.head.appendChild(link);
starfield();

const store = new Store();
const route = () => {
  const view = location.hash === '#screen' ? 'screen' : location.hash === '#host' ? 'host' : 'phone';
  for (const v of ['phone', 'screen', 'host']) $(`#${v}`).hidden = v !== view;
};
addEventListener('hashchange', route);
route();

const phone = mountPhone($('#phone'), store);
store.init().catch((e) => { console.error(e); phone.connectFailed(); });
