import { $ } from './util';

let t: ReturnType<typeof setTimeout> | undefined;
/** #toast is a polite aria-live region, so every toast is announced. */
export function toast(msg: string, ms = 1800) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('on');
  clearTimeout(t);
  t = setTimeout(() => el.classList.remove('on'), ms);
}
export const hideToast = () => { clearTimeout(t); $('#toast').classList.remove('on'); };
/** Screen-reader-only announcement (no visual toast). */
export const announce = (msg: string) => { $('#sr').textContent = msg; };
