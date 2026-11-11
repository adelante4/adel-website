// The pitch of one note, from a short piece of sound. Pure code.
//
// This is the McLeod pitch method: a normalised autocorrelation whose first strong peak marks the
// period. It is made for single notes. A chord gives a low "clarity" and is reported as no pitch.
// Picking the first strong peak, not the highest, keeps it from answering an octave or a twelfth low.
import { createFFT, nextPow2 } from "./fft.js?v=20261109e";

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
