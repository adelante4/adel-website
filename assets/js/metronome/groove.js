// Drum grooves, written as patterns on a grid.
//
// generateGroove(groove, pattern, practice, fromBeat, toBeat) returns drum hits whose position
// falls in [fromBeat, toBeat). Like the click generator it works in beats, so tempo changes
// need no special handling, and it is repeatable: the same range always gives the same hits.
//
// Patterns are lists of entries. An entry has a grid step, a voice, a gain, and an optional
// chance (for ghost notes). Chances come from a seeded generator keyed by bar, step and voice,
// so a ghost note that plays in bar 3 plays in bar 3 every time.
import { slotRng } from "./prng.js?v=20261112a";
import { barPlays } from "./overlay.js?v=20261112a";

export const GROOVE_STYLES = ["off", "lofi", "dilla", "halftime", "boombap", "jazz", "brushes", "bossa", "shuffle", "funk", "waltz", "trap", "house", "techno", "twostep", "idm", "minimal", "five4", "five8", "seven223", "seven322", "nine", "eleven", "teental", "rupak", "jhaptal", "keharwa", "dadra"];
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
  trap: "Trap",
  house: "House",
  techno: "Techno",
  twostep: "2-step",
  idm: "IDM",
  minimal: "Minimal clicks",
  five4: "5/4 jazz",
  five8: "5/8 (3+2)",
  seven223: "7/8 (2+2+3)",
  seven322: "7/8 (3+2+2)",
  nine: "9/8 (2+2+2+3)",
  eleven: "11/8 (3+3+3+2)",
  teental: "Teental (16)",
  rupak: "Rupak (7)",
  jhaptal: "Jhaptal (10)",
  keharwa: "Keharwa (8)",
  dadra: "Dadra (6)",
};
const VOICES = ["kick", "snare", "ghost", "rim", "hat", "ohat", "foot", "ride", "brush", "tom1", "tom2", "tom3", "crash"];
/** Kits with real toms and a crash, so fills can use them. The others fill on the snare. */
const TOM_KITS = new Set(["synth", "rusty", "bebop", "swirly"]);
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

const TRAP = [
  e(0, "kick", 1), e(3, "kick", 0.7, 0.6), e(7, "kick", 0.8, 0.8), e(10, "kick", 0.9), e(14, "kick", 0.55, 0.4),
  e(8, "snare", 1, 1, 0.004), e(8, "ghost", 0.6),
  ...[0, 2, 4, 6, 8, 10, 12, 14].map((s, i) => e(s, "hat", i % 2 ? 0.4 : 0.6)),
  ...[3, 7, 11, 13, 15].map((s) => e(s, "hat", 0.3, 0.55)),
  e(14, "hat", 0.35, 0.5), e(15, "hat", 0.45, 0.5), e(11, "ohat", 0.4, 0.35),
];
const HOUSE = [
  ...[0, 4, 8, 12].map((s) => e(s, "kick", 1)),
  e(4, "ghost", 0.75), e(12, "ghost", 0.75), e(4, "snare", 0.55), e(12, "snare", 0.55),
  ...[2, 6, 10, 14].map((s) => e(s, "ohat", 0.55)),
  ...[0, 4, 8, 12].map((s) => e(s, "hat", 0.3, 0.8)),
  ...[1, 3, 5, 7, 9, 11, 13, 15].map((s) => e(s, "hat", 0.22, 0.7)),
  e(15, "rim", 0.35, 0.3),
];

