export const $ = <T extends HTMLElement = HTMLElement>(s: string, r: ParentNode = document) => r.querySelector(s) as T;
export const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
export const pad = (n: number) => String(n).padStart(6, '0');
export const ls = {
  get<T>(k: string): T | null { try { return JSON.parse(localStorage.getItem(k) as string); } catch { return null; } },
  set(k: string, v: unknown) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } },
};
export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
export const vibrate = (p: number | number[]) => { try { navigator.vibrate?.(p); } catch { /* unsupported */ } };

/** Arrow keys move through a radiogroup's buttons (Left/Up previous, Right/Down next) and select them. */
export function radioKeys(group: HTMLElement) {
  group.addEventListener('keydown', (e) => {
    const k = e.key;
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(k)) return;
    const items = [...group.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    if (i < 0) return;
    e.preventDefault();
    const next = items[(i + (k === 'ArrowLeft' || k === 'ArrowUp' ? -1 : 1) + items.length) % items.length];
    next.focus();
    next.click();
  });
}
