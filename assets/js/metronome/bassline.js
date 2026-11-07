// Bass lines from a chord form. Pure functions, no Web Audio.
//
// generateBass(bass, harmony, pattern, practice, fromBeat, toBeat) returns notes whose start
// falls in [fromBeat, toBeat). Like the other generators it works in beats and is repeatable.
//
// Notes are written as chord tones (root, third, fifth, approach) and placed in a low window,
// E1 to D#2 for the roots. The recorded basses fold by octave if a note is out of their range.
import { slotRng } from "./prng.js?v=20261107a";
import { barPlays } from "./overlay.js?v=20261107a";
import { chordTones } from "./chords.js?v=20261107a";
import { flattenForm } from "./comping.js?v=20261107a";

export const BASS_STYLES = ["roots", "twofeel", "walking", "lofi", "bossa", "funk", "sub"];
export const BASS_STYLE_NAMES = {
  roots: "Roots",
  twofeel: "Two-feel",
  walking: "Walking",
  lofi: "Lofi",
  bossa: "Bossa",
  funk: "Funk",
  sub: "Sub",
};
const WINDOW_LOW = 28;
const MAX_NUDGE_BEATS = 0.03;

/** The root's MIDI note in the window E1 to D#2. */
export const rootMidi = (pc) => WINDOW_LOW + ((((pc - WINDOW_LOW) % 12) + 12) % 12);

function resolve(info, tone, nextRoot, rng) {
  const r = rootMidi(info.root);
  switch (tone) {
    case "root":
      return r;
    case "octave":
      return r + 12;
    case "third":
      return r + info.third;
    case "fifth":
      return r + info.fifth;
    case "seventh":
      return r + (info.seventh ?? 12);
    case "approach": {
      // a half step above or below the next root, whichever is nearer to where the line is
      const target = nextRoot;
      return rng() < 0.5 ? target - 1 : target + 1;
    }
    default:
      return r;
  }
}

/** Notes for one chord of `span` beats: [{at, dur, tone, vel, chance?}]. */
function pattern(style, span, rng) {
  const long = span >= 3;
  switch (style) {
    case "roots":
      return [{ at: 0, dur: span - 0.1, tone: "root", vel: 1 }];
    case "twofeel":
      return long
        ? [{ at: 0, dur: 1.85, tone: "root", vel: 1 }, { at: 2, dur: Math.min(1.85, span - 2.1), tone: "fifth", vel: 0.85 }]
        : [{ at: 0, dur: span - 0.1, tone: "root", vel: 1 }];
    case "walking": {
      if (span >= 2 && span < 3) return [{ at: 0, dur: 0.92, tone: "root", vel: 1 }, { at: 1, dur: 0.92, tone: "approach", vel: 0.8 }];
      if (!long) return [{ at: 0, dur: Math.max(0.5, span - 0.1), tone: "root", vel: 1 }];
      if (span < 4) {
        return [
          { at: 0, dur: 0.92, tone: "root", vel: 1 },
          { at: 1, dur: 0.92, tone: rng() < 0.5 ? "fifth" : "third", vel: 0.85 },
          { at: 2, dur: 0.92, tone: "approach", vel: 0.85 },
        ];
      }
      const pool = ["third", "fifth", "seventh", "octave"];
      const a = pool[Math.floor(rng() * 3)];
      let b = pool[Math.floor(rng() * 4)];
      if (b === a) b = a === "fifth" ? "third" : "fifth";
      return [
        { at: 0, dur: 0.92, tone: "root", vel: 1 },
        { at: 1, dur: 0.92, tone: a, vel: 0.85 },
        { at: 2, dur: 0.92, tone: b, vel: 0.9 },
        { at: 3, dur: 0.92, tone: "approach", vel: 0.85 },
      ];
    }
    case "lofi":
      return long
        ? [
            { at: 0, dur: 1.45, tone: "root", vel: 1 },
            { at: 2.5, dur: 0.4, tone: "octave", vel: 0.7, chance: 0.75 },
            { at: 3, dur: 0.85, tone: "fifth", vel: 0.8, chance: 0.6 },
          ]
        : [{ at: 0, dur: span - 0.1, tone: "root", vel: 1 }];
    case "bossa":
      return long
        ? [
            { at: 0, dur: 1.4, tone: "root", vel: 1 },
            { at: 1.5, dur: 0.45, tone: "fifth", vel: 0.8 },
            { at: 2, dur: 1.4, tone: "root", vel: 0.95 },
            { at: 3.5, dur: 0.45, tone: "fifth", vel: 0.75 },
          ]
        : [{ at: 0, dur: 1.4, tone: "root", vel: 1 }, { at: Math.max(1.5, span - 0.5), dur: 0.45, tone: "fifth", vel: 0.8 }].filter((n) => n.at < span);
    case "funk":
      return long
        ? [
            { at: 0, dur: 0.45, tone: "root", vel: 1 },
            { at: 0.75, dur: 0.2, tone: "octave", vel: 0.6, chance: 0.7 },
            { at: 1.5, dur: 0.45, tone: "fifth", vel: 0.85 },
            { at: 2, dur: 0.45, tone: "root", vel: 0.95 },
            { at: 2.75, dur: 0.2, tone: "third", vel: 0.6, chance: 0.6 },
            { at: 3.25, dur: 0.25, tone: "root", vel: 0.8 },
            { at: 3.75, dur: 0.2, tone: "approach", vel: 0.75, chance: 0.8 },
          ]
        : [{ at: 0, dur: 0.45, tone: "root", vel: 1 }, { at: 0.75, dur: 0.2, tone: "octave", vel: 0.6, chance: 0.7 }].filter((n) => n.at < span);
    case "sub":
      return long
        ? [{ at: 0, dur: span - 0.15, tone: "root", vel: 1 }, { at: 3.5, dur: 0.4, tone: "root", vel: 0.6, chance: 0.3 }]
        : [{ at: 0, dur: span - 0.1, tone: "root", vel: 1 }];
    default:
      return [{ at: 0, dur: span - 0.1, tone: "root", vel: 1 }];
  }
}

