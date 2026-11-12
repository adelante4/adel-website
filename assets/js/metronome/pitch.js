// The pitch of one note, from a short piece of sound. Pure code.
//
// This is the McLeod pitch method: a normalised autocorrelation whose first strong peak marks the
// period. It is made for single notes. A chord gives a low "clarity" and is reported as no pitch.
// Picking the first strong peak, not the highest, keeps it from answering an octave or a twelfth low.
import { createFFT, nextPow2 } from "./fft.js?v=20261112b";

const ffts = new Map();
const fftFor = (n) => {
  if (!ffts.has(n)) ffts.set(n, { fft: createFFT(n), re: new Float64Array(n), im: new Float64Array(n) });
  return ffts.get(n);
};

/**
 * @param {Float32Array|Float64Array} x  the samples to look at (1024 to 4096 is typical)
 * @param {number} rate  sample rate
 * @returns {{hz:number, clarity:number}|null}  clarity runs from 0 to 1; trust it above about 0.8
 */
export function detectPitch(x, rate, { fmin = 70, fmax = 1400, start = 0, length = x.length - start, cutoff = 0.93 } = {}) {
  const W = length;
  if (W < 256) return null;
  const size = nextPow2(2 * W);
  const { fft, re, im } = fftFor(size);
  let mean = 0;
  for (let i = 0; i < W; i++) mean += x[start + i];
  mean /= W;
  let energy = 0;
  for (let i = 0; i < W; i++) {
    const v = x[start + i] - mean;
    re[i] = v;
    energy += v * v;
  }
  if (energy < 1e-12) return null;
  re.fill(0, W);
  im.fill(0);
  // Autocorrelation through the power spectrum.
  fft.forward(re, im);
  for (let i = 0; i < size; i++) {
    re[i] = re[i] * re[i] + im[i] * im[i];
    im[i] = 0;
  }
  fft.inverse(re, im);
  const tauMin = Math.max(2, Math.floor(rate / fmax));
  const tauMax = Math.min(Math.floor(W / 2), Math.ceil(rate / fmin));
  if (tauMax <= tauMin + 2) return null;
  // nsdf[tau] = 2 r[tau] / m[tau], where m is the energy of the two overlapping stretches.
  const nsdf = new Float64Array(tauMax + 2);
  let m = 2 * energy;
  nsdf[0] = 1;
  for (let tau = 1; tau <= tauMax + 1; tau++) {
    const a = x[start + tau - 1] - mean;
    const b = x[start + W - tau] - mean;
    m -= a * a + b * b;
    nsdf[tau] = m > 1e-12 ? (2 * re[tau]) / m : 0;
  }
  // The highest point of each positive lobe after the first dip below zero.
  const peaks = [];
  let tau = 1;
  while (tau <= tauMax && nsdf[tau] > 0) tau++;
  let best = -1;
  for (; tau <= tauMax; tau++) {
    if (nsdf[tau] > 0) {
      if (best < 0 || nsdf[tau] > nsdf[best]) best = tau;
    } else if (best >= 0) {
      peaks.push(best);
      best = -1;
    }
  }
  if (best >= 0 && best < tauMax) peaks.push(best);
  const usable = peaks.filter((p) => p >= tauMin);
  if (!usable.length) return null;
  let top = 0;
  for (const p of usable) top = Math.max(top, nsdf[p]);
  const pick = usable.find((p) => nsdf[p] >= cutoff * top);
  // A parabola through the peak and its neighbours gives the period between samples.
  const y0 = nsdf[pick - 1];
  const y1 = nsdf[pick];
  const y2 = nsdf[pick + 1];
  const d = y0 - 2 * y1 + y2;
  const shift = d < 0 ? Math.max(-0.5, Math.min(0.5, (0.5 * (y0 - y2)) / d)) : 0;
  const period = pick + shift;
  return { hz: rate / period, clarity: Math.max(0, Math.min(1, y1 - 0.25 * (y0 - y2) * shift)) };
}

