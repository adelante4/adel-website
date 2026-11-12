// Time feel: what the notes of a take say about where you sit against the band. Pure code.
//
// The measures here are the ones used in the research on recorded jazz solos, so a take can be read the same way:
//   - Downbeat delay and offbeat delay. A "downbeat" is the first eighth of a beat, an "offbeat" the second.
//     On records, soloists tend to place downbeats a little after the rhythm section and offbeats with it
//     (Friberg & Sundström 2002; Nelias et al. 2022: about 30 ms, or 9% of a beat, at medium tempos, and less
//     as the tempo rises). Delaying both alike did not raise swing ratings in the Nelias experiment.
//   - Swing ratio (beat-upbeat ratio, Benadon 2006): the long eighth divided by the short one, taken from each
//     downbeat-offbeat pair. Most recorded soloists are below 1.5:1 (Nelias et al. 2022); drummers go from
//     about 3.5:1 at slow tempos to 1:1 at fast ones (Friberg & Sundström 2002).
//   - Spread: how far single notes scatter around your own average. This is consistency, apart from placement.
// Added for practice: which beat of the bar is early or late, drift over the take, what happens in bars where
// the band is silent, the loudness of offbeats against downbeats, and how the take is paced (phrases and rests).
//
// Every average comes with its uncertainty. A statement is only marked `sure` when the average is at least twice
// its standard error away from zero and there are enough notes, so a report does not teach from noise.
import { barPlays } from "./overlay.js?v=20261112b";

const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const median = (a) => {
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Mean, spread and standard error, after dropping values far from the middle (3 scaled median deviations). */
export function summarize(values, minN = 6) {
  if (!values.length) return { n: 0, mean: 0, sd: 0, se: Infinity, sure: false, outliers: 0 };
  const med = median(values);
  const mad = median(values.map((v) => Math.abs(v - med))) * 1.4826;
  const kept = mad > 0 ? values.filter((v) => Math.abs(v - med) <= 3 * mad + 1e-9) : values;
  const m = mean(kept);
  const sd = kept.length > 1 ? Math.sqrt(kept.reduce((s, v) => s + (v - m) ** 2, 0) / (kept.length - 1)) : 0;
  const se = kept.length > 1 ? sd / Math.sqrt(kept.length) : Infinity;
  return { n: kept.length, mean: m, sd, se, low: m - 1.96 * se, high: m + 1.96 * se, sure: kept.length >= minN && Math.abs(m) > 2 * se, outliers: values.length - kept.length };
}

/** Least-squares slope of y against x, with its standard error. */
function slope(xs, ys) {
  const n = xs.length;
  if (n < 8) return { n, slope: 0, se: Infinity, sure: false };
  const mx = mean(xs);
  const my = mean(ys);
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    sxx += (xs[i] - mx) ** 2;
    sxy += (xs[i] - mx) * (ys[i] - my);
  }
  if (sxx < 1e-12) return { n, slope: 0, se: Infinity, sure: false };
  const b = sxy / sxx;
  let rss = 0;
  for (let i = 0; i < n; i++) rss += (ys[i] - my - b * (xs[i] - mx)) ** 2;
  const se = Math.sqrt(rss / (n - 2) / sxx);
  return { n, slope: b, se, sure: Math.abs(b) > 2 * se };
}

/**
 * @param {{beat:number, level?:number, precise?:boolean}[]} notes  beat is counted from the start, bar 0 beat 0
 *   is 0, and already corrected for latency
 * @param {{beats:number, feel:number, msPerBeat:(beat:number)=>number, practice:object, bpmAt?:(beat:number)=>number}} ctx
 *   feel: where the band puts the offbeat inside the beat (0.5 straight, 0.667 triplet swing)
 */
