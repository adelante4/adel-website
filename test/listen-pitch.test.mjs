import { test } from "node:test";
import assert from "node:assert/strict";
import { createFFT } from "../assets/js/metronome/fft.js";
import { detectPitch, hzToMidi } from "../assets/js/metronome/pitch.js";
import { pluck, tone, midiHz, noise } from "./helpers/synth.mjs";

test("fft: inverse of forward is the input, and a sine lands in its bin", () => {
  const n = 1024;
  const fft = createFFT(n);
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  for (let i = 0; i < n; i++) re[i] = Math.sin((2 * Math.PI * 37 * i) / n) + 0.3 * Math.cos((2 * Math.PI * 5 * i) / n);
  const keep = Float64Array.from(re);
  fft.forward(re, im);
  assert.ok(Math.abs(Math.hypot(re[37], im[37]) - n / 2) < 1e-6);
  assert.ok(Math.hypot(re[100], im[100]) < 1e-6);
  fft.inverse(re, im);
  for (let i = 0; i < n; i++) assert.ok(Math.abs(re[i] - keep[i]) < 1e-9);
});

test("pitch: every guitar note from low E to high E, on plucked strings, within 15 cents", () => {
  for (const rate of [44100, 48000]) {
    let worst = 0;
    for (let midi = 40; midi <= 88; midi++) {
      const x = pluck(midiHz(midi), 0.12, rate, { seed: midi });
      const p = detectPitch(x, rate, { start: Math.round(0.01 * rate), length: 2048 });
      assert.ok(p, `no pitch at midi ${midi}`);
      const err = Math.abs(hzToMidi(p.hz) - midi);
      // An octave slip keeps the note name, which is all the harmony map needs; anything else is an error.
      const folded = Math.abs(((err + 6) % 12) - 6);
      worst = Math.max(worst, folded);
      assert.ok(folded < 0.15, `midi ${midi} at ${rate}: off by ${folded.toFixed(3)} semitones (${p.hz.toFixed(1)} Hz)`);
      assert.ok(p.clarity > 0.8, `clarity ${p.clarity} at ${midi}`);
    }
    assert.ok(worst < 0.15);
  }
});

test("pitch: soft notes with noise still read, and noise alone is not a pitch", () => {
  const rate = 48000;
  for (const midi of [45, 57, 64, 76]) {
    const x = tone(midiHz(midi), 0.2, rate);
    const nz = noise(x.length, midi, 0.01);
    for (let i = 0; i < x.length; i++) x[i] += nz[i];
    const p = detectPitch(x, rate, { start: 2000, length: 2048 });
    assert.ok(p && Math.abs(hzToMidi(p.hz) - midi) < 0.2, `midi ${midi}`);
  }
  const p = detectPitch(noise(4096, 9, 0.3), rate, { length: 2048 });
  assert.ok(!p || p.clarity < 0.6, `noise read as a pitch with clarity ${p?.clarity}`);
});

test("pitch: two notes at once are reported with low clarity", () => {
  const rate = 48000;
  const a = pluck(midiHz(52), 0.12, rate, { seed: 1 });
  const b = pluck(midiHz(59.5), 0.12, rate, { seed: 2 });
  for (let i = 0; i < a.length; i++) a[i] += b[i];
  const p = detectPitch(a, rate, { start: 480, length: 2048 });
  assert.ok(!p || p.clarity < 0.85, `clarity ${p?.clarity}`);
});
