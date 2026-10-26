# DJ Jelly

Plan DJ sets ahead of time instead of mixing live. A set is a list of clips (the part of each song you want), and each clip overlaps the one before it with a crossfade, so two songs play at once during every transition, like a two-deck mixer. Press play and the whole set runs exactly as planned.

## Features

- **Music from anywhere**: a local folder (Chrome/Edge), files imported into the app (iPhone, Android), or your Jellyfin server.
- **Works across devices**: sets remember each song by artist and title, so a set built from a laptop folder plays on a phone using Jellyfin (or that phone's own copy). Export a set from the ⋮ menu and import it on the other device.
- **Clip editor**: drag in and out points on the waveform, snap to beats, audition any spot.
- **Mix editor**: outgoing and incoming songs stacked with beat ticks so you can line beats up by eye, mix length in beats, smooth or linear curve, one-tap Align beats, Preview mix.
- **Automatic BPM and beat grid**, adjustable by hand (÷2, ×2, shift bar, fine nudge).
- **Sample-accurate playback** with Web Audio. Only clips near the playhead are decoded, to keep memory low on phones.
- Installable PWA, works offline for local files.

## Notes

- Tempo isn't changed: songs at different BPMs drift apart during a long mix. Keep mixes short between songs of different tempo.
- iPhone: playback through the silent switch needs iOS 17+. Keep the app open while a set plays; iOS may pause web audio in the background.

## Development

```sh
npm install
npm run dev     # local dev server
npm run check   # type check
npm run build   # production build in dist/
```

Deployed with Cloudflare Workers Builds (static assets, see `wrangler.jsonc`): `npm run build`, then `npx wrangler deploy`.
