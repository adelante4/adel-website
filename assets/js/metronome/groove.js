// Drum grooves, written as patterns on a grid.
//
// generateGroove(groove, pattern, practice, fromBeat, toBeat) returns drum hits whose position
// falls in [fromBeat, toBeat). Like the click generator it works in beats, so tempo changes
// need no special handling, and it is repeatable: the same range always gives the same hits.
//
// Patterns are lists of entries. An entry has a grid step, a voice, a gain, and an optional
// chance (for ghost notes). Chances come from a seeded generator keyed by bar, step and voice,
// so a ghost note that plays in bar 3 plays in bar 3 every time.
import { slotRng } from "./prng.js?v=20261107p";
import { barPlays } from "./overlay.js?v=20261107p";

export const GROOVE_STYLES = ["off", "lofi", "dilla", "halftime", "boombap", "jazz", "brushes", "bossa", "shuffle", "funk", "waltz"];
export const GROOVE_NAMES = {
  off: "Off",
  lofi: "Lofi",
  jazz: "Jazz swing",
  boombap: "Boom-bap",
  bossa: "Bossa",
  brushes: "Brushes",
  dilla: "Neo-soul",
  halftime: "Halftime",
  shuffle: "Shuffle",
  funk: "Funk",
  waltz: "Jazz waltz",
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

const NEOSOUL = [
  e(0, "kick", 1), e(5, "kick", 0.55, 0.7), e(7, "kick", 0.7, 0.8), e(10, "kick", 0.9), e(13, "kick", 0.4, 0.45),
  e(4, "snare", 0.9, 1, 0.035), e(12, "snare", 0.95, 1, 0.035),
  e(9, "ghost", 0.3, 0.4), e(15, "ghost", 0.25, 0.4), e(2, "ghost", 0.22, 0.25),
  ...[0, 2, 4, 6, 8, 10, 12, 14].map((s, i) => e(s, "hat", i % 2 ? 0.3 : 0.5, 1, 0.01)),
  ...[1, 3, 5, 7, 9, 11, 13, 15].map((s) => e(s, "hat", 0.18, 0.55)),
  e(14, "ohat", 0.4, 0.4),
];
const HALFTIME = [
  e(0, "kick", 1), e(7, "kick", 0.55, 0.5), e(10, "kick", 0.85),
  e(8, "snare", 1, 1, 0.01),
  ...[0, 2, 4, 6, 8, 10, 12, 14].map((s, i) => e(s, "hat", i % 2 ? 0.35 : 0.55)),
  e(12, "hat", 0.25, 0.5), e(13, "hat", 0.22, 0.5), e(15, "hat", 0.25, 0.4),
  e(14, "ohat", 0.35, 0.35), e(15, "ghost", 0.25, 0.3),
];
const FUNK = [
  e(0, "kick", 1), e(3, "kick", 0.5, 0.6), e(6, "kick", 0.85), e(10, "kick", 0.9), e(13, "kick", 0.4, 0.35),
  e(4, "snare", 1), e(12, "snare", 1),
  e(7, "ghost", 0.3, 0.7), e(9, "ghost", 0.28, 0.6), e(11, "ghost", 0.26, 0.5), e(15, "ghost", 0.3, 0.6),
  ...Array.from({ length: 16 }, (_, s) => e(s, "hat", [0.6, 0.22, 0.4, 0.22][s % 4])),
  e(14, "ohat", 0.35, 0.4),
];
/** Triplet shuffle: long-short on the hat, backbeat on 2 and 4. */
const SHUFFLE = [
  ...[0, 3, 6, 9].flatMap((s) => [e(s, "hat", 0.55), e(s + 2, "hat", 0.32)]),
  e(3, "snare", 0.9), e(9, "snare", 0.95),
  e(0, "kick", 1), e(6, "kick", 0.85), e(8, "kick", 0.4, 0.35),
  e(5, "ghost", 0.25, 0.3), e(11, "ghost", 0.25, 0.3),
];
/** Jazz waltz, nine steps in 3/4. */
const WALTZ = [
  ...[0, 3, 6].map((s) => e(s, "ride", s === 0 ? 0.8 : 0.7)),
  ...[5, 8].map((s) => e(s, "ride", 0.45)),
  e(3, "foot", 0.5), e(6, "foot", 0.5),
  e(0, "kick", 0.2, 0.85), e(3, "ghost", 0.3, 0.25), e(8, "ghost", 0.28, 0.25),
];

/** looseness: random timing in beats. swing: the fraction of a pair that the first note takes. */
const STYLE = {
  lofi: { entries: LOFI, steps: 16, swing: 0.6, loose: 0.015, fill: true },
  boombap: { entries: BOOMBAP, steps: 16, swing: 0.57, loose: 0.005, fill: true },
  bossa: { entries: BOSSA, steps: 16, swing: 0.5, loose: 0.006, fill: false },
  jazz: { entries: JAZZ, steps: 12, swing: null, loose: 0.01, fill: false },
  dilla: { entries: NEOSOUL, steps: 16, swing: 0.64, loose: 0.02, fill: true },
  halftime: { entries: HALFTIME, steps: 16, swing: 0.55, loose: 0.008, fill: true },
  funk: { entries: FUNK, steps: 16, swing: 0.53, loose: 0.006, fill: true },
  shuffle: { entries: SHUFFLE, steps: 12, swing: null, loose: 0.01, fill: false },
  waltz: { entries: WALTZ, steps: 9, swing: null, loose: 0.01, fill: false, beats: 3 },
  brushes: { entries: BRUSHES, steps: 12, swing: null, loose: 0.012, fill: false },
};

/** Position of a grid step within a bar, in beats. */
export function stepBeat(style, step, bpm) {
  const s = STYLE[style];
  if (s.steps === 12 || s.steps === 9) {
    // Triplet grid: the third triplet of a beat sits at the swing ratio. Fast tempos play flatter.
    const ratio = bpm <= 120 ? 0.667 : 0.667 - Math.min(0.09, ((bpm - 120) / 120) * 0.09);
    const beat = Math.floor(step / 3);
    const inBeat = step % 3;
    return beat + (inBeat === 0 ? 0 : inBeat === 1 ? ratio / 2 : ratio);
  }
  const pair = Math.floor(step / 2);
  return pair * 0.5 + (step % 2 ? s.swing * 0.5 : 0);
}

/** Whether a groove can play in this meter. Grooves are written for 4/4; the waltz for 3/4. */
export const grooveFits = (pattern, style) => pattern.den === 4 && pattern.beats === (STYLE[style]?.beats ?? 4);

/** Whether the drums are sounding in a given bar. */
export const grooveSounds = (groove, pattern, practice, bar) =>
  Boolean(groove) && STYLE[groove.style] !== undefined && grooveFits(pattern, groove.style) && barPlays(practice, bar).groove;

/**
 * @param {{style:string}} groove
 */
export function generateGroove(groove, pattern, practice, fromBeat, toBeat) {
  const out = [];
  const style = STYLE[groove?.style];
  if (!style || !grooveFits(pattern, groove.style)) return out;
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
