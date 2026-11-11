// A test bench for the listening code: a plucked string, a stand-in band, a room, and a seeded noise source.
// Everything is deterministic, so a failing number is the same number on every run.
import { mulberry32 } from "../../assets/js/metronome/prng.js";
import { createFFT } from "../../assets/js/metronome/fft.js";

export const midiHz = (m) => 440 * Math.pow(2, (m - 69) / 12);

export function noise(n, seed = 1, amp = 1) {
  const r = mulberry32(seed);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = (r() * 2 - 1) * amp;
  return out;
}

/**
 * A plucked string (Karplus-Strong). The first sample of the returned buffer is the true onset.
 * `rise` (seconds) fades the pluck in, like a soft finger stroke; `bright` 0..1 sets the tone.
 */
export function pluck(hz, seconds, rate, { amp = 0.5, bright = 0.6, rise = 0, seed = 1, sustain = 0.996, release = 0.012 } = {}) {
  const n = Math.round(seconds * rate);
  const out = new Float32Array(n);
  const period = rate / hz - 0.5;
  const L = Math.floor(period);
  const frac = period - L;
  const r = mulberry32(seed);
  const burst = new Float32Array(L + 2);
  let lp = 0;
  for (let i = 0; i < burst.length; i++) {
    lp += (0.15 + 0.85 * bright) * (r() * 2 - 1 - lp);
    burst[i] = lp;
  }
  const riseN = Math.round(rise * rate);
  let prev = 0;
  for (let i = 0; i < n; i++) {
    let v = i < burst.length ? burst[i] : 0;
    if (i >= L + 1) {
      const a = out[i - L];
      const b = out[i - L - 1];
      const fed = (1 - frac) * a + frac * b;
      const avg = 0.5 * (fed + prev);
      prev = fed;
      v += sustain * avg;
    }
    out[i] = v;
  }
  let peak = 1e-9;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(out[i]));
  for (let i = 0; i < n; i++) {
    const fade = riseN > 0 && i < riseN ? 0.5 - 0.5 * Math.cos((Math.PI * i) / riseN) : 1;
    // The note is damped at the end, as a finger does, so it does not stop with a click.
    const tail = Math.min(1, (n - 1 - i) / Math.max(1, release * rate));
    out[i] = (out[i] / peak) * amp * fade * tail;
  }
  return out;
}

/** A soft, sung kind of note: a few harmonics with a slow attack. Hard for an onset detector. */
export function tone(hz, seconds, rate, { amp = 0.4, attack = 0.012, release = 0.05 } = {}) {
  const n = Math.round(seconds * rate);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    const env = Math.min(1, t / attack) * Math.min(1, (seconds - t) / release) * Math.exp(-t * 1.2);
    let v = 0;
    for (let h = 1; h <= 6; h++) v += Math.sin(2 * Math.PI * hz * h * t) / (h * h);
    out[i] = v * env * amp;
  }
  return out;
}

export function mixInto(dest, src, at, gain = 1) {
  const start = Math.round(at);
  for (let i = 0; i < src.length; i++) {
    const j = start + i;
    if (j >= 0 && j < dest.length) dest[j] += src[i] * gain;
  }
}

/** A room: the direct sound, a few early reflections and a decaying tail. `delay` is in samples. */
export function roomIR(rate, { delay = 0, rt60 = 0.3, seed = 7, direct = 1, wet = 0.3, length = 0.25 } = {}) {
  const n = Math.round(length * rate) + delay;
  const h = new Float32Array(n);
  const r = mulberry32(seed);
  h[delay] = direct;
  for (let k = 0; k < 6; k++) h[delay + 40 + Math.floor(r() * rate * 0.02)] += (r() * 2 - 1) * 0.5 * wet;
  const tau = rt60 / 6.91;
  for (let i = delay + Math.round(0.004 * rate); i < n; i++) h[i] += (r() * 2 - 1) * wet * 0.25 * Math.exp(-(i - delay) / rate / tau);
  return h;
}

