import { db } from './db';
import { setAnalyzedHandler, ensureAnalysis } from './analysis.svelte';
import { setResolvedHandler } from './sources';
import type { Clip, DjSet, TrackRef } from './types';

export const store = $state({ sets: [] as DjSet[], loaded: false });

export const DEFAULT_FADE = 8;

export async function loadSets() {
  store.sets = (await (await db()).getAll('sets')).sort((a, b) => b.updated - a.updated);
  store.loaded = true;
  for (const s of store.sets) for (const c of s.clips) void ensureAnalysis(c.track);
}

export const getSet = (id: string | undefined) => store.sets.find((s) => s.id === id);

const timers = new Map<string, ReturnType<typeof setTimeout>>();

/** Saves shortly after the last change, so dragging a handle doesn't write on every move. */
export function touch(set: DjSet) {
  set.updated = Date.now();
  clearTimeout(timers.get(set.id));
  timers.set(
    set.id,
    setTimeout(async () => {
      timers.delete(set.id);
      await (await db()).put('sets', $state.snapshot(set) as DjSet);
    }, 400),
  );
}

export function createSet(name = 'New set'): DjSet {
  const set: DjSet = { id: crypto.randomUUID(), name, clips: [], fadeOut: 4, created: Date.now(), updated: Date.now() };
  store.sets.unshift(set);
  const live = store.sets[0];
  touch(live);
  return live;
}

export async function deleteSet(id: string) {
  store.sets = store.sets.filter((s) => s.id !== id);
  clearTimeout(timers.get(id));
  await (await db()).delete('sets', id);
}

export function duplicateSet(set: DjSet) {
  const copy = createSet(`${set.name} (copy)`);
  copy.clips = ($state.snapshot(set.clips) as Clip[]).map((c) => ({ ...c, id: crypto.randomUUID() }));
  copy.fadeOut = set.fadeOut;
  touch(copy);
  return copy;
}

export function newClip(track: TrackRef, isFirst: boolean): Clip {
  return { id: crypto.randomUUID(), track: { ...track }, start: 0, end: track.duration, fadeIn: isFirst ? 0 : DEFAULT_FADE, curve: 'equal', gainDb: 0 };
}

export function addTracks(set: DjSet, tracks: TrackRef[]) {
  for (const t of tracks) {
    set.clips.push(newClip(t, set.clips.length === 0));
    void ensureAnalysis(t);
  }
  touch(set);
}

export function moveClip(set: DjSet, from: number, to: number) {
  if (to < 0 || to >= set.clips.length) return;
  const [c] = set.clips.splice(from, 1);
  set.clips.splice(to, 0, c);
  touch(set);
}

export function removeClip(set: DjSet, index: number) {
  set.clips.splice(index, 1);
  touch(set);
}

// Fill in what analysis and source matching learn about a song, in every set that uses it.
setAnalyzedHandler((a) => {
  for (const set of store.sets) {
    let changed = false;
    for (const c of set.clips) {
      if (c.track.key !== a.key) continue;
      if (Math.abs(c.track.duration - a.duration) > 0.05) {
        c.track.duration = a.duration;
        changed = true;
      }
      if (c.end <= c.start || c.end > a.duration) {
        c.end = a.duration;
        changed = true;
      }
    }
    if (changed) touch(set);
  }
});

setResolvedHandler((key, patch) => {
  for (const set of store.sets) {
    let changed = false;
    for (const c of set.clips) {
      if (c.track.key !== key) continue;
      Object.assign(c.track, patch);
      changed = true;
    }
    if (changed) touch(set);
  }
});

// ---------- export / import ----------

export function exportSet(set: DjSet) {
  const data = JSON.stringify({ app: 'dj-jelly', version: 1, set: $state.snapshot(set) }, null, 2);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
  a.download = `${set.name.replace(/[^\w\- ]+/g, '').trim() || 'set'}.djset.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}

export async function importSet(file: File): Promise<DjSet> {
  const parsed = JSON.parse(await file.text());
  const src = parsed?.set as DjSet | undefined;
  if (parsed?.app !== 'dj-jelly' || !src || !Array.isArray(src.clips)) throw new Error("That file isn't a DJ Jelly set.");
  const set = createSet(src.name || 'Imported set');
  set.fadeOut = src.fadeOut ?? 4;
  // Local ids belong to the device that exported the set; matching by song finds the local copy here.
  set.clips = src.clips.map((c) => ({ ...c, id: crypto.randomUUID(), track: { ...c.track, localId: undefined } }));
  touch(set);
  for (const c of set.clips) void ensureAnalysis(c.track);
  return set;
}
