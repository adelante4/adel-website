// How long the sound takes to leave the page, cross the room and come back through the microphone.
//
// The page knows exactly what it sent to the speakers (the reference). When the microphone hears some of it,
// the time shift between the two is the round trip: output delay, air, input delay. That one number is what
// turns "this note arrived at sample N" into "this note was 12 ms behind the beat you heard".
//
// The method is a generalised cross-correlation with phase weighting: each frequency votes with its phase only,
// so a booming room or a thin speaker does not smear the peak. It runs on a slowed-down copy of the signal
// (a quarter of the sample rate), which is plenty for a result good to a tenth of a millisecond.
// Pure code, no Web Audio.
import { createFFT } from "./fft.js?v=20261112a";

/**
 * @param {{rate:number, maxDelay?:number, decim?:number, size?:number, near?:number|null}} o
 *   near: when set (seconds), only delays within 40 ms of it are considered. Use a measured value here once
 *   there is one; a band that repeats every beat can otherwise look right one beat late.
 */
export function createDelayTracker({ rate, maxDelay = 0.6, decim = 4, size = 16384, near = null }) {
  const dr = rate / decim;
  const fft = createFFT(size);
  const mic = new Float32Array(size);
  const ref = new Float32Array(size);
  const ringM = new Float32Array(size);
  const ringR = new Float32Array(size);
  let pos = 0;
  const accRe = new Float64Array(size);
  const accIm = new Float64Array(size);
  const a = { re: new Float64Array(size), im: new Float64Array(size) };
  const b = { re: new Float64Array(size), im: new Float64Array(size) };
  const win = new Float64Array(size);
  for (let i = 0; i < size; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / size);
  const kLo = Math.max(1, Math.round((200 * size) / dr));
  const kHi = Math.min(size / 2 - 1, Math.round((Math.min(5000, dr * 0.45) * size) / dr));
  let filled = 0; // decimated samples written since the last estimate
  let total = 0;
  let accM = 0;
  let accR = 0;
  let phase = 0;
  let blocks = 0;
  let result = { seconds: null, confidence: 0, locked: false, heard: false };
  const history = [];
  let misses = 0;

  function estimate() {
    let eRef = 0;
    let eMic = 0;
    for (let i = 0; i < size; i++) {
      a.re[i] = mic[i] * win[i];
      a.im[i] = 0;
      b.re[i] = ref[i] * win[i];
      b.im[i] = 0;
      eRef += ref[i] * ref[i];
      eMic += mic[i] * mic[i];
    }
    // Nothing was sent to the speakers in this stretch: there is nothing to line up.
    if (eRef / size < 1e-9 || eMic / size < 1e-12) return;
    fft.forward(a.re, a.im);
    fft.forward(b.re, b.im);
    for (let k = 0; k < size; k++) {
      accRe[k] *= 0.6;
      accIm[k] *= 0.6;
    }
    for (let k = kLo; k <= kHi; k++) {
      // mic times the conjugate of ref: a later microphone gives a positive lag.
      const re = a.re[k] * b.re[k] + a.im[k] * b.im[k];
      const im = a.im[k] * b.re[k] - a.re[k] * b.im[k];
      const mag = Math.hypot(re, im);
      if (mag < 1e-20) continue;
      const w = 1 / Math.pow(mag, 0.85);
      accRe[k] += re * w;
      accIm[k] += im * w;
      accRe[size - k] = accRe[k];
      accIm[size - k] = -accIm[k];
    }
    for (let k = 0; k < size; k++) {
      a.re[k] = accRe[k];
      a.im[k] = accIm[k];
    }
    fft.inverse(a.re, a.im);
    const c = a.re;
    let lo = 0;
    let hi = Math.min(size / 2 - 1, Math.round(maxDelay * dr));
    if (near !== null) {
      lo = Math.max(0, Math.round((near - 0.04) * dr));
      hi = Math.min(hi, Math.round((near + 0.04) * dr));
    }
    let best = lo;
    let sum = 0;
    let sq = 0;
    for (let i = lo; i <= hi; i++) {
      if (c[i] > c[best]) best = i;
      sum += c[i];
      sq += c[i] * c[i];
    }
    const count = hi - lo + 1;
    const mean = sum / count;
    const sd = Math.sqrt(Math.max(1e-30, sq / count - mean * mean));
    // The strongest rival more than 2 ms away. A band that repeats exactly would give a rival as strong as the peak.
    let rival = -Infinity;
    const guard = Math.round(0.002 * dr);
    for (let i = lo; i <= hi; i++) if (Math.abs(i - best) > guard && c[i] > rival) rival = c[i];
    const z = (c[best] - mean) / sd;
    const clear = c[best] > 0 && (rival <= 0 || c[best] / rival > 1.3);
    const y0 = c[Math.max(0, best - 1)];
    const y1 = c[best];
    const y2 = c[best + 1];
    const d = y0 - 2 * y1 + y2;
    const shift = d < 0 ? Math.max(-0.5, Math.min(0.5, (0.5 * (y0 - y2)) / d)) : 0;
    const seconds = (best + shift) / dr;
    // A real echo gives a sharp peak that sits in the same place, to a fraction of a millisecond, block after
    // block. A guitarist playing in time with the band also lines up with it, but loosely: that peak is low and
    // wanders. So a lock needs a strong peak twice in the same place, or one very strong peak.
    const good = z > 11 && clear;
    blocks++;
    history.push(good ? seconds : null);
    if (history.length > 3) history.shift();
    const agree = history.filter((h) => h !== null && Math.abs(h - seconds) < 0.00025).length;
    const was = result.locked;
    let locked = was;
    let value = was ? result.seconds : good ? seconds : null;
    if (!was) {
      if (good && (agree >= 2 || z > 25)) {
        locked = true;
        value = seconds;
        misses = 0;
      }
    } else if (good && Math.abs(seconds - result.seconds) < 0.0005) {
      value = seconds;
      misses = 0;
    } else if (good && agree >= 2) {
      value = seconds; // the delay really changed: another speaker, or the phone moved
      misses = 0;
    } else if (++misses >= 6) {
      // The band plays and is no longer found: the lock was wrong, or the speakers were swapped for headphones.
      locked = false;
      value = null;
    }
    result = { seconds: value, confidence: z, locked, heard: good, blocks };
  }

  return {
    /** Feed the microphone and the reference, the same number of samples of each. */
    push(micBlock, refBlock) {
      for (let i = 0; i < micBlock.length; i++) {
        accM += micBlock[i];
        accR += refBlock[i];
        if (++phase < decim) continue;
        ringM[pos] = accM / decim;
        ringR[pos] = accR / decim;
        pos = (pos + 1) % size;
        accM = 0;
        accR = 0;
        phase = 0;
        total++;
        if (++filled >= size / 2 && total >= size) {
          filled = 0;
          for (let j = 0; j < size; j++) {
            mic[j] = ringM[(pos + j) % size];
            ref[j] = ringR[(pos + j) % size];
          }
          estimate();
        }
      }
    },
    get: () => result,
    /** Only look near a known delay from now on (seconds), or anywhere when null. */
    setNear(seconds) {
      near = seconds;
    },
  };
}

