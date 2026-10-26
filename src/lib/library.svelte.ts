import { db } from './db';
import { AUDIO_EXT, readTags } from './tags';
import { trackKey, type FolderRecord, type LocalTrack } from './types';

/**
 * Local music. Two ways in:
 *  - a folder (Chrome/Edge on desktop): the folder handle is remembered, files are read in place
 *  - imported files (iPhone, Android, anything else): the bytes are copied into IndexedDB
 * The whole track list is kept in memory; even a few thousand rows is small.
 */

export const IMPORTED = 'imported';
export const canPickFolder = typeof window !== 'undefined' && 'showDirectoryPicker' in window;

type Permission = 'granted' | 'prompt' | 'denied';

export const library = $state({
  tracks: [] as LocalTrack[],
  folders: [] as { id: string; name: string; scanned: number; permission: Permission }[],
  loaded: false,
  scanning: '' as string, // progress message while scanning/importing
});

const handles = new Map<string, FileSystemDirectoryHandle>();
let byKey = new Map<string, LocalTrack>();

function reindex() {
  byKey = new Map(library.tracks.map((t) => [t.key, t]));
}

export async function loadLibrary() {
  const d = await db();
  const [tracks, folders] = await Promise.all([d.getAll('tracks'), d.getAll('folders')]);
  library.tracks = tracks.sort(byArtistTitle);
  library.folders = await Promise.all(
    folders.map(async (f) => {
      handles.set(f.id, f.handle);
      return { id: f.id, name: f.name, scanned: f.scanned, permission: await queryPermission(f.handle) };
    }),
  );
  reindex();
  library.loaded = true;
}

const byArtistTitle = (a: LocalTrack, b: LocalTrack) => a.artist.localeCompare(b.artist) || a.title.localeCompare(b.title);

export const localTrack = (id: string) => library.tracks.find((t) => t.id === id);
export const localByKey = (key: string) => byKey.get(key);

async function queryPermission(h: FileSystemDirectoryHandle): Promise<Permission> {
  try {
    return (await h.queryPermission?.({ mode: 'read' })) ?? 'granted';
  } catch {
    return 'prompt';
  }
}

/** Must run inside a tap handler. */
export async function reconnectFolder(id: string) {
  const h = handles.get(id);
  const f = library.folders.find((x) => x.id === id);
  if (!h || !f) return false;
  f.permission = (await h.requestPermission?.({ mode: 'read' })) ?? 'granted';
  return f.permission === 'granted';
}

export async function addFolder() {
  const handle = await window.showDirectoryPicker!({ id: 'dj-jelly-music', mode: 'read' });
  const id = crypto.randomUUID();
  const rec: FolderRecord = { id, name: handle.name, handle, scanned: 0 };
  await (await db()).put('folders', rec);
  handles.set(id, handle);
  library.folders.push({ id, name: handle.name, scanned: 0, permission: 'granted' });
  await scanFolder(id);
}

export async function removeFolder(id: string) {
  const d = await db();
  const tx = d.transaction(['folders', 'tracks'], 'readwrite');
  for (const key of await tx.objectStore('tracks').index('folderId').getAllKeys(id)) tx.objectStore('tracks').delete(key);
  tx.objectStore('folders').delete(id);
  await tx.done;
  handles.delete(id);
  library.folders = library.folders.filter((f) => f.id !== id);
  library.tracks = library.tracks.filter((t) => t.folderId !== id);
  reindex();
}

async function* walk(dir: FileSystemDirectoryHandle, prefix = ''): AsyncGenerator<{ path: string; handle: FileSystemFileHandle }> {
  for await (const entry of dir.values()) {
    if (entry.kind === 'directory') yield* walk(entry as FileSystemDirectoryHandle, `${prefix}${entry.name}/`);
    else if (AUDIO_EXT.test(entry.name)) yield { path: prefix + entry.name, handle: entry as FileSystemFileHandle };
  }
}

