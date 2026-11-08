// Turns a chord form into keyboard hits.
//
// generateHarmony(harmony, pattern, practice, fromBeat, toBeat) returns the events whose
// position falls in [fromBeat, toBeat). Like the click generator it works in beats and is
// repeatable: the same range gives the same events, and splitting a range changes nothing.
import { slotRng } from "./prng.js?v=20261108r";
import { barPlays } from "./overlay.js?v=20261108r";
import { voiceChords } from "./chords.js?v=20261108r";

export const COMP_STYLES = ["sustain", "on1", "charleston", "push", "twofeel", "arp", "mixed"];
const MIXED_POOL = ["on1", "charleston", "push", "twofeel"];
const MAX_NUDGE_BEATS = 0.04;

/** Hits inside one chord that lasts `span` beats. `at` can be negative: a push before the chord. */
export function styleHits(style, span) {
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
    case "arp": {
      // Eighth notes running up and down through the chord, one note at a time.
      const run = [0, 1, 2, 3, 2, 1];
      const n = Math.max(1, Math.floor(span * 2));
      return Array.from({ length: n }, (_, i) => ({ at: i * 0.5, dur: 0.9, vel: i % 2 ? 0.55 : 0.75, note: run[i % run.length] }));
    }
    case "twofeel":
      return long
        ? [{ at: 0, dur: 1.9, vel: 1 }, { at: 2, dur: Math.min(1.9, span - 2), vel: 0.8 }]
        : [{ at: 0, dur: span, vel: 1 }];
    default:
      return [{ at: 0, dur: Math.min(span, 2), vel: 1 }];
  }
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
    const style =
      harmony.comp === "mixed" ? MIXED_POOL[Math.floor(slotRng(pattern.seed, bar, 90, 0)() * MIXED_POOL.length)] : harmony.comp;
    for (const [s, idx] of byBar[fb]) {
      const base = bar * beats + s.start;
      styleHits(style, s.span).forEach((h, n) => {
        const rng = slotRng(pattern.seed, bar, idx, n + 40);
        const nudge = rng();
        const loud = rng();
        let pos = base + h.at;
        let gain = h.vel * (0.92 + loud * 0.16);
        if (pattern.humanize > 0) pos += (nudge - 0.5) * 2 * pattern.humanize * MAX_NUDGE_BEATS;
        if (pos < 0 || pos < fromBeat || pos >= toBeat) return;
        out.push({ beat: pos, kind: "chord", notes: h.note === undefined ? voices[idx] : [voices[idx][h.note % voices[idx].length]], dur: h.dur, gain: Math.min(1, gain), bar, bar_in_form: fb, slot: idx });
      });
    }
  }
  out.sort((a, b) => a.beat - b.beat);
  return out;
}
