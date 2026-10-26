import { getAudio } from './sources';
import { layout, shape, type Placed } from './timeline';
import type { Clip, DjSet, TrackRef } from './types';

/**
 * Plays a set through Web Audio. Every clip is an AudioBufferSourceNode started at an
 * exact time on the AudioContext clock with its own gain envelope, so crossfades land
 * exactly where they were planned. Only clips near the playhead are decoded, and only
 * their portion of the song is kept, so a long set doesn't fill a phone's memory.
 */

export interface Voice {
  clipId: string;
  /** seconds into the song */
  time: number;
}

export const transport = $state({
  /** id of the set playing, or 'preview' */
  setId: '',
  playing: false,
  paused: false,
  loading: false,
  position: 0,
  total: 0,
  index: -1,
  voices: [] as Voice[],
  error: '',
});

const LOOKAHEAD = 20; // schedule clips starting this soon
const PRELOAD = 75; // decode clips starting this soon

let ctx: AudioContext | null = null;
let master: GainNode;
let run = 0;
let items: Placed[] = [];
let total = 0;
let origin = 0; // context time of set time 0
let until = Infinity;
let timer: ReturnType<typeof setInterval> | undefined;
const buffers = new Map<number, Promise<AudioBuffer | null>>();
const ready = new Map<number, AudioBuffer>();
const playing = new Map<number, { src: AudioBufferSourceNode; nodes: AudioNode[] }>();
let current: { setId: string; set: Pick<DjSet, 'clips' | 'fadeOut'> } | null = null;

/** Call synchronously inside a tap handler (iOS only unlocks audio there). */
function unlock() {
  if (!ctx) {
    ctx = new AudioContext({ latencyHint: 'playback' });
    master = ctx.createGain();
    master.connect(ctx.destination);
    // Play through the iPhone silent switch, like a music app.
    if (navigator.audioSession) navigator.audioSession.type = 'playback';
  }
  void ctx.resume();
  return ctx;
}

export const setTime = () => (ctx ? ctx.currentTime - origin : 0);

export function play(setId: string, set: Pick<DjSet, 'clips' | 'fadeOut'>, from = 0, end = Infinity) {
  const c = unlock();
  stopAll();
  const myRun = ++run;
  current = { setId, set: $state.snapshot(set) as Pick<DjSet, 'clips' | 'fadeOut'> };
  ({ items, total } = layout(current.set));
  until = Math.min(end, total);
  from = Math.max(0, Math.min(from, total - 0.05));
  Object.assign(transport, { setId, playing: true, paused: false, loading: true, position: from, total, error: '', voices: [] });
  updateMediaSession(-1);

  // Wait for whatever is audible at the start point, then line the clock up.
  const first = items.filter((p) => p.at <= from + 0.5 && p.at + p.len > from);
  Promise.all(first.map((p) => load(p))).then(() => {
    if (myRun !== run) return;
    origin = c.currentTime + 0.12 - from;
    transport.loading = false;
    tick();
    timer = setInterval(tick, 100);
  });
}

/** Play part of one song on its own (auditioning in the clip editor). */
export function audition(clip: Clip, from: number, to: number) {
  const solo: Clip = { ...($state.snapshot(clip) as Clip), start: from, end: to, fadeIn: 0 };
  play('preview', { clips: [solo], fadeOut: 0.05 });
}

export function pause() {
  if (!ctx || !transport.playing) return;
  void ctx.suspend();
  transport.paused = true;
  if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
}

export function resume() {
  if (!ctx) return;
  unlock();
  transport.paused = false;
  if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
}

export function seek(t: number) {
  if (!current) return;
  play(current.setId, current.set, t, until < total ? until : Infinity);
}

export function stop() {
  run++;
  stopAll();
  current = null;
  Object.assign(transport, { setId: '', playing: false, paused: false, loading: false, position: 0, index: -1, voices: [] });
  updateMediaSession(-1);
}

function stopAll() {
  clearInterval(timer);
  timer = undefined;
  for (const v of playing.values()) {
    try {
      v.src.stop();
    } catch {
      /* never started */
    }
    for (const n of v.nodes) n.disconnect();
  }
  playing.clear();
  buffers.clear();
  ready.clear();
}

// Decode one at a time: several full songs decoded at once can exhaust a phone's memory.
let decodeQueue: Promise<unknown> = Promise.resolve();
const full = new Map<string, Promise<AudioBuffer>>();

function decodeSong(track: TrackRef): Promise<AudioBuffer> {
  let p = full.get(track.key);
  if (!p) {
    p = new Promise<AudioBuffer>((resolve, reject) => {
      decodeQueue = decodeQueue.then(async () => {
        try {
          const { blob } = await getAudio(track);
          resolve(await ctx!.decodeAudioData(await blob.arrayBuffer()));
        } catch (e) {
          reject(e);
        }
      });
    });
    p.catch(() => full.delete(track.key));
    full.set(track.key, p);
    while (full.size > 2) full.delete(full.keys().next().value!);
  }
  return p;
}

