// The ear against synthetic guitars with a known answer.
import { test } from "node:test";
import assert from "node:assert/strict";
import { tone, pluck, midiHz, noise, mixInto, fakeBand, roomIR, convolve, smallSpeaker } from "./helpers/synth.mjs";
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
  const placed = s.errs.filter((e) => e.note.precise).map((e) => e.ms);
  assert.ok(placed.length >= truth.length * 0.9, `only ${placed.length} placed exactly`);
  assert.ok(Math.max(...placed.map(Math.abs)) < 2, "a placed note is never far off");
  assert.ok(Math.abs(s.mean) < 0.6 && s.sd < 2, `bias ${s.mean.toFixed(2)} spread ${s.sd.toFixed(2)}`);
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
  // Leave out the first second after the band is found, while the room is being learned. The page does the same.
  const from = (st.lockedAt + 1.0) * rate - 100000;
  const late = notes.filter((n) => n.at > from);
  const lateTruth = truth.filter((t) => t.at > from);
  const s = score(late, lateTruth);
  assert.ok(sBare.extra > 40, `without the reference there should be many false notes, got ${sBare.extra}`);
  assert.ok(s.extra <= lateTruth.length * 0.05, `false notes ${s.extra} (was ${sBare.extra} without the reference)`);
  assert.ok(s.missed <= lateTruth.length * 0.06, `missed ${s.missed} of ${lateTruth.length}`);
  const placed = s.errs.filter((e) => e.note.precise).map((e) => e.ms);
  const mean = placed.reduce((a, b) => a + b, 0) / placed.length;
  assert.ok(Math.abs(mean) < 0.5, `bias ${mean.toFixed(2)} ms`);
  assert.ok(Math.max(...placed.map(Math.abs)) < 3, "a placed note is never far off");
});

test("ear: a bare click with the player on every beat. The click is not counted, in the count-in or in the rests", () => {
  const seconds = 30;
  const ref = new Float32Array(seconds * rate);
  const click = pluck(1500, 0.03, rate, { seed: 1, amp: 0.6 });
  const beat = 0.4545 * rate;
  for (let b = 0; b * beat < ref.length; b++) mixInto(ref, click, b * beat);
  const d = Math.round(0.041 * rate);
  const mic = noise(ref.length, 3, 0.002);
  for (let i = d; i < mic.length; i++) mic[i] += 0.5 * ref[i - d];
  const truth = [];
  for (let b = 12; b * beat < ref.length - rate; b++) {
    if (Math.floor(b / 4) % 4 === 3) continue; // a bar of rest in every four
    const at = Math.round(b * beat + d + 0.015 * rate);
    mixInto(mic, pluck(midiHz(50 + ((b * 7) % 20)), 0.3, rate, { seed: b + 5, amp: 0.4 }), at);
    truth.push({ at });
  }
  const { notes, ear } = listen(mic, ref);
  const from = (ear.state.lockedAt + 1) * rate - 100000;
  const s = score(notes.filter((n) => n.at > from), truth.filter((t) => t.at > from));
  assert.ok(s.extra <= 2, `false notes ${s.extra}`);
  // A note that lands right on a loud click can be taken for the click. About one in seven is lost this way.
  assert.ok(s.missed <= 6, `missed ${s.missed}`);
  assert.ok(Math.abs(s.mean) < 1, `bias ${s.mean.toFixed(2)}`);
});

test("ear: notes that ring on over each other are still named right, octave included", () => {
  // Every note is left ringing for 0.8 s, so two or three sound at once, as in an arpeggio across the strings.
  const { mic, truth } = line(40, { seed: 8, ring: true });
  const { notes } = listen(mic, null);
  const s = score(notes, truth);
  assert.ok(s.missed <= 2, `missed ${s.missed}`);
  let exact = 0;
  for (const e of s.errs) if (e.note.midi !== null && Math.round(e.note.midi) === e.truth.midi) exact++;
  assert.ok(exact >= s.errs.length * 0.97, `${exact} of ${s.errs.length} exact`);
});
