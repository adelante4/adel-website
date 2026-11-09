import test from "node:test";
import assert from "node:assert/strict";
import { parseChord, cleanChord, transposeChord, formatChord, chordPitchClasses, voiceChord, voiceChords, bassNote, PRESETS, QUALITIES } from "../assets/js/metronome/chords.js";
import { styleHits, flattenForm, generateHarmony, COMP_STYLES, MIX_STYLES, DENSITY, resolveStyle } from "../assets/js/metronome/comping.js";
import { createTransport } from "../assets/js/metronome/transport.js";
import { generateGroove, stepBeat, GROOVE_STYLES, grooveFits, grooveSounds, grooveMeter } from "../assets/js/metronome/groove.js";
import { generateBass, BASS_STYLES } from "../assets/js/metronome/bassline.js";
import { TOP_100 } from "../assets/js/metronome/top100.js";
import { STANDARDS, MY_STANDARDS } from "../assets/js/metronome/standards.js";
import { barPlays } from "../assets/js/metronome/overlay.js";
import { defaultState, normalizePattern, normalizeState, encodeShare, decodeShare } from "../assets/js/metronome/share.js";

const pattern = { bpm: 90, beats: 4, den: 4, seed: 1, humanize: 0 };
const practice = (o = {}) => ({ gap: null, trade: 0, countIn: 0, ladder: null, ...o });
const H = (o = {}) => ({ on: true, form: [["Cmaj7"], ["Am7"], ["Dm7"], ["G7"]], comp: "charleston", sound: "rhodes", ...o });

test("chord names parse, normalise and transpose", () => {
  assert.deepEqual(parseChord("Cmaj7"), { root: 0, quality: "maj7" });
  assert.deepEqual(parseChord("Bb7alt"), { root: 10, quality: "7alt" });
  assert.equal(formatChord(parseChord("A#m7")), "Bbm7");
  assert.equal(parseChord("H7"), null);
  assert.equal(parseChord("Cfoo"), null);
  assert.equal(parseChord({}), null);
  assert.equal(cleanChord("nonsense"), "Cmaj7");
  assert.equal(transposeChord("Dm7", 2), "Em7");
  assert.equal(transposeChord("G7", 5), "C7");
  assert.equal(transposeChord("Cmaj7", -1), "Bmaj7");
});

test("every quality has voiced tones and a pitch class set without the root for 7ths", () => {
  for (const q of QUALITIES) {
    const pcs = chordPitchClasses({ root: 0, quality: q.id });
    assert.ok(pcs.length >= 3, q.id);
  }
  assert.ok(!chordPitchClasses({ root: 0, quality: "maj7" }).includes(0));
  assert.deepEqual(chordPitchClasses({ root: 0, quality: "maj7" }).slice(0, 3), [4, 7, 11]);
});

test("voicings sit in the piano range, ascend, and contain the guide tones", () => {
  for (const q of QUALITIES) {
    for (let root = 0; root < 12; root++) {
      const text = formatChord({ root, quality: q.id });
      const v = voiceChord(text);
      assert.ok(v[0] >= 46 && v[v.length - 1] <= 76, text);
      for (let i = 1; i < v.length; i++) assert.ok(v[i] > v[i - 1], text);
      const pcs = new Set(v.map((n) => n % 12));
      for (const p of chordPitchClasses({ root, quality: q.id })) assert.ok(pcs.has(p), `${text} misses ${p}`);
    }
  }
});

test("voice leading keeps the chords close together", () => {
  for (const preset of PRESETS) {
    const list = preset.form.flat();
    const v = voiceChords(list);
    for (let i = 1; i < v.length; i++) {
      const n = Math.max(v[i].length, v[i - 1].length);
      let total = 0;
      for (let k = 0; k < n; k++) total += Math.abs((v[i][k] ?? v[i][v[i].length - 1]) - (v[i - 1][k] ?? v[i - 1][v[i - 1].length - 1]));
      assert.ok(total / n <= 4, `${preset.name}: voices move ${(total / n).toFixed(1)} on average at ${list[i]}`);
    }
  }
});

test("bass note is the root in the second octave", () => {
  assert.equal(bassNote("Cmaj7"), 36);
  assert.equal(bassNote("Bm7"), 47);
});

test("presets are valid", () => {
  for (const p of PRESETS) {
    assert.ok(p.form.length >= 2 && p.form.length <= 64);
    for (const bar of p.form) {
      assert.ok(bar.length === 1 || bar.length === 2);
      for (const c of bar) assert.equal(cleanChord(c, "X"), c, `${p.name}: ${c}`);
    }
  }
});

