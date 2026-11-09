// Song form: AABA and friends, found from the chords alone.
import { test } from "node:test";
import assert from "node:assert/strict";
import { detectForm, locate } from "../assets/js/metronome/sections.js";
import { STANDARDS, MY_STANDARDS } from "../assets/js/metronome/standards.js";
import { TOP_100 } from "../assets/js/metronome/top100.js";

const all = [...MY_STANDARDS, ...TOP_100, ...STANDARDS];
const byName = (re) => all.find((t) => re.test(t.name));
const nameOf = (re) => detectForm(byName(re).form)?.name;
const r = (chord, n) => Array.from({ length: n }, () => [chord]);

test("rhythm changes and So What are AABA", () => {
  assert.equal(nameOf(/^Rhythm changes/), "AABA");
  assert.equal(nameOf(/^So What \(32\)/), "AABA");
  assert.equal(nameOf(/Maiden Voyage/), "AABA");
});

test("known tunes get the form their charts have", () => {
  assert.equal(nameOf(/^All of Me \(C, 32\)/), "ABAC");
  assert.equal(nameOf(/^11\. Autumn Leaves/), "AABC");
  assert.equal(nameOf(/^8\. What Is This Thing/), "AABA");
});

test("a 12-bar blues is three four-bar lines", () => {
  const d = detectForm(byName(/^20\. St Louis Blues/).form);
  assert.equal(d.kind, "12-bar blues");
  assert.equal(d.name, "AAB");
  assert.equal(d.len, 4);
});

test("a section played again in another key is the same section", () => {
  const d = detectForm(byName(/^2\. All the Things You Are/).form);
  assert.equal(d.name.slice(0, 4), "AABA");
  assert.equal(d.sections[1].shift, 7, "the second A starts a fourth lower (Fm7 then Cm7)");
  assert.equal(d.sections.at(-1).letter, "Tag");
  assert.equal(d.sections.at(-1).bars, 4);
});

test("a section that sits on one chord is not the same as another one-chord section in another key", () => {
  const form = [...r("Dm7", 8), ...r("Ebm7", 8), ...r("Dm7", 8), ...r("Fm7", 8)];
  assert.equal(detectForm(form).name, "ABAC");
});

test("the free ending marks a prime, not a new section", () => {
  const a = [["Cmaj7"], ["Am7"], ["Dm7"], ["G7"], ["Cmaj7"], ["Am7"], ["Dm7"], ["G7"]];
  const a2 = [...a.slice(0, 6), ["Dm7", "G7"], ["Cmaj7"]];
  const b = [["Fmaj7"], ["Fmaj7"], ["Bb7"], ["Bb7"], ["Ebmaj7"], ["Ab7"], ["Dbmaj7"], ["Gb7"]];
  const d = detectForm([...a, ...a2, ...b, ...a2]);
  assert.equal(d.name, "AABA");
  assert.deepEqual(d.sections.map((s) => s.label), ["A", "A′", "B", "A′"]);
});

test("short or shapeless forms get no sections", () => {
  assert.equal(detectForm([["Cmaj7"], ["G7"]]), null);
  assert.equal(detectForm(byName(/^4\. 'Round Midnight/).form), null);
  assert.equal(detectForm(byName(/^Minor blues/).form), null);
});

test("locate finds the section and the bar inside it", () => {
  const d = detectForm(byName(/^Rhythm changes/).form);
  assert.deepEqual([locate(d, 0).section.letter, locate(d, 0).bar], ["A", 1]);
  assert.deepEqual([locate(d, 17).section.letter, locate(d, 17).bar], ["B", 2]);
  assert.deepEqual([locate(d, 31).section.letter, locate(d, 31).bar], ["A", 8]);
  assert.equal(locate(null, 3), null);
});

test("every tune in the library gives a sane answer", () => {
  for (const t of all) {
    const d = detectForm(t.form);
    if (!d) continue;
    let at = 0;
    for (const s of d.sections) {
      assert.equal(s.start, at, t.name);
      assert.ok(s.bars > 0, t.name);
      at += s.bars;
    }
    assert.equal(at, t.form.length, `${t.name}: sections cover every bar`);
  }
});
