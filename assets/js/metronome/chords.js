// Chord names, voicings and voice leading. Pure functions, no Web Audio.
//
// A chord is a string like "Cmaj7" or "Bb7alt": a root, then a quality from QUALITIES.
// Voicings are guide-tone voicings for an electric piano: third, seventh and a colour tone,
// without the root (the bass note is separate). Each chord is placed as close as possible to
// the one before it, so the top line moves in small steps instead of jumping.

export const ROOTS = ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
const ROOT_ALIASES = { "C#": 1, "D#": 3, Gb: 6, "G#": 8, "A#": 10, Cb: 11, "E#": 5, Fb: 4, "B#": 0 };

/** id, text shown, semitones above the root of the voiced tones (colour tones included). */
export const QUALITIES = [
  { id: "maj7", label: "maj7", tones: [4, 7, 11, 14] },
  { id: "6", label: "6", tones: [4, 7, 9, 14] },
  { id: "maj", label: "major", tones: [4, 7, 14] },
  { id: "7", label: "7", tones: [4, 10, 14, 21] },
  { id: "9", label: "9", tones: [4, 10, 14, 7] },
  { id: "13", label: "13", tones: [4, 10, 14, 21] },
  { id: "7alt", label: "7alt", tones: [4, 10, 13, 20] },
  { id: "7#11", label: "7#11", tones: [4, 10, 14, 18] },
  { id: "m7", label: "m7", tones: [3, 7, 10, 14] },
  { id: "m9", label: "m9", tones: [3, 10, 14, 7] },
  { id: "m6", label: "m6", tones: [3, 7, 9, 14] },
  { id: "m", label: "minor", tones: [3, 7, 14] },
  { id: "m7b5", label: "m7b5", tones: [3, 6, 10, 17] },
  { id: "dim7", label: "dim7", tones: [3, 6, 9, 12] },
  { id: "sus4", label: "sus4", tones: [5, 7, 10, 14] },
];
const QUALITY = new Map(QUALITIES.map((q) => [q.id, q]));

const pc = (n) => ((n % 12) + 12) % 12;

/** "Bb7alt" to { root: 10, quality: "7alt" }, or null. */
export function parseChord(text) {
  if (typeof text !== "string") return null;
  const m = /^([A-G])([#b]?)(.*)$/.exec(text.trim());
  if (!m) return null;
  const name = m[1] + m[2];
  let root = ROOTS.indexOf(name);
  if (root < 0) root = ROOT_ALIASES[name] ?? -1;
  if (root < 0) return null;
  const quality = QUALITY.has(m[3]) ? m[3] : m[3] === "" ? "maj" : m[3] === "min" ? "m" : null;
  return quality ? { root, quality } : null;
}

export const formatChord = (c) => ROOTS[pc(c.root)] + c.quality;

/** A valid chord in its canonical spelling, or the fallback. */
export function cleanChord(text, fallback = "Cmaj7") {
  const c = parseChord(text);
  return c ? formatChord(c) : fallback;
}

export function transposeChord(text, semitones) {
  const c = parseChord(text);
  return c ? formatChord({ root: pc(c.root + semitones), quality: c.quality }) : text;
}

/** Pitch classes of the voiced tones, in importance order. */
export function chordPitchClasses(c) {
  const q = QUALITY.get(c.quality);
  const out = [];
  for (const t of q.tones) {
    const p = pc(c.root + t);
    if (!out.includes(p)) out.push(p);
  }
  return out;
}

const LOW = 46;
const HIGH = 76;

function candidates(pcs) {
  const out = [];
  for (let start = LOW; start <= LOW + 14; start++) {
    for (let r = 0; r < pcs.length; r++) {
      const order = pcs.slice(r).concat(pcs.slice(0, r));
      const notes = [];
      let prev = start - 1;
      for (const p of order) {
        let n = prev + 1;
        while (pc(n) !== p) n++;
        notes.push(n);
        prev = n;
      }
      if (notes[notes.length - 1] <= HIGH && notes[0] >= LOW) out.push(notes);
    }
  }
  return out;
}

function distance(a, b) {
  const n = Math.max(a.length, b.length);
  let d = 0;
  for (let i = 0; i < n; i++) d += Math.abs((a[i] ?? a[a.length - 1]) - (b[i] ?? b[b.length - 1]));
  return d;
}

/** Voicing for one chord near the previous voicing (or near a comfortable middle when none). */
export function voiceChord(text, previous = null) {
  const c = parseChord(text) ?? { root: 0, quality: "maj7" };
  let best = null;
  let bestScore = Infinity;
  for (const notes of candidates(chordPitchClasses(c))) {
    const top = notes[notes.length - 1];
    const span = top - notes[0];
    let score = Math.max(0, span - 14) * 3;
    score += previous ? distance(notes, previous) : Math.abs(top - 67) + Math.abs(notes[0] - 55) * 0.5;
    if (score < bestScore) {
      bestScore = score;
      best = notes;
    }
  }
  return best;
}

/** One voicing per chord, each led from the one before. */
export function voiceChords(list) {
  const out = [];
  let prev = null;
  for (const text of list) {
    prev = voiceChord(text, prev);
    out.push(prev);
  }
  return out;
}

/** MIDI note for the bass: the root between C2 and B2. */
export function bassNote(text) {
  const c = parseChord(text);
  return 36 + (c ? c.root : 0);
}

export const midiToHz = (m) => 440 * Math.pow(2, (m - 69) / 12);

/** Starting points for a progression. Each bar holds one chord, or two for a split bar. */
export const PRESETS = [
  { id: "turn", name: "I vi ii V", form: [["Cmaj7"], ["Am7"], ["Dm7"], ["G7"]] },
  { id: "lofi", name: "Lofi descent", form: [["Fmaj7"], ["Em7"], ["Dm9"], ["Cmaj7"]] },
  { id: "two-bar", name: "Turnaround (2 bars)", form: [["Cmaj7", "A7alt"], ["Dm7", "G7"]] },
  { id: "minor", name: "Minor ii V i", form: [["Dm7b5"], ["G7alt"], ["Cm6"], ["Cm6"]] },
  {
    id: "cycle",
    name: "Cycle of fifths (8)",
    form: [["Cm7"], ["F7"], ["Bbmaj7"], ["Ebmaj7"], ["Am7b5"], ["D7alt"], ["Gm6"], ["Gm6"]],
  },
  {
    id: "blues",
    name: "Jazz blues (12)",
    form: [["F7"], ["Bb7"], ["F7"], ["Cm7", "F7"], ["Bb7"], ["Bdim7"], ["F7"], ["Am7", "D7"], ["Gm7"], ["C7"], ["F7", "D7alt"], ["Gm7", "C7"]],
  },
  {
    id: "rhythm",
    name: "Rhythm changes A (8)",
    form: [["Bbmaj7", "G7"], ["Cm7", "F7"], ["Dm7", "G7"], ["Cm7", "F7"], ["Fm7", "Bb7"], ["Ebmaj7", "Edim7"], ["Dm7", "G7"], ["Cm7", "F7"]],
  },
];
