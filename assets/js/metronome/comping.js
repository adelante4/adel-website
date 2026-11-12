// Turns a chord form into keyboard hits.
//
// generateHarmony(harmony, pattern, practice, fromBeat, toBeat) returns the events whose
// position falls in [fromBeat, toBeat). Like the click generator it works in beats and is
// repeatable: the same range gives the same events, and splitting a range changes nothing.
import { slotRng } from "./prng.js?v=20261112a";
import { barPlays } from "./overlay.js?v=20261112a";
import { voiceChords, parseChord } from "./chords.js?v=20261112a";
import { classOf } from "./analysis.js?v=20261112a";

export const COMP_STYLES = [
  "sustain", "on1", "charleston", "push", "twofeel", "bossa", "arp",
  "freddie", "latepush", "anticipate", "bossaclave", "rumba", "ecm", "twostep", "hama1", "hama2", "groups", "hemiola",
  "dcharleston", "offbeat", "dilla", "afro", "quint", "septet",
  "mixed", "arc", "cadence", "develop",
];
/** The comp choices that pick a rhythm for each bar (or chord) instead of being one. */
export const MIX_STYLES = ["mixed", "arc", "cadence", "develop"];
const MIXED_POOL = ["on1", "charleston", "push", "twofeel"];
const MAX_NUDGE_BEATS = 0.04;

/** Table of 2s and 3s that fill `n` counted beats, the way odd-meter players count them. */
const GROUPS = { 1: [1], 2: [2], 3: [3], 4: [2, 2], 5: [3, 2], 6: [3, 3], 7: [2, 2, 3], 8: [3, 3, 2], 9: [3, 3, 3], 10: [2, 3, 2, 3], 11: [3, 3, 3, 2], 12: [3, 3, 3, 3], 16: [4, 4, 4, 4] };
export function groupsFor(n) {
  n = Math.max(1, Math.floor(n));
  if (GROUPS[n]) return GROUPS[n];
  const g = Array(Math.floor(n / 3)).fill(3);
  const r = n % 3;
  if (r === 1) g.splice(g.length - 1, 1, 2, 2);
  else if (r === 2) g.push(2);
  return g;
}

/** Hits at the given positions (in beats) that fall inside the chord. */
function cells(at, span, dur, vels) {
  const out = [];
  at.forEach((a, i) => {
    if (a < span) out.push({ at: a, dur: Math.min(dur, span - a), vel: vels[i % vels.length] });
  });
  return out.length ? out : [{ at: 0, dur: Math.min(span, dur), vel: 1 }];
}

const HEMIOLA_BEATS = 1.5;

/** A steady pulse of `step` beats that ignores bar lines, so it drifts against the bar and comes back. */
function pulseHits(step, span, bar, beats, start) {
  const abs = bar * beats + start;
  const first = (step - (abs % step)) % step;
  const hits = [];
  for (let at = first; at < span - 1e-9; at += step) {
    const k = Math.round((abs + at) / step);
    hits.push({ at, dur: Math.min(step * 0.8, span - at), vel: k % 4 === 0 ? 0.95 : k % 2 ? 0.7 : 0.8 });
  }
  return hits.length ? hits : [{ at: 0, dur: Math.min(span, step * 0.8), vel: 0.8 }];
}

/**
 * Hits inside one chord that lasts `span` beats. `at` can be negative: a push before the chord.
 * `late` pushes a hit behind the grid, `roll` spreads the chord low to high (in beats per note).
 * `bar` counts bars since the count-in, `beats` is the bar length and `start` where the chord starts in its bar:
 * together they let a pattern run across bar lines (the hemiola).
 */
