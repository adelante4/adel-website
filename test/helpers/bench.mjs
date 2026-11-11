// Shared by the listening tests: run the ear over a signal, and compare what it found with the truth.
import { createEar } from "../../assets/js/metronome/ear.js";
import { mulberry32 } from "../../assets/js/metronome/prng.js";
import { pluck, midiHz, mixInto } from "./synth.mjs";

export const rate = 48000;

export function listen(mic, ref, options = {}) {
  const ear = createEar({ rate, ...options });
  const notes = [];
  const B = 2048;
  for (let i = 0; i + B <= mic.length; i += B) notes.push(...ear.push(mic.subarray(i, i + B), ref ? ref.subarray(i, i + B) : null, 100000 + i));
  return { notes: notes.map((n) => ({ ...n, at: n.sample - 100000 })), ear };
}

/** Matches detected notes to the true ones. Returns errors in ms, misses and extras. */
export function score(notes, truth, tolMs = 30) {
  const errs = [];
  const used = new Set();
  let missed = 0;
  for (const t of truth) {
    let best = -1;
    for (let i = 0; i < notes.length; i++) {
      if (used.has(i)) continue;
      if (best < 0 || Math.abs(notes[i].at - t.at) < Math.abs(notes[best].at - t.at)) best = i;
    }
    if (best >= 0 && Math.abs(notes[best].at - t.at) <= (tolMs / 1000) * rate) {
      used.add(best);
      errs.push({ ms: ((notes[best].at - t.at) / rate) * 1000, note: notes[best], truth: t });
    } else missed++;
  }
  const ms = errs.map((e) => e.ms);
  const mean = ms.reduce((a, b) => a + b, 0) / Math.max(1, ms.length);
  const sd = Math.sqrt(ms.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, ms.length));
  const abs = ms.map(Math.abs).sort((a, b) => a - b);
  return { errs, missed, extra: notes.length - used.size, mean, sd, p95: abs[Math.floor(abs.length * 0.95)] ?? 0, max: abs[abs.length - 1] ?? 0 };
}

/**
 * A line of plucked notes with random pitches and spacings. By default each note is damped when the next one
 * starts, as in a single-note line; `ring: true` lets every note ring on over the next ones.
 */
export function line(seconds, { seed = 1, gap = [0.16, 0.5], amp = [0.25, 0.6], rise = 0, low = 43, high = 79, ring = false } = {}) {
  const r = mulberry32(seed);
  const mic = new Float32Array(Math.round(seconds * rate));
  const plan = [];
  let t = 0.6;
  while (t < seconds - 0.9) {
    plan.push({ t, midi: Math.round(low + r() * (high - low)), a: amp[0] + r() * (amp[1] - amp[0]), bright: 0.3 + 0.6 * r() });
    t += gap[0] + r() * (gap[1] - gap[0]);
  }
  const truth = [];
  plan.forEach((n, k) => {
    const at = Math.round(n.t * rate);
    const next = plan[k + 1] ? plan[k + 1].t - n.t : 0.8;
    const len = ring ? 0.8 : Math.min(0.8, next + 0.006);
    mixInto(mic, pluck(midiHz(n.midi), len, rate, { seed: seed * 1000 + k, amp: n.a, rise, bright: n.bright }), at);
    truth.push({ at, midi: n.midi });
  });
  return { mic, truth };
}