export function analyzeTiming(notes, ctx) {
  const { beats, feel, msPerBeat, practice } = ctx;
  const swung = feel >= 0.56;
  const upLo = swung ? 0.45 : 0.4;
  const upHi = swung ? 0.82 : 0.6;
  const rows = [];
  for (const n of notes) {
    const bar = Math.floor(n.beat / beats);
    if (bar < practice.countIn) continue;
    const nearest = Math.round(n.beat);
    const d = n.beat - nearest;
    const f = n.beat - Math.floor(n.beat);
    const ms = msPerBeat(n.beat);
    let kind = "other";
    let off = 0;
    let slot = 0;
    if (Math.abs(d) <= 0.18) {
      kind = "down";
      off = d * ms;
      slot = ((nearest % beats) + beats) % beats;
    } else if (f >= upLo && f <= upHi) {
      kind = "up";
      off = (f - feel) * ms;
      slot = ((Math.floor(n.beat) % beats) + beats) % beats;
    }
    const whichBar = kind === "down" ? Math.floor(nearest / beats) : bar;
    const plays = barPlays(practice, whichBar);
    rows.push({ beat: n.beat, grid: kind === "down" ? nearest : Math.floor(n.beat) + feel, bar: whichBar, kind, slot, ms: off, perBeat: ms, level: n.level ?? null, precise: n.precise !== false, withBand: plays.click || plays.groove || plays.harmony });
  }
  const timed = rows.filter((r) => r.kind !== "other" && r.precise);
  const withBand = timed.filter((r) => r.withBand);
  const down = withBand.filter((r) => r.kind === "down");
  const up = withBand.filter((r) => r.kind === "up");
  const sDown = summarize(down.map((r) => r.ms));
  const sUp = summarize(up.map((r) => r.ms));
  const sAll = summarize(withBand.map((r) => r.ms));
  const typicalMs = withBand.length ? median(withBand.map((r) => r.perBeat)) : 0;

  // Each beat of the bar against your own average: "beat 4 is early" means early for you.
  const byBeat = [];
  for (let b = 0; b < beats; b++) {
    const s = summarize(down.filter((r) => r.slot === b).map((r) => r.ms - sDown.mean), 8);
    byBeat.push({ beat: b + 1, ...s, sure: s.sure && Math.abs(s.mean) >= 5 });
  }

  // Swing: every downbeat note followed by an offbeat note in the same beat.
  const pairs = [];
  const levelGaps = [];
  const sorted = [...rows].sort((a, b) => a.beat - b.beat);
  for (let i = 0; i + 1 < sorted.length; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    if (a.kind !== "down" || b.kind !== "up" || !a.withBand) continue;
    if (Math.floor(b.beat) !== Math.round(a.beat)) continue;
    const share = b.beat - a.beat;
    if (share <= 0.2 || share >= 0.9) continue;
    if (a.precise && b.precise) pairs.push(share);
    if (a.level !== null && b.level !== null) levelGaps.push(b.level - a.level);
  }
  const sShare = summarize(pairs, 6);
  const ratio = (x) => x / (1 - x);
  const swing = {
    n: sShare.n,
    share: sShare.mean,
    ratio: sShare.n ? ratio(sShare.mean) : null,
    low: sShare.n > 1 ? ratio(sShare.low) : null,
    high: sShare.n > 1 ? ratio(sShare.high) : null,
    band: ratio(feel),
    enough: sShare.n >= 6,
  };
  // Offbeats louder or softer than the downbeats before them, in dB.
  const accent = summarize(levelGaps, 8);

  // Drift over the take, in ms per minute of playing.
  const perBeatMin = typicalMs ? 60000 / typicalMs : 0;
  const dr = slope(down.map((r) => r.beat), down.map((r) => r.ms));
  const drift = { ...dr, msPerMinute: dr.slope * perBeatMin };

  // Bars where the band is silent (the gap trainer): how far you have moved by each silent bar.
  let silence = null;
  if (practice.gap) {
    const { audible, silent } = practice.gap;
    const quiet = timed.filter((r) => !r.withBand && r.kind === "down");
    const byBar = [];
    for (let k = 0; k < silent; k++) {
      const s = summarize(quiet.filter((r) => (r.bar - practice.countIn) % (audible + silent) === audible + k).map((r) => r.ms - sDown.mean), 4);
      byBar.push({ bar: k + 1, ...s });
    }
    const all = summarize(quiet.map((r) => r.ms - sDown.mean), 6);
    const sl = slope(quiet.map((r) => ((r.bar - practice.countIn) % (audible + silent)) - audible + (r.grid / beats - Math.floor(r.grid / beats))), quiet.map((r) => r.ms));
    silence = { n: quiet.length, byBar, shift: all, msPerBar: sl.slope, sure: sl.sure };
  }

  // Tempo by tempo (the ladder).
  let byTempo = [];
  if (ctx.bpmAt) {
    const groups = new Map();
    for (const r of withBand) {
      const bpm = Math.round(ctx.bpmAt(r.beat));
      if (!groups.has(bpm)) groups.set(bpm, []);
      groups.get(bpm).push(r.ms);
    }
    byTempo = [...groups.entries()].sort((a, b) => a[0] - b[0]).map(([bpm, v]) => ({ bpm, ...summarize(v, 8) }));
  }

  return {
    notes: rows.length,
    timed: withBand.length,
    other: rows.filter((r) => r.kind === "other").length,
    unplaced: rows.filter((r) => r.kind !== "other" && !r.precise).length,
    msPerBeat: typicalMs,
    swung,
    all: sAll,
    down: { ...sDown, percent: typicalMs ? (sDown.mean / typicalMs) * 100 : 0 },
    up: { ...sUp, percent: typicalMs ? (sUp.mean / typicalMs) * 100 : 0 },
    byBeat,
    swing,
    accent,
    drift,
    silence,
    byTempo,
    points: withBand.map((r) => ({ beat: r.beat, bar: r.bar, kind: r.kind, slot: r.slot, ms: r.ms })),
  };
}

