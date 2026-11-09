// Song form: finds the sections of a chord form (AABA, ABAC, AB, a 12-bar blues...) from the chords alone.
// Pure functions. No DOM, no audio.
//
// The idea: cut the form into equal chunks (8 bars for most standards), call two chunks the same section when
// their bars match, and treat the last two bars as free, because the usual difference between two A sections
// is the ending (a turnaround the first time, a resolution the last). A section that matches but ends
// differently gets a prime: A, A′.
import { parseChord } from "./chords.js?v=20261109e";
import { classOf } from "./analysis.js?v=20261109e";

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
/** Section lengths to try, in order. The first one whose parts repeat wins; long forms try 16 first. */
const LENGTHS = [8, 16, 12, 4, 6, 10];
const LONG_LENGTHS = [16, 8, 12, 4, 6, 10];
/** Only 8 and 16 bars may leave a short tag at the end, and only a form that fits 4 bars twice is cut into 4s. */
const MAX_FOR_FOUR = 16;

/** A chord reduced to its root and its job, so Dm7 and Dm9 count as the same, and G7 and G7alt too. */
function sig(text) {
  const c = parseChord(text);
  return c ? { r: c.root, c: classOf(c.quality) } : { r: -1, c: text };
}
const barSig = (bar) => bar.map(sig);

/** Do two bars hold the same chords, once the second is moved down by `shift` semitones? */
function sameBar(a, b, shift) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].c !== b[i].c) return false;
    if (a[i].r >= 0 && ((a[i].r + shift) % 12 + 12) % 12 !== b[i].r) return false;
  }
  return true;
}

/**
 * How alike two chunks are: the share of matching bars, and whether the free ending also matches.
 * Tries every key, so a section played again a fourth higher still counts as the same section.
 */
function compare(a, b, len) {
  const free = len >= 8 ? 2 : len >= 5 ? 1 : 0;
  const core = len - free;
  // A section that never leaves one or two chords (So What, Cantaloupe Island) is not "the same" in another key.
  const moving = new Set(a.slice(0, core || len).flatMap((bar) => bar.map((x) => `${x.r}${x.c}`))).size >= 3;
  let best = null;
  for (let shift = 0; shift < 12; shift++) {
    if (shift !== 0 && !moving) break;
    let same = 0;
    for (let i = 0; i < core; i++) if (sameBar(a[i], b[i], shift)) same++;
    let tail = 0;
    for (let i = core; i < len; i++) if (sameBar(a[i], b[i], shift)) tail++;
    const r = { core: core ? same / core : 1, exact: same === core && tail === free, shift };
    if (!best || r.core > best.core || (r.core === best.core && r.exact && !best.exact)) best = r;
  }
  return best;
}

/** Equal chunks, plus a short tail (a tag) of up to half a chunk when the form does not divide evenly. */
function cut(sigs, len) {
  const chunks = [];
  for (let s = 0; s < sigs.length; s += len) chunks.push(sigs.slice(s, s + len));
  return chunks;
}

/** Label the chunks: a letter per distinct section, a prime where the ending differs from its first appearance. */
function label(chunks, len) {
  const first = []; // the first chunk of each letter
  const out = [];
  let repeats = 0;
  for (const c of chunks) {
    let hit = -1;
    let exact = false;
    let shift = 0;
    if (c.length < len) {
      // A tail shorter than a section: the same as the start of an earlier one, or a tag of its own.
      const k = first.findIndex((f) => c.every((x, i) => sameBar(f[i], x, 0)));
      if (k >= 0) {
        repeats++;
        out.push({ letter: k, prime: false, short: c.length });
      } else out.push({ letter: -1, prime: false, short: c.length });
      continue;
    }
    for (let k = 0; k < first.length; k++) {
      const r = compare(first[k], c, len);
      if (r.core >= 0.75) {
        hit = k;
        exact = r.exact;
        shift = r.shift;
        break;
      }
    }
    if (hit < 0) {
      first.push(c);
      out.push({ letter: first.length - 1, prime: false });
    } else {
      repeats++;
      out.push({ letter: hit, prime: !exact, shift });
    }
  }
  return { out, repeats, kinds: first.length };
}

/**
 * @param {string[][]} form  bars, each one or two chords
 * @returns {{name:string, len:number, kind:string|null, sections:{letter:string, prime:boolean, start:number, bars:number, label:string, shift:number}[]}|null}
 *   `shift` is how many semitones higher a repeat of a section is played than its first appearance.
 *   null when the form has no clear sections (very short, or nothing repeats and it does not split evenly).
 */
export function detectForm(form) {
  const n = form.length;
  if (n < 4) return null;
  const sigs = form.map(barSig);
  let pick = null;
  let fallback = null;
  for (const len of n >= 48 ? LONG_LENGTHS : LENGTHS) {
    const tail = n % len;
    if (len === 4 && n > MAX_FOR_FOUR) continue;
    // Whole sections only, or (for 8 and 16) a tag of two or more bars after them: a 32-bar tune with a 4-bar tag.
    if (tail !== 0 && !(len >= 8 && tail >= 2 && tail <= len / 2 && n - tail >= 2 * len)) continue;
    const chunks = cut(sigs, len);
    if (chunks.length < 2) continue;
    const l = label(chunks, len);
    if (l.repeats > 0) {
      pick = { len, l };
      break;
    }
    // Nothing repeats. An even split into at most four parts of 8 or more bars can still be shown as A B C D.
    if (!fallback && tail === 0 && len >= 8 && chunks.length <= 4) fallback = { len, l };
  }
  pick ??= fallback;
  if (!pick) return null;
  const sections = pick.l.out.map((o, i) => {
    const letter = o.letter < 0 ? "Tag" : (LETTERS[o.letter] ?? "?");
    return {
      letter,
      prime: o.prime,
      start: i * pick.len,
      bars: o.short ?? pick.len,
      shift: ((o.shift ?? 0) % 12 + 12) % 12,
      label: letter + (o.prime ? "\u2032" : ""),
    };
  });
  const name = sections.filter((s) => s.letter !== "Tag").map((s) => s.letter).join("") + (sections.some((s) => s.letter === "Tag") ? " + tag" : "");
  return { name, len: pick.len, sections, kind: n === 12 ? "12-bar blues" : null };
}

/** Where bar `b` sits: its section, and the bar number within it (1-based). */
export function locate(detected, b) {
  if (!detected) return null;
  const i = Math.min(detected.sections.length - 1, Math.floor(b / detected.len));
  const s = detected.sections[i];
  return { section: s, index: i, bar: b - s.start + 1 };
}
