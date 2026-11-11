// Bass lines from a chord form. Pure functions, no Web Audio.
//
// generateBass(bass, harmony, pattern, practice, fromBeat, toBeat) returns notes whose start
// falls in [fromBeat, toBeat). Like the other generators it works in beats and is repeatable.
//
// A bass line is written one BAR at a time, not one chord at a time. A bar holds one or two
// chords, and the bass line is one gesture across them: a funk riff does not start over at the
// second chord, a bossa pattern keeps its rocking, and a walking line passes through the change.
// Every style writes its notes by position in the bar. The chord that sounds at that position
// decides the pitch, and the helpers below make sure each chord change gets its own root.
//
// Notes are written as chord tones (root, third, fifth, approach) and placed in a low window,
// E1 to D#2 for the roots. The recorded basses fold by octave if a note is out of their range.
//
// An event has: beat, midi, dur (beats), gain, bar, slot, and `art`, how the note is played:
//   undefined  a normal note        "dead"   a muted thud (a ghost note)
//   "slide"    glides up into the note   "fall"   the pitch sags away at the end
import { slotRng } from "./prng.js?v=20261111a";
import { barPlays } from "./overlay.js?v=20261111a";
import { chordTones, parseChord } from "./chords.js?v=20261111a";
import { flattenForm } from "./comping.js?v=20261111a";

const WINDOW_LOW = 28;
const MAX_NUDGE_BEATS = 0.03;

/** The root's MIDI note in the window E1 to D#2. */
export const rootMidi = (pc) => WINDOW_LOW + ((((pc - WINDOW_LOW) % 12) + 12) % 12);

const pcOf = (n) => ((n % 12) + 12) % 12;

// ---- Walking lines ----
// A bassist's line is a path: the first note of a chord is its root, the last approaches the next
// root by a step, and the notes between move mostly by step through the chord's scale, leaning on
// chord tones. The register of each root is chosen near the one before it, so the line does not
// jump around the neck; every choice depends only on the bar, so the line is repeatable and safe
// to generate in pieces.
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
const clampWalk = (x) => Math.min(WALK_HIGH, Math.max(WALK_LOW, x));
const nearestTo = (pc, target) => {
  let best = -1;
  for (let n = WALK_LOW; n <= WALK_HIGH; n++) if (pcOf(n) === pc && (best < 0 || Math.abs(n - target) < Math.abs(best - target))) best = n;
  return best;
};

/** A weighted pick from [[value, weight], ...]. */
function weighted(options, rng) {
  const total = options.reduce((a, [, w]) => a + w, 0);
  let r = rng() * total;
  for (const [v, w] of options) {
    r -= w;
    if (r <= 0) return v;
  }
  return options[options.length - 1][0];
}

/**
 * The step into the next chord. With two beats there is no room for anything but a half step, taken
 * from the side the line is already on; with more room a diatonic neighbour or the note a fifth
 * above the target also join in.
 */
function pickApproach(cur, nxt, start, target, count, rng, scale) {
  const options = [];
  const add = (x, w) => {
    x = clampWalk(x);
    if (x === start || x === target) return;
    if (count === 2 && Math.abs(x - start) > 6) return;
    options.push([x, w]);
  };
  if (nxt.root === cur.root) {
    // The same chord again: lean on the seventh below or the ninth above, a step that belongs to the scale.
    for (const [d, w] of [[-2, 1], [-1, 0.8], [2, 0.6], [1, 0.3]]) if (scale.has(pcOf(target + d))) add(target + d, w);
  } else {
    const below = start < target - 1 ? 1.5 : start > target + 1 ? 0.5 : 1;
    add(target - 1, below);
    add(target + 1, 2 - below);
    if (count >= 3) {
      add(target - 5, 0.35); // the dominant of the target, a fourth below it
      for (const d of [-2, 2]) if (scale.has(pcOf(target + d)) && Math.abs(d) === 2) add(target + d, 0.3);
    }
  }
  if (options.length === 0) return clampWalk(target + (rng() < 0.5 ? -1 : 1));
  return weighted(options, rng);
}

