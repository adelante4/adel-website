import { test } from "node:test";
import assert from "node:assert/strict";
import { formPosition, flattenForm, ladderStep } from "../assets/js/metronome/position.js";

// Four bars of 4/4, bars 1 and 3 split, after one bar of count-in.
const form = [["Dm7"], ["G7", "Db7"], ["Cmaj7"], ["Am7", "D7"]];
const pos = formPosition(form, 4, 1);

test("a split bar holds two chords, the second from the middle of the bar", () => {
  assert.deepEqual(
    flattenForm([["C", "F"]], 5).map((s) => [s.chord, s.start, s.span]),
    [["C", 0, 3], ["F", 3, 2]],
  );
});

test("count-in bars have no place in the form", () => {
  assert.equal(pos.ofBar(0), null);
  assert.equal(pos.at(3.9), null);
});

test("bars after the count-in walk the form and wrap into the next chorus", () => {
  assert.deepEqual(
    [1, 2, 4, 5, 6].map((b) => {
      const p = pos.ofBar(b);
      return [p.playBar, p.formBar, p.chorus];
    }),
    [[0, 0, 0], [1, 1, 0], [3, 3, 0], [4, 0, 1], [5, 1, 1]],
  );
  assert.deepEqual(pos.ofBar(2).slots.map((s) => s.chord), ["G7", "Db7"]);
  assert.deepEqual(pos.ofBar(2).slots.map((s) => s.index), [1, 2]);
});

test("a beat finds its chord, the second half of a split bar included", () => {
  const p = (beat) => {
    const x = pos.at(beat);
    return [x.formBar, x.slot.chord, x.inBar, x.beatInSlot, x.chorus];
  };
  assert.deepEqual(p(4), [0, "Dm7", 0, 0, 0]);
  assert.deepEqual(p(9.5), [1, "G7", 1.5, 1.5, 0]);
  assert.deepEqual(p(10), [1, "Db7", 2, 0, 0]);
  assert.deepEqual(p(19.5), [3, "D7", 3.5, 1.5, 0]);
  assert.deepEqual(p(20), [0, "Dm7", 0, 0, 1]);
});

test("a lead lets a note just before the first bar belong to it", () => {
  assert.equal(pos.at(3.6), null);
  assert.equal(pos.at(3.6, 0.5).formBar, 0);
  assert.equal(pos.at(3.6, 0.5).inBar, 0);
  assert.equal(pos.at(3.4, 0.5), null);
});

test("with no count-in the form starts at beat 0", () => {
  const p = formPosition(form, 4, 0).at(0);
  assert.equal(p.playBar, 0);
  assert.equal(p.slot.chord, "Dm7");
});

test("the ladder step counts from the first bar after the count-in", () => {
  const practice = { countIn: 1, ladder: { rungs: 3, everyBars: 2, step: 5 } };
  assert.deepEqual([0, 1, 2, 3, 4, 5, 9].map((b) => ladderStep(practice, b)), [null, 1, 1, 2, 2, 3, 3]);
  assert.equal(ladderStep({ countIn: 0, ladder: null }, 3), null);
});
