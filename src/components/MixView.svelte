<script lang="ts">
  import { prep, peaks, beats } from '../lib/draw';
  import { shape } from '../lib/timeline';
  import type { Analysis, FadeCurve } from '../lib/types';

  /**
   * One transition, zoomed in: the outgoing song on top, the incoming one below, lined up
   * in set time so their beat ticks can be matched by eye. Drag either lane sideways to
   * change which part of that song plays during the mix (the outgoing song's out point,
   * or the incoming song's in point).
   */
  let {
    a,
    b,
    aEnd,
    bStart,
    fade,
    curveIn,
    curveOut,
    playhead = null,
    ondrag,
  }: {
    a?: Analysis;
    b?: Analysis;
    /** outgoing clip's out point */
    aEnd: number;
    /** incoming clip's in point */
    bStart: number;
    fade: number;
    curveIn: FadeCurve;
    curveOut: FadeCurve;
    /** seconds since the mix started, if playing */
    playhead?: number | null;
    ondrag: (lane: 'a' | 'b', phase: 'start' | 'move', deltaSec: number) => void;
  } = $props();

  const H = 176;
  let canvas: HTMLCanvasElement;
  let w = $state(0);
  const pad = $derived(Math.max(4, fade * 0.35));
  const m0 = $derived(-pad);
  const m1 = $derived(fade + pad);
  const mx = (m: number) => ((m - m0) / (m1 - m0)) * w;

  $effect(() => {
    if (!w || !canvas) return;
    const g = prep(canvas, w, H);
    const lane = H / 2;
    g.fillStyle = '#1a2027';
    g.fillRect(0, 0, w, H);
    g.fillStyle = 'rgb(170 92 195 / 0.14)';
    g.fillRect(mx(0), 0, mx(fade) - mx(0), H);
    // Song time at mix time m: outgoing = aEnd - fade + m, incoming = bStart + m.
    const aOff = aEnd - fade;
    if (a) {
      peaks(g, a, aOff + m0, aOff + m1, 0, w, 12, lane - 16, (t) => (t <= aEnd ? '#4fc3f7' : '#2f3a44'));
      beats(g, a, aOff + m0, aOff + m1, 0, w, 2, lane - 4);
    }
    if (b) {
      peaks(g, b, bStart + m0, bStart + m1, 0, w, lane + 4, lane - 16, (t) => (t >= bStart ? '#ce93d8' : '#2f3a44'));
      beats(g, b, bStart + m0, bStart + m1, 0, w, lane + 2, lane - 4);
    }
    g.fillStyle = '#333d48';
    g.fillRect(0, lane - 0.5, w, 1);
    // Gain curves.
    const env = (top: number, fn: (x: number) => number, color: string) => {
      g.strokeStyle = color;
      g.lineWidth = 2;
      g.beginPath();
      const y = (v: number) => top + lane - 4 - v * (lane - 10);
      g.moveTo(0, y(fn(0)));
      g.lineTo(mx(0), y(fn(0)));
      for (let i = 0; i <= 32; i++) g.lineTo(mx((fade * i) / 32), y(fn(i / 32)));
      g.lineTo(w, y(fn(1)));
      g.stroke();
    };
    if (fade > 0) {
      env(0, (x) => shape(curveOut, 1 - x), 'rgb(255 255 255 / 0.6)');
      env(lane, (x) => shape(curveIn, x), 'rgb(255 255 255 / 0.6)');
    }
    g.fillStyle = '#9aa4ae';
    g.font = '11px system-ui';
    g.fillText('OUT', 6, 12);
    g.fillText('IN', 6, lane + 14);
    if (playhead != null && playhead >= m0 && playhead <= m1) {
      g.fillStyle = '#ef5350';
      g.fillRect(Math.round(mx(playhead)) - 1, 0, 2, H);
    }
  });

  let laneDown: 'a' | 'b' | null = null;
  let downX = 0;

  function down(e: PointerEvent) {
    laneDown = e.offsetY < H / 2 ? 'a' : 'b';
    downX = e.offsetX;
    canvas.setPointerCapture(e.pointerId);
    ondrag(laneDown, 'start', 0);
  }
  function move(e: PointerEvent) {
    if (!laneDown) return;
    // Content follows the finger: dragging right plays earlier material at the same moment.
    ondrag(laneDown, 'move', -((e.offsetX - downX) / w) * (m1 - m0));
  }
</script>

<div class="mixview" bind:clientWidth={w}>
  <canvas bind:this={canvas} style="height: {H}px" onpointerdown={down} onpointermove={move} onpointerup={() => (laneDown = null)} onpointercancel={() => (laneDown = null)}></canvas>
</div>

<style>
  .mixview {
    border-radius: var(--radius);
    overflow: hidden;
  }
  canvas {
    display: block;
    width: 100%;
    touch-action: pan-y;
  }
</style>
