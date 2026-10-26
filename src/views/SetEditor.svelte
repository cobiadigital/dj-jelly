<script lang="ts">
  import { getSet, touch, moveClip, removeClip, deleteSet, duplicateSet, exportSet } from '../lib/sets.svelte';
  import { layout } from '../lib/timeline';
  import { analyses, analyzing, retryAnalysis } from '../lib/analysis.svelte';
  import { transport, play, pause, resume, stop, seek } from '../lib/engine.svelte';
  import { whereIs } from '../lib/sources';
  import { duration, precise } from '../lib/format';
  import { href, go } from '../lib/router.svelte';
  import Icon from '../components/Icon.svelte';
  import Timeline from '../components/Timeline.svelte';

  let { id }: { id: string } = $props();
  const set = $derived(getSet(id));
  const lay = $derived(set ? layout(set) : { items: [], total: 0 });
  const isMine = $derived(transport.playing && transport.setId === id);
  let menu = $state(false);

  function playFrom(t: number) {
    if (set) play(set.id, set, t);
  }

  /** A few seconds before the mix, through to a few seconds after it. */
  function previewMix(i: number) {
    const p = lay.items[i];
    if (set && p) play(set.id, set, Math.max(0, p.at - 6), p.at + p.fadeIn + 4);
  }

  function beats(i: number) {
    const p = lay.items[i];
    const a = analyses[set!.clips[i - 1]?.track.key] ?? analyses[p.clip.track.key];
    return a ? Math.round((p.fadeIn * a.bpm) / 60) : null;
  }

  async function remove() {
    if (!set || !confirm(`Delete "${set.name}"?`)) return;
    if (isMine) stop();
    await deleteSet(set.id);
    go('sets');
  }
</script>