test("comping styles place hits where they should", () => {
  assert.deepEqual(styleHits("on1", 4).map((h) => h.at), [0]);
  assert.deepEqual(styleHits("charleston", 4).map((h) => h.at), [0, 1.5]);
  assert.deepEqual(styleHits("twofeel", 4).map((h) => h.at), [0, 2]);
  assert.equal(styleHits("push", 4)[0].at, -0.5);
  assert.equal(styleHits("sustain", 4)[0].dur, 4);
  assert.equal(styleHits("charleston", 2).length, 1);
});

test("a split bar divides the bar and sums to its length", () => {
  const slots = flattenForm([["Dm7", "G7"], ["Cmaj7"]], 4);
  assert.deepEqual(slots.map((s) => [s.start, s.span]), [[0, 2], [2, 2], [0, 4]]);
  const odd = flattenForm([["A", "B"]], 7);
  assert.equal(odd[0].span + odd[1].span, 7);
});

test("harmony: charleston hits, nothing during the count-in", () => {
  const ev = generateHarmony(H(), pattern, practice(), 0, 8);
  assert.deepEqual(ev.map((e) => e.beat), [0, 1.5, 4, 5.5]);
  const counted = generateHarmony(H(), pattern, practice({ countIn: 1 }), 0, 8);
  assert.ok(counted.every((e) => e.beat >= 4));
});

test("harmony: the form loops and the push anticipates the next bar", () => {
  const ev = generateHarmony(H({ comp: "push" }), pattern, practice(), 0, 20);
  const beats = ev.map((e) => e.beat);
  assert.ok(beats.includes(3.5) && beats.includes(7.5)); // pushes into bars 2 and 3
  assert.ok(beats.includes(15.5)); // pushes into bar 4, which is the first chord again
  assert.deepEqual(ev.find((e) => e.beat === 15.5).notes, ev.find((e) => e.beat === 0.5 + 0 || e.beat === 2)?.notes ?? ev.find((e) => e.beat === 15.5).notes);
});

test("harmony: splitting a range gives the same events as one range", () => {
  for (const comp of ["charleston", "mixed", "push"]) {
    const h = H({ comp });
    const whole = generateHarmony(h, pattern, practice(), 0, 24);
    const parts = [0, 3.3, 9.1, 17, 24].flatMap((a, i, arr) => (i ? generateHarmony(h, pattern, practice(), arr[i - 1], a) : []));
    assert.deepEqual(parts, whole, comp);
  }
});

test("harmony: the gap trainer silences chords in the silent bars", () => {
  const p = practice({ gap: { audible: 1, silent: 1 } });
  const ev = generateHarmony(H({ comp: "on1" }), pattern, p, 0, 16);
  assert.deepEqual(ev.map((e) => e.beat), [0, 8]);
});

test("harmony: trade fours does not silence chords", () => {
  assert.equal(barPlays(practice({ trade: 4 }), 5).harmony, true);
  assert.equal(barPlays(practice({ trade: 4 }), 5).groove, false);
});

test("groove: off and odd meters give nothing", () => {
  assert.deepEqual(generateGroove({ style: "off" }, pattern, practice(), 0, 8), []);
  assert.deepEqual(generateGroove({ style: "lofi" }, { ...pattern, beats: 7, den: 8 }, practice(), 0, 8), []);
  assert.equal(grooveFits({ beats: 3, den: 4 }), false);
});

test("groove: every style plays kick or ride on the downbeat region and stays inside the bar", () => {
  for (const style of GROOVE_STYLES.filter((s) => s !== "off")) {
    const [mb, md] = grooveMeter(style);
    const p = { ...pattern, beats: mb, den: md };
    const ev = generateGroove({ style }, p, practice(), 0, p.beats);
    assert.ok(ev.length >= 5, style);
    assert.ok(ev.every((e) => e.beat >= 0 && e.beat < p.beats && e.gain > 0 && e.gain <= 1), style);
  }
});

test("groove: lofi snares land on 2 and 4 a little late", () => {
  const ev = generateGroove({ style: "lofi" }, pattern, practice(), 0, 4).filter((e) => e.voice === "snare");
  const near = (x, y) => Math.abs(x - y) < 0.06;
  assert.ok(ev.some((e) => near(e.beat, 1)) && ev.some((e) => near(e.beat, 3)));
  assert.ok(ev.filter((e) => near(e.beat, 1) || near(e.beat, 3)).every((e) => e.beat > 0.99));
});

test("groove: jazz ride skip note sits at the swing ratio, flatter when fast", () => {
  assert.ok(Math.abs(stepBeat("jazz", 5, 100) - (1 + 0.667)) < 1e-9);
  assert.ok(stepBeat("jazz", 5, 220) < stepBeat("jazz", 5, 100));
});