function load(p: Placed): Promise<AudioBuffer | null> {
  let b = buffers.get(p.index);
  if (!b) {
    const myRun = run;
    b = decodeSong(p.clip.track)
      .then((song) => {
        // Keep just this clip's portion of the song.
        const rate = song.sampleRate;
        const s = Math.min(song.length - 1, Math.floor(p.clip.start * rate));
        const e = Math.min(song.length, s + Math.ceil(p.len * rate));
        const out = ctx!.createBuffer(song.numberOfChannels, Math.max(1, e - s), rate);
        for (let ch = 0; ch < song.numberOfChannels; ch++) out.copyToChannel(song.getChannelData(ch).subarray(s, e), ch);
        if (myRun === run) ready.set(p.index, out);
        return out;
      })
      .catch((e) => {
        if (myRun === run) transport.error = (e as Error).message;
        return null;
      });
    buffers.set(p.index, b);
  }
  return b;
}

function tick() {
  if (!ctx) return;
  const now = setTime();
  transport.position = Math.min(now, total);

  for (const p of items) {
    if (p.at > now + PRELOAD || p.at + p.len < now) continue;
    void load(p);
    if (p.at <= now + LOOKAHEAD && !playing.has(p.index)) {
      const buf = ready.get(p.index);
      if (buf) schedule(p, buf);
    }
  }
  // Free clips that have finished.
  for (const [i, v] of playing) {
    const p = items[i];
    if (p.at + p.len < now - 0.5) {
      for (const n of v.nodes) n.disconnect();
      playing.delete(i);
      ready.delete(i);
      buffers.delete(i);
    }
  }

  const audible = items.filter((p) => p.at <= now && p.at + p.len > now);
  transport.voices = audible.map((p) => ({ clipId: p.clip.id, time: p.clip.start + (now - p.at) }));
  const idx = audible.length ? audible[audible.length - 1].index : transport.index;
  if (idx !== transport.index) {
    transport.index = idx;
    updateMediaSession(idx);
  }
  if (now >= until + 0.05) stop();
}

function schedule(p: Placed, buf: AudioBuffer) {
  const c = ctx!;
  const lead = c.currentTime + 0.04;
  const startAt = origin + p.at;
  // Starting late (seeking into a clip, or it took a while to decode): join it part way.
  const offset = Math.max(0, lead - startAt);
  const when = Math.max(startAt, lead);
  const remaining = p.len - offset;
  if (remaining <= 0.02) return;

  const src = c.createBufferSource();
  src.buffer = buf;
  const fade = c.createGain();
  const trim = c.createGain();
  trim.gain.value = 10 ** (p.clip.gainDb / 20);
  src.connect(fade).connect(trim).connect(master);

  const nextCurve = items[p.index + 1]?.clip.curve ?? 'linear';
  const g = fade.gain;
  const inEnd = p.fadeIn;
  const outStart = p.len - p.fadeOut;
  const valueAt = (u: number) => {
    let v = 1;
    if (inEnd > 0 && u < inEnd) v *= shape(p.clip.curve, u / inEnd);
    if (p.fadeOut > 0 && u > outStart) v *= shape(nextCurve, 1 - (u - outStart) / p.fadeOut);
    return v;
  };
  // Curves can't share a start time with another automation event, hence the small gaps.
  const eps = 0.002;
  if (offset < inEnd) ramp(g, valueAt, offset, Math.min(inEnd, outStart), when - offset);
  else g.setValueAtTime(valueAt(offset), when);
  if (p.fadeOut > 0) ramp(g, valueAt, Math.max(outStart, offset, inEnd) + eps, p.len, when - offset);
  src.start(when, offset, remaining);
  playing.set(p.index, { src, nodes: [src, fade, trim] });
}

/** Schedules gain fn(u) for clip time u0..u1, where clip time 0 is context time base. */
function ramp(param: AudioParam, fn: (u: number) => number, u0: number, u1: number, base: number) {
  if (u1 - u0 < 0.01) {
    param.setValueAtTime(fn(u1), base + u0);
    return;
  }
  const n = Math.max(2, Math.min(256, Math.ceil((u1 - u0) * 30)));
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) curve[i] = fn(u0 + ((u1 - u0) * i) / (n - 1));
  param.setValueCurveAtTime(curve, base + u0, u1 - u0);
}

function updateMediaSession(idx: number) {
  if (!('mediaSession' in navigator)) return;
  const clip = current?.set.clips[idx];
  navigator.mediaSession.metadata = clip ? new MediaMetadata({ title: clip.track.title, artist: clip.track.artist, album: 'DJ Jelly' }) : null;
  navigator.mediaSession.playbackState = transport.playing ? (transport.paused ? 'paused' : 'playing') : 'none';
  navigator.mediaSession.setActionHandler('play', resume);
  navigator.mediaSession.setActionHandler('pause', pause);
  navigator.mediaSession.setActionHandler('stop', stop);
}
