import { audioUrl, artistOf, searchTracks } from './jellyfin';
import { localByKey, localFile, localTrack } from './library.svelte';
import { auth } from './session.svelte';
import { trackKey, type TrackRef } from './types';

/**
 * The bridge between a set and the actual audio. A track is looked up in this order:
 *   1. the local copy it was added from (localId)
 *   2. any local copy of the same song (matched by artist + title)
 *   3. the Jellyfin item it was added from (jellyfinId)
 *   4. a Jellyfin search for the same song
 * So a set built from a laptop folder still plays on a phone that only has Jellyfin.
 * Jellyfin audio is cached in Cache Storage so editing and replaying a set doesn't
 * download the same song again.
 */

export type SourceKind = 'local' | 'jellyfin';

export interface Found {
  blob: Blob;
  kind: SourceKind;
}

type Patch = Pick<TrackRef, 'localId' | 'jellyfinId' | 'duration'>;
let onResolved: (key: string, patch: Partial<Patch>) => void = () => {};
/** Lets the set store remember ids found by matching. */
export function setResolvedHandler(fn: typeof onResolved) {
  onResolved = fn;
}

const AUDIO_CACHE = 'audio-v1';
const AUDIO_CACHE_MAX = 80;
const cacheKey = (id: string) => `https://dj-jelly.invalid/jellyfin/${id}`;

// Last few files in memory, so auditioning the same song repeatedly is instant.
const recent = new Map<string, Found>();
function remember(key: string, f: Found) {
  recent.delete(key);
  recent.set(key, f);
  while (recent.size > 4) recent.delete(recent.keys().next().value!);
  return f;
}

export function whereIs(track: TrackRef): SourceKind | null {
  if ((track.localId && localTrack(track.localId)) || localByKey(track.key)) return 'local';
  if (auth.session) return 'jellyfin';
  return null;
}

export async function getAudio(track: TrackRef): Promise<Found> {
  const hit = recent.get(track.key);
  if (hit) return remember(track.key, hit);

  const local = (track.localId && localTrack(track.localId)) || localByKey(track.key);
  if (local) {
    const blob = await localFile(local.id);
    if (blob) {
      if (local.id !== track.localId) onResolved(track.key, { localId: local.id });
      return remember(track.key, { blob, kind: 'local' });
    }
  }

  if (auth.session) {
    let id = track.jellyfinId;
    if (!id) {
      id = await findOnJellyfin(track);
      if (id) onResolved(track.key, { jellyfinId: id });
    }
    if (id) return remember(track.key, { blob: await jellyfinAudio(id), kind: 'jellyfin' });
  }

  if (local) throw new Error(`Can't read "${local.fileName}". If it's in a folder, reconnect the folder in Settings.`);
  throw new Error(auth.session ? `"${track.title}" isn't in your local files or on Jellyfin.` : `"${track.title}" isn't in your local files. Sign in to Jellyfin to stream it.`);
}

async function findOnJellyfin(track: TrackRef): Promise<string | undefined> {
  const items = await searchTracks(track.title, 25);
  const exact = items.find((i) => trackKey(artistOf(i), i.Name) === track.key);
  if (exact) return exact.Id;
  // Artist credits often differ ("A & B" vs "A"): accept a title match whose artist overlaps.
  const [artist, title] = track.key.split('|');
  return items.find((i) => {
    const [a, t] = trackKey(artistOf(i), i.Name).split('|');
    return t === title && (a.includes(artist) || artist.includes(a));
  })?.Id;
}

async function jellyfinAudio(id: string): Promise<Blob> {
  const cache = await caches.open(AUDIO_CACHE).catch(() => null);
  const hit = await cache?.match(cacheKey(id));
  if (hit) return hit.blob();
  const res = await fetch(audioUrl(id));
  if (!res.ok) throw new Error(`Jellyfin: couldn't load audio (${res.status})`);
  const blob = await res.blob();
  if (cache) {
    await cache.put(cacheKey(id), new Response(blob, { headers: { 'Content-Type': blob.type } })).catch(() => {});
    const keys = await cache.keys();
    for (const k of keys.slice(0, Math.max(0, keys.length - AUDIO_CACHE_MAX))) await cache.delete(k);
  }
  return blob;
}

export async function clearAudioCache() {
  await caches.delete(AUDIO_CACHE);
  recent.clear();
}
