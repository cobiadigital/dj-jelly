<script lang="ts">
  import { getSet, touch } from '../lib/sets.svelte';
  import { layout } from '../lib/timeline';
  import { analyses, analyzing, nearestBeat, saveAnalysis, retryAnalysis, ensureAnalysis } from '../lib/analysis.svelte';
  import { transport, play, audition, stop } from '../lib/engine.svelte';
  import { whereIs } from '../lib/sources';
  import { precise } from '../lib/format';
  import { href } from '../lib/router.svelte';
  import type { FadeCurve } from '../lib/types';
  import Icon from '../components/Icon.svelte';
  import Waveform from '../components/Waveform.svelte';
  import MixView from '../components/MixView.svelte';

  let { setId, clipId }: { setId: string; clipId: string } = $props();

  const set = $derived(getSet(setId));
  const index = $derived(set ? set.clips.findIndex((c) => c.id === clipId) : -1);
  const clip = $derived(set?.clips[index]);
  const prev = $derived(set && index > 0 ? set.clips[index - 1] : undefined);
  const next = $derived(set?.clips[index + 1]);
  const placed = $derived(set ? layout(set).items[index] : undefined);
  const a = $derived(clip ? analyses[clip.track.key] : undefined);
  const pa = $derived(prev ? analyses[prev.track.key] : undefined);
  const dur = $derived(a?.duration || clip?.track.duration || clip?.end || 1);
  const beatLen = $derived(a ? 60 / a.bpm : 0);
  const mixBpm = $derived(pa?.bpm ?? a?.bpm);
  const where = $derived(clip ? whereIs(clip.track) : null);

  let view = $state<[number, number]>([0, 1]);
  let fitted = false;
  $effect(() => {
    if (!fitted && dur > 1) {
      view = [0, dur];
      fitted = true;
    }
  });
  $effect(() => {
    if (clip) void ensureAnalysis(clip.track);
    if (prev) void ensureAnalysis(prev.track);
  });

  let snap = $state(localStorage.getItem('dj.snap') !== '0');
  $effect(() => {
    try {
      localStorage.setItem('dj.snap', snap ? '1' : '0');
    } catch {}
  });

  const playhead = $derived(transport.voices.find((v) => v.clipId === clipId)?.time ?? null);
  const mixPlayhead = $derived(placed && transport.setId === setId && transport.playing ? transport.position - placed.at : null);

  function save() {
    if (set) touch(set);
  }

  function setPoints(s: number, e: number) {
    if (!clip) return;
    clip.start = Math.max(0, s);
    clip.end = Math.min(dur, e);
    save();
  }

  function nudgeIn(d: number) {
    if (clip) setPoints(Math.min(clip.start + d, clip.end - 1), clip.end);
  }
  function nudgeOut(d: number) {
    if (clip) setPoints(clip.start, Math.max(clip.end + d, clip.start + 1));
  }

  function zoomAt(t: number) {
    const span = Math.min(dur, beatLen ? beatLen * 32 : 20);
    const v0 = Math.max(0, Math.min(dur - span, t - span / 2));
    view = [v0, v0 + span];
  }

  // ---------- mix ----------

  function setFadeBeats(n: number) {
    if (!clip || !mixBpm) return;
    clip.fadeIn = (n * 60) / mixBpm;
    save();
  }

  /** Puts the start of the mix on a beat in both songs. */
  function alignBeats() {
    if (!clip || !prev || !placed || !pa || !a) return;
    const tA = prev.end - placed.fadeIn;
    prev.end = Math.min(pa.duration, prev.end + (nearestBeat(pa, tA) - tA));
    clip.start = Math.min(clip.end - 1, nearestBeat(a, clip.start));
    save();
  }

  let orig = { aEnd: 0, bStart: 0 };
  function onMixDrag(lane: 'a' | 'b', phase: 'start' | 'move', d: number) {
    if (!clip || !prev) return;
    if (phase === 'start') {
      orig = { aEnd: prev.end, bStart: clip.start };
      return;
    }
    if (lane === 'a') prev.end = Math.max(prev.start + 1, Math.min(pa?.duration ?? prev.track.duration ?? Infinity, orig.aEnd + d));
    else clip.start = Math.max(0, Math.min(clip.end - 1, orig.bStart + d));
    save();
  }

  function shiftOutgoing(d: number) {
    if (!prev) return;
    prev.end = Math.max(prev.start + 1, Math.min(pa?.duration ?? Infinity, prev.end + d));
    save();
  }

  function previewMix() {
    if (set && placed) play(set.id, set, Math.max(0, placed.at - 6), placed.at + placed.fadeIn + 4);
  }

  // ---------- beat grid ----------

  function setBpm(bpm: number) {
    if (!a || !(bpm > 30 && bpm < 300)) return;
    void saveAnalysis({ ...a, bpm, manual: true });
  }
  function shiftGrid(d: number) {
    if (!a) return;
    const p = 60 / a.bpm;
    let beat = (a.beat + d) % (4 * p);
    if (beat < 0) beat += 4 * p;
    void saveAnalysis({ ...a, beat, manual: true });
  }

  const curves: { value: FadeCurve; label: string }[] = [
    { value: 'equal', label: 'Smooth' },
    { value: 'linear', label: 'Linear' },
  ];
