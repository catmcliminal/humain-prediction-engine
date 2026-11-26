/** Sets innerHTML only when it changed, so repeated renders do not steal focus or restart animations. */
const last = new WeakMap<Element, string>();
export function paint(el: Element, html: string) {
  if (last.get(el) === html) return false;
  last.set(el, html);
  el.innerHTML = html;
  return true;
}

/** Keyed list: one child per id, patched in place and kept in the given order. */
export function paintList(list: Element, items: { id: string; html: string; cls?: string }[]) {
  const have = new Map([...list.children].map((c) => [(c as HTMLElement).dataset.key!, c as HTMLElement]));
  items.forEach((it, i) => {
    let el = have.get(it.id);
    have.delete(it.id);
    if (!el) { el = document.createElement('li'); el.dataset.key = it.id; }
    el.className = it.cls ?? '';
    paint(el, it.html);
    if (list.children[i] !== el) list.insertBefore(el, list.children[i] ?? null);
  });
  have.forEach((el) => el.remove());
}