export function styleHits(style, span, bar = 0, beats = 4, start = 0) {
  const long = span >= 3;
  switch (style) {
    case "sustain":
      return [{ at: 0, dur: span, vel: 0.8 }];
    case "on1":
      return [{ at: 0, dur: Math.min(span, 2), vel: 1 }];
    case "charleston":
      return long
        ? [{ at: 0, dur: 1, vel: 1 }, { at: 1.5, dur: Math.min(1, span - 1.5), vel: 0.8 }]
        : [{ at: 0, dur: span, vel: 1 }];
    case "push":
      return long
        ? [{ at: -0.5, dur: 1.5, vel: 0.95 }, { at: 2, dur: Math.min(1, span - 2), vel: 0.7 }]
        : [{ at: -0.5, dur: span + 0.5, vel: 0.9 }];
    case "bossa": {
      // The violao clave, two bars long: beat 1, the & of 2 and beat 4, then beats 2 and 3. Short, soft stabs.
      const pick = bar % 2 === 0 ? [[0, 0.9, 0.85], [1.5, 0.45, 0.7], [3, 0.9, 0.75]] : [[1, 0.9, 0.7], [2, 0.9, 0.8]];
      const hits = pick.filter(([at]) => at < span).map(([at, dur, vel]) => ({ at, dur: Math.min(dur, span - at), vel }));
      return hits.length ? hits : [{ at: 0, dur: Math.min(span, 0.9), vel: 0.8 }];
    }
    case "arp": {
      // Eighth notes running up and down through the chord, one note at a time.
      const run = [0, 1, 2, 3, 2, 1];
      const n = Math.max(1, Math.floor(span * 2));
      return Array.from({ length: n }, (_, i) => ({ at: i * 0.5, dur: 0.9, vel: i % 2 ? 0.55 : 0.75, note: run[i % run.length] }));
    }
    case "freddie":
      // Four short, even chops a bar, the way Freddie Green played rhythm guitar with the Basie band.
      return cells(Array.from({ length: Math.max(1, Math.floor(span)) }, (_, i) => i), span, 0.75, [0.72, 0.8]);
    case "latepush":
      return cells([1.5, 3], span, 0.9, [0.9, 0.75]);
    case "anticipate":
      // One chord, played an eighth early so it hangs over the bar line.
      return [{ at: -0.5, dur: span + 0.35, vel: 0.9 }];
    case "bossaclave": {
      // The real bossa clave over two bars: 1, the & of 2 and 4, then 2 and the & of 3.
      const pick = bar % 2 === 0 ? [[0, 0.9, 0.85], [1.5, 0.45, 0.7], [3, 0.9, 0.75]] : [[1, 0.9, 0.7], [2.5, 0.45, 0.8]];
      const hits = pick.filter(([at]) => at < span).map(([at, dur, vel]) => ({ at, dur: Math.min(dur, span - at), vel }));
      return hits.length ? hits : [{ at: 0, dur: Math.min(span, 0.9), vel: 0.8 }];
    }
    case "rumba": {
      // Rumba clave 3-2: 1, the & of 2 and the & of 4, then 2 and 3.
      const pick = bar % 2 === 0 ? [[0, 0.9, 0.85], [1.5, 0.45, 0.7], [3.5, 0.45, 0.8]] : [[1, 0.9, 0.7], [2, 0.9, 0.8]];
      const hits = pick.filter(([at]) => at < span).map(([at, dur, vel]) => ({ at, dur: Math.min(dur, span - at), vel }));
      return hits.length ? hits : [{ at: 0, dur: Math.min(span, 0.9), vel: 0.8 }];
    }
    case "ecm":
      // Sparse and ringing: a rolled chord on 1, then the & of 3 tied over the bar line.
      return long
        ? [{ at: 0, dur: 2.5, vel: 0.8, roll: 0.06 }, { at: 2.5, dur: span - 2.5 + 1.5, vel: 0.6, roll: 0.05 }]
        : [{ at: 0, dur: span + 0.5, vel: 0.8, roll: 0.06 }];
    case "twostep":
      // Broken, UK-garage stabs: 1, the "a" of 2, the & of 3. Sits behind the grid.
      return cells([0, 1.75, 2.5], span, 0.6, [0.85, 0.7, 0.75]).map((h, i) => ({ ...h, late: i === 0 ? 0.03 : 0.07 }));
    case "hama1":
      // 3+3+3+3+2+2 in sixteenths.
      return cells([0, 0.75, 1.5, 2.25, 3, 3.5], span, 0.45, [1, 0.7, 0.8, 0.7, 0.9, 0.65]);
    case "hama2":
      // 3+3+2+3+3+2 in sixteenths.
      return cells([0, 0.75, 1.5, 2, 2.75, 3.5], span, 0.45, [1, 0.7, 0.85, 0.75, 0.7, 0.8]);
    case "groups": {
      // One stab on the start of each group of 2 or 3 counted beats: 5 is 3+2, 7 is 2+2+3, 10 is 2+3+2+3.
      let at = 0;
      const hits = [];
      groupsFor(span).forEach((n, i) => {
        hits.push({ at, dur: n * 0.9, vel: i === 0 ? 1 : 0.8 });
        at += n;
      });
      return hits.filter((h) => h.at < span);
    }
    case "hemiola":
      return pulseHits(HEMIOLA_BEATS, span, bar, beats, start);
    case "quint":
      // A hit every five sixteenths, 5 against 4. Back on the downbeat after 5 bars of 4/4.
      return pulseHits(1.25, span, bar, beats, start);
    case "septet":
      // A hit every seven sixteenths, 7 against 4. Back on the downbeat after 7 bars of 4/4.
      return pulseHits(1.75, span, bar, beats, start);
    case "dcharleston":
      return cells([0, 1.5, 2, 3.5], span, 0.8, [1, 0.8, 0.9, 0.7]);
    case "offbeat":
      // Every & : the skank, and the dub chord.
      return cells([0.5, 1.5, 2.5, 3.5], span, 0.35, [0.75, 0.85]);
    case "dilla":
      // Behind the beat: 1, the a of 2 and the e of 4, all late, like a drummer who is not hurrying.
      return cells([0, 1.75, 3.25], span, 0.6, [0.9, 0.7, 0.75]).map((h, i) => ({ ...h, late: i === 0 ? 0.04 : 0.1 }));
    case "afro":
      // The 12/8 bell across four beats (Afro Blue, Footprints): triplet eighths 0 2 4 5 7 9 11.
      return cells([0, 2 / 3, 4 / 3, 5 / 3, 7 / 3, 3, 11 / 3], span, 0.5, [1, 0.7, 0.8, 0.65, 0.8, 0.7, 0.75]);
    case "twofeel":
      return long
        ? [{ at: 0, dur: 1.9, vel: 1 }, { at: 2, dur: Math.min(1.9, span - 2), vel: 0.8 }]
        : [{ at: 0, dur: span, vel: 1 }];
    default:
      return [{ at: 0, dur: Math.min(span, 2), vel: 1 }];
  }
}