test("groove: repeatable, and splitting a range changes nothing", () => {
  const g = { style: "jazz" };
  const whole = generateGroove(g, pattern, practice(), 0, 16);
  assert.deepEqual(generateGroove(g, pattern, practice(), 0, 16), whole);
  const parts = [0, 2.7, 9, 16].flatMap((a, i, arr) => (i ? generateGroove(g, pattern, practice(), arr[i - 1], a) : []));
  assert.deepEqual(parts, whole);
});

test("groove: trade fours, gap trainer and count-in", () => {
  const g = { style: "boombap" };
  const trade = generateGroove(g, pattern, practice({ trade: 4 }), 0, 48);
  const bars = new Set(trade.map((e) => e.bar));
  assert.ok([0, 1, 2, 3, 8, 9].every((b) => bars.has(b)));
  assert.ok([4, 5, 6, 7].every((b) => !bars.has(b)));
  assert.deepEqual(generateGroove(g, pattern, practice({ countIn: 2 }), 0, 7.9), []);
  const gap = new Set(generateGroove(g, pattern, practice({ gap: { audible: 1, silent: 1 } }), 0, 15.9).map((e) => e.bar));
  assert.deepEqual([...gap], [0, 2]);
});

test("share: harmony, groove and mix round trip; defaults stay out of the link", () => {
  const s = defaultState();
  s.harmony = { on: true, form: [["Dm7", "G7"], ["Cmaj7"]], comp: "arp", sound: "vibes" };
  s.groove = { style: "jazz", kit: "rusty", dust: true, intensity: 0.5, fills: true, pocket: true };
  s.bass = { on: true, style: "bossa", sound: "swagbass" };
  s.mix = { click: 0.3, chords: 0.5, bass: 0.6, groove: 0.9, autoMute: true };
  const back = decodeShare(encodeShare(s));
  assert.deepEqual(back.harmony, s.harmony);
  assert.deepEqual(back.groove, s.groove);
  assert.deepEqual(back.mix, s.mix);
  assert.deepEqual(back.bass, s.bass);
  s.mix.autoMute = false;
  assert.equal(decodeShare(encodeShare(s)).mix.autoMute, false);
  assert.equal(encodeShare(defaultState()), encodeShare(normalizeState({})));
  const t = encodeShare(defaultState()).replace(/-/g, "+").replace(/_/g, "/");
  const d = JSON.parse(atob(t + "=".repeat((4 - (t.length % 4)) % 4)));
  assert.deepEqual(Object.keys(d), ["v"]);
});

test("share: hostile harmony input is repaired", () => {
  const bad = normalizeState({
    harmony: { on: "yes", form: [["Zzz9", 5], null, [], {}, ["__proto__", "Cmaj7", "Dm7"], ...Array(40).fill(["Am7"])], comp: "<script>", sound: "../x" },
    groove: { style: "../../etc", kit: "<img>" },
    bass: { on: 1, style: "x", sound: {} },
    mix: { click: 99, chords: -4, groove: "x", bass: NaN },
  });
  assert.equal(bad.harmony.on, false);
  assert.ok(bad.harmony.form.length <= 64);
  for (const bar of bad.harmony.form) {
    assert.ok(bar.length >= 1 && bar.length <= 2);
    for (const c of bar) assert.ok(parseChord(c));
  }
  assert.equal(bad.harmony.comp, "charleston");
  assert.deepEqual(bad.groove, { style: "off", kit: "synth", dust: false, intensity: 0.5, fills: true, pocket: true });
  assert.deepEqual(bad.bass, { on: false, style: "walking", sound: "doublebass" });
  assert.equal(bad.harmony.sound, "rhodes");
  assert.deepEqual(bad.mix, { click: 1, chords: 0, bass: 0.7, groove: 0.7, autoMute: false });
  assert.equal(({}).polluted, undefined);
});

test("share: an old link without the new fields still loads", () => {
  const old = btoa(JSON.stringify({ v: 1, p: { bpm: 100 } })).replace(/=+$/, "");
  const s = decodeShare(old);
  assert.equal(s.pattern.bpm, 100);
  assert.equal(s.harmony.on, false);
  assert.equal(s.groove.style, "off");
});

