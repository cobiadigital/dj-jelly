/**
 * A song as a set refers to it. Sets never point at a file directly: they keep the
 * metadata plus whichever source ids are known, and sources.ts finds the audio at play
 * time (local copy first, then Jellyfin). That lets one set play on any device.
 */
export interface TrackRef {
  /** normalized "artist|title", shared by every copy of the same song */
  key: string;
  title: string;
  artist: string;
  album?: string;
  /** seconds; 0 until known */
  duration: number;
  localId?: string;
  jellyfinId?: string;
}

export type FadeCurve = 'equal' | 'linear';

/** One portion of a song in a set. */
export interface Clip {
  id: string;
  track: TrackRef;
  /** in and out points, seconds into the song */
  start: number;
  end: number;
  /** seconds this clip overlaps the previous one (for the first clip: fade in from silence) */
  fadeIn: number;
  curve: FadeCurve;
  /** volume trim in dB */
  gainDb: number;
}

export interface DjSet {
  id: string;
  name: string;
  clips: Clip[];
  /** fade out at the very end of the set, seconds */
  fadeOut: number;
  created: number;
  updated: number;
}

/** A song found in a local folder or imported into the app. */
export interface LocalTrack {
  id: string;
  key: string;
  title: string;
  artist: string;
  album?: string;
  duration?: number;
  bpm?: number;
  fileName: string;
  size: number;
  /** 'imported' = bytes stored in IndexedDB, otherwise the id of the folder it lives in */
  folderId: string;
  /** path inside the folder, e.g. "House/Track.mp3" */
  path: string;
}

export interface FolderRecord {
  id: string;
  name: string;
  handle: FileSystemDirectoryHandle;
  scanned: number;
}

export interface Analysis {
  key: string;
  duration: number;
  bpm: number;
  /** time of the first beat, seconds */
  beat: number;
  /** waveform: peak level 0..255 per 1/PEAKS_PER_SEC seconds */
  peaks: Uint8Array;
  /** true once the user has adjusted the BPM or grid by hand */
  manual?: boolean;
}

export const PEAKS_PER_SEC = 50;

export function trackKey(artist: string, title: string) {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/\s*[([](feat|ft)\.?[^)\]]*[)\]]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  return `${norm(artist)}|${norm(title)}`;
}
