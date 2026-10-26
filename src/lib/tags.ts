/**
 * Just enough tag reading to list a local music folder: title, artist, album and BPM from
 * ID3v2 (MP3) and Vorbis comments (FLAC), plus FLAC's exact duration. Anything else falls
 * back to the file name ("Artist - Title.mp3").
 */

export interface Tags {
  title?: string;
  artist?: string;
  album?: string;
  bpm?: number;
  duration?: number;
}

export const AUDIO_EXT = /\.(mp3|m4a|aac|mp4|flac|ogg|oga|opus|wav|aif|aiff)$/i;

export async function readTags(file: File): Promise<Tags> {
  let tags: Tags = {};
  try {
    const head = new DataView(await file.slice(0, 10).arrayBuffer());
    const magic = String.fromCharCode(head.getUint8(0), head.getUint8(1), head.getUint8(2), head.getUint8(3));
    if (magic.startsWith('ID3')) {
      const size = syncsafe(head, 6) + 10;
      tags = id3(new DataView(await file.slice(0, Math.min(size, 1 << 20)).arrayBuffer()));
    } else if (magic === 'fLaC') {
      tags = flac(new DataView(await file.slice(0, 1 << 20).arrayBuffer()));
    }
  } catch {
    /* unreadable tags: use the file name */
  }
  const fromName = parseFileName(file.name);
  return { ...tags, title: tags.title || fromName.title, artist: tags.artist || fromName.artist };
}

export function parseFileName(name: string): { title: string; artist: string } {
  const base = name.replace(/\.[^.]+$/, '').replace(/^\d{1,3}\s*[-.)_]\s*/, '').replace(/_/g, ' ');
  const parts = base.split(/\s+[-–—]\s+/);
  if (parts.length >= 2) return { artist: parts[0].trim(), title: parts.slice(1).join(' - ').trim() };
  return { artist: 'Unknown artist', title: base.trim() };
}

const syncsafe = (v: DataView, o: number) => (v.getUint8(o) << 21) | (v.getUint8(o + 1) << 14) | (v.getUint8(o + 2) << 7) | v.getUint8(o + 3);

function decodeText(bytes: Uint8Array): string {
  if (!bytes.length) return '';
  const enc = bytes[0];
  const body = bytes.subarray(1);
  let s: string;
  if (enc === 1) s = new TextDecoder('utf-16').decode(body);
  else if (enc === 2) s = new TextDecoder('utf-16be').decode(body);
  else if (enc === 3) s = new TextDecoder('utf-8').decode(body);
  else s = new TextDecoder('latin1').decode(body);
  return s.replace(/\0+$/, '').split('\0')[0].trim();
}

function id3(v: DataView): Tags {
  const major = v.getUint8(3);
  const end = Math.min(v.byteLength, syncsafe(v, 6) + 10);
  const out: Tags = {};
  const small = major === 2;
  let o = 10;
  if (!small && v.getUint8(5) & 0x40) o += major === 4 ? syncsafe(v, 10) : v.getUint32(10) + 4; // extended header
  const idLen = small ? 3 : 4;
  const hdrLen = small ? 6 : 10;
  while (o + hdrLen <= end) {
    const id = String.fromCharCode(...new Uint8Array(v.buffer, o, idLen));
    if (!/^[A-Z0-9]+$/.test(id)) break; // padding
    const size = small ? (v.getUint8(o + 3) << 16) | (v.getUint8(o + 4) << 8) | v.getUint8(o + 5) : major === 4 ? syncsafe(v, o + 4) : v.getUint32(o + 4);
    const data = new Uint8Array(v.buffer, o + hdrLen, Math.max(0, Math.min(size, end - o - hdrLen)));
    const text = () => decodeText(data);
    if (id === 'TIT2' || id === 'TT2') out.title = text();
    else if (id === 'TPE1' || id === 'TP1') out.artist = text();
    else if (id === 'TALB' || id === 'TAL') out.album = text();
    else if (id === 'TBPM' || id === 'TBP') out.bpm = parseFloat(text()) || undefined;
    o += hdrLen + size;
  }
  return out;
}

function flac(v: DataView): Tags {
  const out: Tags = {};
  let o = 4;
  while (o + 4 <= v.byteLength) {
    const hdr = v.getUint8(o);
    const type = hdr & 0x7f;
    const len = (v.getUint8(o + 1) << 16) | (v.getUint8(o + 2) << 8) | v.getUint8(o + 3);
    const b = o + 4;
    if (b + len > v.byteLength) break;
    if (type === 0) {
      const rate = (v.getUint8(b + 10) << 12) | (v.getUint8(b + 11) << 4) | (v.getUint8(b + 12) >> 4);
      const samples = (v.getUint8(b + 13) & 0x0f) * 2 ** 32 + v.getUint32(b + 14);
      if (rate && samples) out.duration = samples / rate;
    } else if (type === 4) {
      const td = new TextDecoder('utf-8');
      let p = b + 4 + v.getUint32(b, true);
      const n = v.getUint32(p, true);
      p += 4;
      for (let i = 0; i < n && p + 4 <= b + len; i++) {
        const l = v.getUint32(p, true);
        const kv = td.decode(new Uint8Array(v.buffer, p + 4, l));
        p += 4 + l;
        const eq = kv.indexOf('=');
        const k = kv.slice(0, eq).toUpperCase();
        const val = kv.slice(eq + 1).trim();
        if (k === 'TITLE') out.title = val;
        else if (k === 'ARTIST') out.artist ??= val;
        else if (k === 'ALBUM') out.album = val;
        else if (k === 'BPM') out.bpm = parseFloat(val) || undefined;
      }
    }
    if (hdr & 0x80) break;
    o = b + len;
  }
  return out;
}