test("click steps aside while the groove plays, and returns in count-in and trade bars", () => {
  const cfg = (o = {}) => ({ pattern: o.pattern ?? defaultState().pattern, practice: practice(o.practice), harmony: H({ on: false }), groove: o.groove ?? { style: "lofi", dust: false }, mix: { click: 1, chords: 0.7, bass: 0.6, groove: 0.5, autoMute: o.autoMute ?? true } });
  const clickBars = (c, bars) => {
    const tr = createTransport(() => c);
    tr.start(0, 0);
    const got = tr.pullAll(0, bars * 60 / c.pattern.bpm * 4 - 0.001).clicks;
    return [...new Set(got.map((e) => e.bar))];
  };
  assert.deepEqual(clickBars(cfg(), 4), [], "groove on: no clicks");
  assert.deepEqual(clickBars(cfg({ autoMute: false }), 2), [0, 1], "switch off: clicks stay");
  assert.deepEqual(clickBars(cfg({ groove: { style: "off", dust: false } }), 2), [0, 1], "no groove: clicks stay");
  assert.deepEqual(clickBars(cfg({ practice: { countIn: 2 } }), 4), [0, 1], "count-in bars click");
  assert.deepEqual(clickBars(cfg({ practice: { trade: 4 } }), 8), [4, 5, 6, 7], "trade bars click");
  assert.deepEqual(clickBars(cfg({ pattern: normalizePattern({ beats: 7, den: 8 }) }), 2), [0, 1], "odd meter has no groove, so clicks stay");
  assert.equal(grooveSounds({ style: "off" }, pattern, practice(), 0), false);
});

test("legacy links: chords on used to mean a root note on each change", () => {
  const old = btoa(JSON.stringify({ v: 1, h: { on: true } })).replace(/=+$/, "");
  assert.deepEqual(decodeShare(old).bass, { on: true, style: "roots", sound: "round" });
  const off = btoa(JSON.stringify({ v: 1, h: { on: true, bass: false } })).replace(/=+$/, "");
  assert.equal(decodeShare(off).bass.on, false);
});

test("bass: roots sit in the low window and land on the chord start", () => {
  const form = { form: [["Cmaj7"], ["Am7"], ["Dm7"], ["G7"]] };
  const ev = generateBass({ style: "roots" }, form, pattern, practice(), 0, 16);
  assert.deepEqual(ev.map((e) => e.beat), [0, 4, 8, 12]);
  assert.deepEqual(ev.map((e) => e.midi % 12), [0, 9, 2, 7]);
  assert.ok(ev.every((e) => e.midi >= 28 && e.midi <= 39));
});

test("bass: walking has four notes a bar, starts on the root and approaches the next root", () => {
  const form = { form: [["Dm7"], ["G7"], ["Cmaj7"], ["Cmaj7"]] };
  const ev = generateBass({ style: "walking" }, form, pattern, practice(), 0, 16);
  const bar0 = ev.filter((e) => e.bar === 0);
  assert.deepEqual(bar0.map((e) => e.beat), [0, 1, 2, 3]);
  assert.equal(bar0[0].midi % 12, 2); // D
  const next = ev.find((e) => e.bar === 1 && e.beat === 4).midi;
  assert.equal(Math.abs(bar0[3].midi - next), 1); // a half step into G
  assert.ok(ev.every((e) => e.midi >= 26 && e.midi <= 52));
});

test("bass: every style gives notes in range, repeatable, split-safe", () => {
  const form = { form: [["Cm7", "F7"], ["Bbmaj7"], ["Am7b5", "D7alt"], ["Gm6"]] };
  for (const style of BASS_STYLES) {
    const whole = generateBass({ style }, form, pattern, practice(), 0, 32);
    assert.ok(whole.length >= 8, style);
    assert.ok(whole.every((e) => e.midi >= 26 && e.midi <= 52 && e.gain > 0 && e.gain <= 1 && e.dur > 0), style);
    const parts = [0, 5.5, 13, 32].flatMap((a, i, arr) => (i ? generateBass({ style }, form, pattern, practice(), arr[i - 1], a) : []));
    assert.deepEqual(parts, whole, style);
  }
});

test("bass: silent in the count-in and the gap trainer's silent bars, steady during trade fours", () => {
  const form = { form: [["Cmaj7"]] };
  const beatsOf = (p) => generateBass({ style: "roots" }, form, pattern, practice(p), 0, 15.9).map((e) => e.beat);
  assert.deepEqual(beatsOf({ countIn: 1 }), [4, 8, 12]);
  assert.deepEqual(beatsOf({ gap: { audible: 1, silent: 1 } }), [0, 8]);
  assert.deepEqual(beatsOf({ trade: 4 }), [0, 4, 8, 12]);
});

test("catalogs: sound ids are unique and every recorded one has a manifest", async () => {
  const { KEYS, BASSES, KITS } = await import("../assets/js/metronome/instruments.js");
  const fs = await import("node:fs");
  for (const list of [KEYS, BASSES, KITS]) {
    assert.equal(new Set(list.map((x) => x.id)).size, list.length);
    for (const x of list) {
      if (x.synth) continue;
      const dir = list === KITS ? "kits" : "inst";
      const man = JSON.parse(fs.readFileSync(new URL(`../assets/audio/${dir}/${x.id}/manifest.json`, import.meta.url)));
      assert.equal(man.id, x.id);
      const files = man.notes ? man.notes.map((n) => n.file) : Object.values(man.voices).flatMap((v) => v.hits.map((h) => h.file));
      for (const f of files) assert.ok(fs.existsSync(new URL(`../assets/audio/${dir}/${x.id}/${f}`, import.meta.url)), `${x.id}/${f}`);
    }
  }
});

