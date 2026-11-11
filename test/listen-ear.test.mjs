// The ear against synthetic guitars with a known answer.
import { test } from "node:test";
import assert from "node:assert/strict";
import { tone, midiHz, noise, mixInto, fakeBand, roomIR, convolve, smallSpeaker } from "./helpers/synth.mjs";
import { rate, listen, score, line } from "./helpers/bench.mjs";

test("ear: a clean plucked line. Every note found, starts within a millisecond, pitches right", () => {
  const { mic, truth } = line(30, { seed: 2 });
  const nz = noise(mic.length, 4, 0.002);
  for (let i = 0; i < mic.length; i++) mic[i] += nz[i];
  const { notes } = listen(mic, null);
  const s = score(notes, truth);
  assert.equal(s.missed, 0, `missed ${s.missed} of ${truth.length}`);
  assert.equal(s.extra, 0, `extra ${s.extra}`);
  assert.ok(Math.abs(s.mean) < 0.5, `bias ${s.mean.toFixed(2)} ms`);
  assert.ok(s.sd < 0.6, `spread ${s.sd.toFixed(2)} ms`);
  assert.ok(s.max < 2.5, `worst ${s.max.toFixed(2)} ms`);
  const pitched = s.errs.filter((e) => e.note.midi !== null);
  assert.ok(pitched.length >= truth.length * 0.97, `only ${pitched.length} of ${truth.length} pitched`);
  for (const e of pitched) assert.equal(((Math.round(e.note.midi) % 12) + 12) % 12, e.truth.midi % 12, `note ${e.truth.midi} read as ${e.note.midi}`);
});

test("ear: fast lines (sixteenths at 200), with the last note still ringing", () => {
  const { mic, truth } = line(20, { seed: 5, gap: [0.075, 0.09], low: 52, high: 76 });
  const { notes } = listen(mic, null);
  const s = score(notes, truth, 20);
  assert.ok(s.missed <= truth.length * 0.02, `missed ${s.missed} of ${truth.length}`);
  assert.ok(s.extra <= truth.length * 0.02, `extra ${s.extra}`);
  assert.ok(Math.abs(s.mean) < 0.6 && s.sd < 1.2, `bias ${s.mean.toFixed(2)} spread ${s.sd.toFixed(2)}`);
});

test("ear: soft finger attacks are found, a little late, and never wildly off", () => {
  const { mic, truth } = line(25, { seed: 7, rise: 0.006 });
  const { notes } = listen(mic, null);
  const s = score(notes, truth);
  assert.ok(s.missed <= 1, `missed ${s.missed}`);
  assert.ok(s.extra <= 1, `extra ${s.extra}`);
  // A 6 ms fade-in has no sharp start: the ear reports the point where it becomes audible.
  assert.ok(s.mean > 0 && s.mean < 4, `bias ${s.mean.toFixed(2)} ms`);
  assert.ok(s.sd < 1.5, `spread ${s.sd.toFixed(2)}`);
});

test("ear: quiet room noise and a held note do not make notes", () => {
  const mic = noise(rate * 10, 3, 0.004);
  mixInto(mic, tone(midiHz(57), 6, rate, { amp: 0.3 }), rate * 2);
  const { notes } = listen(mic, null);
  assert.ok(notes.length <= 1, `${notes.length} notes`);
});

test("ear: with speakers, the band is taken out. Its drum hits are not counted as notes, the guitar still is", () => {
  const seconds = 40;
  const bpm = 126;
  const ref = fakeBand(seconds, rate, bpm);
  const delay = Math.round(0.043 * rate);
  const room = roomIR(rate, { delay, seed: 11 });
  const echo = convolve(smallSpeaker(ref, rate), room);
  const { mic: guitar, truth } = line(seconds, { seed: 9, amp: [0.2, 0.5] });
  const mic = new Float32Array(guitar.length);
  const nz = noise(mic.length, 6, 0.002);
  // The band comes back about as loud as the guitar: a phone on a music stand.
  for (let i = 0; i < mic.length; i++) mic[i] = guitar[i] + 0.9 * echo[i] + nz[i];

  const bare = listen(mic, null);
  const sBare = score(bare.notes, truth);
  const { notes, ear } = listen(mic, ref);
  const st = ear.state;
  assert.equal(st.mode, "speakers");
  assert.ok(Math.abs(st.roundTrip * 1000 - 43) < 0.3, `round trip ${(st.roundTrip * 1000).toFixed(2)} ms`);
  // Leave out the first seconds, before the room is learned.
  const from = (st.lockedAt + 1.0) * rate - 100000;
  const late = notes.filter((n) => n.at > from);
  const lateTruth = truth.filter((t) => t.at > from);
  const s = score(late, lateTruth);
  assert.ok(sBare.extra > 40, `without the reference there should be many false notes, got ${sBare.extra}`);
  assert.ok(s.extra <= 2, `false notes ${s.extra} (was ${sBare.extra} without cancelling)`);
  assert.ok(s.missed <= lateTruth.length * 0.03, `missed ${s.missed} of ${lateTruth.length}`);
  assert.ok(Math.abs(s.mean) < 0.7 && s.sd < 1.5, `bias ${s.mean.toFixed(2)} spread ${s.sd.toFixed(2)}`);
});
