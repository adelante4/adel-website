// The ear: turns the microphone into notes.
//
// Sound comes in as blocks. Notes come out a little later (about a tenth of a second), each with:
//   t        when the note began, in seconds on the audio clock, good to about a millisecond
//   midi     its pitch as a note number, or null when it was a chord or unclear
//   level    how loud it was, in dB
//   precise  false when the start was too soft to place exactly (left out of the timing numbers)
//
// How it works, in order:
//   1. The sound is cut into short overlapping frames and turned into spectra.
//   2. If the band is coming back through the microphone, it is subtracted (echo.js), and the delay it comes back
//      with is measured (latency.js). That delay is also the latency the timing numbers need.
//   3. A note start shows as energy rising in several frequency bands at once. That gives the start to within a
//      frame. The exact moment is then found in the cleaned waveform: the point where the level leaves the floor.
//   4. A start that the band's own signal explains (a drum hit that was not fully removed) is dropped.
//   5. The pitch is read from the cleaned waveform just after the start (pitch.js).
// Pure code, no Web Audio, so all of it is tested under Node with synthetic guitars and rooms.
import { createFFT, hann } from "./fft.js?v=20261109e";
import { createEchoModel } from "./echo.js?v=20261109e";
import { createDelayTracker } from "./latency.js?v=20261109e";
import { detectPitch, hzToMidi } from "./pitch.js?v=20261109e";

const db = (x) => 10 * Math.log10(Math.max(x, 1e-20));

/**
 * @param {{rate:number, delay?:number|null, onDelay?:(r:object)=>void}} o
 *   delay: the round trip in seconds when already measured. The ear keeps checking it against what it hears.
 */
