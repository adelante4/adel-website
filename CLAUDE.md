# adel-website

Personal site with a jazz practice metronome. Plain HTML, CSS and ES modules. No build step, no bundler, no dependencies to install.

`README.md` is the feature reference for people. This file is for agents working on the code.

## Run and test

- Tests: `npm test` (Node's built-in runner, `test/*.test.mjs`). Run them before every commit. They must all pass.
- Local server: `python3 -m http.server 8000`, then open `http://localhost:8000/metronome.html`. Modules and `fetch` do not work from `file://`.
- Deploy: GitHub Pages serves `main` from the repo root. A push to `main` is a release.

## Where things are

- `metronome.html`: the metronome page. All its code is in `assets/js/metronome/`, styles in `assets/css/metronome.css`.
- `index.html`, `notes.html`, `post.html`, `about.html`, `listening.html`: the rest of the site. `worker/` is a Cloudflare Worker for the "now playing" chip (own `package.json` and tests).
- `tools/`: scripts that generate committed files (sample sets, `top100.js`, the MPC template, `offline-manifest.json`). Python scripts need numpy and scipy and local clones of the sample libraries named in `README.md`.
- `test/helpers/`: a synthetic guitar (`synth.mjs`) and a bench (`bench.mjs`) for the listening code.

Every module starts with a one-line comment that says what it is. Read that first.

Pure modules (no Web Audio, no DOM) run under Node and have tests: timing (`timeline`, `transport`, `pattern`, `overlay`, `meter`, `tempo`), harmony (`chords`, `analysis`, `scales`, `sections`, `voicing`, `dna`), the band (`comping`, `bassline`, `groove`, `bands`), state (`share`, `edits`, `mine`, `sentence`), export (`wav`, `midi`, `zip`, `mpc`, `mpcdsp`) and listening (`fft`, `pitch`, `ear`, `latency`, `echo`, `timefeel`, `coach`, `harmonymap`, `licks`).

Browser-only modules wire the page: `metronome.js` (entry point, controls to state to audio), `audio.js`, `sampler.js`, `voices.js`, `rooms.js`, `tune.js`, `listen.js`, `mic.js`, `tap-worklet.js`, `offline.js`, `export.js`.

Keep new logic in pure modules and test it there. Keep browser modules thin. A choice that ties settings together (a meter change, a groove that moves the meter) belongs in `edits.js`, and the page applies it with `apply()`.

## Rules to keep

- **Cache tag.** Every import and asset link carries the same `?v=<tag>` (for example `?v=20261112b`). When you change any file under `assets/js`, `assets/css` or `metronome.html`, bump the tag everywhere at once. `test/cachetag.test.mjs` fails on mixed tags. A stale tag makes the browser load two copies of a module.
- **Offline manifest.** After you add, remove or change a metronome module, icon or sound, run `node tools/offline-manifest.mjs`. The tests fail if `offline-manifest.json` is out of date.
- **Sound levels** (no test checks this). Per-sound loudness trims live in `instruments.js`. After a change to a sound, re-measure with `tools/measure-levels.html`.

## Writing style

Code comments, commit messages and the README use short, plain sentences in the present tense. Say what a thing does, not how clever it is. Commit subjects start with the area: `Listen: ...`, `Bass: ...`, `Comping: ...`, `Service worker: ...`.

## Agent skills

The engineering skills from [mattpocock/skills](https://github.com/mattpocock/skills) (MIT) are copied into `.claude/skills/`. They are plain files: edit them to fit this repo.

### Issue tracker

Issues and specs are markdown files under `.scratch/`. See `docs/agents/issue-tracker.md`.

### Triage labels

The five default roles, as `Status:` lines: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` and `docs/adr/` at the repo root, created when the first term or decision is settled. See `docs/agents/domain.md`.