/** The notes of one chord's walk as MIDI numbers: `start` first, the approach last. */
function walkNotes(cur, nxt, start, target, count, rng) {
  if (count < 2) return [start];
  const tones = chordTones(cur.name);
  const scale = new Set((SCALES[cur.quality] ?? SCALES.maj7).map((x) => pcOf(cur.root + x)));
  const strong = new Set([tones.third, tones.fifth, tones.seventh ?? 10].map((x) => pcOf(cur.root + x)));
  const approach = pickApproach(cur, nxt, start, target, count, rng, scale);
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

/** A walking line for the whole bar. Each chord gets its own walk, linked to the next by the approach. */
function walkBar(c, ghosted) {
  const notes = [];
  const last = c.slots.length - 1;
  const roots = [];
  c.slots.forEach((s, i) => roots.push(nearestTo(s.cur.root, i === 0 ? WALK_CENTER : roots[i - 1])));
  const final = nearestTo(c.slots[last].nextCur.root, WALK_CENTER);
  c.slots.forEach((s, i) => {
    const count = Math.max(1, Math.round(s.span));
    const target = i < last ? roots[i + 1] : final;
    const nxt = i < last ? c.slots[i + 1].cur : s.nextCur;
    const rng = c.r(10 + i);
    const line = count === 1 ? [roots[i]] : walkNotes(s.cur, nxt, roots[i], target, count, rng);
    const skip = c.r(30 + i);
    line.forEach((midi, k) => {
      const at = s.start + k;
      const vel = k === 0 ? 1 : k === line.length - 1 ? 0.84 : 0.88;
      // A skipped beat (long-short), as a swinging bassist plays now and then: the note is clipped and
      // a ghost note sits on the "and" before the next beat.
      if (ghosted && k % 2 === 1 && k < count - 1 && skip() < 0.34) {
        notes.push(N(at, 0.5, null, vel, { midi }), N(at + 0.5, 0.1, null, 0.42, { midi, art: "dead" }));
      } else notes.push(N(at, count === 1 ? Math.max(0.5, s.span - 0.1) : 0.94, null, vel, { midi }));
    });
  });
  return notes;
}

// ---- Note helpers ----
/** A note: position in the bar (negative counts back from the bar's end), length, tone, loudness. */
const N = (at, dur, tone, vel, extra) => ({ at, dur, tone, vel, ...extra });
/** A muted ghost note. */
const D = (at, vel = 0.38, tone = "root") => N(at, 0.1, tone, vel, { art: "dead" });

/** Run `fn(span, slot, rng)` for each chord of the bar; its notes are placed relative to the chord's start. */
function eachSlot(c, fn) {
  return c.slots.flatMap((s, i) => fn(s.span, s, c.r(20 + i)).map((n) => ({ ...n, at: n.at < 0 ? s.start + s.span + n.at : s.start + n.at })));
}

// ---- The styles ----
// Funk, from what players and teachers agree on: the one is the anchor and the loudest note; the line is
// mostly space, with short notes (staccato) on the 16th grid; muted "ghost" notes fill the gaps and
// make it percussive; the line repeats like a riff, so it locks with the drums; and the last 16th or
// 8th of a bar jumps ahead to the next chord.
const FUNK_RIFFS = [
  // Locked to the kick: one, the "a" of 1, the "and" of 2, a pickup into the next bar.
  [N(0, 0.4, "root", 1), D(0.5), N(0.75, 0.2, "root", 0.7), D(1.5), N(1.75, 0.2, "octave", 0.8), N(2.5, 0.3, "fifth", 0.85), D(2.75), N(3.25, 0.2, "root", 0.72), D(3.5), N(-0.25, 0.2, "next", 0.8)],
  // Sparse and heavy: lots of air around the one.
  [N(0, 0.5, "root", 1), D(0.75), D(1.25), N(1.5, 0.25, "root", 0.8), N(2.5, 0.3, "seventh", 0.85), D(3), N(3.5, 0.25, "fifth", 0.8), N(-0.25, 0.2, "next", 0.8)],
  // Octave pops, bouncy.
  [N(0, 0.3, "root", 1), N(0.5, 0.15, "octave", 0.75), D(0.75), D(1), N(1.75, 0.2, "fifth", 0.8), D(2.25), N(2.5, 0.3, "root", 0.9), N(3, 0.15, "octave", 0.8), D(3.25), N(3.5, 0.2, "seventh", 0.75), N(-0.25, 0.2, "next", 0.8)],
  // Busy 16ths around a steady one and three.
  [N(0, 0.4, "root", 1), D(0.25), N(0.75, 0.2, "root", 0.75), D(1), N(1.5, 0.3, "fifth", 0.85), D(1.75), N(2, 0.3, "root", 0.9), N(2.5, 0.2, "octave", 0.8), D(2.75), N(3.25, 0.2, "seventh", 0.75), D(3.5), N(-0.25, 0.2, "next", 0.8)],
  // Pushing: the "and" of 1 and the "a" of 2 answer the one.
  [N(0, 0.35, "root", 1), D(0.5), N(1.25, 0.2, "octave", 0.75), N(1.75, 0.2, "root", 0.7), D(2), N(2.5, 0.35, "fifth", 0.85), N(3, 0.2, "seventh", 0.7), D(3.5), N(-0.25, 0.2, "next", 0.8)],
  // Heavy and slow: a long one, a ghost-filled gap, a late three.
  [N(0, 0.65, "root", 1), D(0.75), D(1.5), N(1.75, 0.3, "root", 0.75), N(2.75, 0.3, "fifth", 0.85), D(3.25), N(3.5, 0.25, "octave", 0.78), N(-0.25, 0.2, "next", 0.8)],
];

/** Notes of the bar's single riff, picked by the seed; the last bar of each four plays the next one as a fill. */
const funk = (c) => {
  const pick = Math.floor(slotRng(c.seed, 0, 0, 40)() * FUNK_RIFFS.length);
  return FUNK_RIFFS[(pick + (c.fb % 4 === 3 ? 1 : 0)) % FUNK_RIFFS.length];
};

// A string-bass staple in four: the baixo of a bossa. Root on 1 (held), the fifth on the "and" of 2
// (anticipating 3), the root again on 3, and on the "and" of 4 either the fifth or a push into the
// next chord. The fifth sits an octave below the root when the root is high, so the line rocks
// between two registers instead of leaping up.
const bossa = (c) => {
  const r = c.r(1);
  const push = r() < 0.45;
  return [
    N(0, 1.45, "root", 1),
    N(1.5, 0.5, "fifthLow", 0.78),
    N(2, 1.45, r() < 0.2 ? "fifthLow" : "root", 0.92),
    N(-0.5, 0.45, push ? "approach" : "fifthLow", push ? 0.7 : 0.75),
  ];
};

const STYLES = {
  roots: {
    name: "Roots",
    note: "The root, held for the whole chord.",
    gen: (c) => eachSlot(c, (span) => [N(0, span - 0.1, "root", 1)]),
  },
  twofeel: {
    name: "Two-feel",
    note: "Half notes: the root on the chord, the fifth on 3.",
    gen: (c) =>
      eachSlot(c, (span) =>
        span >= 3 ? [N(0, 1.85, "root", 1), N(2, Math.min(1.85, span - 2.1), "fifth", 0.85)] : [N(0, span - 0.1, "root", 1)],
      ),
  },
  ballad: {
    name: "Ballad",
    note: "Slow, soft roots with now and then a fifth, and a slide up into the next chord.",
    gen: (c) =>
      eachSlot(c, (span, s, rng) => {
        if (span < 3) return [N(0, span - 0.1, "root", 0.85)];
        const out = [N(0, span - 0.7, "root", 0.9)];
        if (span >= 4 && rng() < 0.35) out[0].dur = 1.9, out.push(N(2, 1.2, "fifth", 0.62));
        out.push(N(-0.5, 0.45, "approach", 0.58, { art: "slide", chance: 0.55 }));
        return out;
      }),
  },
  walking: {
    name: "Walking",
    note: "A quarter note on every beat: the root, chord tones and steps, and a half step into the next chord. Two chords in a bar get a walk each.",
    gen: (c) => walkBar(c, false),
  },
  walkghost: {
    name: "Walking, skipped",
    note: "Walking, with the lilt of a bassist who now and then clips a beat short and ghosts the note after it.",
    gen: (c) => walkBar(c, true),
  },
  boogie: {
    name: "Boogie",
    note: "The blues shuffle figure: root, third, fifth, sixth, seventh, and back down, in swung eighths.",
    gen: (c) =>
      eachSlot(c, (span) => {
        const cycle = ["root", "third", "fifth", "sixth", "seventh", "sixth", "fifth", "third"];
        return Array.from({ length: Math.round(span * 2) }, (_, i) => N(i * 0.5, 0.42, cycle[i % 8], i === 0 ? 1 : i % 2 === 0 ? 0.88 : 0.72));
      }),
  },
  bossa: {
    name: "Bossa",
    note: "Root and fifth in the bossa pattern, with a push into the next chord now and then.",
    gen: bossa,
    anchors: true,
    tile: true,
  },
  latin: {
    name: "Tumbao",
    note: "The Cuban bass: it leaves the one empty, hits the \"and\" of 2 and the 4, and anticipates the next chord on the \"and\" of 4.",
    gen: (c) => {
      const r = c.r(2);
      return r() < 0.5
        ? [N(1.5, 0.5, "root", 0.95), N(3, 0.45, "fifthLow", 0.82), N(-0.5, 0.45, "next", 0.92)]
        : [N(1.5, 0.5, "root", 0.95), N(2.5, 0.3, "octave", 0.7), N(3, 0.45, "fifthLow", 0.82), N(-0.5, 0.45, "next", 0.92)];
    },
    anchors: true,
    tile: true,
  },
  lofi: {
    name: "Lofi",
    note: "The root on 1, with a short octave and fifth pickup that sometimes stays out.",
    gen: (c) => [N(0, 1.45, "root", 1), N(2.5, 0.4, "octave", 0.7, { chance: 0.75 }), N(3, 0.85, "fifth", 0.8, { chance: 0.6 })],
    anchors: true,
    tile: true,
  },
  neosoul: {
    name: "Neo-soul",
    note: "Behind the beat: a rounded one, ghost notes, a sliding fifth, and a late pickup.",
    gen: (c) => [N(0, 0.7, "root", 0.95), D(1, 0.34), N(1.75, 0.35, "octave", 0.7), N(2.5, 0.5, "fifth", 0.8, { art: "slide" }), D(3.25, 0.3), N(-0.25, 0.3, "approach", 0.6, { chance: 0.5, art: "slide" })],
    anchors: true,
    tile: true,
  },
  soul: {
    name: "Soul",
    note: "Motown-style: a held one, then a bouncing line of octave, fifth and sixth, with a step into the next chord.",
    gen: (c) => [N(0, 0.9, "root", 1), N(1.5, 0.4, "octave", 0.8, { chance: 0.8 }), N(2, 0.45, "fifth", 0.85), N(2.5, 0.4, "sixth", 0.7), N(3, 0.45, "fifth", 0.8), N(-0.5, 0.4, "approach", 0.75)],
    anchors: true,
    tile: true,
  },
  funk: {
    name: "Funk",
    note: "One riff for the whole bar: a loud one, space, muted ghost notes. A bar with two chords keeps the riff and changes the notes under it, with a pickup into the next chord.",
    gen: funk,
    anchors: true,
    tile: true,
  },
  disco: {
    name: "Disco",
    note: "Octaves in steady eighths, root below and octave above, with a step into the next chord.",
    gen: (c) => {
      const r = c.r(3);
      return Array.from({ length: 8 }, (_, i) => {
        if (i === 7 && r() < 0.4) return N(3.5, 0.4, "approach", 0.8);
        return N(i * 0.5, 0.4, i % 2 === 0 ? "root" : "octave", i === 0 ? 1 : i % 2 === 0 ? 0.88 : 0.76);
      });
    },
    tile: true,
  },
  eighths: {
    name: "Eighths",
    note: "Driving eighth notes on the root, the way a rock or pop band plays, with a step into the next chord now and then.",
    gen: (c) => {
      const r = c.r(4);
      return Array.from({ length: 8 }, (_, i) => {
        if (i === 7 && r() < 0.35) return N(3.5, 0.42, "approach", 0.8);
        if (i % 2 === 1 && r() < 0.1) return N(i * 0.5, 0.42, "octave", 0.72);
        return N(i * 0.5, 0.45, "root", i === 0 ? 1 : i % 2 === 0 ? 0.88 : 0.7);
      });
    },
    tile: true,
  },
  reggae: {
    name: "Reggae",
    note: "One drop: space on the one, the weight on 3, round long notes, and a walk-around now and then.",
    gen: (c) => {
      const r = c.r(5);
      return r() < 0.5
        ? [N(0, 0.4, "root", 0.8), N(1.5, 0.4, "fifth", 0.62, { chance: 0.6 }), N(2, 1.4, "root", 1), N(3.5, 0.4, "seventh", 0.65, { chance: 0.5 })]
        : [N(0.5, 0.4, "third", 0.6, { chance: 0.5 }), N(1, 0.9, "root", 0.9), N(2, 1.4, "fifth", 1), N(3.5, 0.45, "approach", 0.7, { chance: 0.6 })];
    },
    anchors: true,
    tile: true,
  },
  vamp: {
    name: "Vamp 3+3+2",
    note: "A modal vamp in groups of three, three and two eighths, rocking between the root and its neighbours.",
    gen: (c) => {
      const r = c.r(6);
      return [N(0, 1.4, "root", 1), N(1.5, 1.35, r() < 0.5 ? "fifth" : "third", 0.8), N(3, 0.9, r() < 0.5 ? "octave" : "fifth", 0.78)];
    },
    anchors: true,
    tile: true,
  },
  arp: {
    name: "Broken chord",
    note: "Eighth notes through the chord: root, fifth, octave, fifth, then root, third, fifth, third.",
    gen: (c) =>
      eachSlot(c, (span) => {
        const cycle = ["root", "fifth", "octave", "fifth", "root", "third", "fifth", "third"];
        return Array.from({ length: Math.round(span * 2) }, (_, i) => N(i * 0.5, 0.46, cycle[i % 8], i === 0 ? 1 : i % 2 === 0 ? 0.84 : 0.7));
      }),
  },
  offbeat: {
    name: "Offbeat",
    note: "The house bass: short roots on every \"and\", leaving the beat to the kick.",
    gen: (c) => {
      const r = c.r(7);
      return [0, 1, 2, 3].map((q) => N(q + 0.5, 0.36, r() < 0.2 && q === 3 ? "octave" : "root", q % 2 === 0 ? 0.95 : 0.8));
    },
    tile: true,
  },
  rolling: {
    name: "Rolling",
    note: "The techno bass: sixteenth notes that leave the beat open, the root with octave jumps on the accents.",
    gen: (c) => {
      const r = c.r(8);
      const out = [];
      for (let q = 0; q < 4; q++) {
        out.push(N(q + 0.25, 0.18, "root", 0.6), N(q + 0.5, 0.18, r() < 0.3 ? "octave" : "root", 0.9), N(q + 0.75, 0.18, "root", 0.66));
      }
      return out;
    },
    tile: true,
  },
  sub: {
    name: "Sub",
    note: "Long deep notes, with an occasional re-hit.",
    gen: (c) => eachSlot(c, (span) => (span >= 3 ? [N(0, span - 0.15, "root", 1), N(-0.5, 0.4, "root", 0.6, { chance: 0.3 })] : [N(0, span - 0.1, "root", 1)])),
  },
};

// The order of the buttons: slow and held, then jazz, then groove styles, then electronic.
export const BASS_STYLES = [
  "roots", "twofeel", "ballad", "walking", "walkghost", "boogie", "bossa", "latin", "lofi", "neosoul", "soul",
  "funk", "disco", "eighths", "reggae", "vamp", "arp", "offbeat", "rolling", "sub",
];
export const BASS_STYLE_NAMES = Object.fromEntries(BASS_STYLES.map((id) => [id, STYLES[id].name]));
export const BASS_STYLE_NOTES = Object.fromEntries(BASS_STYLES.map((id) => [id, STYLES[id].note]));

// ---- Placing notes on chords ----
const slotAt = (c, at) => c.slots.find((s) => at >= s.start - 1e-6 && at < s.start + s.span - 1e-6) ?? c.slots[c.slots.length - 1];

function resolveMidi(n, c, rng) {
  if (n.midi != null) return n.midi;
  const s = slotAt(c, n.abs);
  const r = s.root;
  const i = s.info;
  switch (n.tone) {
    case "octave":
      return r + 12;
    case "third":
      return r + i.third;
    case "fifth":
      return r + i.fifth;
    case "fifthLow":
      // below the root when the root is above F#1, else above, so the bass stays in its best octave
      return r + i.fifth - (r > 34 ? 12 : 0);
    case "seventh":
      return r + (i.seventh ?? 10);
    case "sixth":
      return r + 9;
    case "next":
      return s.nextRoot;
    case "approach": {
      // a half step from the side the line is on
      const t = s.nextRoot;
      return t + (r > t ? 1 : r < t ? -1 : rng() < 0.5 ? -1 : 1);
    }
    default:
      return r;
  }
}

/** The bar's notes, resolved to pitches and cut to fit their chords. */
function layoutBar(def, c) {
  let notes = def.gen(c);
  if (def.tile && c.beats > 4) {
    // Meters longer than four: the four-beat figure repeats, and the bar's own ending stays at the end.
    const base = notes.filter((n) => n.at >= 0);
    const tail = notes.filter((n) => n.at < 0);
    const more = [];
    for (let shift = 4; shift < c.beats; shift += 4) for (const n of base) more.push({ ...n, at: n.at + shift });
    notes = [...base, ...more, ...tail];
  }
  notes = notes
    .map((n) => ({ ...n, abs: n.at < 0 ? c.beats + n.at : n.at }))
    .filter((n) => n.abs >= 0 && n.abs < c.beats - 1e-6);
  if (def.anchors) {
    for (let i = 1; i < c.slots.length; i++) {
      const s = c.slots[i];
      // A note just before the change anticipates it, which is how funk and Latin players take a change.
      for (const n of notes) {
        const gap = s.start - n.abs;
        if (gap > 0 && gap <= 0.5 && !n.art && n.tone !== "approach") {
          n.tone = "next";
          n.midi = undefined;
        }
      }
      // The change itself gets the new chord's root (or its octave), whatever the figure had there.
      const onChange = notes.filter((n) => Math.abs(n.abs - s.start) < 0.13 && n.art !== "dead");
      if (onChange.length === 0) notes.push(N(s.start, Math.min(1.2, s.span - 0.1), "root", 0.92, { abs: s.start }));
      for (const n of onChange) {
        if (n.tone !== "octave") n.tone = "root";
        n.midi = undefined;
      }
    }
  }
  const appr = c.r(90);
  return notes
    .map((n) => {
      const s = slotAt(c, n.abs);
      const end = s.start + s.span - n.abs - 0.03;
      return { ...n, slotIdx: s.idx, dur: n.art === "dead" ? n.dur : Math.max(0.05, Math.min(n.dur, end)), midi: resolveMidi(n, c, appr) };
    })
    .sort((a, b) => a.abs - b.abs);
}

/**
 * @param {{style:string}} bass
 * @param {{form:string[][]}} harmony
 */
export function generateBass(bass, harmony, patternCfg, practice, fromBeat, toBeat) {
  const out = [];
  if (!bass || !harmony || harmony.form.length === 0) return out;
  const def = STYLES[bass.style] ?? STYLES.roots;
  const beats = patternCfg.beats;
  const slots = flattenForm(harmony.form, beats);
  const infos = slots.map((s) => chordTones(s.chord));
  const curs = slots.map((s) => ({ ...(parseChord(s.chord) ?? { root: 0, quality: "maj7" }), name: s.chord }));
  const byBar = harmony.form.map((_, b) => slots.map((s, i) => [s, i]).filter(([s]) => s.bar === b));
  const firstBar = Math.max(0, Math.floor(fromBeat / beats) - 1);
  const lastBar = Math.ceil(toBeat / beats) + 1;
  for (let bar = firstBar; bar <= lastBar; bar++) {
    const pb = bar - practice.countIn;
    if (pb < 0 || !barPlays(practice, bar).harmony) continue;
    const fb = pb % harmony.form.length;
    const c = {
      beats,
      bar,
      fb,
      seed: patternCfg.seed,
      r: (k) => slotRng(patternCfg.seed, bar, k, 50),
      slots: byBar[fb].map(([s, idx]) => {
        const nx = (idx + 1) % slots.length;
        return {
          idx,
          start: s.start,
          span: s.span,
          chord: s.chord,
          cur: curs[idx],
          info: infos[idx],
          root: rootMidi(infos[idx].root),
          nextCur: curs[nx],
          nextRoot: rootMidi(infos[nx].root),
        };
      }),
    };
    if (c.slots.length === 0) continue;
    layoutBar(def, c).forEach((n, k) => {
      const rng = slotRng(patternCfg.seed, bar, 100 + k, 60);
      const plays = rng() < (n.chance ?? 1);
      const nudge = rng();
      const loud = rng();
      if (!plays) return;
      let pos = bar * beats + n.abs;
      if (patternCfg.humanize > 0) pos += (nudge - 0.5) * 2 * patternCfg.humanize * MAX_NUDGE_BEATS;
      if (pos < 0 || pos < fromBeat || pos >= toBeat) return;
      const ev = {
        beat: pos,
        midi: n.midi,
        dur: n.dur,
        gain: Math.min(1, n.vel * (0.9 + loud * 0.2)),
        bar,
        slot: n.slotIdx,
      };
      if (n.art) ev.art = n.art;
      out.push(ev);
    });
  }
  out.sort((a, b) => a.beat - b.beat);
  return out;
}
