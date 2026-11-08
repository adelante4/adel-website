import test from "node:test";
import assert from "node:assert/strict";
import { scaleFor, playFor, targetFor } from "../assets/js/metronome/scales.js";

test("scales follow the chord and where it goes", () => {
  assert.equal(scaleFor("Dm7").id, "dorian");
  assert.equal(scaleFor("G7", "Cmaj7").id, "mixo");
  assert.equal(scaleFor("G7", "Cm7").id, "altered");
  assert.equal(scaleFor("Bm7b5").id, "locrian");
  assert.equal(scaleFor("Fmaj7", null, "IV").id, "lydian");
  assert.equal(scaleFor("C7#11").id, "lydDom");
  assert.equal(scaleFor("Bdim7").id, "wholeHalf");
});
test("note names and arpeggio", () => {
  const p = playFor("Dm7", true);
  assert.deepEqual(p.scale, ["D", "E", "F", "G", "A", "B", "C"]);
  assert.deepEqual(p.arp.map((t) => t.note), ["D", "F", "A", "C"]);
  assert.deepEqual(p.arp.map((t) => t.label), ["root", "3rd", "5th", "7th"]);
});
test("target tone is steady for a count and varies across counts", () => {
  assert.equal(targetFor("Cmaj7", false, 3).label, targetFor("Cmaj7", false, 3).label);
  const seen = new Set();
  for (let i = 0; i < 30; i++) seen.add(targetFor("Cmaj7", false, i).label);
  assert.ok(seen.size >= 3);
});
