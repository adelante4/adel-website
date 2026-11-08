import test from "node:test";
import assert from "node:assert/strict";
import { peakOf, rmsOf, trimTail, limiterGain, applyGain, mixHits, masterProject } from "../assets/js/metronome/mpcdsp.js";

const RATE = 44100;
const db = (x) => 20 * Math.log10(x);
/** A decaying tone with a hiss floor: the shape of a recorded drum hit. */
const hit = (sec, { hz = 180, decay = 12, hiss = 0.0004, amp = 0.8, seed = 1 } = {}) => {
  let s = seed;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;
  const n = Math.round(sec * RATE);
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) c[i] = amp * Math.exp(-decay * (i / RATE)) * Math.sin((2 * Math.PI * hz * i) / RATE) + hiss * rnd();
  return [c, c.slice()];
};

test("trimTail cuts the noise floor after the hit and fades the cut", () => {
  const x = hit(2);
  const y = trimTail(x, RATE);
  assert.ok(y[0].length < x[0].length * 0.9, `cut from ${x[0].length} to ${y[0].length}`);
  assert.ok(y[0].length >= 0.1 * RATE);
  assert.equal(y[0].length, y[1].length);
  assert.ok(Math.abs(y[0].at(-1)) < 1e-3, "ends at silence, no click");
  assert.ok(peakOf(y) > 0.7, "the hit itself is untouched");
  // What is left is not the hiss: the last 50 ms before the fade is still well above the floor.
  const body = y[0].slice(Math.round(0.02 * RATE), Math.round(0.05 * RATE));
  assert.ok(rmsOf([body]) > 0.0004 * 3);
});

test("trimTail keeps a short sound whole and ignores silence", () => {
  const short = hit(0.12, { decay: 8 });
  assert.ok(trimTail(short, RATE)[0].length >= 0.1 * RATE);
  const silent = [new Float32Array(1000)];
  assert.equal(trimTail(silent, RATE), silent);
});

test("limiterGain never lets the signal pass the ceiling", () => {
  const n = RATE;
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) c[i] = 0.3 * Math.sin((2 * Math.PI * 220 * i) / RATE);
  for (const at of [5000, 20000, 20100, 41000]) c[at] = 1.8; // spikes
  const g = limiterGain([c], { ceil: 0.8, rate: RATE });
  const y = applyGain([c], g);
  assert.ok(peakOf(y) <= 0.8 + 1e-4, `peak ${peakOf(y)}`);
  assert.ok(g[2000] > 0.999, "quiet parts before a spike are left alone");
  assert.ok(g[5000] < 0.5, "the spike itself is pulled down");
});

test("limiterGain with wrap leaves no seam", () => {
  const n = RATE / 2;
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) c[i] = 0.2 * Math.sin((2 * Math.PI * 100 * i) / RATE);
  c[n - 10] = 2; // a peak just before the loop end: the gain must already be down at the start
  const g = limiterGain([c], { ceil: 0.8, rate: RATE, wrap: true });
  assert.ok(g[0] < 0.99, "the start of the loop feels the peak at its end");
  assert.ok(Math.abs(g[0] - g[n - 1]) < 0.1, "gain is continuous across the loop point");
});

test("mixHits wraps a tail round the loop", () => {
  const shot = [Float32Array.from([1, 1, 1, 1])];
  const out = mixHits(6, [{ time: 4, pad: 0, vel: 0.5 }], new Map([[0, shot]]));
  assert.deepEqual([...out[0]], [0.5, 0.5, 0, 0, 0.5, 0.5]);
  assert.deepEqual([...out[1]], [...out[0]], "a mono shot plays on both sides");
});

test("masterProject makes the project louder without passing the ceiling", () => {
  const n = RATE * 4;
  const mk = (hz, amp) => {
    const c = new Float32Array(n);
    for (let i = 0; i < n; i++) c[i] = amp * Math.sin((2 * Math.PI * hz * i) / RATE) * (0.5 + 0.5 * Math.sin((2 * Math.PI * i) / n));
    return [c, c.slice()];
  };
  const bed = [mk(220, 0.2), mk(55, 0.18)];
  const shots = new Map([[0, hit(0.6, { amp: 0.45, hiss: 0 })], [1, hit(0.4, { amp: 0.4, hz: 400, hiss: 0 })]]);
  const hits = [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5].map((t, i) => ({ time: t, pad: i % 2, vel: 0.6 + 0.04 * i }));
  const loud = masterProject({ n, rate: RATE, shots, hits, bed });
  assert.ok(loud.stats.afterRmsDb > loud.stats.beforeRmsDb + 4, `rms ${loud.stats.beforeRmsDb.toFixed(1)} -> ${loud.stats.afterRmsDb.toFixed(1)}`);
  assert.ok(loud.stats.peakDb < -0.4, `peak ${loud.stats.peakDb.toFixed(1)}`);
  assert.ok(loud.stats.duckDb < 9);
  for (const chans of loud.shots.values()) assert.ok(peakOf(chans) <= 0.55 + 1e-3, "each one-shot is limited");
  const same = masterProject({ n, rate: RATE, shots, hits, bed, loud: false });
  assert.equal(same.bed, bed);
  assert.equal(same.shots, shots);
  assert.equal(same.stats.afterRmsDb, same.stats.beforeRmsDb);
});
