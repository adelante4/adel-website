// Preparing sounds for the MPC project: trim tails, make the project loud without clipping.
// No Web Audio in here, so Node can test it. Channels are arrays of Float32Array (mono or stereo).
//
// Why: the band is scaled so its loudest moment peaks at -1 dBFS, and a sparse band has a big gap between its
// peaks and its average (about 22 dB), so the loops and the one-shots are quiet. A sampler has no limiter we can
// switch on from the project file, so the loudness is built into the sounds: each one-shot is peak-limited and
// lifted, the project's sum is simulated, and a limiter driven by that sum is applied to the chords and the bass.

const db = (x) => 20 * Math.log10(Math.max(x, 1e-9));
const lin = (d) => 10 ** (d / 20);

export function peakOf(chans) {
  let p = 0;
  for (const c of chans) for (let i = 0; i < c.length; i++) p = Math.max(p, Math.abs(c[i]));
  return p;
}

export function rmsOf(chans) {
  let s = 0;
  let n = 0;
  for (const c of chans) {
    for (let i = 0; i < c.length; i++) s += c[i] * c[i];
    n += c.length;
  }
  return n ? Math.sqrt(s / n) : 0;
}

/**
 * Cut a one-shot where it has died away, and fade the cut. Everything quieter than `floorDb` below the loudest
 * part is the noise floor of the recording: on its own, on a sampler turned up, it is the hiss you hear.
 */
export function trimTail(chans, rate, { floorDb = -48, minSec = 0.1 } = {}) {
  const n = chans[0].length;
  const win = Math.max(1, Math.round(rate * 0.01));
  const nw = Math.ceil(n / win);
  const env = new Float32Array(nw);
  for (let w = 0; w < nw; w++) {
    let s = 0;
    let k = 0;
    for (let i = w * win; i < Math.min(n, (w + 1) * win); i++) for (const c of chans) (s += c[i] * c[i]), k++;
    env[w] = Math.sqrt(s / Math.max(1, k));
  }
  const top = env.reduce((a, b) => Math.max(a, b), 0);
  if (top === 0) return chans;
  const thr = top * lin(floorDb);
  let last = nw - 1;
  while (last > 0 && env[last] < thr) last--;
  const end = Math.min(n, Math.max(Math.round(minSec * rate), (last + 1) * win + Math.round(0.02 * rate)));
  const fade = Math.min(end, Math.max(Math.round(0.02 * rate), Math.min(Math.round(0.2 * rate), Math.round(0.3 * end))));
  return chans.map((c) => {
    const o = c.slice(0, end);
    for (let k = 0; k < fade; k++) o[end - fade + k] *= 0.5 * (1 + Math.cos((Math.PI * (k + 1)) / fade));
    return o;
  });
}

/**
 * A look-ahead peak limiter's gain, one value per sample, so that `signal * gain` never passes `ceil`.
 * Look-ahead minimum, then a moving average (no clicks on the way in), then an exponential release.
 * With `wrap` the end of the signal leads into its start, so a loop has no seam.
 */
export function limiterGain(chans, { ceil, rate, look = 0.004, rel = 0.15, wrap = false }) {
  const n = chans[0].length;
  const pad = wrap ? Math.min(n, Math.round(rate * 0.5)) : 0;
  const m = n + 2 * pad;
  const need = new Float32Array(m);
  for (let i = 0; i < m; i++) {
    const j = wrap ? (((i - pad) % n) + n) % n : i;
    let a = 0;
    for (const c of chans) a = Math.max(a, Math.abs(c[j]));
    need[i] = a > ceil ? ceil / a : 1;
  }
  const w = Math.max(1, Math.round(look * rate));
  // Minimum over [i-2w, i+2w] with a monotone queue.
  const mn = new Float32Array(m);
  const q = new Int32Array(m);
  let head = 0;
  let tail = 0;
  for (let r = 0; r < m + 2 * w; r++) {
    if (r < m) {
      while (tail > head && need[q[tail - 1]] >= need[r]) tail--;
      q[tail++] = r;
    }
    const c = r - 2 * w;
    if (c >= 0) {
      while (q[head] < c - 2 * w) head++;
      mn[c] = need[q[head]];
    }
  }
  // Moving average over [i-w, i+w]: the result is still at or under `need` everywhere.
  const sum = new Float64Array(m + 1);
  for (let i = 0; i < m; i++) sum[i + 1] = sum[i] + mn[i];
  const sm = new Float32Array(m);
  for (let i = 0; i < m; i++) {
    const a = Math.max(0, i - w);
    const b = Math.min(m - 1, i + w);
    sm[i] = (sum[b + 1] - sum[a]) / (b - a + 1);
  }
  const k = Math.exp(-1 / (rel * rate));
  const out = new Float32Array(n);
  let s = 1;
  for (let i = 0; i < m; i++) {
    s = sm[i] < s ? sm[i] : sm[i] + (s - sm[i]) * k;
    if (i >= pad && i < pad + n) out[i - pad] = s;
  }
  return out;
}

