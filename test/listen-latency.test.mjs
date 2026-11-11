import { test } from "node:test";
import assert from "node:assert/strict";
import { measureDelay, createDelayTracker, probeSignal } from "../assets/js/metronome/latency.js";
import { fakeBand, roomIR, convolve, smallSpeaker, noise, pluck, mixInto, midiHz } from "./helpers/synth.mjs";

const rate = 48000;

function heard(ref, delaySeconds, { guitar = true, level = 1, room = true, seed = 5 } = {}) {
  const d = Math.round(delaySeconds * rate);
  const h = room ? roomIR(rate, { delay: d, seed }) : (() => { const x = new Float32Array(d + 1); x[d] = 1; return x; })();
  const mic = convolve(smallSpeaker(ref, rate), h);
  for (let i = 0; i < mic.length; i++) mic[i] *= level;
  const nz = noise(mic.length, seed + 1, 0.003);
  for (let i = 0; i < mic.length; i++) mic[i] += nz[i];
  if (guitar) for (let k = 0; k * 0.37 * rate < mic.length; k++) mixInto(mic, pluck(midiHz(52 + ((k * 5) % 19)), 0.4, rate, { seed: k + 1, amp: 0.4 }), k * 0.37 * rate + 1234);
  return mic;
}

test("latency: the sweep is found to a tenth of a millisecond, through a room, a small speaker and a guitar on top", () => {
  for (const ms of [8, 23.5, 61, 142, 310]) {
    const ref = probeSignal(rate, 4.5);
    const mic = heard(ref, ms / 1000);
    const r = measureDelay(mic, ref, rate);
    assert.ok(r && r.locked, `no lock at ${ms} ms`);
    const want = Math.round((ms / 1000) * rate) / rate;
    assert.ok(Math.abs(r.seconds - want) < 0.00015, `${ms} ms read as ${(r.seconds * 1000).toFixed(3)}`);
  }
});

test("latency: a playing band is enough, even quiet under the guitar", () => {
  for (const ms of [18, 47, 95]) {
    const ref = fakeBand(8, rate, 132);
    const mic = heard(ref, ms / 1000, { level: 0.15 });
    const r = measureDelay(mic, ref, rate);
    assert.ok(r && r.locked, `no lock at ${ms} ms`);
    assert.ok(Math.abs(r.seconds * 1000 - ms) < 0.3, `${ms} ms read as ${(r.seconds * 1000).toFixed(2)}`);
  }
});

test("latency: headphones (no band in the microphone) give no answer, not a wrong one", () => {
  const ref = fakeBand(8, rate, 120);
  const mic = noise(ref.length, 3, 0.003);
  for (let k = 0; k * 0.5 * rate < mic.length; k++) mixInto(mic, pluck(midiHz(55 + (k % 12)), 0.45, rate, { seed: k + 1 }), k * 0.5 * rate);
  const r = measureDelay(mic, ref, rate);
  assert.equal(r, null);
});

test("latency: with a measured value to look near, a bare click cannot be read one beat late", () => {
  // A click that repeats exactly looks the same shifted by a beat. Looking near the known delay settles it.
  const ref = new Float32Array(rate * 6);
  const click = pluck(1000, 0.03, rate, { seed: 1, amp: 0.8 });
  for (let b = 0; b * 0.25 * rate < ref.length; b++) mixInto(ref, click, b * 0.25 * rate);
  const mic = heard(ref, 0.27, { guitar: false });
  const t = createDelayTracker({ rate, near: 0.268 });
  for (let i = 0; i + 4096 <= mic.length; i += 4096) t.push(mic.subarray(i, i + 4096), ref.subarray(i, i + 4096));
  assert.ok(Math.abs(t.get().seconds - 0.27) < 0.0003, String(t.get().seconds));
});
