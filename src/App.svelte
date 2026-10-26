<script lang="ts">
  import { onMount } from 'svelte';
  import { route, href } from './lib/router.svelte';
  import { loadLibrary } from './lib/library.svelte';
  import { loadSets, store } from './lib/sets.svelte';
  import Icon, { type IconName } from './components/Icon.svelte';
  import Transport from './components/Transport.svelte';
  import Sets from './views/Sets.svelte';
  import SetEditor from './views/SetEditor.svelte';
  import ClipEditor from './views/ClipEditor.svelte';
  import Library from './views/Library.svelte';
  import Settings from './views/Settings.svelte';

  onMount(() => {
    void loadLibrary();
    void loadSets();
  });

  const tabs: { name: string; label: string; icon: IconName }[] = [
    { name: 'sets', label: 'Sets', icon: 'sets' },
    { name: 'library', label: 'Library', icon: 'library' },
    { name: 'settings', label: 'Settings', icon: 'settings' },
  ];
  const active = $derived(route.name === 'set' ? 'sets' : route.name);
</script>

{#if !store.loaded}
  <div class="center"><div class="spinner"></div></div>
{:else if route.name === 'set' && route.parts[1] === 'clip'}
  {#key route.parts[2]}<ClipEditor setId={route.parts[0]} clipId={route.parts[2]} />{/key}
{:else if route.name === 'set'}
  <SetEditor id={route.parts[0]} />
{:else if route.name === 'library'}
  <Library addTo={route.parts[0]} />
{:else if route.name === 'settings'}
  <Settings />
{:else}
  <Sets />
{/if}

<Transport />

<nav class="tabs">
  {#each tabs as t (t.name)}
    <a href={href(t.name)} class:on={active === t.name} aria-current={active === t.name ? 'page' : undefined}>
      <Icon name={t.icon} />
      <span>{t.label}</span>
    </a>
  {/each}
</nav>

<style>
  .tabs {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    z-index: 20;
    display: flex;
    height: calc(var(--nav-h) + var(--safe-b));
    padding-bottom: var(--safe-b);
    background: var(--surface);
    border-top: 1px solid var(--surface-2);
  }
  .tabs a {
    flex: 1;
    display: grid;
    place-items: center;
    align-content: center;
    gap: 2px;
    font-size: 0.75rem;
    color: var(--muted);
  }
  .tabs a.on {
    color: var(--accent);
  }
</style>
