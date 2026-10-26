<script lang="ts">
  import { library, canPickFolder, addFolder, importFiles } from '../lib/library.svelte';
  import { auth } from '../lib/session.svelte';
  import { searchTracks, artistOf, ticksToSeconds, type Item } from '../lib/jellyfin';
  import { getSet, addTracks } from '../lib/sets.svelte';
  import { duration } from '../lib/format';
  import { href } from '../lib/router.svelte';
  import { trackKey, type LocalTrack, type TrackRef } from '../lib/types';
  import Icon from '../components/Icon.svelte';

  let { addTo }: { addTo?: string } = $props();
  const set = $derived(getSet(addTo));

  let tab = $state<'local' | 'jellyfin'>(localStorage.getItem('dj.libTab') === 'jellyfin' ? 'jellyfin' : 'local');
  $effect(() => {
    try {
      localStorage.setItem('dj.libTab', tab);
    } catch {}
  });
  let query = $state('');
  let added = $state<Record<string, number>>({});
  let error = $state('');
  let fileInput = $state<HTMLInputElement>();

  const LIMIT = 200;
  const localResults = $derived.by(() => {
    const q = query.trim().toLowerCase();
    const words = q.split(/\s+/).filter(Boolean);
    const list = words.length ? library.tracks.filter((t) => words.every((w) => `${t.title} ${t.artist} ${t.album ?? ''} ${t.fileName}`.toLowerCase().includes(w))) : library.tracks;
    return { shown: list.slice(0, LIMIT), total: list.length };
  });

  let jfResults = $state<Item[]>([]);
  let jfBusy = $state(false);
  let timer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => {
    const q = query.trim();
    if (tab !== 'jellyfin' || !auth.session) return;
    clearTimeout(timer);
    if (!q) {
      jfResults = [];
      return;
    }
    timer = setTimeout(async () => {
      jfBusy = true;
      error = '';
      try {
        const r = await searchTracks(q);
        if (q === query.trim()) jfResults = r;
      } catch (e) {
        error = (e as Error).message;
      } finally {
        jfBusy = false;
      }
    }, 300);
  });

  const fromLocal = (t: LocalTrack): TrackRef => ({ key: t.key, title: t.title, artist: t.artist, album: t.album, duration: t.duration ?? 0, localId: t.id });
  const fromJellyfin = (i: Item): TrackRef => {
    const artist = artistOf(i) || 'Unknown artist';
    return { key: trackKey(artist, i.Name), title: i.Name, artist, album: i.Album, duration: ticksToSeconds(i.RunTimeTicks), jellyfinId: i.Id };
  };

  function add(id: string, ref: TrackRef) {
    if (!set) return;
    addTracks(set, [ref]);
    added[id] = (added[id] ?? 0) + 1;
  }

  async function pickFolder() {
    error = '';
    try {
      await addFolder();
    } catch (e) {
      if ((e as Error).name !== 'AbortError') error = (e as Error).message;
    }
  }

  async function onFiles(e: Event) {
    const files = (e.currentTarget as HTMLInputElement).files;
    if (files?.length) await importFiles(files);
    if (fileInput) fileInput.value = "";
  }
</script>

<main class="page">
  {#if set}
    <header class="row adding">
      <div class="grow">
        <div class="muted small">Adding to</div>
        <div class="ellipsis"><b>{set.name}</b> · {set.clips.length} clips</div>
      </div>
      <a class="btn primary" href={href('set', set.id)}>Done</a>
    </header>
  {:else}
    <h1 class="page-title">Library</h1>
  {/if}

  <div class="row tabs">
    <button class="chip" class:on={tab === 'local'} onclick={() => (tab = 'local')}>Local files</button>
    <button class="chip" class:on={tab === 'jellyfin'} onclick={() => (tab = 'jellyfin')}>Jellyfin</button>
  </div>
  <input type="search" bind:value={query} placeholder={tab === 'local' ? 'Filter songs' : 'Search Jellyfin'} autocapitalize="off" autocomplete="off" />
  {#if library.scanning}<p class="muted">{library.scanning}</p>{/if}
  {#if error}<p class="error">{error}</p>{/if}

  {#if tab === 'local'}
    <div class="row wrap sources">
      {#if canPickFolder}<button class="chip" onclick={pickFolder}><Icon name="folder" size={16} />Add folder</button>{/if}
      <button class="chip" onclick={() => fileInput?.click()}><Icon name="upload" size={16} />Import files</button>
      <input bind:this={fileInput} type="file" accept="audio/*,.mp3,.m4a,.flac,.wav,.ogg,.aiff" multiple hidden onchange={onFiles} />
    </div>
    {#if !library.tracks.length && library.loaded}
      <p class="muted">No local songs yet. {canPickFolder ? 'Add your music folder, or import' : 'Import'} some files. Imported files are copied into the app so they stay available.</p>
    {/if}
    <ul class="list">
      {#each localResults.shown as t (t.id)}
        {@render row(t.id, t.title, t.artist, t.duration, () => add(t.id, fromLocal(t)))}
      {/each}
    </ul>
    {#if localResults.total > LIMIT}<p class="muted small">Showing {LIMIT} of {localResults.total}. Type to narrow it down.</p>{/if}
  {:else if !auth.session}
    <p class="muted">Sign in to your Jellyfin server in <a class="link" href={href('settings')}>Settings</a> to search it here.</p>
  {:else}
    {#if jfBusy}<div class="center"><div class="spinner"></div></div>{/if}
    <ul class="list">
      {#each jfResults as i (i.Id)}
        {@render row(i.Id, i.Name, artistOf(i), ticksToSeconds(i.RunTimeTicks), () => add(i.Id, fromJellyfin(i)))}
      {/each}
    </ul>
    {#if !query.trim()}<p class="muted">Search for songs by title, artist or album.</p>{/if}
  {/if}
</main>

{#snippet row(id: string, title: string, artist: string, secs: number | undefined, onadd: () => void)}
  <li class="row item">
    <div class="grow text">
      <div class="ellipsis">{title}</div>
      <div class="ellipsis muted small">{artist}{secs ? ` · ${duration(secs)}` : ''}</div>
    </div>
    {#if set}
      <button class="icon-btn" class:on={added[id]} onclick={onadd} aria-label="Add to set">
        <Icon name={added[id] ? 'check' : 'add'} />
      </button>
    {/if}
  </li>
{/snippet}

<style>
  .adding {
    position: sticky;
    top: 0;
    z-index: 5;
    background: var(--bg);
    padding: 8px 0 12px;
  }
  .grow {
    flex: 1;
    min-width: 0;
  }
  .small {
    font-size: 0.8rem;
  }
  .tabs {
    margin-bottom: 10px;
  }
  .sources {
    margin: 10px 0;
  }
  .wrap {
    flex-wrap: wrap;
  }
  .list {
    list-style: none;
    padding: 0;
    margin: 8px 0;
  }
  .item {
    min-height: 56px;
    border-bottom: 1px solid var(--surface);
  }
  .text {
    padding: 6px 0;
  }
  .link {
    color: var(--accent);
  }
</style>
