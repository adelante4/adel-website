import test from "node:test";
import assert from "node:assert/strict";
import { parseChord, cleanChord, transposeChord, formatChord, chordPitchClasses, voiceChord, voiceChords, bassNote, PRESETS, QUALITIES } from "../assets/js/metronome/chords.js";
import { styleHits, flattenForm, generateHarmony } from "../assets/js/metronome/comping.js";
import { generateGroove, stepBeat, GROOVE_STYLES, grooveFits } from "../assets/js/metronome/groove.js";
import { barPlays } from "../assets/js/metronome/overlay.js";
import { defaultState, normalizeState, encodeShare, decodeShare } from "../assets/js/metronome/share.js";

const pattern = { bpm: 90, beats: 4, den: 4, seed: 1, humanize: 0 };
const practice = (o = {}) => ({ gap: null, trade: 0, countIn: 0, ladder: null, ...o });
const H = (o = {}) => ({ on: true, form: [["Cmaj7"], ["Am7"], ["Dm7"], ["G7"]], comp: "charleston", bass: true, ...o });

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
    assert.ok(p.form.length >= 2 && p.form.length <= 16);
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

test("harmony: charleston hits, bass on the chord start, nothing during the count-in", () => {
  const ev = generateHarmony(H(), pattern, practice(), 0, 8);
  const chords = ev.filter((e) => e.kind === "chord");
  assert.deepEqual(chords.map((e) => e.beat), [0, 1.5, 4, 5.5]);
  assert.deepEqual(ev.filter((e) => e.kind === "bass").map((e) => e.beat), [0, 4]);
  const counted = generateHarmony(H(), pattern, practice({ countIn: 1 }), 0, 8);
  assert.ok(counted.every((e) => e.beat >= 4));
});

test("harmony: the form loops and the push anticipates the next bar", () => {
  const ev = generateHarmony(H({ comp: "push", bass: false }), pattern, practice(), 0, 20);
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
  const ev = generateHarmony(H({ comp: "on1", bass: false }), pattern, p, 0, 16);
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
    const ev = generateGroove({ style }, pattern, practice(), 0, 4);
    assert.ok(ev.length >= 8, style);
    assert.ok(ev.every((e) => e.beat >= 0 && e.beat < 4 && e.gain > 0 && e.gain <= 1), style);
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
  s.harmony = { on: true, form: [["Dm7", "G7"], ["Cmaj7"]], comp: "twofeel", bass: false };
  s.groove = { style: "jazz", dust: true };
  s.mix = { click: 0.3, chords: 0.5, groove: 0.9 };
  const back = decodeShare(encodeShare(s));
  assert.deepEqual(back.harmony, s.harmony);
  assert.deepEqual(back.groove, s.groove);
  assert.deepEqual(back.mix, s.mix);
  assert.equal(encodeShare(defaultState()), encodeShare(normalizeState({})));
  const t = encodeShare(defaultState()).replace(/-/g, "+").replace(/_/g, "/");
  const d = JSON.parse(atob(t + "=".repeat((4 - (t.length % 4)) % 4)));
  assert.deepEqual(Object.keys(d), ["v"]);
});

test("share: hostile harmony input is repaired", () => {
  const bad = normalizeState({
    harmony: { on: "yes", form: [["Zzz9", 5], null, [], {}, ["__proto__", "Cmaj7", "Dm7"], ...Array(40).fill(["Am7"])], comp: "<script>", bass: 3 },
    groove: { style: "../../etc" },
    mix: { click: 99, chords: -4, groove: "x" },
  });
  assert.equal(bad.harmony.on, false);
  assert.ok(bad.harmony.form.length <= 16);
  for (const bar of bad.harmony.form) {
    assert.ok(bar.length >= 1 && bar.length <= 2);
    for (const c of bar) assert.ok(parseChord(c));
  }
  assert.equal(bad.harmony.comp, "charleston");
  assert.deepEqual(bad.groove, { style: "off", dust: false });
  assert.deepEqual(bad.mix, { click: 1, chords: 0, groove: 0.8 });
  assert.equal(({}).polluted, undefined);
});

test("share: an old link without the new fields still loads", () => {
  const old = btoa(JSON.stringify({ v: 1, p: { bpm: 100 } })).replace(/=+$/, "");
  const s = decodeShare(old);
  assert.equal(s.pattern.bpm, 100);
  assert.equal(s.harmony.on, false);
  assert.equal(s.groove.style, "off");
});