export const hzToMidi = (hz) => 69 + 12 * Math.log2(hz / 440);

const tapers = new Map();
/** How much of a Hann window still overlaps itself when shifted by tau: the fade an autocorrelation gets from it. */
function taperFor(W) {
  if (!tapers.has(W)) {
    const w = new Float64Array(W);
    for (let i = 0; i < W; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / W);
    const t = new Float64Array(W / 2 + 2);
    let w2 = 0;
    for (let i = 0; i < W; i++) w2 += w[i] * w[i];
    for (let tau = 0; tau < t.length; tau++) {
      let s = 0;
      for (let i = 0; i + tau < W; i++) s += w[i] * w[i + tau];
      t[tau] = s / w2;
    }
    tapers.set(W, { w, t });
  }
  return tapers.get(W);
}

/**
 * The pitch of a note that starts while other notes are still ringing.
 * `before` is the sound just before the note began, `after` the sound just after, the same length (a power of two).
 * Whatever was already sounding is in both; only what is new is kept, and its period is read from that.
 * @returns {{hz:number, clarity:number}|null}
 */
export function detectNewPitch(before, after, rate, { fmin = 70, fmax = 1400, cutoff = 0.85 } = {}) {
  const W = after.length;
  const { w, t } = taperFor(W);
  const size = 2 * W;
  const { fft, re, im } = fftFor(size);
  const old = new Float64Array(size / 2 + 1);
  re.fill(0);
  im.fill(0);
  for (let i = 0; i < W; i++) re[i] = before[i] * w[i];
  fft.forward(re, im);
  for (let k = 0; k <= size / 2; k++) old[k] = re[k] * re[k] + im[k] * im[k];
  re.fill(0);
  im.fill(0);
  for (let i = 0; i < W; i++) re[i] = after[i] * w[i];
  fft.forward(re, im);
  let kept = 0;
  let all = 0;
  const lo = Math.floor((60 * size) / rate);
  for (let k = 0; k <= size / 2; k++) {
    const p = re[k] * re[k] + im[k] * im[k];
    // A ringing note only fades, so anything above 1.3 times what was there is new.
    const fresh = k < lo ? 0 : Math.max(0, p - 1.3 * old[k]);
    all += p;
    kept += fresh;
    re[k] = fresh;
    im[k] = 0;
    if (k > 0 && k < size / 2) {
      re[size - k] = fresh;
      im[size - k] = 0;
    }
  }
  if (kept < 1e-14 || kept < 0.02 * all) return null;
  fft.inverse(re, im);
  const r0 = re[0];
  if (r0 <= 0) return null;
  const tauMin = Math.max(2, Math.floor(rate / fmax));
  const tauMax = Math.min(W / 2, Math.ceil(rate / fmin));
  const ac = (tau) => re[tau] / r0 / t[tau];
  let tau = 1;
  while (tau <= tauMax && ac(tau) > 0) tau++;
  const peaks = [];
  let best = -1;
  for (; tau <= tauMax; tau++) {
    if (ac(tau) > 0) {
      if (best < 0 || ac(tau) > ac(best)) best = tau;
    } else if (best >= 0) {
      peaks.push(best);
      best = -1;
    }
  }
  if (best >= 0 && best < tauMax) peaks.push(best);
  const usable = peaks.filter((p) => p >= tauMin);
  if (!usable.length) return null;
  let top = 0;
  for (const p of usable) top = Math.max(top, ac(p));
  const pick = usable.find((p) => ac(p) >= cutoff * top);
  const y0 = ac(pick - 1);
  const y1 = ac(pick);
  const y2 = ac(pick + 1);
  const d = y0 - 2 * y1 + y2;
  const shift = d < 0 ? Math.max(-0.5, Math.min(0.5, (0.5 * (y0 - y2)) / d)) : 0;
  return { hz: rate / (pick + shift), clarity: Math.max(0, Math.min(1, y1)) };
}
