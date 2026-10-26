<script lang="ts">
  import { onMount } from 'svelte';
  import { auth, setSession } from '../lib/session.svelte';
  import { login, logout } from '../lib/jellyfin';
  import { library, canPickFolder, addFolder, removeFolder, scanFolder, reconnectFolder, importFiles, IMPORTED } from '../lib/library.svelte';
  import { clearAudioCache } from '../lib/sources';
  import { bytes } from '../lib/format';
  import Icon from '../components/Icon.svelte';

  let server = $state(localStorage.getItem('dj.lastServer') ?? '');
  let username = $state('');
  let password = $state('');
  let busy = $state(false);
  let error = $state('');
  let usage = $state('');
  let fileInput: HTMLInputElement;

  const imported = $derived(library.tracks.filter((t) => t.folderId === IMPORTED));
  const countIn = (id: string) => library.tracks.filter((t) => t.folderId === id).length;

  async function refreshUsage() {
    const e = await navigator.storage?.estimate?.();
    usage = e?.usage != null ? `${bytes(e.usage)} used${e.quota ? ` of ${bytes(e.quota)} available` : ''}` : '';
  }
  onMount(refreshUsage);

  async function signIn(e: SubmitEvent) {
    e.preventDefault();
    busy = true;
    error = '';
    try {
      const s = await login(server, username, password);
      try {
        localStorage.setItem('dj.lastServer', s.server);
      } catch {}
      setSession(s);
      password = '';
    } catch (err) {
      error = (err as Error).message;
    } finally {
      busy = false;
    }
  }

  async function signOut() {
    await logout();
    setSession(null);
  }

  async function run(fn: () => Promise<unknown>) {
    error = '';
    try {
      await fn();
    } catch (e) {
      if ((e as Error).name !== 'AbortError') error = (e as Error).message;
    }
    void refreshUsage();
  }

  async function onFiles(e: Event) {
    const files = (e.currentTarget as HTMLInputElement).files;
    if (files?.length) await run(() => importFiles(files));
    fileInput.value = '';
  }
</script>

<main class="page">
  <h1 class="page-title">Settings</h1>
  {#if error}<p class="error">{error}</p>{/if}

  <h2 class="section-title">Local music</h2>
  <div class="card stack">
    {#if library.scanning}<p class="muted">{library.scanning}</p>{/if}
    {#each library.folders as f (f.id)}
      <div class="row">
        <Icon name="folder" />
        <div class="grow">
          <div class="ellipsis">{f.name}</div>
          <div class="muted small">{countIn(f.id)} songs</div>
        </div>
        {#if f.permission !== 'granted'}
          <button class="chip on" onclick={() => run(async () => (await reconnectFolder(f.id)) && scanFolder(f.id))}>Reconnect</button>
        {:else}
          <button class="chip" onclick={() => run(() => scanFolder(f.id))} disabled={!!library.scanning}>Rescan</button>
        {/if}
        <button class="icon-btn" onclick={() => run(() => removeFolder(f.id))} aria-label="Remove folder"><Icon name="delete" /></button>
      </div>
    {/each}
    <div class="row">
      <Icon name="upload" />
      <div class="grow">
        <div>Imported files</div>
        <div class="muted small">{imported.length} songs, stored in this app</div>
      </div>
    </div>
    <div class="row wrap">
      {#if canPickFolder}<button class="btn" onclick={() => run(addFolder)} disabled={!!library.scanning}><Icon name="folder" />Add folder</button>{/if}
      <button class="btn" onclick={() => fileInput.click()} disabled={!!library.scanning}><Icon name="upload" />Import files</button>
      <input bind:this={fileInput} type="file" accept="audio/*,.mp3,.m4a,.flac,.wav,.ogg,.aiff" multiple hidden onchange={onFiles} />
    </div>
    <p class="muted small">
      {#if canPickFolder}A folder is read in place and stays linked; after restarting the browser you may need to tap Reconnect.
      {:else}This browser can't link a folder, so picked files are copied into the app. On iPhone, pick them from the Files app.{/if}
    </p>
  </div>

  <h2 class="section-title">Jellyfin</h2>
  <div class="card">
    {#if auth.session}
      <div class="row">
        <div class="grow">
          <div>{auth.session.userName} on {auth.session.serverName}</div>
          <div class="muted small ellipsis">{auth.session.server}</div>
        </div>
        <button class="btn" onclick={signOut}>Sign out</button>
      </div>
      <p class="muted small">Songs that aren't on this device are streamed from Jellyfin and cached for faster editing.</p>
      <button class="btn" onclick={() => run(clearAudioCache)}>Clear cached audio</button>
    {:else}
      <form class="stack" onsubmit={signIn}>
        <label class="field">Server URL<input bind:value={server} type="url" inputmode="url" autocomplete="url" placeholder="https://jellyfin.example.com" required /></label>
        <label class="field">Username<input bind:value={username} autocomplete="username" autocapitalize="off" required /></label>
        <label class="field">Password<input bind:value={password} type="password" autocomplete="current-password" /></label>
        <button class="btn primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        <p class="muted small">Optional. Lets sets use songs from your Jellyfin server when they aren't on this device. The password goes only to your server.</p>
      </form>
    {/if}
  </div>

  <h2 class="section-title">About</h2>
  <div class="card">
    <p class="muted small">DJ Jelly {__APP_VERSION__} ({__APP_COMMIT__}){usage ? ` · ${usage}` : ''}</p>
  </div>
</main>

<style>
  .stack {
    display: grid;
    gap: 14px;
  }
  .grow {
    flex: 1;
    min-width: 0;
  }
  .small {
    font-size: 0.8rem;
  }
  .wrap {
    flex-wrap: wrap;
  }
  p {
    margin: 0;
  }
  .card p.small {
    margin-top: 8px;
  }
</style>
