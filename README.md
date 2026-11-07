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

`metronome.html` is a practice metronome: odd meters, swing, chance, gap trainer, tempo ladder, count-in, share links, a chord progression builder with an electric piano, and a band you build in layers: chords (7 keys sounds), bass (walking, two-feel, bossa, lofi and more, 6 sounds), and drums (10 grooves, 3 kits), each with its own volume. A few standards are included as changes only (typical changes, check against your own chart). Every sound has a synth fallback. It has no build step. The code is plain ES modules in `assets/js/metronome/`. The timing logic (`timeline`, `pattern`, `overlay`, `chords`, `comping`, `groove`, `transport`, `share`) does not touch Web Audio, so it runs under Node.

```
npm test
```

The recorded click voices in `assets/audio/clicks/` come from the CC0 Versilian Community Sample Library. See the licence note in that folder.

The recorded instruments in `assets/audio/inst/` and drum kits in `assets/audio/kits/` are also CC0 (Karoryfer Samples and the Versilian Community Sample Library), so no credit is required. They load lazily, only for the sounds you pick.

## Run locally

Modules and `fetch` need a server, not `file://`:

```
python3 -m http.server 8000
```

## Deploy

GitHub Pages: Settings, Pages, deploy from branch `main`, folder `/ (root)`.
