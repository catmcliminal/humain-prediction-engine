import { $, reducedMotion } from './util';

/** Decorative background. Static when the player prefers reduced motion. */
export function starfield() {
  const c = $<HTMLCanvasElement>('#stars'), x = c.getContext('2d')!;
  let W = 0, H = 0, S: { x: number; y: number; z: number }[] = [];
  const size = () => {
    W = c.width = innerWidth; H = c.height = innerHeight;
    S = Array.from({ length: 110 }, () => ({ x: Math.random() * W, y: Math.random() * H, z: Math.random() * 0.9 + 0.1 }));
  };
  size();
  addEventListener('resize', size);
  const still = reducedMotion();
  let last = 0;
  const frame = (t: number) => {
    requestAnimationFrame(frame);
    if (t - last < 33) return;
    last = t;
    x.clearRect(0, 0, W, H);
    for (const s of S) {
      if (!still) { s.y += s.z * 1.2; if (s.y > H) { s.y = 0; s.x = Math.random() * W; } }
      x.fillStyle = s.z > 0.7 ? '#ffffff' : s.z > 0.4 ? '#8a86b8' : '#3a3460';
      const k = s.z > 0.7 ? 3 : 2;
      x.fillRect(s.x | 0, s.y | 0, k, k);
    }
  };
  frame(0);
}
