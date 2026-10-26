# CLAUDE.md

Guidance for Claude Code working in this repository.

## Change workflow (required)

1. **Issue first.** Create a GitHub issue describing the change before writing code.
2. **Branch from the issue**: `issue-<number>-<short-slug>`, from the latest `main`.
3. **Open a pull request into `main`** with `Closes #<number>` in the body.
4. **`main` changes only through merged PRs.** Never push to `main` directly. Don't merge PRs unless asked.

## User context

- The owner works mostly from a phone. Prefer dashboard or GitHub UI steps over CLI steps.
- Deployment is **Cloudflare Workers Builds**: a merge to `main` runs `npm run build`, then `npx wrangler deploy`, straight to production.
- Never ask for secrets in chat or commit them; use Workers Builds variables/secrets.

## Project overview

Sister project of `cobiadigital/jellyfin-client`. A PWA for planning DJ sets: clips of songs with overlapping crossfades, played back with Web Audio. Static site, no backend. Stack: Vite, Svelte 5 (runes), TypeScript, `idb`.

| Path | Purpose |
| --- | --- |
| `src/lib/types.ts` | Set, clip, track and analysis types; `trackKey` (normalized artist+title) |
| `src/lib/sources.ts` | The bridge: finds audio for a track (local copy, then Jellyfin), caches Jellyfin audio |
| `src/lib/library.svelte.ts` | Local music: folder handles (File System Access) and imported files (blobs in IndexedDB) |
| `src/lib/tags.ts` | Minimal ID3v2 / FLAC tag reader |
| `src/lib/analysis.svelte.ts` | BPM, beat grid and waveform peaks, cached in IndexedDB |
| `src/lib/timeline.ts` | Where each clip sits in a set; fade shapes |
| `src/lib/engine.svelte.ts` | Playback: schedules clips on the AudioContext clock with gain envelopes |
| `src/lib/sets.svelte.ts` | Set store, persistence, export/import |
| `src/views/`, `src/components/` | UI |

### Rules

- Sets refer to songs by `TrackRef`, never by file. Local ids are device-specific; matching by `key` is the fallback.
- Decode one song at a time and keep only the clip's portion of the buffer (phone memory).
- Call `play()`/`audition()` synchronously inside tap handlers (iOS unlocks audio only there).
- Snapshot `$state` before writing to IndexedDB.

## Before opening a PR

`npm run check` (0 errors) and `npm run build` must pass. For playback changes, exercise `npm run preview` in a browser at a phone-sized viewport and say in the PR what was and wasn't tested.