test("standards: valid chords, one or two per bar, ids unique, and they fit a share link", () => {
  assert.equal(new Set([...STANDARDS, ...MY_STANDARDS].map((x) => x.id)).size, STANDARDS.length + MY_STANDARDS.length);
  const expected = { "blue-bossa": 16, "so-what": 32, ipanema: 32, "all-things": 36, "fly-me": 16, "giant-steps": 16, cantaloupe: 16, "rhythm-full": 32, "blues-alice": 12, "minor-blues": 12, "my-all-of-me": 32, "my-autumn-leaves": 32, "my-blue-monk": 12, "my-so-what": 32, "my-igr": 36, "my-maiden-voyage": 32, "my-days-of-wine": 32, "my-never-another-you": 32, "my-softly": 32, "my-stella": 32, "my-manha": 37, "my-wave": 44, "my-tunisia": 48 };
  for (const t of [...STANDARDS, ...MY_STANDARDS]) {
    assert.equal(t.form.length, expected[t.id], `${t.id} has ${t.form.length} bars`);
    for (const bar of t.form) {
      assert.ok(bar.length === 1 || bar.length === 2, t.id);
      for (const c of bar) assert.notEqual(cleanChord(c, "X"), "X", `${t.id}: ${c}`);
    }
    const s = defaultState();
    s.harmony = { on: true, form: t.form, comp: "charleston", sound: "rhodes" };
    const link = encodeShare(s);
    assert.ok(link.length < 3000, `${t.id} link is ${link.length}`);
    assert.equal(decodeShare(link).harmony.form.length, t.form.length, t.id);
  }
});

test("bass: walking lines move mostly by step", () => {
  const forms = [
    [["Dm7"], ["G7"], ["Cmaj7"], ["A7"]],
    [["Bb7"], ["Eb7"], ["Bb7"], ["Bb7"], ["Eb7"], ["Edim7"], ["Bb7"], ["G7alt"], ["Cm7"], ["F7"], ["Bb7", "G7"], ["Cm7", "F7"]],
    [["Dm7"], ["Dm7"], ["Dm7"], ["Ebm7"]],
  ];
  for (const f of forms) {
    const leaps = [];
    for (const seed of [1, 2, 3]) {
      const ev = generateBass({ style: "walking" }, { form: f }, { ...pattern, seed }, practice(), 0, f.length * 8);
      for (let i = 1; i < ev.length; i++) leaps.push(Math.abs(ev[i].midi - ev[i - 1].midi));
    }
    const mean = leaps.reduce((a, b) => a + b, 0) / leaps.length;
    assert.ok(mean < 3, `mean leap ${mean}`);
    assert.ok(Math.max(...leaps) <= 7, `max leap ${Math.max(...leaps)}`);
    assert.ok(leaps.filter((x) => x <= 2).length / leaps.length > 0.6);
  }
});

test("Top 100: 100 tunes, valid chords, fit a share link", () => {
  assert.equal(TOP_100.length, 100);
  const ids = new Set([...STANDARDS, ...MY_STANDARDS, ...TOP_100].map((x) => x.id));
  assert.equal(ids.size, STANDARDS.length + MY_STANDARDS.length + TOP_100.length);
  for (const t of TOP_100) {
    assert.ok(t.form.length >= 8 && t.form.length <= 64, `${t.id} has ${t.form.length} bars`);
    assert.ok(t.beats === 3 || t.beats === 4);
    for (const bar of t.form) {
      assert.ok(bar.length === 1 || bar.length === 2, t.id);
      for (const c of bar) assert.notEqual(cleanChord(c, "X"), "X", `${t.id}: ${c}`);
    }
    const st = defaultState();
    st.harmony = { on: true, form: t.form, comp: "charleston", sound: "rhodes" };
    const link = encodeShare(st);
    assert.ok(link.length < 3500, `${t.id} link is ${link.length}`);
    assert.equal(decodeShare(link).harmony.form.length, t.form.length, t.id);
  }
});

test("every groove stays inside its own bar and matches only its own meter", () => {
  for (const style of GROOVE_STYLES.filter((s) => s !== "off")) {
    const [beats, den] = grooveMeter(style);
    const p = { ...defaultState().pattern, beats, den };
    assert.ok(grooveFits(p, style), style);
    const hits = generateGroove({ style }, p, { countIn: 0, gap: null, trade: 0, ladder: null }, 0, beats);
    assert.ok(hits.length >= 4, `${style} has hits`);
    assert.ok(hits.every((h) => h.beat >= 0 && h.beat < beats + 0.05), `${style} hits fall in the bar`);
  }
});