export const applyGain = (chans, g, k = 1) => chans.map((c) => c.map((x, i) => x * g[i] * k));

/** Put the hits on a loop of `n` samples. A tail that runs past the end wraps round to the start, as it does on the MPC. */
export function mixHits(n, hits, shots, channels = 2) {
  const out = Array.from({ length: channels }, () => new Float32Array(n));
  for (const h of hits) {
    const shot = shots.get(h.pad);
    if (!shot) continue;
    const t = Math.min(n - 1, Math.max(0, Math.round(h.time)));
    for (let ch = 0; ch < channels; ch++) {
      const src = shot[Math.min(ch, shot.length - 1)];
      const dst = out[ch];
      for (let i = 0; i < src.length; i++) dst[(t + i) % n] += src[i] * h.vel;
    }
  }
  return out;
}

const sumOf = (parts, n, channels = 2) => {
  const out = Array.from({ length: channels }, () => new Float32Array(n));
  for (const p of parts) for (let ch = 0; ch < channels; ch++) for (let i = 0; i < n; i++) out[ch][i] += p[Math.min(ch, p.length - 1)][i];
  return out;
};

/**
 * @param {{n: number, rate: number, shots: Map<number, Float32Array[]>, hits: {time: number, pad: number, vel: number}[],
 *          bed: Float32Array[][], loud?: boolean, shotsDb?: number, bedDb?: number}} o
 *   n: loop length in samples; time: seconds from the start; vel: 0-1 as the sequence plays it (pad velocity, assumed linear)
 * @returns {{shots: Map<number, Float32Array[]>, bed: Float32Array[][], stats: {beforeRmsDb: number, afterRmsDb: number, peakDb: number, duckDb: number}}}
 */
export function masterProject({ n, rate, shots, hits, bed, loud = true, shotsDb = 6, bedDb = 8 }) {
  const placed = hits.map((h) => ({ pad: h.pad, vel: h.vel, time: h.time * rate }));
  const before = sumOf([...bed, mixHits(n, placed, shots)], n);
  const stats = { beforeRmsDb: db(rmsOf(before)), afterRmsDb: db(rmsOf(before)), peakDb: db(peakOf(before)), duckDb: 0 };
  if (!loud) return { shots, bed, stats };
  const kShot = lin(shotsDb);
  const kBed = lin(bedDb);
  const outShots = new Map();
  for (const [pad, chans] of shots) {
    const lifted = chans.map((c) => c.map((x) => x * kShot));
    outShots.set(pad, applyGain(lifted, limiterGain(lifted, { ceil: 0.55, rate, look: 0.002, rel: 0.05 })));
  }
  const drums = mixHits(n, placed, outShots);
  const lifted = bed.map((b) => b.map((c) => c.map((x) => x * kBed)));
  const g = limiterGain(sumOf([...lifted, drums], n), { ceil: 0.85, rate, wrap: true });
  const outBed = lifted.map((b) => applyGain(b, g));
  const after = sumOf([...outBed, drums], n);
  let low = 1;
  for (let i = 0; i < n; i++) low = Math.min(low, g[i]);
  stats.afterRmsDb = db(rmsOf(after));
  stats.peakDb = db(peakOf(after));
  stats.duckDb = -db(low);
  return { shots: outShots, bed: outBed, stats };
}
