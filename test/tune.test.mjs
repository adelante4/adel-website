import test from "node:test";
import assert from "node:assert/strict";
import { analyze } from "../assets/js/metronome/analysis.js";
import { voiceForm, guideSemis } from "../assets/js/metronome/voicing.js";
import { buildIndex, sharedPieces, plainName } from "../assets/js/metronome/dna.js";
import { PRESETS, QUALITIES, ROOTS, parseChord } from "../assets/js/metronome/chords.js";
import { STANDARDS, MY_STANDARDS } from "../assets/js/metronome/standards.js";
import { TOP_100 } from "../assets/js/metronome/top100.js";

const form = (id) => PRESETS.find((p) => p.id === id).form;

test("analysis: ii-V-I and minor ii-V-i are found and named in their own key", () => {
  const a = analyze(form("cycle"));
  assert.deepEqual(a.slots.map((s) => s.numeral), ["ii", "V", "I", "IV", "iiø", "V", "i", "i"]);
  assert.deepEqual(a.cadences.map((c) => [c.kind, c.key.name]), [["ii–V–I", "Bb"], ["iiø–V–i", "Gm"]]);
  assert.equal(a.slots[0].pos, "start");
  assert.equal(a.slots[2].pos, "end");
});

test("analysis: the jazz blues is in F, with its dominant tonic", () => {
  const a = analyze(form("blues"));
  assert.equal(a.key.name, "F");
  assert.equal(a.slots[0].numeral, "I");
  assert.ok(a.idioms.some((i) => i.label === "ii–V–I"));
});

test("analysis: rhythm changes are in Bb and Cm7 G7 is a secondary dominant", () => {
  const a = analyze(form("rhythm"));
  assert.equal(a.key.name, "Bb");
  assert.ok(a.slots.some((s) => s.numeral === "V/ii"));
});

test("analysis: every tune in the library gets a key and a numeral per chord", () => {
  for (const t of [...STANDARDS, ...MY_STANDARDS, ...TOP_100]) {
    const a = analyze(t.form);
    assert.equal(a.slots.length, t.form.flat().length, t.name);
    assert.ok(a.key.name, t.name);
    assert.ok(a.slots.every((s) => s.numeral.length > 0), t.name);
  }
});

test("voicing: every quality in every key has a four-string shape with its guide tones", () => {
  for (const q of QUALITIES) {
    for (let r = 0; r < 12; r++) {
      const [v] = voiceForm([ROOTS[r] + q.id]);
      assert.ok(v, ROOTS[r] + q.id);
      assert.equal(v.frets.length, 4);
      assert.ok(v.hi - v.lo <= 3, "fits the hand");
      const g = guideSemis(q.id);
      if (!["maj", "m"].includes(q.id)) {
        assert.ok(v.semis.includes(g.third), `${ROOTS[r]}${q.id} has its third`);
        assert.ok(v.semis.includes(g.seventh) || q.id === "sus4", `${ROOTS[r]}${q.id} has its seventh`);
      }
    }
  }
});

test("voicing: a ii-V-I moves the hand by a few semitones at most", () => {
  const chords = form("cycle").flat();
  const v = voiceForm(chords);
  for (let i = 1; i < v.length; i++) {
    const move = v[i].notes.reduce((s, n, j) => s + Math.abs(n - v[i - 1].notes[j]), 0);
    assert.ok(move <= 14, `${chords[i - 1]} to ${chords[i]} moved ${move}`);
  }
});

test("tune DNA: Autumn Leaves shares its minor ii-V-i phrase with other tunes", () => {
  const all = [...MY_STANDARDS, ...TOP_100, ...STANDARDS];
  const tune = MY_STANDARDS.find((t) => t.id === "my-autumn-leaves");
  const pieces = sharedPieces(tune.form, buildIndex(all), tune.name);
  assert.ok(pieces.length > 0);
  for (const p of pieces) {
    assert.ok(p.tunes.length > 0);
    assert.ok(p.tunes.every((t) => plainName(t.name) !== plainName(tune.name)), "never lists itself");
  }
});