/**
 * How the take is paced: phrases and the rests between them.
 * A phrase ends when nothing is played for `rest` beats (one and a half by default).
 */
export function analyzePacing(notes, { beats, countIn = 0, rest = 1.5, totalBeats = null } = {}) {
  const list = notes.filter((n) => n.beat >= countIn * beats).sort((a, b) => a.beat - b.beat);
  if (list.length < 2) return { phrases: [], count: 0 };
  const phrases = [];
  let start = list[0].beat;
  let last = start;
  let count = 1;
  const close = () => phrases.push({ start, end: last, notes: count, length: last - start + 0.5 });
  for (let i = 1; i < list.length; i++) {
    const b = list[i].beat;
    if (b - last >= rest) {
      close();
      start = b;
      count = 0;
    }
    last = b;
    count++;
  }
  close();
  const from = countIn * beats;
  const span = (totalBeats ?? last) - from;
  const playing = phrases.reduce((s, p) => s + p.length, 0);
  // Where phrases begin and end, in eighths of the bar (0 is beat 1, 1 is the "and" of 1, ...).
  const eighth = (b) => ((Math.round((b - Math.floor(b / beats) * beats) * 2) % (beats * 2)) + beats * 2) % (beats * 2);
  const starts = new Array(beats * 2).fill(0);
  const ends = new Array(beats * 2).fill(0);
  for (const p of phrases) {
    starts[eighth(p.start)]++;
    ends[eighth(p.end)]++;
  }
  const lengths = phrases.map((p) => p.length);
  return {
    phrases,
    count: phrases.length,
    restShare: span > 0 ? Math.max(0, 1 - playing / span) : 0,
    medianLength: median(lengths),
    longest: Math.max(...lengths),
    starts,
    ends,
    startOnOne: starts[0] / phrases.length,
    startOnBeat: starts.filter((_, i) => i % 2 === 0).reduce((s, x) => s + x, 0) / phrases.length,
    endOnOffbeat: ends.filter((_, i) => i % 2 === 1).reduce((s, x) => s + x, 0) / phrases.length,
    notesPerBeat: playing > 0 ? list.length / playing : 0,
  };
}