{#if !set}
  <main class="page"><p class="muted">This set doesn't exist anymore. <a href={href('sets')}>Back to sets</a></p></main>
{:else}
  <main class="page">
    <header class="row head">
      <a class="icon-btn" href={href('sets')} aria-label="Back"><Icon name="back" /></a>
      <input class="name" bind:value={set.name} oninput={() => touch(set)} aria-label="Set name" />
      <button class="icon-btn" onclick={() => (menu = true)} aria-label="More"><Icon name="more" /></button>
    </header>

    <div class="row summary">
      <span class="muted tabular">{set.clips.length} clips · {duration(lay.total)}</span>
      <span class="spacer"></span>
      {#if isMine && !transport.paused}
        <button class="btn" onclick={pause}><Icon name="pause" />Pause</button>
      {:else if isMine}
        <button class="btn primary" onclick={resume}><Icon name="play" />Resume</button>
      {:else}
        <button class="btn primary" onclick={() => playFrom(0)} disabled={!set.clips.length}><Icon name="play" />Play set</button>
      {/if}
    </div>

    {#if set.clips.length}
      <Timeline
        items={lay.items}
        total={lay.total}
        position={isMine ? transport.position : null}
        selected={isMine ? transport.index : -1}
        onseek={(t) => (isMine ? seek(t) : playFrom(t))}
        onselect={(i) => go('set', set.id, 'clip', set.clips[i].id)}
      />
      <p class="muted hint">Tap a clip to edit it, or the empty space to play from there.</p>
    {/if}

    <ol class="clips">
      {#each lay.items as p (p.clip.id)}
        {@const c = p.clip}
        {@const a = analyses[c.track.key]}
        {@const where = whereIs(c.track)}
        {#if p.index > 0}
          <li class="mix row">
            <Icon name="mix" size={18} />
            <span class="tabular">{p.fadeIn ? `${p.fadeIn.toFixed(1)}s mix` : 'Cut'}{beats(p.index) ? ` · ${beats(p.index)} beats` : ''}</span>
            <span class="spacer"></span>
            <button class="chip" onclick={() => previewMix(p.index)}><Icon name="play" size={16} />Preview</button>
          </li>
        {/if}
        <li class="card clip" class:now={isMine && transport.index === p.index}>
          <a class="info" href={href('set', set.id, 'clip', c.id)}>
            <div class="row top">
              <span class="num">{p.index + 1}</span>
              <span class="ellipsis title">{c.track.title}</span>
            </div>
            <div class="ellipsis muted small">{c.track.artist}</div>
            <div class="row meta small tabular">
              <span>{precise(c.start)} → {precise(c.end)}</span>
              <span class="muted">({duration(p.len)})</span>
              {#if a}<span class="muted">{a.bpm.toFixed(1)} BPM</span>
              {:else if analyzing[c.track.key]}<span class="error">{analyzing[c.track.key]}</span>
              {:else if c.track.key in analyzing}<span class="muted">Analyzing…</span>{/if}
              {#if where}<span class="badge {where}">{where}</span>{:else}<span class="badge">missing</span>{/if}
            </div>
          </a>
          <div class="row tools">
            <button class="icon-btn" onclick={() => playFrom(p.at)} aria-label="Play from here"><Icon name="play" /></button>
            <button class="icon-btn" onclick={() => moveClip(set, p.index, p.index - 1)} disabled={p.index === 0} aria-label="Move up"><Icon name="up" /></button>
            <button class="icon-btn" onclick={() => moveClip(set, p.index, p.index + 1)} disabled={p.index === set.clips.length - 1} aria-label="Move down"><Icon name="down" /></button>
            {#if analyzing[c.track.key]}
              <button class="chip" onclick={() => retryAnalysis(c.track)}>Retry</button>
            {/if}
            <span class="spacer"></span>
            <button class="icon-btn" onclick={() => removeClip(set, p.index)} aria-label="Remove"><Icon name="delete" /></button>
          </div>
        </li>
      {/each}
    </ol>

    <a class="btn primary add" href={href('library', set.id)}><Icon name="add" />Add songs</a>
  </main>

  {#if menu}
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <div class="scrim" onclick={() => (menu = false)}>
      <div class="sheet" role="menu" tabindex="-1">
        <button role="menuitem" onclick={() => go('set', duplicateSet(set).id)}><Icon name="add" />Duplicate</button>
        <button role="menuitem" onclick={() => exportSet(set)}><Icon name="upload" />Export (to open on another device)</button>
        <button role="menuitem" class="error" onclick={remove}><Icon name="delete" />Delete set</button>
      </div>
    </div>
  {/if}
{/if}

<style>
  .head {
    gap: 4px;
    margin: 0 -8px 8px;
  }
  .name {
    flex: 1;
    font-size: 1.3rem;
    font-weight: 700;
    background: none;
    border-color: transparent;
    padding: 8px;
  }
  .summary {
    margin-bottom: 12px;
  }
  .spacer {
    flex: 1;
  }
  .hint {
    font-size: 0.8rem;
    margin: 6px 0 0;
  }
  .clips {
    list-style: none;
    padding: 0;
    margin: 16px 0;
  }
  .clip {
    padding: 10px 8px 4px 12px;
  }
  .clip.now {
    outline: 2px solid var(--accent);
  }
  .info {
    display: block;
  }
  .top {
    gap: 10px;
  }
  .num {
    color: var(--muted);
    font-weight: 700;
    min-width: 1.4em;
  }
  .title {
    font-weight: 600;
  }
  .small {
    font-size: 0.85rem;
  }
  .meta {
    flex-wrap: wrap;
    margin-top: 4px;
    gap: 10px;
  }
  .tools {
    gap: 0;
    margin: 2px -4px 0;
  }
  .tools .icon-btn:disabled {
    opacity: 0.3;
  }
  .mix {
    padding: 6px 12px;
    color: var(--accent-2);
    font-size: 0.85rem;
  }
  .add {
    width: 100%;
  }
</style>