/** Convolution through the FFT, cut to the length of the input. */
export function convolve(x, h) {
  let n = 1;
  while (n < x.length + h.length) n <<= 1;
  const fft = createFFT(n);
  const ar = new Float64Array(n);
  const ai = new Float64Array(n);
  const br = new Float64Array(n);
  const bi = new Float64Array(n);
  ar.set(x);
  br.set(h);
  fft.forward(ar, ai);
  fft.forward(br, bi);
  for (let i = 0; i < n; i++) {
    const re = ar[i] * br[i] - ai[i] * bi[i];
    ai[i] = ar[i] * bi[i] + ai[i] * br[i];
    ar[i] = re;
  }
  fft.inverse(ar, ai);
  return Float32Array.from(ar.subarray(0, x.length));
}

/** A small speaker: no deep bass, a little distortion. */
export function smallSpeaker(x, rate, drive = 1.5) {
  const out = new Float32Array(x.length);
  const a = Math.exp((-2 * Math.PI * 250) / rate);
  let lp = 0;
  for (let i = 0; i < x.length; i++) {
    lp = a * lp + (1 - a) * x[i];
    out[i] = Math.tanh((x[i] - lp) * drive) / drive;
  }
  return out;
}

/**
 * A stand-in band for Node tests: a hat on every eighth, kick and snare on the beats, a bass note and a held chord
 * per bar. Returns the dry signal the page would send to the speakers.
 */
export function fakeBand(seconds, rate, bpm, { seed = 3, level = 0.35 } = {}) {
  const n = Math.round(seconds * rate);
  const out = new Float32Array(n);
  const beat = (60 / bpm) * rate;
  const r = mulberry32(seed);
  const burst = (len, decay, hp) => {
    const b = new Float32Array(len);
    let prev = 0;
    for (let i = 0; i < len; i++) {
      const w = r() * 2 - 1;
      const v = hp ? w - prev : w;
      prev = w;
      b[i] = v * Math.exp(-i / (decay * rate));
    }
    return b;
  };
  const kick = new Float32Array(Math.round(0.18 * rate));
  for (let i = 0; i < kick.length; i++) {
    const t = i / rate;
    kick[i] = Math.sin(2 * Math.PI * (50 * t + 60 * (1 - Math.exp(-t * 30)) / 30)) * Math.exp(-t * 18);
  }
  const hat = burst(Math.round(0.04 * rate), 0.008, true);
  const snare = burst(Math.round(0.14 * rate), 0.035, false);
  for (let b = 0; b * beat < n; b += 0.5) {
    const at = b * beat;
    mixInto(out, hat, at, level * 0.5);
    if (Number.isInteger(b)) {
      if (b % 2 === 0) mixInto(out, kick, at, level * 1.2);
      else mixInto(out, snare, at, level * 0.9);
      const bassHz = midiHz(36 + [0, 5, 7, 3][Math.floor(b / 4) % 4]);
      const len = Math.round(beat * 0.9);
      for (let i = 0; i < len && at + i < n; i++) {
        const t = i / rate;
        out[Math.round(at) + i] += level * 0.5 * (Math.sin(2 * Math.PI * bassHz * t) + 0.4 * Math.sin(4 * Math.PI * bassHz * t)) * Math.min(1, t / 0.004) * Math.exp(-t * 3);
      }
    }
    if (b % 4 === 0) {
      const root = 48 + [0, 5, 7, 3][Math.floor(b / 4) % 4];
      const len = Math.round(beat * 3.6);
      for (const iv of [4, 10, 14]) {
        const hz = midiHz(root + iv + 12);
        for (let i = 0; i < len && at + i < n; i++) {
          const t = i / rate;
          out[Math.round(at) + i] += level * 0.12 * Math.sin(2 * Math.PI * hz * t) * Math.min(1, t / 0.01) * Math.exp(-t * 1.5);
        }
      }
    }
  }
  return out;
}
