import test from "node:test";
import assert from "node:assert/strict";
import { formToText, textToForm, sanitizeMine, withSaved } from "../assets/js/metronome/mine.js";

test("mine: text becomes a form and back", () => {
  const r = textToForm("Dm7 G7 | Cmaj7 | % | Bm7b5 E7alt");
  assert.deepEqual(r.form, [["Dm7", "G7"], ["Cmaj7"], ["Cmaj7"], ["Bm7b5", "E7alt"]]);
  assert.equal(formToText(r.form), "Dm7 G7 | Cmaj7 | Cmaj7 | Bm7b5 E7alt");
  assert.deepEqual(textToForm("Dm7\nG7").form, [["Dm7"], ["G7"]]);
});

test("mine: bad input gets a message that names the bar and the chord", () => {
  assert.match(textToForm("Dm7 | Hello").error, /Bar 2.*Hello/);
  assert.match(textToForm("C D E").error, /3 chords/);
  assert.match(textToForm("%").error, /Bar 1/);
  assert.match(textToForm("   ").error, /Type some chords/);
  assert.match(textToForm(Array(70).fill("C").join("|")).error, /limit/);
});

test("mine: saving replaces a progression of the same name, and bad saved data is dropped", () => {
  let list = withSaved([], "My blues", [["F7"], ["Bb7"]], 4);
  list = withSaved(list, "my BLUES", [["C7"]], 3);
  assert.equal(list.length, 1);
  assert.deepEqual(list[0].form, [["C7"]]);
  assert.equal(list[0].beats, 3);
  assert.deepEqual(sanitizeMine([{ id: "x", name: "ok", form: [["Dm7"]] }, { id: 5 }, null, { id: "y", name: "bad", form: [["Nope"]] }]).map((p) => p.id), ["x"]);
});
