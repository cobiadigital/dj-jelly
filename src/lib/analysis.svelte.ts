import { db } from './db';
import { getAudio } from './sources';
import { PEAKS_PER_SEC, type Analysis, type TrackRef } from './types';

/**
 * BPM, beat grid and waveform for each song, computed once and kept in IndexedDB.
 * Songs are decoded at a low sample rate in mono, which is plenty for both and keeps
 * memory use down on phones.
 */

const RATE = 22050;

export const analyses = $state<Record<string, Analysis>>({});
export const analyzing = $state<Record<string, string>>({}); // key -> '' while working, or an error message

let onAnalyzed: (a: Analysis) => void = () => {};
export function setAnalyzedHandler(fn: typeof onAnalyzed) {
  onAnalyzed = fn;
}

let queue = Promise.resolve();
const pending = new Set<string>();

/** Loads the cached analysis, or queues the song to be analyzed. */
export async function ensureAnalysis(track: TrackRef) {
  if (analyses[track.key] || pending.has(track.key)) return;
  pending.add(track.key);
  const saved = await (await db()).get('analysis', track.key);
  if (saved) {
    analyses[track.key] = saved;
    pending.delete(track.key);
    onAnalyzed(saved);
    return;
  }
  analyzing[track.key] = '';
  queue = queue.then(async () => {
    try {
      const a = await analyze(track);
      await saveAnalysis(a);
      delete analyzing[track.key];
      onAnalyzed(a);
    } catch (e) {
      analyzing[track.key] = (e as Error).message;
    } finally {
      pending.delete(track.key);
    }
  });
}

export async function saveAnalysis(a: Analysis) {
  analyses[a.key] = a;
  await (await db()).put('analysis', $state.snapshot(a) as Analysis);
}

/** Forget a failed attempt so it can be tried again (e.g. after signing in). */
export function retryAnalysis(track: TrackRef) {
  delete analyzing[track.key];
  pending.delete(track.key);
  return ensureAnalysis(track);
}

async function analyze(track: TrackRef): Promise<Analysis> {
  const { blob } = await getAudio(track);
  const buf = await new OfflineAudioContext(1, 1, RATE).decodeAudioData(await blob.arrayBuffer());
  const pcm = new Float32Array(buf.length);
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const ch = buf.getChannelData(c);
    for (let i = 0; i < ch.length; i++) pcm[i] += ch[i] / buf.numberOfChannels;
  }
  const rate = buf.sampleRate;
  const { bpm, beat } = detectTempo(pcm, rate);
  return { key: track.key, duration: buf.duration, bpm, beat, peaks: peaks(pcm, rate) };
}

function peaks(pcm: Float32Array, rate: number) {
  const win = rate / PEAKS_PER_SEC;
  const out = new Uint8Array(Math.ceil(pcm.length / win));
  let max = 1e-6;
  const raw = new Float32Array(out.length);
  for (let i = 0; i < out.length; i++) {
    let m = 0;
    const end = Math.min(pcm.length, Math.floor((i + 1) * win));
    for (let j = Math.floor(i * win); j < end; j++) m = Math.max(m, Math.abs(pcm[j]));
    raw[i] = m;
    max = Math.max(max, m);
  }
  for (let i = 0; i < out.length; i++) out[i] = Math.round((raw[i] / max) * 255);
  return out;
}

/**
 * Tempo by folding an onset envelope (mostly kick drum) at each candidate beat period
 * and picking the period where the onsets pile up most sharply in one phase. Folding the
 * whole song gives a tempo accurate to a few hundredths of a BPM for steady dance music.
 * The phase of the pile-up is the beat grid offset.
 */
export function detectTempo(pcm: Float32Array, rate: number): { bpm: number; beat: number } {
  const hop = Math.round(rate / 100);
  const fps = rate / hop;
  const frames = Math.floor(pcm.length / hop);
  if (frames < fps * 5) return { bpm: 120, beat: 0 };

  // Energy per frame: low band (one-pole low-pass ~150 Hz) and full band.
  const a = 1 - Math.exp((-2 * Math.PI * 150) / rate);
  const low = new Float32Array(frames);
  const full = new Float32Array(frames);
  let y = 0;
  for (let f = 0; f < frames; f++) {
    let el = 0;
    let ef = 0;
    for (let i = f * hop, end = i + hop; i < end; i++) {
      const x = pcm[i];
      y += a * (x - y);
      el += y * y;
      ef += x * x;
    }
    low[f] = Math.log1p(1000 * Math.sqrt(el / hop));
    full[f] = Math.log1p(1000 * Math.sqrt(ef / hop));
  }
  const onset = new Float32Array(frames);
  for (let f = 1; f < frames; f++) onset[f] = Math.max(0, low[f] - low[f - 1]) + 0.5 * Math.max(0, full[f] - full[f - 1]);
  // Subtract a moving average so loud passages don't dominate.
  const w = Math.round(fps / 2);
  let sum = 0;
  const env = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    sum += onset[f];
    if (f >= w) sum -= onset[f - w];
    env[f] = Math.max(0, onset[f] - sum / Math.min(f + 1, w));
  }

  const K = 32;
  const bins = new Float64Array(K);
  const score = (bpm: number) => {
    const period = (60 * fps) / bpm;
    bins.fill(0);
    let total = 0;
    for (let f = 0; f < frames; f++) {
      const v = env[f];
      if (!v) continue;
      bins[Math.floor(((f % period) / period) * K) % K] += v;
      total += v;
    }
    let best = 0;
    let bi = 0;
    for (let k = 0; k < K; k++) {
      // smooth over neighbours so a peak straddling two bins isn't penalized
      const s = bins[k] + 0.5 * (bins[(k + 1) % K] + bins[(k + K - 1) % K]);
      if (s > best) {
        best = s;
        bi = k;
      }
    }
    const sharp = total ? (best / 2) / (total / K) : 0;
    // mild preference for the usual DJ range, to settle half/double tempo ambiguity
    const prior = Math.exp(-0.5 * (Math.log2(bpm / 122) / 0.6) ** 2);
    return { s: sharp * (0.75 + 0.25 * prior), phase: (bi + 0.5) / K, period };
  };

  let best = { bpm: 120, s: -1, phase: 0, period: 0 };
  for (let b = 70; b <= 180; b += 0.5) {
    const r = score(b);
    if (r.s > best.s) best = { bpm: b, ...r };
  }
  const coarse = best.bpm;
  for (let b = coarse - 0.6; b <= coarse + 0.6; b += 0.02) {
    const r = score(b);
    if (r.s > best.s) best = { bpm: b, ...r };
  }
  const periodSec = 60 / best.bpm;
  // An onset in frame f happened during that frame: centre it.
  let beat = ((best.phase * best.period + 0.5) / fps) % periodSec;
  if (beat < 0) beat += periodSec;
  return { bpm: Math.round(best.bpm * 100) / 100, beat };
}

/** Beat times (seconds into the song) between t0 and t1. */
export function beatsBetween(a: Analysis, t0: number, t1: number) {
  const p = 60 / a.bpm;
  const out: { t: number; bar: boolean }[] = [];
  let n = Math.ceil((t0 - a.beat) / p);
  for (let t = a.beat + n * p; t <= t1; t = a.beat + ++n * p) out.push({ t, bar: ((n % 4) + 4) % 4 === 0 });
  return out;
}

export function nearestBeat(a: Analysis | undefined, t: number) {
  if (!a) return t;
  const p = 60 / a.bpm;
  return Math.max(0, a.beat + Math.round((t - a.beat) / p) * p);
}
