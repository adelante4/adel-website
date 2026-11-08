import test from "node:test";
import assert from "node:assert/strict";
import { swingBeat, bandFeel, styleFeel, stepBeat } from "../assets/js/metronome/groove.js";

test("swingBeat is identity when straight and moves the off-beat eighth", () => {
  assert.equal(swingBeat(1.5, 0.5), 1.5);
  assert.ok(Math.abs(swingBeat(1.5, 2 / 3) - (1 + 2 / 3)) < 1e-9);
  assert.equal(swingBeat(2, 0.7), 2);
  assert.ok(Math.abs(swingBeat(3.75, 0.6) - (3 + 0.6 + 0.25 * 0.8)) < 1e-9);
});

test("bandFeel: the swing control wins, else the style, else straight", () => {
  assert.equal(bandFeel({ style: "jazz" }, { swing: 0.5, bpm: 100 }), styleFeel("jazz", 100));
  assert.equal(bandFeel({ style: "jazz" }, { swing: 0.6, bpm: 100 }), 0.6);
  assert.equal(bandFeel({ style: "off" }, { swing: 0.5, bpm: 100 }), 0.5);
});

test("stepBeat honours a swing override", () => {
  assert.ok(Math.abs(stepBeat("lofi", 1, 90, 0.7) - 0.35) < 1e-9);
  assert.ok(Math.abs(stepBeat("jazz", 2, 100, 0.6) - 0.6) < 1e-9);
});