// ---- mixing: ways to move between rhythms that follow the music instead of a dice roll ----

/** From sparse to busy. Each mode below walks these. */
export const DENSITY = [
  ["sustain", "ecm", "anticipate"],
  ["on1", "twofeel", "latepush", "bossaclave"],
  ["charleston", "push", "dcharleston", "twostep", "rumba", "dilla", "offbeat", "freddie"],
  ["hama1", "hama2", "afro", "arp", "hemiola", "quint"],
];
/** Arc: eight bars that build, peak, then breathe before the loop turns. */
const ARC = [0, 1, 1, 2, 2, 3, 3, 1];
/** Cadence: what each kind of chord leans toward. */
const BY_FUNCTION = {
  maj: ["ecm", "on1", "sustain", "twofeel"],
  min: ["charleston", "latepush", "dcharleston", "twostep"],
  hdim: ["latepush", "twostep", "charleston"],
  dim: ["latepush", "twostep"],
  dom: ["push", "anticipate", "latepush", "offbeat"],
};
const MOTIFS = ["charleston", "latepush", "bossaclave", "rumba", "twostep", "hama2", "dcharleston", "afro", "dilla"];

const everyOther = (hits) => {
  const kept = hits.filter((_, i) => i % 2 === 0).map((h) => ({ ...h, dur: h.dur * 1.5 }));
  return kept.length ? kept : hits;
};
const shiftLater = (hits, span) => {
  const moved = hits.map((h) => ({ ...h, at: h.at + 0.5 })).filter((h) => h.at < span);
  return moved.length ? moved : hits;
};
/** How a motif is changed from bar to bar of a four-bar phrase: stated, repeated, displaced, thinned. */
const DEVELOP = [(h) => h, (h) => h, shiftLater, (h) => everyOther(h)];

/**
 * Which rhythm one chord plays, and how it is changed.
 * `mixed` rolls a seeded die each bar. The others have no dice in the pattern itself: `arc` follows a shape over
 * eight bars, `cadence` follows the chord's job (rest on the tonic, lean on the dominant) and `develop` states a
 * motif and then repeats, displaces and thins it. Same inputs, same answer, so a loop does not wander.
 */
