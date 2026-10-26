<script lang="ts">
  import type { Placed } from '../lib/timeline';

  /** Two-lane overview of a set: clips alternate between deck A and B so each mix shows as an overlap. */
  let {
    items,
    total,
    position = null,
    selected = -1,
    onseek,
    onselect,
  }: {
    items: Placed[];
    total: number;
    position?: number | null;
    selected?: number;
    onseek?: (t: number) => void;
    onselect?: (index: number) => void;
  } = $props();

  const pct = (t: number) => (total ? (t / total) * 100 : 0);
  const hue = (i: number) => (i * 47) % 360;

  function onclick(e: MouseEvent) {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const t = ((e.clientX - r.left) / r.width) * total;
    const hit = items.filter((p) => p.at <= t && p.at + p.len >= t && p.deck === ((e.clientY - r.top) / r.height < 0.5 ? 0 : 1)).at(-1);
    if (hit && onselect) onselect(hit.index);
    else onseek?.(t);
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<div class="timeline" role="slider" tabindex="-1" aria-label="Set timeline" aria-valuemin={0} aria-valuemax={total} aria-valuenow={position ?? 0} {onclick}>
  <span class="lane-label a">A</span>
  <span class="lane-label b">B</span>
  {#each items as p (p.clip.id)}
    <div
      class="clip"
      class:sel={p.index === selected}
      style="left: {pct(p.at)}%; width: {pct(p.len)}%; top: {p.deck ? 50 : 0}%; --h: {hue(p.index)}"
    >
      {#if p.fadeIn > 0}<span class="fade in" style="width: {(p.fadeIn / p.len) * 100}%"></span>{/if}
      {#if p.fadeOut > 0}<span class="fade out" style="width: {(p.fadeOut / p.len) * 100}%"></span>{/if}
      <span class="label">{p.index + 1}</span>
    </div>
  {/each}
  {#if position != null}<div class="playhead" style="left: {pct(position)}%"></div>{/if}
</div>

<style>
  .timeline {
    position: relative;
    height: 72px;
    background: var(--surface);
    border-radius: var(--radius);
    overflow: hidden;
    cursor: pointer;
    touch-action: manipulation;
  }
  .lane-label {
    position: absolute;
    left: 4px;
    font-size: 0.65rem;
    color: var(--muted);
    z-index: 2;
    pointer-events: none;
  }
  .lane-label.a {
    top: 2px;
  }
  .lane-label.b {
    top: calc(50% + 2px);
  }
  .clip {
    position: absolute;
    height: 50%;
    padding: 3px 0;
  }
  .clip::before {
    content: '';
    position: absolute;
    inset: 3px 0;
    border-radius: 4px;
    background: hsl(var(--h) 55% 45% / 0.85);
  }
  .clip.sel::before {
    outline: 2px solid var(--text);
    outline-offset: -2px;
  }
  .fade {
    position: absolute;
    top: 3px;
    bottom: 3px;
    z-index: 1;
  }
  .fade.in {
    left: 0;
    background: linear-gradient(to top right, rgb(0 0 0 / 0.45) 50%, transparent 50%);
  }
  .fade.out {
    right: 0;
    background: linear-gradient(to top left, rgb(0 0 0 / 0.45) 50%, transparent 50%);
  }
  .label {
    position: relative;
    z-index: 1;
    display: block;
    text-align: center;
    font-size: 0.75rem;
    font-weight: 700;
    line-height: 30px;
    pointer-events: none;
  }
  .playhead {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 2px;
    margin-left: -1px;
    background: #fff;
    z-index: 3;
    pointer-events: none;
  }
</style>
