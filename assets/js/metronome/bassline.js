// Bass lines from a chord form. Pure functions, no Web Audio.
//
// generateBass(bass, harmony, pattern, practice, fromBeat, toBeat) returns notes whose start
// falls in [fromBeat, toBeat). Like the other generators it works in beats and is repeatable.
//
// Notes are written as chord tones (root, third, fifth, approach) and placed in a low window,
// E1 to D#2 for the roots. The recorded basses fold by octave if a note is out of their range.
import { slotRng } from "./prng.js?v=20261108w";
import { barPlays } from "./overlay.js?v=20261108w";
import { chordTones, parseChord } from "./chords.js?v=20261108w";
import { flattenForm } from "./comping.js?v=20261108w";

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


// ---- Walking lines ----
// A bassist's line is a path: beat 1 is the root, the last beat approaches the next root by a
// half step, and the notes between move mostly by step through the chord's scale, leaning on
// chord tones. Both ends of each chord's path depend only on the two chords, so the line is
// repeatable and safe to generate in pieces.
const WALK_LOW = 28;
const WALK_HIGH = 47;
const WALK_CENTER = 36;
const SCALES = {
  maj7: [0, 2, 4, 5, 7, 9, 11], "6": [0, 2, 4, 5, 7, 9, 11], maj: [0, 2, 4, 5, 7, 9, 11],
  "7": [0, 2, 4, 5, 7, 9, 10], "9": [0, 2, 4, 5, 7, 9, 10], "13": [0, 2, 4, 5, 7, 9, 10],
  "7alt": [0, 1, 3, 4, 6, 8, 10], "7#11": [0, 2, 4, 6, 7, 9, 10],
  m7: [0, 2, 3, 5, 7, 9, 10], m9: [0, 2, 3, 5, 7, 9, 10], m: [0, 2, 3, 5, 7, 9, 10], m6: [0, 2, 3, 5, 7, 9, 11],
  m7b5: [0, 2, 3, 5, 6, 8, 10], dim7: [0, 2, 3, 5, 6, 8, 9, 11], sus4: [0, 2, 5, 7, 9, 10],
};
const pcOf = (n) => ((n % 12) + 12) % 12;
const nearestTo = (pc, target) => {
  let best = -1;
  for (let n = WALK_LOW; n <= WALK_HIGH; n++) if (pcOf(n) === pc && (best < 0 || Math.abs(n - target) < Math.abs(best - target))) best = n;
  return best;
};

/** The chord's notes for `count` beats as MIDI numbers, first the root, last the approach. */
function walkNotes(chord, nextChord, count, rng) {
  const cur = parseChord(chord) ?? { root: 0, quality: "maj7" };
  const nxt = parseChord(nextChord) ?? cur;
  const tones = chordTones(chord);
  const scale = new Set((SCALES[cur.quality] ?? SCALES.maj7).map((x) => pcOf(cur.root + x)));
  const strong = new Set([tones.third, tones.fifth, tones.seventh ?? 10].map((x) => pcOf(cur.root + x)));
  const start = nearestTo(cur.root, WALK_CENTER);
  if (count < 2) return [start];
  const n = nearestTo(nxt.root, WALK_CENTER);
  let approach;
  if (nxt.root === cur.root) approach = n + (rng() < 0.5 ? -2 : 2);
  else if (start < n - 1) approach = n - 1;
  else if (start > n + 1) approach = n + 1;
  else approach = n + (rng() < 0.5 ? -1 : 1);
  approach = Math.min(WALK_HIGH, Math.max(WALK_LOW, approach));
  const out = [start];
  let prev = start;
  let before = start;
  let dir = Math.sign(approach - start) || (rng() < 0.5 ? 1 : -1);
  for (let k = 1; k < count - 1; k++) {
    const left = count - 1 - k; // notes still to place after this one, up to the approach
    let best = null;
    for (let x = Math.max(WALK_LOW, prev - 5); x <= Math.min(WALK_HIGH, prev + 5); x++) {
      if (x === prev || !scale.has(pcOf(x))) continue;
      const leap = Math.abs(x - prev);
      let sc = leap <= 2 ? 0 : leap === 3 ? -0.6 : leap === 4 ? -1.2 : -2.2;
      if (strong.has(pcOf(x))) sc += 1;
      else if (pcOf(x) === cur.root) sc += 0.3;
      if (x === before) sc -= 1.2;
      if (Math.sign(x - prev) === dir) sc += 0.4;
      const gap = Math.abs(approach - x);
      sc -= Math.max(0, gap - 3 * left) * 1.5;
      if (left === 1) sc += gap >= 1 && gap <= 4 ? 0.5 : -1;
      if (gap === 0) sc -= 3;
      if (x < WALK_LOW + 2 || x > WALK_HIGH - 3) sc -= 0.8;
      sc += rng() * 0.9;
      if (!best || sc > best.sc) best = { x, sc };
    }
    const x = best ? best.x : prev;
    dir = Math.sign(x - prev) || dir;
    before = prev;
    prev = x;
    out.push(x);
  }
  out.push(approach);
  return out;
}

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
    case "fifthLow":
      // below the root when the root is above F#1, else above, so the bass stays in its best octave
      return r + info.fifth - (r > 34 ? 12 : 0);
    case "seventh":
      return r + (info.seventh ?? 12);
    case "next":
      return nextRoot;
    case "approach": {
      // a half step above or below the next root, whichever is nearer to where the line is
      const target = nextRoot;
      return rng() < 0.5 ? target - 1 : target + 1;
    }
    default:
      return r;
  }
}