export function createEar({ rate, size = 1024, hop = 256, delay = null, minGap = 0.05, sensitivity = 1, probe = null } = {}) {
  const fft = createFFT(size);
  const win = hann(size);
  const half = size >> 1;
  const binHz = rate / size;
  const kLo = Math.max(2, Math.ceil(70 / binHz));
  const kHi = Math.min(half - 1, Math.floor(8000 / binHz));
  const canceller = createEchoModel({ rate });
  const PART = canceller.part;
  let tracker = createDelayTracker({ rate, near: delay });
  let roundTrip = delay; // seconds, or null when unknown
  let refShift = delay === null ? null : Math.max(0, Math.round(delay * rate) - Math.round(0.002 * rate));
  let cancelling = delay !== null;
  let mode = delay === null ? "unknown" : "speakers"; // "unknown" | "speakers" | "headphones"
  let lockedAt = delay === null ? null : 0;
  let quietBlocks = 0;

  // Frequency bands for the onset detector: about a third of an octave each.
  const bands = [];
  for (let f = 80; f < 8000; f *= 1.26) {
    const a = Math.max(kLo, Math.round(f / binHz));
    const b = Math.min(kHi, Math.max(a, Math.round((f * 1.26) / binHz) - 1));
    if (b >= a && (!bands.length || a > bands[bands.length - 1][1])) bands.push([a, b]);
  }
  const NB = bands.length;

  // Input queues. `base` is the audio-clock frame of sample 0.
  const CAP = 1 << 17; // about 2.7 s of history at 48 kHz
  const MASK = CAP - 1;
  const micRing = new Float32Array(CAP);
  const refRing = new Float32Array(CAP);
  const clean = new Float32Array(CAP); // the cleaned waveform, by absolute sample
  const echoWave = new Float32Array(CAP); // the band as the microphone is estimated to hear it
  let base = null;
  let written = 0; // samples received
  let frame = 0; // frames done; frame f covers samples f*hop .. f*hop+size-1
  let cleanEnd = 0; // clean[] is final below this sample

  const E = { re: new Float64Array(size), im: new Float64Array(size) };
  const Y = { re: new Float64Array(size), im: new Float64Array(size) };
  const refTail = new Float32Array(canceller.F);
  const echoPart = new Float64Array(PART);
  const micPart = new Float32Array(PART);
  // A gentle high-pass on the cleaned sound: rumble and handling noise are not notes.
  const hpA = Math.exp((-2 * Math.PI * 60) / rate);
  let hpX = 0;
  let hpY = 0;

  // Per-frame history, short rings.
  const H = 256;
  const logE = new Float64Array(H * NB);
  const linE = new Float64Array(H * NB); // cleaned energy per band
  const linY = new Float64Array(H * NB); // echo estimate energy per band
  const odf = new Float64Array(H);
  const yOdf = new Float64Array(H);
  const frameDb = new Float64Array(H);
  // The noise floor is the quietest level of the last several seconds, per band and overall. A plain slow rise
  // would climb to the level of the playing during a long phrase, so the minimum is kept per second instead.
  const SEC = Math.round(rate / hop);
  const KEEP = 45;
  const noiseBand = new Float64Array(NB).fill(1e-12);
  const minNow = new Float64Array(NB).fill(Infinity);
  const minRing = new Float64Array(KEEP * NB).fill(Infinity);
  const dbRing = new Float64Array(KEEP).fill(Infinity);
  let dbNow = Infinity;
  let minSlot = 0;
  const smooth = new Float64Array(NB);
  const peakBand = new Float64Array(NB);
  const ringBand = new Float64Array(NB);
  const RING = Math.pow(10, (-6 * hop) / rate / 0.8); // a room that rings for 0.8 s
  let noiseDb = -90;
  let levelDb = -90;
  const ratios = new Float64Array(96);
  const levels = new Float64Array(96);
  let leakLevel = 0.4; // the same for loudness over the first 30 ms
  let echoRise = 0;
  let ratioN = 0;
  let leak = 0.4; // the share of a band hit's click expected to be left after the subtraction (amplitude)

  let lastOnsetSample = -1e9;
  const pending = []; // onsets waiting for their pitch
  const out = [];
  const loud = []; // recent note levels, for the relative gate
  let stats = { frames: 0, onsets: 0, dropped: 0 };

  function bandEnergies(spec, dest, f) {
    const row = (f % H) * NB;
    let total = 0;
    for (let b = 0; b < NB; b++) {
      let e = 0;
      for (let k = bands[b][0]; k <= bands[b][1]; k++) e += spec.re[k] * spec.re[k] + spec.im[k] * spec.im[k];
      dest[row + b] = e;
      total += e;
    }
    return total;
  }

  /** Fills clean[] and echoWave[] for samples from cleanEnd up to `upTo`. */
  function cleanUp(upTo) {
    if (!cancelling) {
      for (let i = cleanEnd; i < upTo; i++) {
        const x = micRing[i & MASK];
        hpY = hpA * (hpY + x - hpX);
        hpX = x;
        clean[i & MASK] = hpY;
        echoWave[i & MASK] = 0;
      }
      cleanEnd = upTo;
      return;
    }
    while (cleanEnd + PART <= upTo) {
      const end = cleanEnd + PART;
      const F = canceller.F;
      for (let i = 0; i < F; i++) {
        const j = end - F + i - refShift;
        refTail[i] = j >= 0 ? refRing[j & MASK] : 0;
      }
      for (let i = 0; i < PART; i++) micPart[i] = micRing[(cleanEnd + i) & MASK];
      canceller.step(refTail, micPart, echoPart);
      for (let i = 0; i < PART; i++) {
        const n = cleanEnd + i;
        const x = micPart[i] - echoPart[i];
        hpY = hpA * (hpY + x - hpX);
        hpX = x;
        clean[n & MASK] = hpY;
        echoWave[n & MASK] = echoPart[i];
      }
      cleanEnd = end;
    }
  }

  function doFrame() {
    const start = frame * hop;
    for (let i = 0; i < size; i++) {
      E.re[i] = clean[(start + i) & MASK] * win[i];
      E.im[i] = 0;
    }
    fft.forward(E.re, E.im);
    const total = bandEnergies(E, linE, frame);
    if (cancelling) {
      for (let i = 0; i < size; i++) {
        Y.re[i] = echoWave[(start + i) & MASK] * win[i];
        Y.im[i] = 0;
      }
      fft.forward(Y.re, Y.im);
      bandEnergies(Y, linY, frame);
    } else linY.fill(0, (frame % H) * NB, (frame % H) * NB + NB);

    const row = (frame % H) * NB;
    const fdb = db((total / (size * size * 0.375)) * 2);
    for (let b = 0; b < NB; b++) {
      const e = linE[row + b];
      smooth[b] = frame === 0 ? e : 0.7 * smooth[b] + 0.3 * e;
      if (smooth[b] < minNow[b]) minNow[b] = smooth[b];
    }
    if (fdb < dbNow) dbNow = fdb;
    if (frame % SEC === SEC - 1 || frame === 7) {
      minRing.set(minNow, minSlot * NB);
      dbRing[minSlot] = dbNow;
      minSlot = (minSlot + 1) % KEEP;
      minNow.fill(Infinity);
      dbNow = Infinity;
      let lowest = Infinity;
      for (let j = 0; j < KEEP; j++) if (dbRing[j] < lowest) lowest = dbRing[j];
      noiseDb = lowest;
      for (let b = 0; b < NB; b++) {
        let m = Infinity;
        for (let j = 0; j < KEEP; j++) if (minRing[j * NB + b] < m) m = minRing[j * NB + b];
        noiseBand[b] = m + 1e-14;
      }
    } else if (frame < 7) {
      noiseDb = Math.min(noiseDb === -90 ? fdb : noiseDb, fdb);
      for (let b = 0; b < NB; b++) noiseBand[b] = Math.max(1e-14, Math.min(noiseBand[b] === 1e-12 ? smooth[b] : noiseBand[b], smooth[b]));
    }
    // Changes far below the recent loudest level in a band are not notes: a ringing string wobbles down there.
    for (let b = 0; b < NB; b++) {
      const e = linE[row + b];
      peakBand[b] = e > peakBand[b] ? e : peakBand[b] * 0.997;
      // With speakers, the band's echo and its ring in the room set a floor too. The room model only reaches a
      // tenth of a second, so the end of a drum hit's ring comes back uncancelled; it must not look like a note.
      const y = linY[row + b];
      ringBand[b] = y > ringBand[b] ? y : ringBand[b] * RING;
      logE[row + b] = Math.log10(e + 6 * noiseBand[b] + 3e-4 * peakBand[b] + leakLevel * leakLevel * ringBand[b] + 1e-13);
    }
    frameDb[frame % H] = fdb;
    levelDb = fdb > levelDb ? fdb : 0.9 * levelDb + 0.1 * fdb;

    // The rise in each band against two frames back (and its neighbours there, so vibrato does not count).
    let d = 0;
    if (frame >= 2) {
      const prev = ((frame - 2) % H) * NB;
      for (let b = 0; b < NB; b++) {
        let ref = logE[prev + b];
        if (b > 0) ref = Math.max(ref, logE[prev + b - 1]);
        if (b < NB - 1) ref = Math.max(ref, logE[prev + b + 1]);
        const rise = logE[row + b] - ref;
        if (rise > 0) d += rise;
      }
    }
    odf[frame % H] = d;
    if (probe) probe({ frame, odf: d, db: fdb, noiseDb });

    // Band hits, seen in the estimated echo. They are looked at a few frames later (see hitLeft).
    let yr = 0;
    if (cancelling && frame >= 2) {
      const old = ((frame - 2) % H) * NB;
      for (let b = 0; b < NB; b++) yr += Math.max(0, linY[row + b] - linY[old + b]);
    }
    yOdf[frame % H] = yr;
    if (cancelling && canceller.ready && frame >= 12) {
      const c0 = frame - 4;
      const v = yOdf[c0 % H];
      let top = v > 0;
      for (let j = c0 - 3; j <= c0 + 3 && top; j++) if (j !== c0 && yOdf[j % H] > v) top = false;
      echoRise = v > echoRise ? v : echoRise * 0.999;
      if (top && v > 0.05 * echoRise) hitLeft(c0);
    }

    // A peak three frames ago, now that the frames after it are known.
    const c = frame - 3;
    if (c >= 24) {
      const v = odf[c % H];
      let isPeak = true;
      for (let j = c - 3; j <= c + 3; j++) if (j !== c && odf[j % H] > v) isPeak = false;
      if (isPeak) {
        const past = [];
        for (let j = c - 22; j <= c - 3; j++) past.push(odf[j % H]);
        past.sort((a, b) => a - b);
        const med = past[past.length >> 1];
        const need = (1.2 + 2.5 * med) / sensitivity;
        if (v > need) candidate(c, v);
      }
    }
    frame++;
    stats.frames = frame;
  }

  const candidates = [];
  function candidate(f, strength) {
    candidates.push({ f, strength });
  }

  /**
   * Finds the exact start of a note in the cleaned waveform, near frame f.
   * The pick or finger makes a short bright click, so the search first looks at the top of the spectrum only,
   * where a previous note that is still ringing is weak. If nothing stands out there, it looks at the fuller sound.
   */
  function refine(f) {
    const a = Math.max(0, f * hop - 2 * hop);
    const b = Math.min(cleanEnd - 1, f * hop + size + Math.round(0.004 * rate));
    const pre = Math.max(2, a - Math.round(0.012 * rate));
    const hold = Math.max(1, Math.round(0.0005 * rate));
    const n = b - pre + 1;
    if (n < 64) return null;
    const preN = a - pre;
    const span = Math.round(0.0015 * rate);
    const raw = new Float32Array(n);
    const env = new Float32Array(n);
    const mask = new Float32Array(n);
    // What is left of a band hit after the subtraction can be this large (as a share of the hit itself).
    const left = cancelling ? leak : 0;
    let vetoed = false;
    const wide = Math.round(0.001 * rate);
    let at = -1;
    for (const order of [2, 1]) {
      const filter = (buf, i) => {
        const x0 = buf[(pre + i) & MASK];
        const x1 = buf[(pre + i - 1) & MASK];
        const x2 = buf[(pre + i - 2) & MASK];
        return Math.abs(order === 2 ? x0 - 1.9 * x1 + 0.9025 * x2 : x0 - 0.95 * x1);
      };
      for (let i = 0; i < n; i++) raw[i] = filter(clean, i);
      // A running maximum over half a millisecond: keeps the rising edge exact and fills the gaps between cycles.
      for (let i = 0; i < n; i++) {
        let m = raw[i];
        for (let j = 1; j <= hold && i - j >= 0; j++) if (raw[i - j] > m) m = raw[i - j];
        env[i] = m;
      }
      // The same for the estimated echo, held a little wider: where the band hits, the bar is raised, so a
      // leftover drum hit just before a guitar note is not taken for the start of the note.
      if (left > 0) {
        for (let i = 0; i < n; i++) raw[i] = filter(echoWave, i);
        for (let i = 0; i < n; i++) {
          let m = 0;
          const a0 = Math.max(0, i - 3 * wide);
          const b0 = Math.min(n - 1, i + wide);
          for (let j = a0; j <= b0; j++) if (raw[j] > m) m = raw[j];
          mask[i] = m * left;
        }
      }
      let floor = 0;
      if (preN > 8) {
        const list = Array.from(env.subarray(0, preN)).sort((x, y) => x - y);
        floor = list[Math.floor(list.length * 0.9)];
      }
      let peak = 0;
      let peakAt = preN;
      for (let i = preN; i < n; i++) {
        if (env[i] > peak) {
          peak = env[i];
          peakAt = i;
        }
      }
      if (peak <= 2.5 * floor + 1e-7) continue;
      const thr = floor + 0.2 * (peak - floor);
      for (let i = preN; i <= peakAt; i++) {
        if (env[i] <= thr) continue;
        if (env[i] <= mask[i]) {
          vetoed = true;
          continue;
        }
        // It has to stay up: a single tick before the note does not count.
        let s = 0;
        const end = Math.min(n, i + span);
        for (let j = i; j < end; j++) s += env[j];
        if (s / (end - i) > 0.7 * thr) {
          at = i;
          break;
        }
      }
      if (at >= 0) {
        const low = floor + 0.06 * (peak - floor);
        let back = Math.round(0.001 * rate);
        while (back-- > 0 && at > 0 && env[at - 1] > low) at--;
        break;
      }
    }
    // Too soft to place: use the middle of the frame where the energy rose. Good to about half a frame.
    const sample = at >= 0 ? pre + at : f * hop + half - hop;
    // Loudness of the first 30 ms.
    let sq = 0;
    const len = Math.min(Math.round(0.03 * rate), cleanEnd - sample);
    for (let i = 0; i < len; i++) {
      const x = clean[(sample + i) & MASK];
      sq += x * x;
    }
    // With speakers: a "note" that is much quieter than the band's echo at that moment is a leftover of the band.
    let drowned = false;
    if (cancelling) {
      let sy = 0;
      for (let i = 0; i < len; i++) sy += echoWave[(sample + i) & MASK] ** 2;
      drowned = sq < leakLevel * leakLevel * sy;
    }
    return { sample, precise: at >= 0, level: db(sq / Math.max(1, len)), masked: (at < 0 && vetoed) || drowned };
  }

  const sharp = (buf, i) => Math.abs(buf[i & MASK] - 1.9 * buf[(i - 1) & MASK] + 0.9025 * buf[(i - 2) & MASK]);

  /**
   * At a band hit near frame f: how large is the click left in the cleaned sound, as a share of the click in
   * the estimated echo? Most band hits do not fall on a guitar note, so the lower part of these shares is what
   * the leftovers alone look like. That sets how much of a band hit the note finder has to look past.
   */
  function hitLeft(f) {
    const a = Math.max(2, f * hop - hop);
    const b = Math.min(cleanEnd - 1, f * hop + size);
    let top = 0;
    let at = a;
    for (let i = a; i <= b; i++) {
      const v = sharp(echoWave, i);
      if (v > top) {
        top = v;
        at = i;
      }
    }
    if (top < 1e-7) return;
    const w = Math.round(0.0015 * rate);
    let c = 0;
    for (let i = Math.max(a, at - w); i <= Math.min(b, at + w); i++) c = Math.max(c, sharp(clean, i));
    // The same for loudness: the 30 ms after the hit, cleaned against estimated echo.
    const len = Math.min(Math.round(0.03 * rate), cleanEnd - at);
    let sc = 0;
    let sy = 0;
    for (let i = 0; i < len; i++) {
      sc += clean[(at + i) & MASK] ** 2;
      sy += echoWave[(at + i) & MASK] ** 2;
    }
    const slot = ratioN++ % ratios.length;
    ratios[slot] = c / top;
    levels[slot] = Math.sqrt(sc / (sy + 1e-20));
    const n = Math.min(ratioN, ratios.length);
    const part = (arr, q) => Array.from(arr.subarray(0, n)).sort((x, y) => x - y)[Math.floor(n * q)];
    // A note has to stand clear of the leftovers: well above the usual ones, and never below a fixed share of
    // the band hit itself, so a hit that happens to cancel badly is still not a note.
    leak = Math.min(0.7, Math.max(0.12, 4 * part(ratios, 0.35)));
    // Loudness is judged at the quietest hits: with a guitar sustaining, the rest are mostly guitar.
    leakLevel = Math.min(0.6, Math.max(0.2, 4 * part(levels, 0.12)));
  }

  function settle() {
    // Candidates become onsets once the cleaned waveform around them is complete.
    while (candidates.length && cleanEnd >= candidates[0].f * hop + size + Math.round(0.006 * rate)) {
      const c = candidates.shift();
      const r = refine(c.f);
      if (!r) continue;
      if (r.sample - lastOnsetSample < minGap * rate) continue;
      // A start that could not be placed exactly needs stronger evidence to count as a note at all.
      // With speakers: a start with no click of its own, right where the band hits, is the band.
      let onHit = false;
      if (cancelling && !r.precise) for (let j = c.f - 3; j <= c.f + 3; j++) if (yOdf[(j + H) % H] > 0.05 * echoRise) onHit = true;
      if (r.level < noiseDb + 9 || (!r.precise && c.strength < 2.0) || r.masked || onHit) {
        stats.dropped++;
        continue;
      }
      if (loud.length >= 8) {
        const top = [...loud].sort((x, y) => y - x)[Math.floor(loud.length * 0.1)];
        if (r.level < top - 32) {
          stats.dropped++;
          continue;
        }
      }
      loud.push(r.level);
      if (loud.length > 64) loud.shift();
      lastOnsetSample = r.sample;
      if (pending.length) pending[pending.length - 1].next = r.sample;
      pending.push({ ...r, strength: c.strength, next: null });
    }
    // Onsets get their pitch once enough of the note has been heard, or the next note has begun.
    const wait = Math.round(0.115 * rate);
    while (pending.length) {
      const p = pending[0];
      const until = p.next !== null ? Math.min(p.next - Math.round(0.004 * rate), p.sample + wait) : p.sample + wait;
      if (p.next === null && cleanEnd < until) break;
      if (cleanEnd < Math.min(until, p.sample + wait)) break;
      pending.shift();
      const from = p.sample + Math.round(0.008 * rate);
      const room = until - from;
      const W = room >= 2048 ? 2048 : room >= 1024 ? 1024 : 0;
      let midi = null;
      let clarity = 0;
      if (W) {
        const buf = new Float32Array(W);
        const reads = [];
        for (let s = from; s + W <= until && reads.length < 4; s += 768) {
          for (let i = 0; i < W; i++) buf[i] = clean[(s + i) & MASK];
          const r = detectPitch(buf, rate, { fmin: W === 2048 ? 70 : 110 });
          if (r && r.clarity >= 0.8) reads.push(r);
        }
        if (reads.length) {
          const ms = reads.map((r) => hzToMidi(r.hz)).sort((x, y) => x - y);
          midi = ms[ms.length >> 1];
          clarity = Math.max(...reads.map((r) => r.clarity));
        }
      }
      stats.onsets++;
      out.push({ t: (base + p.sample) / rate, sample: base + p.sample, level: p.level, strength: p.strength, precise: p.precise, midi, clarity });
    }
  }

  function trackDelay(micBlock, refBlock) {
    tracker.push(micBlock, refBlock);
    const r = tracker.get();
    if (r.locked && r.seconds !== null) {
      const changed = roundTrip === null || Math.abs(r.seconds - roundTrip) > 0.0007;
      if (changed) {
        roundTrip = r.seconds;
        refShift = Math.max(0, Math.round(r.seconds * rate) - Math.round(0.002 * rate));
        canceller.reset();
        cancelling = true;
        if (lockedAt === null) lockedAt = written;
        tracker.setNear(r.seconds);
      }
      mode = "speakers";
      quietBlocks = 0;
    } else if (r.blocks !== undefined && !r.heard) {
      // The band is playing and the microphone does not hear it: headphones, or a plugged-in guitar.
      if (r.blocks !== trackDelay.last) quietBlocks++;
      if (quietBlocks >= 3 && mode !== "speakers") mode = "headphones";
    }
    trackDelay.last = r.blocks;
  }

  return {
    rate,
    /**
     * Feed sound. `mic` and `ref` are the same length; `ref` is what the page sent to the speakers (or null).
     * `startFrame` is the audio-clock frame of the first sample. Returns the notes that are ready.
     */
    push(mic, ref, startFrame) {
      if (base === null) base = startFrame;
      let at = startFrame - base;
      if (at !== written) {
        if (at > written && at - written < rate) {
          // A short gap (a dropped block): fill it with silence.
          for (let i = written; i < at; i++) {
            micRing[i & MASK] = 0;
            refRing[i & MASK] = 0;
          }
          written = at;
        } else if (at < written) {
          const skip = written - at;
          if (skip >= mic.length) return [];
          mic = mic.subarray(skip);
          ref = ref ? ref.subarray(skip) : null;
          at = written;
        } else {
          // A long gap: start again from here.
          base = startFrame;
          written = 0;
          frame = 0;
          cleanEnd = 0;
          canceller.reset();
          candidates.length = 0;
          pending.length = 0;
          lastOnsetSample = -1e9;
          at = 0;
        }
      }
      for (let i = 0; i < mic.length; i++) {
        micRing[(written + i) & MASK] = mic[i];
        refRing[(written + i) & MASK] = ref ? ref[i] : 0;
      }
      written += mic.length;
      if (ref) trackDelay(mic, ref);
      cleanUp(written);
    while (frame * hop + size <= cleanEnd) doFrame();
      settle();
      return out.splice(0);
    },
    /** What the ear knows about the room. */
    get state() {
      return {
        mode,
        roundTrip,
        cancelling,
        ready: !cancelling || canceller.ready,
        lockedAt: lockedAt === null || base === null ? null : (base + lockedAt) / rate,
        levelDb,
        noiseDb,
        leak,
        leakLevel,
        leftovers: Array.from(ratios.subarray(0, Math.min(ratioN, ratios.length))).sort((x, y) => x - y),
        confidence: tracker.get().confidence,
        ...stats,
      };
    },
    /** Use a known round trip (seconds), for example one measured with the sweep. */
    setDelay(seconds) {
      roundTrip = seconds;
      refShift = Math.max(0, Math.round(seconds * rate) - Math.round(0.002 * rate));
      canceller.reset();
      cancelling = true;
      mode = "speakers";
      tracker = createDelayTracker({ rate, near: seconds });
    },
  };
}
