// Turns a pattern into clicks.
//
// generateEvents(pattern, practice, fromBeat, toBeat) returns every click whose position
// falls in the beat range [fromBeat, toBeat). Positions are in beats, not seconds, so the
// same function serves a steady tempo and a tempo ladder; the transport converts to time.
//
// Each click's random draws come from its own seeded generator (see prng.js), so asking
// for the same range twice gives the same clicks, and splitting a range in two gives the
// same clicks as one call.
import { slotRng } from "./prng.js?v=20261109c";
import { subFraction } from "./timeline.js?v=20261109c";
import { barPlays } from "./overlay.js?v=20261109c";

const LEVEL_GAIN = [0, 0.6, 1];
const SUB_GAIN = 0.35;
const MAX_NUDGE_BEATS = 0.04; // timing nudge at full human feel
const MAX_VELOCITY_SWING = 0.3; // loudness change at full human feel

/**
 * @typedef {Object} Pattern
 * @property {number} bpm
 * @property {number} beats       counted beats per bar
 * @property {4|8} den
 * @property {number} bars        pattern length in bars, 1 to 4
 * @property {(0|1|2)[]} levels   per beat across all bars: silent, normal, accent
 * @property {number[]} chances   per beat, 0 to 1: chance the beat sounds
 * @property {1|2|3|4} subdivision
 * @property {number} swing       0.5 straight
 * @property {"all"|"backbeat"|"downbeat"|"upbeats"} clickOn
 * @property {number} humanize    0 exact, 1 loose
 * @property {number} density     0 to 1, scales every chance
 * @property {number} seed
 * @property {boolean} freeze     repeat the same random choices every loop
 * @property {"tock"|"wood"|"soft"|"woodblock"|"claves"|"log"|"frame"|"brake"} sound
 */

function beatSelected(clickOn, i) {
  if (clickOn === "backbeat") return i % 2 === 1;
  if (clickOn === "downbeat") return i === 0;
  return true;
}

/**
 * @param {Pattern} pattern
 * @param {import("./overlay.js").Practice} practice
 */
export function generateEvents(pattern, practice, fromBeat, toBeat) {
  const p = pattern;
  const out = [];
  const firstBar = Math.max(0, Math.floor(fromBeat / p.beats) - 1);
  const lastBar = Math.ceil(toBeat / p.beats) + 1;
  for (let bar = firstBar; bar <= lastBar; bar++) {
    if (!barPlays(practice, bar).click) continue;
    const drawBar = p.freeze ? 0 : bar;
    for (let i = 0; i < p.beats; i++) {
      if (!beatSelected(p.clickOn, i)) continue;
      const slot = (bar % p.bars) * p.beats + i;
      const level = p.levels[slot];
      if (level === 0) continue;
      const chance = Math.min(1, Math.max(0, (p.chances[slot] ?? 1) * p.density));
      for (let s = 0; s < p.subdivision; s++) {
        const upbeat = s > 0;
        if (p.clickOn === "upbeats" && !upbeat) continue;
        const rng = slotRng(p.seed, drawBar, i, s);
        const plays = rng() < chance;
        const nudge = rng();
        const loud = rng();
        if (!plays) continue;
        let gain;
        let kind;
        if (p.clickOn === "upbeats") {
          gain = LEVEL_GAIN[1];
          kind = "sub";
        } else if (upbeat) {
          gain = SUB_GAIN;
          kind = "sub";
        } else {
          gain = LEVEL_GAIN[level];
          kind = level === 2 ? "accent" : "beat";
        }
        let pos = bar * p.beats + i + subFraction(s, p.subdivision, p.swing);
        if (p.humanize > 0) {
          pos += (nudge - 0.5) * 2 * p.humanize * MAX_NUDGE_BEATS;
          gain *= 1 + (loud - 0.5) * 2 * p.humanize * MAX_VELOCITY_SWING;
        }
        if (pos < 0) pos = 0;
        if (pos < fromBeat || pos >= toBeat) continue;
        out.push({ beat: pos, gain: Math.min(1, gain), kind, bar, i, s });
      }
    }
  }
  out.sort((a, b) => a.beat - b.beat);
  return out;
}
