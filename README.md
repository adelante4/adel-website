# adel-website

Personal site. Plain HTML, CSS and a little JavaScript. No build step.

## Pages

- `index.html`: home, floating sections (About me, Notes)
- `notes.html`: posts as tracks on a spinning vinyl, three per record
- `post.html?slug=...`: a single note
- `about.html`

## Now playing

The home page shows what I am playing on Spotify through a small Cloudflare Worker in `worker/`.
Setup steps are in `worker/README.md`. Until `assets/js/config.js` has the Worker URL, the chip stays hidden.

## Add a note

1. Add an entry to `assets/js/posts.js` (newest first).
2. Create `posts/<slug>.html` with the post content as an HTML fragment (no `<html>` or `<body>`).

Every three posts make a new vinyl.

## Metronome

`metronome.html` is a practice metronome: odd meters, swing, chance, gap trainer, tempo ladder, count-in, share links, a chord progression builder with an electric piano, and a band you build in layers: chords (20 chord sounds: sampled pianos, strings, horn, trumpet and organs, plus synths made in code: Analog poly, Supersaw, Dark drone, Glass bells), bass (walking, two-feel, bossa, lofi and more, 10 sounds), and drums (16 grooves, 10 kits), each with its own volume. A few standards are included as changes only (typical changes, check against your own chart). Every sound has a synth fallback. It has no build step. The code is plain ES modules in `assets/js/metronome/`. The timing logic (`timeline`, `pattern`, `overlay`, `chords`, `comping`, `groove`, `transport`, `share`) does not touch Web Audio, so it runs under Node.

```
npm test
```

The recorded click voices in `assets/audio/clicks/` come from the CC0 Versilian Community Sample Library. See the licence note in that folder.

The recorded instruments in `assets/audio/inst/` and drum kits in `assets/audio/kits/` are also CC0 (Karoryfer Samples, the Versilian Community Sample Library and D. Smolken's Otto Rubner double bass), so no credit is required. They load lazily, only for the sounds you pick.

The kit `bebop` (a jazz kit played with sticks) is cut from Versilian Studios' Virtuosity Drums (CC0) by the same script (clone `sfzinstruments/virtuosity_drums` next to the others). The kits `tr808` and `tr909` are generated in code by `tools/build-electro.py`, so they are original sounds. The kits `gogoroom`, `gogoretro`, `swirly` and `hands` are cut from the Karoryfer libraries by `tools/build-kits.py (mono) and tools/build-kits-stereo.py (stereo, with toms and crash)` (needs numpy and scipy, and local clones of `karoryfer.swirly-drums` and `karoryfer.gogodze-phu-vol-ii` from sfzinstruments on GitHub). Per-sound loudness trims live in `instruments.js`. `tools/measure-levels.html` renders every sound through the real audio engine so the trims can be re-measured after any change.

The instruments `grand`, `kawai`, `harpsichord`, `harp`, `marimba`, `kalimba` and `pipeorgan` are cut from the VCSL library (CC0) by `tools/build-keys.py` (needs numpy, scipy and a local clone of `sgossner/vcsl`). The `strings` (cello, viola and violin sections), `horn` and `trumpet` are cut from VS Chamber Orchestra: Community Edition (CC0) by `tools/build-orchestra.py` (a clone of `sgossner/VSCO-2-CE`). Instruments load on first use.

## Run locally

Modules and `fetch` need a server, not `file://`:

```
python3 -m http.server 8000
```

## Deploy

GitHub Pages: Settings, Pages, deploy from branch `main`, folder `/ (root)`.


## Top 100

The "Top 100" group in the chord picker is the JazzStandards.com top 100 (`tools/top100.txt`), with the changes taken from an iReal Pro playlist that holds them: `node tools/build-top-100.mjs <file with the irealb:// link>` writes `assets/js/metronome/top100.js`. Bars with more than two chords keep two, and chord types are mapped to the ones the page knows. Check them against your own chart.

The "My standards" group (your Notion list) is built the same way from your own charts: `node tools/build-my-standards.mjs <file with the irealb:// link>`.

## The page and the Tune section

The page is one column: Sound (Metronome, Chords, Bass, Drums and Feel as chips, each opening its settings in one panel, plus a plain sentence from `sentence.js` saying what you hear), Practice (count-in, gap, ladder, trade fours), then Tune, with Start and tempo fixed at the bottom. Every control exists once. The Tune section holds the chart. A lens changes what each bar shows: chord names, Roman numerals (`analysis.js` finds ii-V-I, ii-V-i, V-I and tritone-sub cadences and names each chord in the key it is working in), the 3rd and 7th of each chord (`tune.js`), or a four-string guitar shape per chord (`voicing.js` searches shapes and picks a path with the least hand movement). The Now/Next strip follows the playhead. Under the chart, `dna.js` lists the four-bar pieces the tune shares with the others in the library, matched by shape, not by key.

## Offline and install

`manifest.webmanifest`, `sw.js` and `assets/js/metronome/offline.js` make the metronome an installable app that works with no connection. The service worker saves the app files when the page first loads. A button under "Use offline or install as an app" saves all the sounds (about 47 MB). `offline-manifest.json` lists every file with a content hash. After adding or rebuilding any file under `assets/`, run `node tools/offline-manifest.mjs`; a test fails if it is out of date. The screen stays awake while the metronome plays, where the browser allows it.

## Export

"Export to your MPC, Ableton or any sampler" renders the band offline, in the page, with the same engine as playback: loop-ready WAV stems (full mix, chords, bass, drums, metronome; 16 or 24-bit, 44.1 kHz, exact bar lengths, seamless tails, shared level so the stems add up), a MIDI file (chords, bass, drums, metronome on separate tracks, tempo and meter included), and the current drum kit as one-shot WAVs. Akai MPC Sample imports WAV, not MIDI files.

## Odd meters and taals

Choosing 5/4 jazz, 5/8, 7/8 (2+2+3 or 3+2+2), 9/8, 11/8, Teental (16), Rupak (7), Jhaptal (10), Keharwa (8) or Dadra (6) moves the meter to match. The taal grooves play the theka (the standard bol pattern) on the existing drum voices: open bass strokes as kick, dayan strokes as rim, closed strokes as ghost notes. They are approximations, best on the Hand percussion kit. They are unheard by the author's ear.

## Smarter band

- **Intensity** (Drums panel): 0.5 is the groove as written. Lower drops ghost notes and subdivisions; higher adds ghost notes, louder hits and more frequent fills. **Fills** are written-out drum fills (a crescendo of snare hits, sometimes with a kick) at the end of every fourth bar, landing on the next downbeat with an open hat and kick (every second above 0.75), now also for the triplet grooves (jazz, shuffle, brushes). **Pocket feel** puts the bass about 10 ms behind the beat, chords 4 ms, snare 5 ms, ride 5 ms ahead.
- **Scales lens** (Tune room): the scale for each chord, its arpeggio, and a random tone to land on in the Now and Next cards. A dominant that falls to a minor chord gets the altered scale, a major chord on IV gets Lydian, vi gets Aeolian, iii Phrygian.