const TECHNO = [
  ...[0, 4, 8, 12].map((s) => e(s, "kick", 1)),
  e(4, "ghost", 0.7), e(12, "ghost", 0.7), e(4, "snare", 0.3, 0.6), e(12, "snare", 0.3, 0.6),
  ...[2, 6, 10, 14].map((s) => e(s, "ohat", 0.5)),
  ...[1, 3, 5, 7, 9, 11, 13, 15].map((s) => e(s, "hat", 0.26, 0.8)),
  e(7, "rim", 0.3, 0.3), e(11, "rim", 0.35, 0.35), e(15, "rim", 0.3, 0.25),
];
const TWOSTEP = [
  e(0, "kick", 1), e(10, "kick", 0.9), e(7, "kick", 0.5, 0.35), e(14, "kick", 0.4, 0.2),
  e(4, "snare", 1), e(12, "snare", 1),
  ...[0, 2, 4, 6, 8, 10, 12, 14].map((s, i) => e(s, "hat", i % 2 ? 0.3 : 0.5)),
  ...[3, 9, 15].map((s) => e(s, "hat", 0.2, 0.5)),
  e(6, "rim", 0.4, 0.45), e(11, "rim", 0.35, 0.4), e(14, "ohat", 0.35, 0.3), e(15, "ghost", 0.25, 0.3),
];
const IDM = [
  e(0, "kick", 1), e(3, "kick", 0.6, 0.35), e(7, "kick", 0.8, 0.6), e(10, "kick", 0.9, 0.7), e(13, "kick", 0.5, 0.3),
  e(4, "snare", 1), e(12, "snare", 0.9, 0.8), e(9, "snare", 0.65, 0.35), e(15, "snare", 0.6, 0.3), e(6, "snare", 0.5, 0.25),
  ...[2, 5, 8, 11, 14].map((s) => e(s, "ghost", 0.35, 0.45)),
  ...[...Array(16).keys()].map((s) => e(s, "hat", s % 4 === 0 ? 0.5 : 0.28, 0.7)),
  e(5, "rim", 0.45, 0.4), e(14, "rim", 0.5, 0.35), e(11, "ohat", 0.4, 0.25),
];
const MINIMAL = [
  e(0, "kick", 0.8), e(8, "kick", 0.5, 0.6), e(11, "kick", 0.35, 0.25),
  ...[3, 5, 7, 11, 13].map((s) => e(s, "hat", 0.4, 0.6)),
  ...[2, 6, 10, 14].map((s) => e(s, "rim", 0.35, 0.5)),
  e(9, "ghost", 0.3, 0.3), e(15, "ohat", 0.25, 0.2), e(1, "hat", 0.25, 0.3),
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

// ---- Odd meters and Indian taals -------------------------------------------------------------------------
// One step per beat (the eighth in x/8, the matra in a taal) unless noted. Strokes use the existing drum voices:
// a bayan stroke (open bass) is the kick, a dayan stroke is the rim, a closed or "khali" stroke is a ghost.
const dha = (s, g = 1) => [e(s, "kick", 0.75 * g), e(s, "rim", 0.7 * g)];
const dhin = (s, g = 1) => [e(s, "kick", 0.5 * g), e(s, "rim", 0.6 * g)];
const na = (s, g = 1) => [e(s, "rim", 0.55 * g)];
const tin = (s, g = 1) => [e(s, "ghost", 0.6 * g), e(s, "rim", 0.4 * g)];
const eighths = (n, hi, lo = 0.3) => Array.from({ length: n }, (_, s) => e(s, "hat", hi.includes(s) ? 0.6 : lo));
/** 5/4 jazz in a triplet grid, 15 steps: ride on every beat with the skip note, feet on 2 and 4. */
const FIVE4 = [
  ...[0, 3, 6, 9, 12].map((s) => e(s, "ride", s === 0 ? 0.85 : 0.7)),
  ...[5, 8, 11, 14].map((s) => e(s, "ride", 0.45)),
  e(3, "foot", 0.55), e(9, "foot", 0.55),
  e(0, "kick", 0.25, 0.85), e(6, "kick", 0.2, 0.5), e(8, "ghost", 0.3, 0.3), e(13, "ghost", 0.28, 0.3),
];
const FIVE8 = [e(0, "kick", 1), e(3, "snare", 0.95), ...eighths(5, [0, 3]), e(2, "ghost", 0.3, 0.4)];
const SEVEN223 = [e(0, "kick", 1), e(2, "snare", 0.95), e(4, "kick", 0.85), e(6, "ghost", 0.3, 0.5), ...eighths(7, [0, 2, 4])];
const SEVEN322 = [e(0, "kick", 1), e(3, "snare", 0.95), e(5, "kick", 0.7), e(6, "snare", 0.4, 0.5), ...eighths(7, [0, 3, 5])];
const NINE = [e(0, "kick", 1), e(2, "snare", 0.9), e(4, "kick", 0.8), e(6, "snare", 0.9), e(8, "ghost", 0.45), e(7, "ghost", 0.3, 0.4), ...eighths(9, [0, 2, 4, 6])];
const ELEVEN = [e(0, "kick", 1), e(3, "snare", 0.95), e(6, "kick", 0.85), e(9, "snare", 0.85), e(10, "ghost", 0.35, 0.5), ...eighths(11, [0, 3, 6, 9])];
/** Teental, 16 matras, 4+4+4+4: Dha Dhin Dhin Dha | Dha Dhin Dhin Dha | Dha Tin Tin Ta | Ta Dhin Dhin Dha. */
const TEENTAL = [
  ...dha(0, 1.1), ...dhin(1), ...dhin(2), ...dha(3), ...dha(4), ...dhin(5), ...dhin(6), ...dha(7),
  ...tin(8), ...tin(9), ...na(10), ...na(11), ...tin(12, 0.9), ...dhin(13), ...dhin(14), ...dha(15),
];
/** Rupak, 7 matras, 3+2+2, opens on the empty beat: Tin Tin Na | Dhin Na | Dhin Na. */
const RUPAK = [...tin(0), ...tin(1), ...na(2), ...dhin(3, 1.1), ...na(4), ...dhin(5), ...na(6)];
/** Jhaptal, 10 matras, 2+3+2+3: Dhi Na | Dhi Dhi Na | Ti Na | Dhi Dhi Na. */
const JHAPTAL = [
  ...dhin(0, 1.1), ...na(1), ...dhin(2), ...dhin(3), ...na(4), ...tin(5), ...na(6), ...dhin(7), ...dhin(8), ...na(9),
];
/** Keharwa, 8 matras, 4+4: Dha Ge Na Ti | Na Ka Dhi Na. */
const KEHARWA = [...dha(0, 1.1), ...dhin(1, 0.7), ...na(2), ...tin(3), ...na(4), ...tin(5, 0.7), ...dhin(6), ...na(7)];
/** Dadra, 6 matras, 3+3: Dha Dhi Na | Dha Tu Na. */
const DADRA = [...dha(0, 1.1), ...dhin(1), ...na(2), ...dha(3), ...tin(4), ...na(5)];

const GRID = { fill: false, swing: null };

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
  trap: { entries: TRAP, steps: 16, swing: 0.5, loose: 0.004, fill: true },
  house: { entries: HOUSE, steps: 16, swing: 0.52, loose: 0.003, fill: false },
  techno: { entries: TECHNO, steps: 16, swing: 0.5, loose: 0.002, fill: false },
  twostep: { entries: TWOSTEP, steps: 16, swing: 0.6, loose: 0.006, fill: true },
  idm: { entries: IDM, steps: 16, swing: 0.5, loose: 0.006, fill: true },
  minimal: { entries: MINIMAL, steps: 16, swing: 0.5, loose: 0.003, fill: false },
  brushes: { entries: BRUSHES, steps: 12, swing: null, loose: 0.012, fill: false },
  five4: { entries: FIVE4, steps: 15, swing: null, loose: 0.01, fill: false, beats: 5 },
  five8: { entries: FIVE8, steps: 5, per: 1, swing: 0.5, loose: 0.005, fill: false, beats: 5, den: 8 },
  seven223: { entries: SEVEN223, steps: 7, per: 1, swing: 0.5, loose: 0.005, fill: false, beats: 7, den: 8 },
  seven322: { entries: SEVEN322, steps: 7, per: 1, swing: 0.5, loose: 0.005, fill: false, beats: 7, den: 8 },
  nine: { entries: NINE, steps: 9, per: 1, swing: 0.5, loose: 0.005, fill: false, beats: 9, den: 8 },
  eleven: { entries: ELEVEN, steps: 11, per: 1, swing: 0.5, loose: 0.005, fill: false, beats: 11, den: 8 },
  teental: { entries: TEENTAL, steps: 16, per: 1, swing: 0.5, loose: 0.008, fill: false, beats: 16 },
  rupak: { entries: RUPAK, steps: 7, per: 1, swing: 0.5, loose: 0.008, fill: false, beats: 7 },
  jhaptal: { entries: JHAPTAL, steps: 10, per: 1, swing: 0.5, loose: 0.008, fill: false, beats: 10 },
  keharwa: { entries: KEHARWA, steps: 8, per: 1, swing: 0.5, loose: 0.008, fill: false, beats: 8 },
  dadra: { entries: DADRA, steps: 6, per: 1, swing: 0.5, loose: 0.008, fill: false, beats: 6 },
};

