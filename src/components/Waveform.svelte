<script lang="ts">
  import { nearestBeat } from '../lib/analysis.svelte';
  import { prep, peaks, beats } from '../lib/draw';
  import { shape } from '../lib/timeline';
  import type { Analysis, FadeCurve } from '../lib/types';

  /**
   * The whole song with the clip's in and out points as draggable handles. Tap anywhere
   * else to hear the song from there; drag sideways to scroll when zoomed in.
   */
  let {
    analysis,
    duration,
    start,
    end,
    fadeIn = 0,
    fadeOut = 0,
    curve = 'equal',
    playhead = null,
    snap = true,
    view = $bindable(),
    onchange,
    ontap,
  }: {
    analysis?: Analysis;
    duration: number;
    start: number;
    end: number;
    fadeIn?: number;
    fadeOut?: number;
    curve?: FadeCurve;
    playhead?: number | null;
    snap?: boolean;
    view: [number, number];
    onchange: (start: number, end: number) => void;
    ontap?: (t: number) => void;
  } = $props();

  const H = 128;
  let canvas: HTMLCanvasElement;
  let w = $state(0);

  const tx = (t: number) => ((t - view[0]) / (view[1] - view[0])) * w;
  const xt = (x: number) => view[0] + (x / w) * (view[1] - view[0]);

  $effect(() => {
    if (!w || !canvas) return;
    const g = prep(canvas, w, H);
    g.fillStyle = '#1a2027';
    g.fillRect(0, 0, w, H);
    const xs = tx(start);
    const xe = tx(end);
    g.fillStyle = 'rgb(0 164 220 / 0.12)';
    g.fillRect(xs, 0, xe - xs, H);
    if (analysis) {
      peaks(g, analysis, view[0], view[1], 0, w, 14, H - 28, (t) => (t >= start && t <= end ? '#4fc3f7' : '#46525e'));
      beats(g, analysis, view[0], view[1], 0, w, 0, 10);
    } else {
      g.fillStyle = '#9aa4ae';
      g.font = '13px system-ui';
      g.fillText('Analyzing…', 12, H / 2);
    }
    // Volume envelope across the clip.
    g.strokeStyle = '#aa5cc3';
    g.lineWidth = 2;
    g.beginPath();
    const len = end - start;
    const steps = 48;
    const yOf = (v: number) => H - 4 - v * (H - 8);
    for (let i = 0; i <= steps; i++) {
      const u = (len * i) / steps;
      let v = 1;
      if (fadeIn > 0 && u < fadeIn) v *= shape(curve, u / fadeIn);
      if (fadeOut > 0 && u > len - fadeOut) v *= shape(curve, (len - u) / fadeOut);
      const x = tx(start + u);
      if (i) g.lineTo(x, yOf(v));
      else g.moveTo(x, yOf(v));
    }
    g.stroke();
    for (const [x, label] of [
      [xs, 'IN'],
      [xe, 'OUT'],
    ] as const) {
      g.fillStyle = '#e8eaed';
      g.fillRect(Math.round(x) - 1, 0, 2, H);
      const kx = Math.max(11, Math.min(w - 11, x)); // keep the knob on screen
      g.beginPath();
      g.arc(kx, H - 10, 9, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#101418';
      g.font = 'bold 8px system-ui';
      g.textAlign = 'center';
      g.fillText(label, kx, H - 7);
      g.textAlign = 'start';
    }
    if (playhead != null) {
      g.fillStyle = '#ef5350';
      g.fillRect(Math.round(tx(playhead)) - 1, 0, 2, H);
    }
  });

  let mode: 'start' | 'end' | 'tap' | 'pan' | null = null;
  let downX = 0;
  let downView: [number, number] = [0, 0];

  function down(e: PointerEvent) {
    const x = e.offsetX;
    const ds = Math.abs(x - tx(start));
    const de = Math.abs(x - tx(end));
    mode = Math.min(ds, de) < 24 ? (ds <= de ? 'start' : 'end') : 'tap';
    downX = x;
    downView = [...view];
    canvas.setPointerCapture(e.pointerId);
  }

  function move(e: PointerEvent) {
    if (!mode) return;
    const x = e.offsetX;
    if (mode === 'tap' && Math.abs(x - downX) > 8) mode = 'pan';
    if (mode === 'pan') {
      const span = downView[1] - downView[0];
      let v0 = downView[0] - ((x - downX) / w) * span;
      v0 = Math.max(0, Math.min(duration - span, v0));
      view = [v0, v0 + span];
    } else if (mode === 'start' || mode === 'end') {
      let t = Math.max(0, Math.min(duration, xt(x)));
      if (snap) t = Math.min(duration, nearestBeat(analysis, t));
      if (mode === 'start') onchange(Math.min(t, end - 1), end);
      else onchange(start, Math.max(t, start + 1));
    }
  }

  function up(e: PointerEvent) {
    if (mode === 'tap') ontap?.(Math.max(0, xt(e.offsetX)));
    mode = null;
  }
</script>

<div class="wave" bind:clientWidth={w}>
  <canvas bind:this={canvas} style="height: {H}px" onpointerdown={down} onpointermove={move} onpointerup={up} onpointercancel={() => (mode = null)}></canvas>
</div>

<style>
  .wave {
    border-radius: var(--radius);
    overflow: hidden;
  }
  canvas {
    display: block;
    width: 100%;
    touch-action: pan-y;
  }
</style>