/** Reads the folder again. Files already known (same path and size) keep their tags. */
export async function scanFolder(id: string) {
  const h = handles.get(id);
  if (!h) return;
  const d = await db();
  const known = new Map((await d.getAllFromIndex('tracks', 'folderId', id)).map((t) => [t.path, t]));
  const found: LocalTrack[] = [];
  let n = 0;
  try {
    for await (const { path, handle } of walk(h)) {
      library.scanning = `Scanning ${h.name}: ${++n} files`;
      const file = await handle.getFile();
      const old = known.get(path);
      if (old && old.size === file.size) {
        found.push(old);
        continue;
      }
      found.push(await toTrack(file, id, path, old?.id ?? `${id}:${path}`));
    }
    const tx = d.transaction(['tracks', 'folders'], 'readwrite');
    const keep = new Set(found.map((t) => t.id));
    for (const t of known.values()) if (!keep.has(t.id)) tx.objectStore('tracks').delete(t.id);
    for (const t of found) tx.objectStore('tracks').put(t);
    const rec = await tx.objectStore('folders').get(id);
    if (rec) tx.objectStore('folders').put({ ...rec, scanned: Date.now() });
    await tx.done;
    library.tracks = [...library.tracks.filter((t) => t.folderId !== id), ...found].sort(byArtistTitle);
    const f = library.folders.find((x) => x.id === id);
    if (f) f.scanned = Date.now();
    reindex();
  } finally {
    library.scanning = '';
  }
}

async function toTrack(file: File, folderId: string, path: string, id: string): Promise<LocalTrack> {
  const tags = await readTags(file);
  const title = tags.title!;
  const artist = tags.artist!;
  return { id, key: trackKey(artist, title), title, artist, album: tags.album, duration: tags.duration, bpm: tags.bpm, fileName: file.name, size: file.size, folderId, path };
}

/** Copies picked files into the app, so they stay available without the file picker. */
export async function importFiles(files: FileList | File[]) {
  const d = await db();
  void navigator.storage?.persist?.();
  const added: LocalTrack[] = [];
  try {
    let i = 0;
    for (const file of Array.from(files)) {
      library.scanning = `Importing ${++i} of ${files.length}`;
      if (!AUDIO_EXT.test(file.name) && !file.type.startsWith('audio/')) continue;
      const t = await toTrack(file, IMPORTED, file.name, `${IMPORTED}:${crypto.randomUUID()}`);
      // Re-importing the same song replaces the old copy.
      const dup = library.tracks.find((x) => x.folderId === IMPORTED && x.fileName === file.name && x.size === file.size);
      if (dup) t.id = dup.id;
      const tx = d.transaction(['tracks', 'blobs'], 'readwrite');
      tx.objectStore('blobs').put(file, t.id);
      tx.objectStore('tracks').put(t);
      await tx.done;
      added.push(t);
    }
  } finally {
    library.scanning = '';
  }
  const ids = new Set(added.map((t) => t.id));
  library.tracks = [...library.tracks.filter((t) => !ids.has(t.id)), ...added].sort(byArtistTitle);
  reindex();
  return added.length;
}

export async function removeLocalTrack(id: string) {
  const d = await db();
  const tx = d.transaction(['tracks', 'blobs'], 'readwrite');
  tx.objectStore('tracks').delete(id);
  tx.objectStore('blobs').delete(id);
  await tx.done;
  library.tracks = library.tracks.filter((t) => t.id !== id);
  reindex();
}

/** The audio file for a local track, or null if it can't be read right now. */
export async function localFile(id: string): Promise<Blob | null> {
  const t = localTrack(id);
  if (!t) return null;
  if (t.folderId === IMPORTED) return (await (await db()).get('blobs', id)) ?? null;
  const root = handles.get(t.folderId);
  const f = library.folders.find((x) => x.id === t.folderId);
  if (!root || f?.permission !== 'granted') return null;
  try {
    const parts = t.path.split('/');
    let dir = root;
    for (const p of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(p);
    return await (await dir.getFileHandle(parts.at(-1)!)).getFile();
  } catch {
    return null;
  }
}
