import test from "node:test";
import assert from "node:assert/strict";
import { describeSound } from "../assets/js/metronome/sentence.js";
import { defaultState } from "../assets/js/metronome/share.js";

test("plain metronome", () => {
  const d = describeSound(defaultState());
  assert.match(d.text, /^Metronome only/);
  assert.equal(d.values.keys, "adds a backing");
});

test("band on, click auto, trainers", () => {
  const s = defaultState();
  s.harmony.on = true; s.bass.on = true; s.groove.style = "jazz"; s.mix.autoMute = true;
  s.practice.gap = { audible: 2, silent: 2 }; s.practice.trade = 4; s.pattern.swing = 0.6;
  const d = describeSound(s, "Autumn Leaves");
  assert.match(d.text, /Chords, bass and drums play Autumn Leaves/);
  assert.match(d.text, /metronome steps aside/);
  assert.match(d.text, /Gap trainer: 2 bars on, 2 silent/);
  assert.match(d.text, /drop out every other 4 bars/);
  assert.equal(d.values.click, "Auto, 4/4");
});

test("never a silent no-op", () => {
  const s = defaultState();
  s.practice.trade = 4;
  assert.match(describeSound(s).text, /Trade fours does nothing/);
  assert.equal(describeSound(s).values.trade, "needs drums");
  s.harmony.on = false; s.mix.click = 0;
  assert.match(describeSound(s).text, /Silence/);
  s.harmony.on = true; s.mix.click = 0; s.groove.style = "off";
  assert.equal(describeSound(s).chartSilent, false);
  s.harmony.on = false; s.bass.on = false;
  assert.equal(describeSound(s).chartSilent, true);
});