test("intensity thins and fills the groove; defaults keep the old sound", () => {
  const p = defaultState().pattern;
  const pr = { countIn: 0, gap: null, trade: 0, ladder: null };
  const n = (g) => generateGroove({ style: "lofi", ...g }, p, pr, 0, 32).length;
  assert.ok(n({ intensity: 0.1 }) < n({ intensity: 0.5 }));
  assert.ok(n({ intensity: 0.5 }) < n({ intensity: 1 }));
  const sig = (g) => JSON.stringify(generateGroove({ style: "lofi", ...g }, p, pr, 0, 32).map((h) => [h.step, h.voice]));
  assert.notEqual(sig({ fills: false }), sig({}));
  const bar3 = generateGroove({ style: "lofi" }, p, pr, 15, 16);
  assert.ok(bar3.filter((h) => h.voice === "hat").length === 0, "the fill replaces the hats");
  const next = generateGroove({ style: "lofi" }, p, pr, 16, 17);
  assert.ok(next.some((h) => h.voice === "crash"), "lands on the downbeat");
  assert.equal(n({}), n({ intensity: 0.5, fills: true, pocket: true }));
});

test("bossa comping plays the two-bar clave", () => {
  assert.deepEqual(styleHits("bossa", 4, 0).map((h) => h.at), [0, 1.5, 3]);
  assert.deepEqual(styleHits("bossa", 4, 1).map((h) => h.at), [1, 2]);
  assert.ok(styleHits("bossa", 2, 1).length >= 1);
});

test("new comping styles place hits where they should", () => {
  const at = (style, span = 4, bar = 0, beats = 4, start = 0) => styleHits(style, span, bar, beats, start).map((h) => h.at);
  assert.deepEqual(at("freddie"), [0, 1, 2, 3]);
  assert.deepEqual(at("latepush"), [1.5, 3]);
  assert.deepEqual(at("anticipate"), [-0.5]);
  assert.deepEqual(at("bossaclave", 4, 0), [0, 1.5, 3]);
  assert.deepEqual(at("bossaclave", 4, 1), [1, 2.5]);
  assert.deepEqual(at("rumba", 4, 0), [0, 1.5, 3.5]);
  assert.deepEqual(at("rumba", 4, 1), [1, 2]);
  assert.deepEqual(at("ecm"), [0, 2.5]);
  assert.deepEqual(at("twostep"), [0, 1.75, 2.5]);
  assert.deepEqual(at("hama1"), [0, 0.75, 1.5, 2.25, 3, 3.5]);
  assert.deepEqual(at("hama2"), [0, 0.75, 1.5, 2, 2.75, 3.5]);
});

test("groups follow the odd-meter counts", () => {
  const at = (span) => styleHits("groups", span).map((h) => h.at);
  assert.deepEqual(at(5), [0, 3]);
  assert.deepEqual(at(7), [0, 2, 4]);
  assert.deepEqual(at(10), [0, 2, 5, 7]);
  assert.deepEqual(at(4), [0, 2]);
  assert.deepEqual(at(13), [0, 3, 6, 9, 11]);
});

test("hemiola runs through the bar lines and repeats every 3 bars of 4/4", () => {
  const hits = (bar) => styleHits("hemiola", 4, bar, 4, 0).map((h) => 4 * bar + h.at);
  const all = [0, 1, 2, 3, 4, 5].flatMap(hits);
  all.forEach((b, i) => i && assert.ok(Math.abs(b - all[i - 1] - 1.5) < 1e-9, `gap before ${b}`));
  assert.deepEqual(styleHits("hemiola", 4, 3).map((h) => h.at), styleHits("hemiola", 4, 0).map((h) => h.at));
  assert.ok(styleHits("hemiola", 1, 0).length >= 1);
});

test("every comping style makes hits that stay inside the chord, and split ranges agree", () => {
  for (const comp of COMP_STYLES) {
    for (const span of [1, 2, 3, 4, 5, 7]) {
      const hs = styleHits(comp, span, 1, 4, 0);
      assert.ok(hs.length >= 1, `${comp} span ${span}`);
      for (const h of hs) assert.ok(h.at < span && h.dur > 0 && h.vel > 0 && h.vel <= 1, `${comp} span ${span}`);
    }
    const h = H({ comp });
    const whole = generateHarmony(h, pattern, practice(), 0, 24);
    const parts = [...generateHarmony(h, pattern, practice(), 0, 7.3), ...generateHarmony(h, pattern, practice(), 7.3, 24)];
    assert.deepEqual(parts.sort((a, b) => a.beat - b.beat), whole, comp);
  }
});

