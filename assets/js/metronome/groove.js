// Drum grooves, written as patterns on a grid.
//
// generateGroove(groove, pattern, practice, fromBeat, toBeat) returns drum hits whose position
// falls in [fromBeat, toBeat). Like the click generator it works in beats, so tempo changes
// need no special handling, and it is repeatable: the same range always gives the same hits.
//
// Patterns are lists of entries. An entry has a grid step, a voice, a gain, and an optional
// chance (for ghost notes). Chances come from a seeded generator keyed by bar, step and voice,
// so a ghost note that plays in bar 3 plays in bar 3 every time.
import { slotRng } from "./prng.js?v=20261106d";
import { barPlays } from "./overlay.js?v=20261106d";

export const GROOVE_STYLES = ["off", "lofi", "jazz", "boombap", "bossa", "brushes"];
export const GROOVE_NAMES = {
  off: "Off",
  lofi: "Lofi",
  jazz: "Jazz swing",
  boombap: "Boom-bap",
  bossa: "Bossa",
  brushes: "Brushes",
};
const VOICES = ["kick", "snare", "ghost", "rim", "hat", "ohat", "foot", "ride", "brush"];
export const DRUM_VOICES = VOICES;

const e = (step, voice, gain, chance = 1, late = 0) => ({ step, voice, gain, chance, late });

/** Entries for a 16-step bar (four steps per beat). */
const LOFI = [
  e(0, "kick", 1), e(6, "kick", 0.8, 0.9), e(10, "kick", 0.7, 0.7), e(15, "kick", 0.35, 0.3),
  e(4, "snare", 0.9, 1, 0.02), e(12, "snare", 0.95, 1, 0.02),
  e(7, "ghost", 0.3, 0.35), e(14, "ghost", 0.28, 0.3),
  ...[0, 2, 4, 6, 8, 10, 12, 14].map((s, i) => e(s, "hat", i % 2 ? 0.38 : 0.55)),
  ...[1, 3, 5, 7, 9, 11, 13, 15].map((s) => e(s, "hat", 0.2, 0.5)),
  e(14, "ohat", 0.4, 0.5),
];
const BOOMBAP = [
  e(0, "kick", 1), e(6, "kick", 0.85), e(10, "kick", 0.9), e(13, "kick", 0.3, 0.3),
  e(4, "snare", 1), e(12, "snare", 1),
  e(15, "ghost", 0.3, 0.3),
  ...[0, 2, 4, 6, 8, 10, 12, 14].map((s, i) => e(s, "hat", i % 2 ? 0.45 : 0.65)),
  e(15, "hat", 0.3, 0.35), e(14, "ohat", 0.35, 0.25),
];
const BOSSA = [
  e(0, "kick", 0.9), e(6, "kick", 0.7), e(8, "kick", 0.9), e(14, "kick", 0.7),
  ...[0, 3, 6, 10, 12].map((s) => e(s, "rim", 0.7)),
  ...[0, 2, 4, 6, 8, 10, 12, 14].map((s, i) => e(s, "hat", i % 2 ? 0.28 : 0.4)),
];
/** Entries for a 12-step bar (three steps per beat, swing built in). */
const JAZZ = [
  ...[0, 3, 6, 9].map((s) => e(s, "ride", s === 3 || s === 9 ? 0.85 : 0.72)),
  ...[5, 11].map((s) => e(s, "ride", 0.45)),
  e(3, "foot", 0.6), e(9, "foot", 0.6),
  ...[0, 3, 6, 9].map((s) => e(s, "kick", 0.16, 0.85)),
  ...[2, 5, 8, 11].map((s) => e(s, "ghost", 0.3, 0.22)),
  e(8, "kick", 0.5, 0.1), e(11, "kick", 0.45, 0.1),
  e(3, "ghost", 0.4, 0.12), e(9, "ghost", 0.4, 0.12),
];
const BRUSHES = [
  ...[0, 3, 6, 9].map((s) => e(s, "brush", s === 0 ? 0.55 : 0.45)),
  ...[2, 5, 8, 11].map((s) => e(s, "brush", 0.3, 0.8)),
  e(3, "foot", 0.5), e(9, "foot", 0.5),
  e(0, "kick", 0.4), e(6, "kick", 0.2, 0.5),
  e(3, "ghost", 0.3, 0.35), e(9, "ghost", 0.3, 0.35),
];

