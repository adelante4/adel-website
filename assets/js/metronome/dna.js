// Tune DNA: which four-bar pieces of a tune show up in other tunes.
// A piece is matched by its shape (root movement and chord class), not by key, so a ii-V-I in Bb
// matches one in F. Pure functions.

import { parseChord } from "./chords.js";
import { classOf } from "./analysis.js";

const pc = (n) => ((n % 12) + 12) % 12;
const WINDOW = 4;

/** A tune's name without a rank or a key: "12. Autumn Leaves (Gm)" to "autumn leaves". */
export const plainName = (name) =>
  name
    .replace(/^\d+\.\s*/, "")
    .replace(/\s*\([^)]*\)\s*$/, "")
    .toLowerCase()
    .replace(/^(my|the)\s+/, "")
    .trim();

function flat(form, from, to) {
  const out = [];
  for (let b = from; b < to; b++) {
    for (const text of form[b]) {
      const c = parseChord(text) ?? { root: 0, quality: "maj7" };
      out.push({ root: c.root, cls: classOf(c.quality), text });
    }
  }
  return out;
}

/** The shape of a stretch of chords, or null when it is too plain to mean anything. */
function shape(slots) {
  if (new Set(slots.map((s) => `${s.root}${s.cls}`)).size < 3) return null;
  const r0 = slots[0].root;
  return slots.map((s) => `${pc(s.root - r0)}${s.cls}`).join(" ");
}

/** @param {{id:string,name:string,form:string[][]}[]} tunes */
export function buildIndex(tunes) {
  const map = new Map();
  for (const t of tunes) {
    for (let b = 0; b + WINDOW <= t.form.length; b++) {
      const sh = shape(flat(t.form, b, b + WINDOW));
      if (!sh) continue;
      if (!map.has(sh)) map.set(sh, []);
      map.get(sh).push({ id: t.id, name: t.name, bar: b });
    }
  }
  return map;
}

/** A tune's name as a person says it: no rank, no key. */
export const shortName = (name) => name.replace(/^\d+\.\s*/, "").replace(/\s*\([^)]*\)\s*$/, "");

/**
 * Four-bar pieces of `form` that other tunes share, without overlapping. A piece that comes back in the
 * same tune lists every place it starts. Less common pieces come first, since those say the most.
 * @returns {{starts:number[],chords:string,tunes:{id:string,name:string,bar:number}[]}[]}
 */
export function sharedPieces(form, index, selfName, limit = 4) {
  const self = plainName(selfName ?? "");
  const groups = new Map();
  // Phrases start on bars 1, 5, 9 ...
  for (let b = 0; b + WINDOW <= form.length; b += WINDOW) {
    const slots = flat(form, b, b + WINDOW);
    const sh = shape(slots);
    if (!sh) continue;
    let g = groups.get(sh);
    if (!g) {
      const seen = new Set();
      const tunes = [];
      for (const m of index.get(sh) ?? []) {
        const key = plainName(m.name);
        if (key === self || seen.has(key)) continue;
        seen.add(key);
        tunes.push(m);
      }
      if (!tunes.length) continue;
      g = { starts: [], chords: slots.map((x) => x.text).join(" "), tunes };
      groups.set(sh, g);
    }
    g.starts.push(b);
  }
  const rank = (g) => (g.tunes.length === 1 ? 1000 : g.tunes.length);
  const found = [...groups.values()].sort((x, y) => rank(x) - rank(y) || x.starts[0] - y.starts[0]);
  const used = new Set();
  const picked = [];
  for (const g of found) {
    if (picked.length >= limit) break;
    const bars = g.starts.flatMap((b) => [b, b + 1, b + 2, b + 3]);
    if (bars.some((x) => used.has(x))) continue;
    bars.forEach((x) => used.add(x));
    picked.push(g);
  }
  return picked.sort((x, y) => x.starts[0] - y.starts[0]);
}