/** The delay between two whole recordings, in seconds, or null when the reference cannot be found in the microphone. */
export function measureDelay(micSignal, refSignal, rate, options = {}) {
  const t = createDelayTracker({ rate, ...options });
  const step = 4096;
  for (let i = 0; i + step <= micSignal.length; i += step) t.push(micSignal.subarray(i, i + step), refSignal.subarray(i, i + step));
  const r = t.get();
  return r.seconds === null ? null : r;
}

/**
 * A test signal for measuring the delay on purpose: two rising sweeps with a gap. A sweep never repeats itself,
 * so the answer cannot be off by a beat the way it can with a click.
 */
export function probeSignal(rate, seconds = 3.2) {
  const n = Math.round(seconds * rate);
  const out = new Float32Array(n);
  const sweep = (start, len, f0, f1) => {
    const m = Math.round(len * rate);
    const k = Math.log(f1 / f0);
    for (let i = 0; i < m && start + i < n; i++) {
      const t = i / rate;
      const ph = (2 * Math.PI * f0 * len * (Math.exp((t / len) * k) - 1)) / k;
      const env = Math.min(1, i / (0.01 * rate), (m - i) / (0.01 * rate));
      out[start + i] += 0.5 * Math.sin(ph) * env;
    }
  };
  sweep(Math.round(0.15 * rate), 1.2, 300, 6000);
  sweep(Math.round(1.6 * rate), 1.35, 400, 5000);
  return out;
}