// Funk, from what players and teachers agree on: the one is the anchor and the loudest note; the line is
// mostly space, with short notes (staccato) on the 16th grid; muted "ghost" notes fill the gaps and
// make it percussive; the line repeats like a riff, so it locks with the drums; and the last 16th or
// 8th of a bar jumps ahead to the next chord. [position in beats, length, tone, loudness]; "x" is a ghost.
const G = (at) => [at, 0.06, "root", 0.38];
const FUNK_RIFFS = [
  // Locked to the kick: one, the "a" of 1, the "and" of 2, a pickup into the next bar.
  [[0, 0.4, "root", 1], G(0.5), [0.75, 0.2, "root", 0.7], G(1.5), [1.75, 0.2, "octave", 0.8], [2.5, 0.3, "fifth", 0.85], G(2.75), [3.25, 0.2, "root", 0.72], G(3.5), [3.75, 0.2, "next", 0.8]],
  // Sparse and heavy: lots of air around the one.
  [[0, 0.5, "root", 1], G(0.75), G(1.25), [1.5, 0.25, "root", 0.8], [2.5, 0.3, "seventh", 0.85], G(3), [3.5, 0.25, "fifth", 0.8], [3.75, 0.2, "next", 0.8]],
  // Octave pops, bouncy.
  [[0, 0.3, "root", 1], [0.5, 0.15, "octave", 0.75], G(0.75), G(1), [1.75, 0.2, "fifth", 0.8], G(2.25), [2.5, 0.3, "root", 0.9], [3, 0.15, "octave", 0.8], G(3.25), [3.5, 0.2, "seventh", 0.75], [3.75, 0.2, "next", 0.8]],
  // Busy 16ths around a steady one and three.
  [[0, 0.4, "root", 1], G(0.25), [0.75, 0.2, "root", 0.75], G(1), [1.5, 0.3, "fifth", 0.85], G(1.75), [2, 0.3, "root", 0.9], [2.5, 0.2, "octave", 0.8], G(2.75), [3.25, 0.2, "seventh", 0.75], G(3.5), [3.75, 0.2, "next", 0.8]],
];

function funkRiff(index, span) {
  const notes = FUNK_RIFFS[index].map(([at, dur, tone, vel]) => ({ at, dur, tone, vel }));
  if (span >= 3) return notes;
  // Two chords in a bar: the first two beats of the riff, then a pickup into the next chord.
  const keep = notes.filter((n) => n.at < span - 0.5 && n.tone !== "next");
  return [...keep, { at: span - 0.25, dur: 0.2, tone: "next", vel: 0.8 }];
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
    case "bossa": {
      // The baixo of a bossa: root on 1 (held), the fifth on the "and" of 2 (anticipating 3), the root again on 3,
      // and on the "and" of 4 either the fifth or a push into the next chord. The fifth sits an octave below the
      // root when the root is high, so the line rocks between two registers instead of leaping up.
      if (span >= 3) {
        const push = rng() < 0.45;
        return [
          { at: 0, dur: 1.45, tone: "root", vel: 1 },
          { at: 1.5, dur: 0.5, tone: "fifthLow", vel: 0.78 },
          { at: 2, dur: 1.45, tone: rng() < 0.2 ? "fifthLow" : "root", vel: 0.92 },
          { at: 3.5, dur: 0.45, tone: push ? "approach" : "fifthLow", vel: push ? 0.7 : 0.75 },
        ];
      }
      return [{ at: 0, dur: 1.45, tone: "root", vel: 1 }, { at: 1.5, dur: 0.45, tone: "fifthLow", vel: 0.78 }].filter((n) => n.at < span);
    }
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
      let layout = pattern(bass.style, s.span, slotRng(patternCfg.seed, bar, idx, 50));
      if (bass.style === "funk") {
        // One riff for the whole tune, picked by the seed; the last bar of each four plays another one as a fill.
        const riff = Math.floor(slotRng(patternCfg.seed, 0, 0, 40)() * FUNK_RIFFS.length);
        layout = funkRiff(fb % 4 === 3 ? (riff + 1) % FUNK_RIFFS.length : riff, s.span);
      }
      if (bass.style === "walking" && s.span >= 2) {
        const count = Math.round(s.span);
        const line = walkNotes(slots[idx].chord, slots[(idx + 1) % slots.length].chord, count, slotRng(patternCfg.seed, bar, idx, 55));
        layout = line.map((midi, k) => ({ at: k, dur: 0.92, midi, vel: k === 0 ? 1 : k === line.length - 1 ? 0.85 : 0.9 }));
      }
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
          midi: n.midi ?? resolve(info, n.tone, nextRoot, appr),
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