/**
 * @param {{style:string}} bass
 * @param {{form:string[][]}} harmony
 */
export function generateBass(bass, harmony, patternCfg, practice, fromBeat, toBeat) {
  const out = [];
  if (!bass || !harmony || harmony.form.length === 0) return out;
  const beats = patternCfg.beats;
  const slots = flattenForm(harmony.form, beats);
  const infos = slots.map((s) => chordTones(s.chord));
  const byBar = harmony.form.map((_, b) => slots.map((s, i) => [s, i]).filter(([s]) => s.bar === b));
  const firstBar = Math.max(0, Math.floor(fromBeat / beats) - 1);
  const lastBar = Math.ceil(toBeat / beats) + 1;
  for (let bar = firstBar; bar <= lastBar; bar++) {
    const pb = bar - practice.countIn;
    if (pb < 0 || !barPlays(practice, bar).harmony) continue;
    const fb = pb % harmony.form.length;
    for (const [s, idx] of byBar[fb]) {
      const info = infos[idx];
      const nextRoot = rootMidi(infos[(idx + 1) % infos.length].root);
      const base = bar * beats + s.start;
      const layout = pattern(bass.style, s.span, slotRng(patternCfg.seed, bar, idx, 50));
      layout.filter((n) => n.at < s.span).forEach((n, k) => {
        const rng = slotRng(patternCfg.seed, bar, idx, 60 + k);
        const plays = rng() < (n.chance ?? 1);
        const nudge = rng();
        const loud = rng();
        const appr = slotRng(patternCfg.seed, bar, idx, 80);
        if (!plays) return;
        let pos = base + n.at;
        if (patternCfg.humanize > 0) pos += (nudge - 0.5) * 2 * patternCfg.humanize * MAX_NUDGE_BEATS;
        if (pos < 0 || pos < fromBeat || pos >= toBeat) return;
        out.push({
          beat: pos,
          midi: resolve(info, n.tone, nextRoot, appr),
          dur: n.dur,
          gain: Math.min(1, n.vel * (0.9 + loud * 0.2)),
          bar,
          slot: idx,
        });
      });
    }
  }
  out.sort((a, b) => a.beat - b.beat);
  return out;
}
