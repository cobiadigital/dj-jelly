<script lang="ts">
  import { transport, pause, resume, stop, seek } from '../lib/engine.svelte';
  import { getSet } from '../lib/sets.svelte';
  import { duration } from '../lib/format';
  import { href } from '../lib/router.svelte';
  import Icon from './Icon.svelte';

  const set = $derived(transport.setId === 'preview' ? undefined : getSet(transport.setId));
  const clip = $derived(set?.clips[transport.index]);

  function onBar(e: MouseEvent) {
    if (!transport.total) return;
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    seek(((e.clientX - r.left) / r.width) * transport.total);
  }
</script>

{#if transport.playing}
  <div class="transport">
    <button class="bar" onclick={onBar} aria-label="Seek">
      <span style="width: {transport.total ? (transport.position / transport.total) * 100 : 0}%"></span>
    </button>
    <div class="row main">
      <a class="info" href={set ? href('set', set.id) : undefined}>
        <div class="ellipsis title">
          {#if transport.loading}Loading…{:else if clip}{clip.track.title}{:else}Preview{/if}
        </div>
        <div class="ellipsis muted small">
          {#if transport.error}<span class="error">{transport.error}</span>
          {:else}{set ? `${set.name} · ` : ''}{duration(transport.position)} / {duration(transport.total)}{/if}
        </div>
      </a>
      {#if transport.paused}
        <button class="icon-btn" onclick={resume} aria-label="Resume"><Icon name="play" size={30} /></button>
      {:else}
        <button class="icon-btn" onclick={pause} aria-label="Pause"><Icon name="pause" size={30} /></button>
      {/if}
      <button class="icon-btn" onclick={stop} aria-label="Stop"><Icon name="stop" /></button>
    </div>
  </div>
{/if}

<style>
  .transport {
    position: fixed;
    left: 0;
    right: 0;
    bottom: calc(var(--nav-h) + var(--safe-b));
    z-index: 19;
    background: var(--surface-2);
    height: var(--mini-h);
  }
  .bar {
    display: block;
    width: 100%;
    height: 14px;
    margin-top: -7px;
    position: relative;
  }
  .bar::before,
  .bar span {
    content: '';
    position: absolute;
    left: 0;
    top: 5px;
    height: 4px;
    background: #333d48;
    width: 100%;
  }
  .bar span {
    background: var(--accent);
  }
  .main {
    padding: 0 8px 0 16px;
    height: calc(var(--mini-h) - 7px);
  }
  .info {
    flex: 1;
    min-width: 0;
  }
  .title {
    font-weight: 600;
  }
  .small {
    font-size: 0.8rem;
  }
</style>