export function resolveStyle(comp, { seed = 1, bar = 0, pb = 0, slot = 0, chord = "Cmaj7", form = 4 } = {}) {
  const same = (h) => h;
  if (comp === "mixed") {
    return { style: MIXED_POOL[Math.floor(slotRng(seed, bar, 90, 0)() * MIXED_POOL.length)], xform: same };
  }
  if (comp === "arc") {
    const tier = DENSITY[ARC[((pb % 8) + 8) % 8]];
    return { style: tier[(Math.floor(pb / 8) + pb) % tier.length], xform: same };
  }
  if (comp === "cadence") {
    const q = parseChord(chord)?.quality ?? "maj7";
    const pool = BY_FUNCTION[classOf(q)] ?? BY_FUNCTION.maj;
    return { style: pool[(pb + slot) % pool.length], xform: same };
  }
  if (comp === "develop") {
    const phrase = Math.floor(pb / 4);
    const motif = MOTIFS[Math.floor(slotRng(seed, phrase, 91, 0)() * MOTIFS.length)];
    return { style: motif, xform: DEVELOP[((pb % 4) + 4) % 4] };
  }
  return { style: comp, xform: same };
}

/** The chords of a form in playing order, with where each one starts in its bar. */
export function flattenForm(form, beats) {
  const half = Math.ceil(beats / 2);
  const slots = [];
  form.forEach((bar, b) => {
    if (bar.length === 2) {
      slots.push({ bar: b, k: 0, chord: bar[0], start: 0, span: half });
      slots.push({ bar: b, k: 1, chord: bar[1], start: half, span: beats - half });
    } else {
      slots.push({ bar: b, k: 0, chord: bar[0], start: 0, span: beats });
    }
  });
  return slots;
}

const voicingCache = new Map();
function voicingsFor(slots) {
  const key = slots.map((s) => s.chord).join(",");
  let v = voicingCache.get(key);
  if (!v) {
    v = voiceChords(slots.map((s) => s.chord));
    if (voicingCache.size > 50) voicingCache.clear();
    voicingCache.set(key, v);
  }
  return v;
}

/**
 * @param {{form:string[][], comp:string}} harmony
 * @returns {{beat:number, kind:"chord", notes:number[], dur:number, gain:number, bar:number, bar_in_form:number, slot:number}[]}
 */
export function generateHarmony(harmony, pattern, practice, fromBeat, toBeat) {
  const out = [];
  if (!harmony || harmony.form.length === 0) return out;
  const beats = pattern.beats;
  const slots = flattenForm(harmony.form, beats);
  const voices = voicingsFor(slots);
  const byBar = harmony.form.map((_, b) => slots.map((s, i) => [s, i]).filter(([s]) => s.bar === b));
  const firstBar = Math.max(0, Math.floor(fromBeat / beats) - 1);
  const lastBar = Math.ceil(toBeat / beats) + 1;
  for (let bar = firstBar; bar <= lastBar; bar++) {
    const pb = bar - practice.countIn;
    if (pb < 0 || !barPlays(practice, bar).harmony) continue;
    const fb = pb % harmony.form.length;
    for (const [s, idx] of byBar[fb]) {
      const base = bar * beats + s.start;
      const { style, xform } = resolveStyle(harmony.comp, { seed: pattern.seed, bar, pb, slot: idx, chord: s.chord });
      xform(styleHits(style, s.span, pb, beats, s.start), s.span).forEach((h, n) => {
        const rng = slotRng(pattern.seed, bar, idx, n + 40);
        const nudge = rng();
        const loud = rng();
        let pos = base + h.at;
        let gain = h.vel * (0.92 + loud * 0.16);
        if (pattern.humanize > 0) pos += (nudge - 0.5) * 2 * pattern.humanize * MAX_NUDGE_BEATS;
        pos += h.late || 0;
        const notes = h.note === undefined ? voices[idx] : [voices[idx][h.note % voices[idx].length]];
        if (h.roll) {
          // A rolled chord: one event per note, low to high, each a little later than the last.
          [...notes].sort((a, b) => a - b).forEach((note, i) => {
            const p = pos + i * h.roll;
            if (p < 0 || p < fromBeat || p >= toBeat) return;
            out.push({ beat: p, kind: "chord", notes: [note], dur: h.dur, gain: Math.min(1, gain * (1 - i * 0.04)), bar, bar_in_form: fb, slot: idx });
          });
          return;
        }
        if (pos < 0 || pos < fromBeat || pos >= toBeat) return;
        out.push({ beat: pos, kind: "chord", notes, dur: h.dur, gain: Math.min(1, gain), bar, bar_in_form: fb, slot: idx });
      });
    }
  }
  out.sort((a, b) => a.beat - b.beat);
  return out;
}
