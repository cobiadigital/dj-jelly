import type { Clip, DjSet, FadeCurve } from './types';

/** Where each clip sits in the set. Overlaps are clamped so fades never cross each other. */
export interface Placed {
  clip: Clip;
  index: number;
  /** set time the clip starts */
  at: number;
  len: number;
  /** fade in (overlap with the previous clip, or from silence for the first) */
  fadeIn: number;
  /** fade out (overlap with the next clip, or the set's final fade) */
  fadeOut: number;
  /** alternate decks so overlapping clips sit on different lanes */
  deck: 0 | 1;
}

export function clipLength(c: Clip) {
  const end = c.end > c.start ? c.end : (c.track.duration || 240);
  return Math.max(1, end - c.start);
}

export function layout(set: Pick<DjSet, 'clips' | 'fadeOut'>): { items: Placed[]; total: number } {
  const clips = set.clips;
  const len = clips.map(clipLength);
  const fin = clips.map((c, i) => Math.max(0, Math.min(c.fadeIn, len[i], i ? len[i - 1] : Infinity)));
  // Each clip must fit its fade in and fade out.
  for (let i = 0; i < clips.length; i++) {
    const next = i + 1 < clips.length ? fin[i + 1] : 0;
    if (fin[i] + next > len[i] && i + 1 < clips.length) fin[i + 1] = Math.max(0, len[i] - fin[i]);
  }
  const items: Placed[] = [];
  let at = 0;
  for (let i = 0; i < clips.length; i++) {
    if (i) at += len[i - 1] - fin[i];
    const fadeOut = i + 1 < clips.length ? fin[i + 1] : Math.max(0, Math.min(set.fadeOut, len[i] - fin[i]));
    items.push({ clip: clips[i], index: i, at, len: len[i], fadeIn: fin[i], fadeOut, deck: (i % 2) as 0 | 1 });
  }
  const last = items.at(-1);
  return { items, total: last ? last.at + last.len : 0 };
}

/** Fade-in gain for progress x (0..1). A fade-out uses shape(1 - x). */
export function shape(curve: FadeCurve, x: number) {
  x = Math.min(1, Math.max(0, x));
  return curve === 'equal' ? Math.sin((x * Math.PI) / 2) : x;
}

/** Gain of a placed clip at time u seconds into the clip. */
export function gainAt(p: Placed, u: number, nextCurve: FadeCurve = p.clip.curve) {
  let g = 1;
  if (p.fadeIn > 0 && u < p.fadeIn) g *= shape(p.clip.curve, u / p.fadeIn);
  const outStart = p.len - p.fadeOut;
  if (p.fadeOut > 0 && u > outStart) g *= shape(nextCurve, 1 - (u - outStart) / p.fadeOut);
  return g;
}
