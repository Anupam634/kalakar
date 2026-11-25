export const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const ramp = (p: number, a: number, b: number) => clamp((p - a) / (b - a));
export const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
/** 0 outside [a,b], 1 inside, with soft edges. */
export const win = (p: number, a: number, b: number, f = 0.025) => Math.min(ramp(p, a - f, a), 1 - ramp(p, b, b + f));

/** Scroll progress through the pinned #story section, 0..1. */
export function measureStory(): number {
  const el = document.getElementById("story");
  if (!el) return 0;
  const r = el.getBoundingClientRect();
  const total = r.height - window.innerHeight;
  return total > 0 ? clamp(-r.top / total) : 0;
}

/** Chapter windows shared by the 3D scene and the captions. */
export const CH = {
  hero: [0, 0.05],
  product: [0.08, 0.2],
  design: [0.25, 0.37],
  voice: [0.41, 0.52],
  plan: [0.58, 0.7],
  post: [0.76, 0.88],
  end: [0.93, 1.01],
} as const;
