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

`metronome.html` is a practice metronome: odd meters, swing, chance, gap trainer, tempo ladder, count-in, share links, a chord progression builder with an electric piano, and a band you build in layers: chords (17 keys sounds, including two sampled grand pianos and four synths made in code), bass (walking, two-feel, bossa, lofi and more, 10 sounds), and drums (17 grooves, 10 kits), each with its own volume. A few standards are included as changes only (typical changes, check against your own chart). Every sound has a synth fallback. It has no build step. The code is plain ES modules in `assets/js/metronome/`. The timing logic (`timeline`, `pattern`, `overlay`, `chords`, `comping`, `groove`, `transport`, `share`) does not touch Web Audio, so it runs under Node.

```
npm test
```

The recorded click voices in `assets/audio/clicks/` come from the CC0 Versilian Community Sample Library. See the licence note in that folder.

The recorded instruments in `assets/audio/inst/` and drum kits in `assets/audio/kits/` are also CC0 (Karoryfer Samples, the Versilian Community Sample Library and D. Smolken's Otto Rubner double bass), so no credit is required. They load lazily, only for the sounds you pick.

The kit `bebop` (a jazz kit played with sticks) is cut from Versilian Studios' Virtuosity Drums (CC0) by the same script (clone `sfzinstruments/virtuosity_drums` next to the others). The kits `tr808` and `tr909` are generated in code by `tools/build-electro.py`, so they are original sounds. The kits `gogoroom`, `gogoretro`, `swirly` and `hands` are cut from the Karoryfer libraries by `tools/build-kits.py` (needs numpy and scipy, and local clones of `karoryfer.swirly-drums` and `karoryfer.gogodze-phu-vol-ii` from sfzinstruments on GitHub). Per-sound loudness trims live in `instruments.js`. `tools/measure-levels.html` renders every sound through the real audio engine so the trims can be re-measured after any change.

The keys `grand`, `kawai`, `harpsichord`, `harp`, `marimba` and `kalimba` are cut from the VCSL library (CC0) by `tools/build-keys.py` (needs numpy and scipy and a local clone of `sgossner/vcsl`). They load on first use.

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

The page is one column: Sound (Click, Keys, Bass, Drums and Feel as chips, each opening its settings in one panel, plus a plain sentence from `sentence.js` saying what you hear), Practice (count-in, gap, ladder, trade fours), then Tune, with Start and tempo fixed at the bottom. Every control exists once. The Tune section holds the chart. A lens changes what each bar shows: chord names, Roman numerals (`analysis.js` finds ii-V-I, ii-V-i, V-I and tritone-sub cadences and names each chord in the key it is working in), the 3rd and 7th of each chord (`tune.js`), or a four-string guitar shape per chord (`voicing.js` searches shapes and picks a path with the least hand movement). The Now/Next strip follows the playhead. Under the chart, `dna.js` lists the four-bar pieces the tune shares with the others in the library, matched by shape, not by key.