</script>

{#if !set || !clip || !placed}
  <main class="page"><p class="muted">This clip doesn't exist anymore. <a href={href('set', setId)}>Back to the set</a></p></main>
{:else}
  <main class="page">
    <header class="row head">
      <a class="icon-btn" href={href('set', setId)} aria-label="Back to set"><Icon name="back" /></a>
      <span class="muted grow">Clip {index + 1} of {set.clips.length}</span>
      <a class="icon-btn" class:off={!prev} href={prev ? href('set', setId, 'clip', prev.id) : undefined} aria-label="Previous clip"><Icon name="left" /></a>
      <a class="icon-btn" class:off={!next} href={next ? href('set', setId, 'clip', next.id) : undefined} aria-label="Next clip"><Icon name="right" /></a>
    </header>

    <h1 class="title">{clip.track.title}</h1>
    <p class="muted artist">
      {clip.track.artist}
      {#if where}<span class="badge {where}">{where}</span>{:else}<span class="badge">missing</span>{/if}
    </p>

    {#if analyzing[clip.track.key]}
      <p class="error">{analyzing[clip.track.key]} <button class="chip" onclick={() => retryAnalysis(clip.track)}>Retry</button></p>
    {/if}

    <section>
      <Waveform
        analysis={a}
        duration={dur}
        start={clip.start}
        end={clip.end}
        fadeIn={placed.fadeIn}
        fadeOut={placed.fadeOut}
        curve={clip.curve}
        {playhead}
        {snap}
        bind:view
        onchange={setPoints}
        ontap={(t) => audition(clip, t, dur)}
      />
      <div class="row wrap tools">
        <button class="chip" onclick={() => (view = [0, dur])}>Whole song</button>
        <button class="chip" onclick={() => zoomAt(clip.start)}><Icon name="zoomIn" size={16} />In</button>
        <button class="chip" onclick={() => zoomAt(clip.end)}><Icon name="zoomIn" size={16} />Out</button>
        <span class="grow"></span>
        <button class="chip" class:on={snap} onclick={() => (snap = !snap)} disabled={!a}>Snap to beat</button>
      </div>
      <p class="muted hint">Drag IN and OUT to trim. Tap the waveform to listen from that spot.</p>
    </section>

    {#snippet nudges(fn: (d: number) => void)}
      {#if beatLen}<button class="chip" onclick={() => fn(-beatLen)}>−1 beat</button>{/if}
      <button class="chip" onclick={() => fn(-0.1)}>−0.1s</button>
      <button class="chip" onclick={() => fn(0.1)}>+0.1s</button>
      {#if beatLen}<button class="chip" onclick={() => fn(beatLen)}>+1 beat</button>{/if}
    {/snippet}

    <section class="card points">
      <div class="point">
        <div class="row"><b>In</b><span class="tabular">{precise(clip.start)}</span><span class="grow"></span>
          {#if playhead != null}<button class="chip" onclick={() => setPoints(Math.min(playhead!, clip.end - 1), clip.end)}>Set here</button>{/if}
        </div>
        <div class="row wrap">{@render nudges(nudgeIn)}</div>
      </div>
      <div class="point">
        <div class="row"><b>Out</b><span class="tabular">{precise(clip.end)}</span><span class="grow"></span>
          {#if playhead != null}<button class="chip" onclick={() => setPoints(clip.start, Math.max(playhead!, clip.start + 1))}>Set here</button>{/if}
        </div>
        <div class="row wrap">{@render nudges(nudgeOut)}</div>
      </div>
      <div class="row wrap">
        <button class="btn" onclick={() => audition(clip, clip.start, clip.end)}><Icon name="play" />Play clip</button>
        <button class="btn" onclick={() => audition(clip, Math.max(clip.start, clip.end - 10), clip.end)}>Last 10s</button>
        {#if transport.playing}<button class="icon-btn" onclick={stop} aria-label="Stop"><Icon name="stop" /></button>{/if}
      </div>
    </section>

    {#if prev}
      <section class="card">
        <h2 class="section-title first">Mix in from “{prev.track.title}”</h2>
        <MixView a={pa} b={a} aEnd={prev.end} bStart={clip.start} fade={placed.fadeIn} curveIn={clip.curve} curveOut={clip.curve} playhead={mixPlayhead} ondrag={onMixDrag} />
        <p class="muted hint">Top: the song ending. Bottom: this song. Drag either one sideways until the beat lines match.</p>

        <div class="field-row">
          <span class="muted">Length</span>
          <span class="tabular">{placed.fadeIn.toFixed(1)}s{mixBpm ? ` · ${Math.round((placed.fadeIn * mixBpm) / 60)} beats` : ''}</span>
          {#if placed.fadeIn + 0.05 < clip.fadeIn}<span class="muted small">(limited by clip length)</span>{/if}
        </div>
        <input type="range" min="0" max="64" step="0.1" bind:value={clip.fadeIn} oninput={save} aria-label="Mix length in seconds" />
        {#if mixBpm}
          <div class="row wrap">
            {#each [0, 4, 8, 16, 32, 64] as n (n)}
              <button class="chip" onclick={() => setFadeBeats(n)}>{n ? `${n} beats` : 'Cut'}</button>
            {/each}
          </div>
        {/if}

        <div class="field-row"><span class="muted">Shift ending song</span></div>
        <div class="row wrap">{@render nudges(shiftOutgoing)}</div>
        <div class="field-row"><span class="muted">Shift this song</span></div>
        <div class="row wrap">{@render nudges(nudgeIn)}</div>

        <div class="field-row"><span class="muted">Curve</span></div>
        <div class="row">
          {#each curves as c (c.value)}
            <button class="chip" class:on={clip.curve === c.value} onclick={() => ((clip.curve = c.value), save())}>{c.label}</button>
          {/each}
        </div>

        <div class="row wrap actions">
          <button class="btn primary" onclick={previewMix}><Icon name="play" />Preview mix</button>
          <button class="btn" onclick={alignBeats} disabled={!a || !pa}>Align beats</button>
        </div>
      </section>
    {:else}
      <section class="card">
        <h2 class="section-title first">Start of the set</h2>
        <div class="field-row"><span class="muted">Fade in</span><span class="tabular">{clip.fadeIn.toFixed(1)}s</span></div>
        <input type="range" min="0" max="30" step="0.5" bind:value={clip.fadeIn} oninput={save} aria-label="Fade in seconds" />
      </section>
    {/if}

    {#if !next}
      <section class="card">
        <h2 class="section-title first">End of the set</h2>
        <div class="field-row"><span class="muted">Fade out</span><span class="tabular">{set.fadeOut.toFixed(1)}s</span></div>
        <input type="range" min="0" max="30" step="0.5" bind:value={set.fadeOut} oninput={save} aria-label="Fade out seconds" />
      </section>
    {/if}

    <section class="card">
      <h2 class="section-title first">Song</h2>
      <div class="field-row"><span class="muted">Volume</span><span class="tabular">{clip.gainDb > 0 ? '+' : ''}{clip.gainDb.toFixed(1)} dB</span></div>
      <input type="range" min="-12" max="6" step="0.5" bind:value={clip.gainDb} oninput={save} aria-label="Volume trim" />
      {#if a}
        <div class="field-row"><span class="muted">Tempo</span></div>
        <div class="row wrap">
          <input class="bpm" type="number" inputmode="decimal" step="0.01" value={a.bpm.toFixed(2)} onchange={(e) => setBpm(parseFloat(e.currentTarget.value))} aria-label="BPM" />
          <span class="muted">BPM</span>
          <button class="chip" onclick={() => setBpm(a.bpm / 2)}>÷2</button>
          <button class="chip" onclick={() => setBpm(a.bpm * 2)}>×2</button>
        </div>
        <div class="field-row"><span class="muted">Beat grid</span>{#if a.manual}<span class="muted small">adjusted by hand</span>{/if}</div>
        <div class="row wrap">
          <button class="chip" onclick={() => shiftGrid(-60 / a.bpm)}>Bar −1 beat</button>
          <button class="chip" onclick={() => shiftGrid(60 / a.bpm)}>Bar +1 beat</button>
          <button class="chip" onclick={() => shiftGrid(-0.01)}>−10ms</button>
          <button class="chip" onclick={() => shiftGrid(0.01)}>+10ms</button>
        </div>
        <p class="muted hint">Tall ticks mark the start of each bar. If they fall between kicks, nudge the grid.</p>
      {/if}
    </section>
  </main>
{/if}

<style>
  .head {
    margin: 0 -8px;
  }
  .grow {
    flex: 1;
  }
  .off {
    opacity: 0.3;
    pointer-events: none;
  }
  .title {
    font-size: 1.35rem;
    margin: 8px 0 2px;
  }
  .artist {
    margin: 0 0 12px;
    display: flex;
    gap: 8px;
    align-items: center;
  }
  section {
    margin-bottom: 12px;
  }
  .wrap {
    flex-wrap: wrap;
  }
  .tools {
    margin-top: 8px;
  }
  .hint {
    font-size: 0.8rem;
    margin: 6px 0 0;
  }
  .points {
    display: grid;
    gap: 14px;
  }
  .point {
    display: grid;
    gap: 6px;
  }
  .section-title.first {
    margin-top: 0;
    font-size: 1rem;
  }
  .field-row {
    display: flex;
    gap: 10px;
    align-items: baseline;
    margin-top: 14px;
  }
  .small {
    font-size: 0.8rem;
  }
  .actions {
    margin-top: 16px;
  }
  .bpm {
    width: 110px;
  }
</style>
