import { beatsBetween } from './analysis.svelte';
import { PEAKS_PER_SEC, type Analysis } from './types';

/** Sizes a canvas for the screen's pixel density and returns a context in CSS pixels. */
export function prep(canvas: HTMLCanvasElement, w: number, h: number) {
  const dpr = window.devicePixelRatio || 1;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  const g = canvas.getContext('2d')!;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);
  return g;
}

/**
 * Waveform of song time t0..t1 across x0..x1, centred in the band y..y+h.
 * color(t) picks the colour per column (e.g. brighter inside the clip).
 */
export function peaks(g: CanvasRenderingContext2D, a: Analysis, t0: number, t1: number, x0: number, x1: number, y: number, h: number, color: (t: number) => string) {
  const w = x1 - x0;
  const per = (t1 - t0) / w;
  const mid = y + h / 2;
  for (let x = 0; x < w; x++) {
    const ta = t0 + x * per;
    const tb = ta + per;
    if (tb < 0 || ta > a.duration) continue;
    let i = Math.max(0, Math.floor(ta * PEAKS_PER_SEC));
    const j = Math.min(a.peaks.length, Math.max(i + 1, Math.ceil(tb * PEAKS_PER_SEC)));
    let m = 0;
    for (; i < j; i++) m = Math.max(m, a.peaks[i]);
    const half = Math.max(0.5, (m / 255) * (h / 2 - 1));
    g.fillStyle = color(ta);
    g.fillRect(x0 + x, mid - half, 1, half * 2);
  }
}

/** Beat ticks; bars (every 4 beats from the grid start) are taller. Skipped when too dense to read. */
export function beats(g: CanvasRenderingContext2D, a: Analysis, t0: number, t1: number, x0: number, x1: number, y: number, h: number) {
  const pxPerBeat = ((x1 - x0) / (t1 - t0)) * (60 / a.bpm);
  if (pxPerBeat < 3) return;
  for (const b of beatsBetween(a, Math.max(0, t0), Math.min(a.duration, t1))) {
    if (!b.bar && pxPerBeat < 8) continue;
    const x = x0 + ((b.t - t0) / (t1 - t0)) * (x1 - x0);
    g.fillStyle = b.bar ? 'rgb(255 255 255 / 0.55)' : 'rgb(255 255 255 / 0.2)';
    g.fillRect(Math.round(x), b.bar ? y : y + h * 0.25, 1, b.bar ? h : h * 0.5);
  }
}