/** The meter a style is written for. */
export const grooveMeter = (style) => [STYLE[style]?.beats ?? 4, STYLE[style]?.den ?? 4];

/** The swing ratio of a style's own feel: where the off-beat eighth sits in the beat (0.5 straight, 0.667 triplet). */
export function styleFeel(style, bpm) {
  const s = STYLE[style];
  if (!s) return 0.5;
  if (s.swing !== null) return s.swing;
  // Triplet grids. Fast tempos play flatter.
  return bpm <= 120 ? 0.667 : 0.667 - Math.min(0.09, ((bpm - 120) / 120) * 0.09);
}

/**
 * The swing the whole band plays with: the swing control when it is set, else the drum style's own feel,
 * else straight. Keys, bass and drums all follow it, so they swing together.
 */
export function bandFeel(groove, pattern) {
  if (pattern.swing > 0.5) return pattern.swing;
  return groove && groove.style !== "off" ? styleFeel(groove.style, pattern.bpm) : 0.5;
}

/** Moves a position so straight eighths (and the sixteenths around them) land on the swing ratio. */
export function swingBeat(pos, ratio) {
  if (ratio === 0.5) return pos;
  const i = Math.floor(pos);
  const f = pos - i;
  return i + (f < 0.5 ? (f * ratio) / 0.5 : ratio + ((f - 0.5) * (1 - ratio)) / 0.5);
}