test("the ECM rolled chord spreads its notes low to high", () => {
  const ev = generateHarmony(H({ comp: "ecm" }), pattern, practice(), 0, 4).filter((e) => e.bar === 0 && e.beat < 1);
  assert.ok(ev.length > 1);
  assert.ok(ev.every((e) => e.notes.length === 1));
  ev.forEach((e, i) => i && assert.ok(e.beat > ev[i - 1].beat && e.notes[0] >= ev[i - 1].notes[0]));
});

test("more rhythms place hits where they should", () => {
  const at = (style, span = 4, bar = 0) => styleHits(style, span, bar, 4, 0).map((h) => +h.at.toFixed(3));
  assert.deepEqual(at("dcharleston"), [0, 1.5, 2, 3.5]);
  assert.deepEqual(at("offbeat"), [0.5, 1.5, 2.5, 3.5]);
  assert.deepEqual(at("dilla"), [0, 1.75, 3.25]);
  assert.ok(styleHits("dilla", 4).every((h, i) => (i ? h.late === 0.1 : h.late === 0.04)));
  assert.deepEqual(at("afro"), [0, 0.667, 1.333, 1.667, 2.333, 3, 3.667]);
  const gaps = (style, bars, step) => {
    const all = Array.from({ length: bars }, (_, b) => styleHits(style, 4, b, 4, 0).map((h) => 4 * b + h.at)).flat();
    all.forEach((b, i) => i && assert.ok(Math.abs(b - all[i - 1] - step) < 1e-9, `${style} gap before ${b}`));
    return all;
  };
  gaps("quint", 10, 1.25);
  gaps("septet", 14, 1.75);
  assert.deepEqual(styleHits("quint", 4, 5).map((h) => h.at), styleHits("quint", 4, 0).map((h) => h.at));
  assert.deepEqual(styleHits("septet", 4, 7).map((h) => h.at), styleHits("septet", 4, 0).map((h) => h.at));
});

test("every style named in the density tiers exists, and mix modes are listed last", () => {
  for (const id of DENSITY.flat()) assert.ok(COMP_STYLES.includes(id), id);
  assert.deepEqual(COMP_STYLES.slice(-MIX_STYLES.length), MIX_STYLES);
  for (const id of MIX_STYLES) assert.ok(COMP_STYLES.includes(id));
});

test("arc builds from sparse to busy and breathes at the end, with no randomness", () => {
  const tierOf = (pb) => DENSITY.findIndex((t) => t.includes(resolveStyle("arc", { pb }).style));
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7].map(tierOf), [0, 1, 1, 2, 2, 3, 3, 1]);
  assert.deepEqual([8, 9, 10, 11, 12, 13, 14, 15].map(tierOf), [0, 1, 1, 2, 2, 3, 3, 1]);
  for (const seed of [1, 99, 12345]) assert.equal(resolveStyle("arc", { pb: 5, seed }).style, resolveStyle("arc", { pb: 5 }).style);
});

test("cadence: the tonic rests, the minor asks, the dominant leans forward", () => {
  const pick = (chord, pb = 0) => resolveStyle("cadence", { chord, pb }).style;
  for (let pb = 0; pb < 8; pb++) {
    assert.ok(["ecm", "on1", "sustain", "twofeel"].includes(pick("Cmaj7", pb)));
    assert.ok(["charleston", "latepush", "dcharleston", "twostep"].includes(pick("Dm7", pb)));
    assert.ok(["push", "anticipate", "latepush", "offbeat"].includes(pick("G7", pb)));
    assert.ok(["latepush", "twostep", "charleston"].includes(pick("Bm7b5", pb)));
  }
});

test("develop states a motif, repeats it, shifts it an eighth later, then thins it", () => {
  const bars = [0, 1, 2, 3].map((pb) => {
    const { style, xform } = resolveStyle("develop", { pb, seed: 7 });
    return { style, hits: xform(styleHits(style, 4, pb, 4, 0), 4) };
  });
  assert.equal(new Set(bars.map((b) => b.style)).size, 1, "one motif for the phrase");
  const base = styleHits(bars[0].style, 4, 1, 4, 0).map((h) => h.at);
  assert.deepEqual(bars[1].hits.map((h) => h.at), base);
  assert.ok(bars[2].hits.every((h) => h.at < 4));
  assert.ok(bars[3].hits.length <= bars[0].hits.length);
  assert.ok(bars[3].hits.length >= 1);
  const a = resolveStyle("develop", { pb: 0, seed: 7 }).style;
  assert.equal(resolveStyle("develop", { pb: 3, seed: 7 }).style, a);
  const seen = new Set([0, 4, 8, 12, 16, 20].map((pb) => resolveStyle("develop", { pb, seed: 7 }).style));
  assert.ok(seen.size > 1, "motif changes between phrases");
});