/** looseness: random timing in beats. swing: the fraction of a pair that the first note takes. */
const STYLE = {
  lofi: { entries: LOFI, steps: 16, swing: 0.6, loose: 0.015, fill: true },
  boombap: { entries: BOOMBAP, steps: 16, swing: 0.57, loose: 0.005, fill: true },
  bossa: { entries: BOSSA, steps: 16, swing: 0.5, loose: 0.006, fill: false },
  jazz: { entries: JAZZ, steps: 12, swing: null, loose: 0.01, fill: false },
  brushes: { entries: BRUSHES, steps: 12, swing: null, loose: 0.012, fill: false },
};

/** Position of a grid step within a bar, in beats. */
export function stepBeat(style, step, bpm) {
  const s = STYLE[style];
  if (s.steps === 12) {
    // Triplet grid: the third triplet of a beat sits at the swing ratio. Fast tempos play flatter.
    const ratio = bpm <= 120 ? 0.667 : 0.667 - Math.min(0.09, ((bpm - 120) / 120) * 0.09);
    const beat = Math.floor(step / 3);
    const inBeat = step % 3;
    return beat + (inBeat === 0 ? 0 : inBeat === 1 ? ratio / 2 : ratio);
  }
  const pair = Math.floor(step / 2);
  return pair * 0.5 + (step % 2 ? s.swing * 0.5 : 0);
}

/** Whether a groove can play in this meter. Only 4/4 so far. */
export const grooveFits = (pattern) => pattern.beats === 4 && pattern.den === 4;

/** Whether the drums are sounding in a given bar. */
export const grooveSounds = (groove, pattern, practice, bar) =>
  Boolean(groove) && STYLE[groove.style] !== undefined && grooveFits(pattern) && barPlays(practice, bar).groove;

/**
 * @param {{style:string}} groove
 */
export function generateGroove(groove, pattern, practice, fromBeat, toBeat) {
  const out = [];
  const style = STYLE[groove?.style];
  if (!style || !grooveFits(pattern)) return out;
  const beats = pattern.beats;
  const firstBar = Math.max(0, Math.floor(fromBeat / beats) - 1);
  const lastBar = Math.ceil(toBeat / beats) + 1;
  for (let bar = firstBar; bar <= lastBar; bar++) {
    const pb = bar - practice.countIn;
    if (pb < 0 || !barPlays(practice, bar).groove) continue;
    const entries = style.fill && pb % 4 === 3 ? style.entries.concat(FILL) : style.entries;
    entries.forEach((en, n) => {
      const rng = slotRng(pattern.seed, bar, en.step * 16 + n, 70);
      const plays = rng() < en.chance;
      const nudge = rng();
      const loud = rng();
      if (!plays) return;
      let pos = bar * beats + stepBeat(groove.style, en.step, pattern.bpm) + en.late;
      pos += (nudge - 0.5) * 2 * (style.loose + pattern.humanize * 0.03);
      let gain = en.gain * (0.9 + loud * 0.2);
      if (pos < 0 || pos < fromBeat || pos >= toBeat) return;
      out.push({ beat: pos, voice: en.voice, gain: Math.min(1, gain), bar, step: en.step });
    });
  }
  out.sort((a, b) => a.beat - b.beat);
  return out;
}

/** Added in the last beat of every fourth bar for grooves with a fill. */
const FILL = [e(12, "snare", 0.5, 0.5), e(13, "ghost", 0.45, 0.5), e(14, "snare", 0.55, 0.4), e(15, "snare", 0.65, 0.4)];
