import { ls } from './util';

/** Chiptune effects. Optional: every audio event also has a visual equivalent. */
class Sfx {
  private ctx: AudioContext | null = null;
  on = ls.get<boolean>('pe27-snd') !== false;
  init() {
    if (!this.ctx) {
      try {
        const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        this.ctx = new AC();
      } catch { /* no audio */ }
    }
    if (this.ctx?.state === 'suspended') this.ctx.resume().catch(() => {});
  }
  setOn(v: boolean) { this.on = v; ls.set('pe27-snd', v); }
  tone(f1: number, f2: number, dur: number, type: OscillatorType = 'square', vol = 0.07, delay = 0) {
    if (!this.on || !this.ctx) return;
    const t = this.ctx.currentTime + delay, o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f1, t);
    o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.ctx.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  }
  boom() {
    if (!this.on || !this.ctx) return;
    const n = this.ctx.sampleRate * 0.4, b = this.ctx.createBuffer(1, n, this.ctx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2.5);
    const s = this.ctx.createBufferSource(), g = this.ctx.createGain();
    g.gain.value = 0.25;
    s.buffer = b;
    s.connect(g).connect(this.ctx.destination);
    s.start();
  }
  laser() { this.tone(1600, 110, 0.3); }
  blip() { this.tone(520, 880, 0.07); }
  coin() { this.tone(988, 988, 0.07); this.tone(1319, 1319, 0.22, 'square', 0.07, 0.08); }
  start() { [262, 330, 392, 523].forEach((f, i) => this.tone(f, f, 0.12, 'square', 0.06, i * 0.1)); }
  /** Pitch rises with level. */
  level(n: number) { this.tone(200 + n * 120, 200 + n * 120, 0.08); }
}
export const SFX = new Sfx();