/** Position of a grid step within a bar, in beats. `ratio` overrides the style's own swing. */
export function stepBeat(style, step, bpm, ratio = null) {
  const s = STYLE[style];
  if (s.per === 1) return step;
  if (s.steps === 12 || s.steps === 9 || s.steps === 15) {
    // Triplet grid: the third triplet of a beat sits at the swing ratio.
    ratio = ratio ?? styleFeel(style, bpm);
    const beat = Math.floor(step / 3);
    const inBeat = step % 3;
    return beat + (inBeat === 0 ? 0 : inBeat === 1 ? ratio / 2 : ratio);
  }
  const pair = Math.floor(step / 2);
  return pair * 0.5 + (step % 2 ? (ratio ?? s.swing) * 0.5 : 0);
}

/** Whether a groove can play in this meter. Each groove is written for one meter, 4/4 unless it says otherwise. */
export const grooveFits = (pattern, style) => pattern.den === (STYLE[style]?.den ?? 4) && pattern.beats === (STYLE[style]?.beats ?? 4);

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
    // Intensity: 0.5 is the groove as written. Lower thins it (ghosts and subdivisions drop out, no fills);
    // higher fills the gaps, makes the ghosts likelier, and fills more often.
    const level = groove.intensity ?? 0.5;
    const grid12 = style.steps === 12;
    const fillAt = groove.fills === false || level < 0.2 ? 0 : level > 0.75 ? 2 : 4;
    const fillIn = (q) => fillAt > 0 && q >= 0 && (style.fill || grid12) && q % fillAt === fillAt - 1;
    let entries = style.entries;
    if (fillIn(pb)) {
      const toms = TOM_KITS.has(groove.kit ?? "synth");
      const set = grid12 ? (toms ? FILLS12_TOMS : FILLS12) : toms ? FILLS16_TOMS : FILLS16;
      const pool = set.filter((f) => !f.long || level > 0.6);
      const f = pool[Math.floor(slotRng(pattern.seed, bar, 999, 71)() * pool.length)];
      entries = entries.filter((x) => x.step < f.from).concat(f.hits.map((h) => ({ ...h, chance: 1, late: 0 })));
    } else if (fillIn(pb - 1)) {
      entries = entries.concat((TOM_KITS.has(groove.kit ?? "synth") ? LANDING_CRASH : LANDING).map((h) => ({ ...h, chance: 1, late: 0 })));
    }
    const volume = 0.8 + 0.4 * level;
    entries.forEach((en, n) => {
      const rng = slotRng(pattern.seed, bar, en.step * 16 + n, 70);
      const weak = en.chance < 1 || en.gain < 0.4;
      if (level < 0.35 && en.gain < 0.4 && en.voice !== "kick") return;
      const chance = weak ? Math.min(1, en.chance * (0.4 + 1.2 * level)) : en.chance;
      const plays = rng() < chance;
      const nudge = rng();
      const loud = rng();
      if (!plays) return;
      let pos = bar * beats + stepBeat(groove.style, en.step, pattern.bpm, pattern.swing > 0.5 ? pattern.swing : null) + en.late;
      pos += (nudge - 0.5) * 2 * (style.loose + pattern.humanize * 0.03);
      let gain = en.gain * (0.9 + loud * 0.2) * volume;
      if (pos < 0 || pos < fromBeat || pos >= toBeat) return;
      out.push({ beat: pos, voice: en.voice, gain: Math.min(1, gain), bar, step: en.step });
    });
  }
  out.sort((a, b) => a.beat - b.beat);
  return out;
}

