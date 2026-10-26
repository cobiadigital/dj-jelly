<script lang="ts">
  import { store, createSet, importSet } from '../lib/sets.svelte';
  import { layout } from '../lib/timeline';
  import { duration } from '../lib/format';
  import { href, go } from '../lib/router.svelte';
  import Icon from '../components/Icon.svelte';

  let error = $state('');
  let fileInput: HTMLInputElement;

  function newSet() {
    const s = createSet(`Set ${store.sets.length + 1}`);
    go('set', s.id);
  }

  async function onImport(e: Event) {
    const file = (e.currentTarget as HTMLInputElement).files?.[0];
    if (!file) return;
    error = '';
    try {
      go('set', (await importSet(file)).id);
    } catch (err) {
      error = (err as Error).message;
    }
    fileInput.value = '';
  }
</script>

<main class="page">
  <h1 class="page-title">DJ Jelly</h1>
  <p class="muted intro">Build a set from parts of songs, plan each crossfade, then play it back hands-free.</p>
  <div class="row actions">
    <button class="btn primary" onclick={newSet}><Icon name="add" />New set</button>
    <button class="btn" onclick={() => fileInput.click()}><Icon name="upload" />Import</button>
    <input bind:this={fileInput} type="file" accept=".json,application/json" hidden onchange={onImport} />
  </div>
  {#if error}<p class="error">{error}</p>{/if}

  {#if store.sets.length}
    <ul class="list">
      {#each store.sets as s (s.id)}
        <li>
          <a class="card set" href={href('set', s.id)}>
            <div class="ellipsis name">{s.name}</div>
            <div class="muted small">{s.clips.length} {s.clips.length === 1 ? 'clip' : 'clips'} · {duration(layout(s).total)}</div>
          </a>
        </li>
      {/each}
    </ul>
  {:else}
    <div class="card empty">
      <p><b>How it works</b></p>
      <ol class="muted">
        <li>Add music in <a class="link" href={href('settings')}>Settings</a>: a local folder, imported files, or your Jellyfin server.</li>
        <li>Make a set and add songs from the Library.</li>
        <li>Trim each song to the part you want and set how long it overlaps the one before.</li>
        <li>Press play. Two songs play at once during each mix, like a two-deck mixer.</li>
      </ol>
    </div>
  {/if}
</main>

<style>
  .intro {
    margin-top: -4px;
  }
  .actions {
    margin: 16px 0;
    flex-wrap: wrap;
  }
  .list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    gap: 8px;
  }
  .set {
    display: block;
    min-height: 44px;
  }
  .name {
    font-weight: 600;
  }
  .small {
    font-size: 0.85rem;
    margin-top: 2px;
  }
  .empty ol {
    padding-left: 20px;
    line-height: 1.5;
  }
  .link {
    color: var(--accent);
  }
</style>
