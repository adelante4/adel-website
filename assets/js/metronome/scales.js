// What to play over a chord: the scale that fits it, its arpeggio, and a tone to aim for.
// Pure functions, no DOM, no audio. Semitones are counted up from the chord's root.
import { parseChord } from "./chords.js?v=20261108s";
import { classOf, noteName } from "./analysis.js?v=20261108s";

const pc = (n) => ((n % 12) + 12) % 12;

const SCALES = {
  ionian: ["Ionian (major)", [0, 2, 4, 5, 7, 9, 11]],
  lydian: ["Lydian", [0, 2, 4, 6, 7, 9, 11]],
  mixo: ["Mixolydian", [0, 2, 4, 5, 7, 9, 10]],
  lydDom: ["Lydian dominant", [0, 2, 4, 6, 7, 9, 10]],
  altered: ["Altered", [0, 1, 3, 4, 6, 8, 10]],
  dorian: ["Dorian", [0, 2, 3, 5, 7, 9, 10]],
  phrygian: ["Phrygian", [0, 1, 3, 5, 7, 8, 10]],
  aeolian: ["Aeolian (natural minor)", [0, 2, 3, 5, 7, 8, 10]],
  locrian: ["Locrian ♮2", [0, 2, 3, 5, 6, 8, 10]],
  wholeHalf: ["Diminished (whole-half)", [0, 2, 3, 5, 6, 8, 9, 11]],
};

/** The chord's arpeggio, as [semitones, label]. */
const ARP = {
  maj7: [[0, "root"], [4, "3rd"], [7, "5th"], [11, "7th"]],
  "6": [[0, "root"], [4, "3rd"], [7, "5th"], [9, "6th"]],
  maj: [[0, "root"], [4, "3rd"], [7, "5th"]],
  "7": [[0, "root"], [4, "3rd"], [7, "5th"], [10, "7th"]],
  "9": [[0, "root"], [4, "3rd"], [7, "5th"], [10, "7th"]],
  "13": [[0, "root"], [4, "3rd"], [7, "5th"], [10, "7th"]],
  "7alt": [[0, "root"], [4, "3rd"], [8, "♭13"], [10, "7th"]],
  "7#11": [[0, "root"], [4, "3rd"], [7, "5th"], [10, "7th"]],
  m7: [[0, "root"], [3, "3rd"], [7, "5th"], [10, "7th"]],
  m9: [[0, "root"], [3, "3rd"], [7, "5th"], [10, "7th"]],
  m6: [[0, "root"], [3, "3rd"], [7, "5th"], [9, "6th"]],
  m: [[0, "root"], [3, "3rd"], [7, "5th"]],
  m7b5: [[0, "root"], [3, "3rd"], [6, "♭5"], [10, "7th"]],
  dim7: [[0, "root"], [3, "3rd"], [6, "♭5"], [9, "7th"]],
  sus4: [[0, "root"], [5, "4th"], [7, "5th"], [10, "7th"]],
};

/**
 * The scale for a chord. `next` is the chord after it (a dominant that falls to a minor chord gets the altered
 * scale), `numeral` its Roman numeral in the key it works in (a major chord on IV gets Lydian).
 */
export function scaleFor(chord, next = null, numeral = "") {
  const c = parseChord(chord);
  if (!c) return null;
  const n = next ? parseChord(next) : null;
  let id;
  switch (c.quality) {
    case "maj7": case "6": case "maj": id = numeral === "IV" || numeral === "bII" ? "lydian" : "ionian"; break;
    case "7": case "9": case "13": {
      const toMinor = n && pc(n.root - c.root) === 5 && ["min", "hdim"].includes(classOf(n.quality));
      id = c.quality === "7" && toMinor ? "altered" : "mixo";
      break;
    }
    case "7alt": id = "altered"; break;
    case "7#11": id = "lydDom"; break;
    case "m7": case "m9": case "m6": case "m": id = numeral === "iii" ? "phrygian" : numeral === "vi" ? "aeolian" : "dorian"; break;
    case "m7b5": id = "locrian"; break;
    case "dim7": id = "wholeHalf"; break;
    default: id = "mixo";
  }
  const [name, semis] = SCALES[id];
  return { id, name, semis, root: c.root, quality: c.quality };
}

/** Note names of the scale and of the arpeggio. */
export function playFor(chord, flats, next = null, numeral = "") {
  const s = scaleFor(chord, next, numeral);
  if (!s) return null;
  const arp = (ARP[s.quality] ?? ARP.maj).map(([semi, label]) => ({ label, note: noteName(s.root + semi, flats), semi }));
  return { name: s.name, scale: s.semis.map((x) => noteName(s.root + x, flats)), arp, root: s.root };
}

/** A tone to aim for in a chord: the same choice every time for the same count, different from one count to the next. */
export function targetFor(chord, flats, count) {
  const p = playFor(chord, flats);
  if (!p) return null;
  const pool = p.arp.filter((t) => t.label !== "root" || count % 5 === 0);
  const h = Math.imul(count + 1, 2654435761) >>> 0;
  return pool[(h >>> 7) % pool.length];
}