/**
 * Fills, written out the way a drummer plays them: each starts at `from`, replaces what the groove would play from
 * there, builds in loudness, and lands on the next bar's downbeat with a crash (or an open hat) over the kick.
 */
const FILLS16 = [
  { from: 12, long: false, hits: [e(12, "snare", 0.5), e(13, "snare", 0.55), e(14, "snare", 0.72), e(15, "snare", 0.9)] },
  { from: 12, long: false, hits: [e(12, "snare", 0.75), e(13, "kick", 0.8), e(14, "snare", 0.7), e(15, "snare", 0.95)] },
  { from: 8, long: true, hits: [e(8, "kick", 0.85), e(10, "snare", 0.55), e(12, "snare", 0.65), e(13, "snare", 0.7), e(14, "snare", 0.82), e(15, "snare", 0.95)] },
  { from: 8, long: true, hits: [e(8, "snare", 0.6), e(9, "ghost", 0.4), e(10, "snare", 0.65), e(12, "kick", 0.85), e(13, "snare", 0.7), e(14, "snare", 0.85), e(15, "snare", 1)] },
];
/** With toms: the same shapes, moving down the kit. */
const FILLS16_TOMS = [
  { from: 12, long: false, hits: [e(12, "tom1", 0.65), e(13, "tom1", 0.7), e(14, "tom2", 0.8), e(15, "tom3", 0.9)] },
  { from: 12, long: false, hits: [e(12, "snare", 0.6), e(13, "snare", 0.6), e(14, "tom1", 0.8), e(15, "tom3", 0.95)] },
  { from: 8, long: true, hits: [e(8, "snare", 0.6), e(9, "snare", 0.5), e(10, "tom1", 0.72), e(11, "tom1", 0.68), e(12, "tom2", 0.8), e(13, "tom2", 0.75), e(14, "tom3", 0.9), e(15, "tom3", 0.9)] },
  { from: 8, long: true, hits: [e(8, "kick", 0.85), e(10, "snare", 0.6), e(11, "snare", 0.55), e(12, "tom1", 0.75), e(13, "tom2", 0.8), e(14, "tom3", 0.88), e(15, "kick", 0.9)] },
];
/** The same on the triplet grids (jazz, shuffle, brushes). */
const FILLS12 = [
  { from: 9, long: false, hits: [e(9, "snare", 0.5), e(10, "snare", 0.6), e(11, "snare", 0.78)] },
  { from: 9, long: false, hits: [e(9, "snare", 0.7), e(11, "snare", 0.85), e(10, "kick", 0.5)] },
  { from: 6, long: true, hits: [e(6, "snare", 0.55), e(7, "ghost", 0.4), e(8, "snare", 0.62), e(9, "snare", 0.7), e(10, "snare", 0.8), e(11, "snare", 0.95)] },
];
const FILLS12_TOMS = [
  { from: 9, long: false, hits: [e(9, "tom1", 0.65), e(10, "tom2", 0.75), e(11, "tom3", 0.88)] },
  { from: 9, long: false, hits: [e(9, "snare", 0.6), e(10, "tom1", 0.72), e(11, "tom3", 0.9)] },
  { from: 6, long: true, hits: [e(6, "snare", 0.55), e(7, "snare", 0.5), e(8, "tom1", 0.7), e(9, "tom2", 0.78), e(10, "tom2", 0.78), e(11, "tom3", 0.92)] },
];
const LANDING = [e(0, "ohat", 0.8), e(0, "kick", 1)];
const LANDING_CRASH = [e(0, "crash", 0.85), e(0, "kick", 1)];