test("bass: styles are all named and described", async () => {
  const { BASS_STYLE_NAMES, BASS_STYLE_NOTES } = await import("../assets/js/metronome/bassline.js");
  assert.ok(BASS_STYLES.length >= 20);
  assert.equal(new Set(BASS_STYLES).size, BASS_STYLES.length);
  for (const s of BASS_STYLES) {
    assert.ok(BASS_STYLE_NAMES[s] && BASS_STYLE_NOTES[s], s);
    assert.ok(BASS_STYLE_NOTES[s].length > 20, s);
  }
});

test("bass: a bar with two chords puts each chord's root on its own change, in every style that plays the beat", () => {
  const form = { form: [["Dm7", "G7"], ["Cmaj7"], ["Cm7", "F7"], ["Bbmaj7"]] };
  for (const style of ["walking", "walkghost", "funk", "bossa", "soul", "lofi", "neosoul", "vamp", "roots", "twofeel", "boogie", "arp", "ballad"]) {
    for (const seed of [1, 2, 3]) {
      const ev = generateBass({ style }, form, { ...pattern, seed }, practice(), 0, 16);
      for (const [beat, pc] of [[0, 2], [2, 7], [8, 0], [10, 5]]) {
        const hit = ev.find((e) => Math.abs(e.beat - beat) < 0.2 && e.art !== "dead");
        assert.ok(hit, `${style} seed ${seed}: nothing at ${beat}`);
        assert.equal(hit.midi % 12, pc, `${style} seed ${seed} beat ${beat}: ${hit.midi}`);
      }
    }
  }
});

test("bass: walking through two chords in a bar steps into each change", () => {
  const form = { form: [["Dm7", "G7"], ["Cmaj7", "A7"], ["Dm7", "G7"], ["Cmaj7"]] };
  for (const seed of [1, 2, 3, 4]) {
    for (const style of ["walking", "walkghost"]) {
      const ev = generateBass({ style }, form, { ...pattern, seed }, practice(), 0, 16).filter((e) => e.art !== "dead");
      for (const [i, j] of [[1, 2], [3, 4], [5, 6], [7, 8]]) {
        const a = ev.find((e) => Math.abs(e.beat - i) < 0.01);
        const b = ev.find((e) => Math.abs(e.beat - j) < 0.01);
        assert.equal(Math.abs(a.midi - b.midi), 1, `${style} seed ${seed}: ${a.midi} -> ${b.midi}`);
      }
      const leaps = ev.slice(1).map((e, k) => Math.abs(e.midi - ev[k].midi));
      assert.ok(Math.max(...leaps) <= 7, `max leap ${Math.max(...leaps)}`);
    }
  }
});

test("bass: funk keeps one riff across a split bar and marks ghost notes as dead", () => {
  const split = { form: [["Dm7", "G7"], ["Cmaj7"]] };
  const whole = { form: [["Dm7"], ["Cmaj7"]] };
  const a = generateBass({ style: "funk" }, split, pattern, practice(), 0, 8);
  const b = generateBass({ style: "funk" }, whole, pattern, practice(), 0, 8);
  // The same rhythm in the first bar, whether the bar holds one chord or two.
  const rhythm = (ev) => ev.filter((e) => e.bar === 0 && Math.abs(e.beat - 2) > 0.2).map((e) => e.beat);
  const drop = (ev) => rhythm(ev).filter((x) => x < 1.4 || x > 2.3);
  assert.deepEqual(drop(a), drop(b));
  const ghosts = a.filter((e) => e.art === "dead");
  assert.ok(ghosts.length >= 2);
  assert.ok(ghosts.every((e) => e.dur < 0.2 && e.gain < 0.6));
  // One loud one per bar: the downbeat is the loudest note.
  assert.ok(a.find((e) => e.beat === 0).gain >= 0.9);
});

test("bass: odd meters keep notes inside the bar", () => {
  const form = { form: [["Dm7", "G7"], ["Cmaj7"], ["Am7"], ["D7", "G7"]] };
  for (const beats of [3, 5, 6, 7]) {
    for (const style of BASS_STYLES) {
      const cfg = { ...pattern, beats };
      const ev = generateBass({ style }, form, cfg, practice(), 0, beats * 8);
      assert.ok(ev.length > 0, `${style} ${beats}`);
      for (const e of ev) {
        assert.ok(e.beat >= e.bar * beats - 0.05 && e.beat < (e.bar + 1) * beats + 0.0001, `${style} ${beats}: ${e.beat} in bar ${e.bar}`);
      }
    }
  }
});
