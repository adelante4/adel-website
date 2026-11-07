// Guitar voicings for a chord form, led smoothly from chord to chord.
// Four-note shapes on adjacent strings (D G B e, or A D G B), found by search rather than a lookup
// table, so every chord quality works in every key. A path search (Viterbi) then picks one shape per
// chord so the hand and the voices move as little as possible.

import { parseChord } from "./chords.js";

const pc = (n) => ((n % 12) + 12) % 12;
const OPEN = [40, 45, 50, 55, 59, 64]; // E A D G B e
const SETS = [
  [2, 3, 4, 5], // D G B e
  [1, 2, 3, 4], // A D G B
];
const MAX_FRET = 15;
const SPAN = 3; // frets between the lowest and highest finger

// Tones by semitones above the root. req: all must sound. any: at least one must sound. opt: allowed.
const POOL = {
  maj7: { req: [4, 11], opt: [0, 7, 2] },
  "6": { req: [4, 9], opt: [0, 7, 2] },
  maj: { req: [4], opt: [0, 7], triad: true },
  "7": { req: [4, 10], opt: [0, 7, 2, 9] },
  "9": { req: [4, 10, 2], opt: [0, 7, 9] },
  "13": { req: [4, 10, 9], opt: [0, 2, 7] },
  "7alt": { req: [4, 10], any: [8, 1, 3, 6], opt: [0] },
  "7#11": { req: [4, 10, 6], opt: [0, 2, 7] },
  m7: { req: [3, 10], opt: [0, 7, 2] },
  m9: { req: [3, 10, 2], opt: [0, 7] },
  m6: { req: [3, 9], opt: [0, 7, 2] },
  m: { req: [3], opt: [0, 7], triad: true },
  m7b5: { req: [3, 6, 10], opt: [0] },
  dim7: { req: [3, 6, 9], opt: [0] },
  sus4: { req: [5, 10], opt: [0, 7, 2] },
};
const TENSIONS = new Set([1, 2, 3, 6, 8]); // colour tones that cost a little (not in a plain chord)

const DEGREE = ["R", "b9", "9", "b3", "3", "4", "b5", "5", "#5", "6", "b7", "7"];
/** Short label for a tone, as a player would say it for this chord. */
export function degreeLabel(semis, quality) {
  if (quality === "dim7" && semis === 9) return "bb7";
  if (quality === "13" && semis === 9) return "13";
  if (quality === "7alt" && semis === 3) return "#9";
  if (quality === "7#11" && semis === 6) return "#11";
  if ((quality === "7alt" || quality === "m7b5") && semis === 6) return "b5";
  return DEGREE[pc(semis)];
}

/** The two notes that define a chord, as semitones above the root. */
export function guideSemis(quality) {
  const third = { sus4: 5, m7: 3, m9: 3, m6: 3, m: 3, m7b5: 3, dim7: 3 }[quality] ?? 4;
  const seventh = { maj7: 11, "6": 9, m6: 9, dim7: 9, maj: 7, m: 7 }[quality] ?? 10;
  return { third, seventh };
}

const cache = new Map();

/** Every playable shape for a chord, best first. */
function shapesFor(root, quality) {
  const id = `${root}:${quality}`;
  if (cache.has(id)) return cache.get(id);
  const pool = POOL[quality] ?? POOL.maj7;
  const allowed = new Set([...pool.req, ...(pool.any ?? []), ...pool.opt].map((s) => pc(root + s)));
  const need = pool.req.map((s) => pc(root + s));
  const anyOf = (pool.any ?? []).map((s) => pc(root + s));
  const out = [];
  for (let si = 0; si < SETS.length; si++) {
    const strings = SETS[si];
    const rec = (i, frets, pcs) => {
      if (i === 4) {
        if (!need.every((p) => pcs.includes(p))) return;
        if (anyOf.length && !anyOf.some((p) => pcs.includes(p))) return;
        if (!pool.triad && new Set(pcs).size < 4) return;
        const notes = frets.map((f, j) => OPEN[strings[j]] + f);
        const sorted = [...notes].sort((a, b) => a - b);
        const lo = Math.min(...frets);
        const hi = Math.max(...frets);
        const tensions = pcs.filter((p) => TENSIONS.has(pc(p - root)) && !(pool.any ?? []).includes(pc(p - root)) && !pool.req.includes(pc(p - root))).length;
        const extras = pcs.filter((p) => !need.includes(p) && p !== pc(root)).length;
        out.push({
          set: si,
          strings,
          frets,
          notes: sorted,
          semis: frets.map((f, j) => pc(notes[j] - root)),
          lo,
          hi,
          cost: Math.abs((lo + hi) / 2 - 7) * 0.25 + (hi - lo) * 0.15 + tensions * 0.6 + extras * 0.1 + (si === 1 ? 0.3 : 0),
        });
        return;
      }
      for (let f = 1; f <= MAX_FRET; f++) {
        const p = pc(OPEN[strings[i]] + f);
        if (!allowed.has(p)) continue;
        if (frets.length && Math.max(f, ...frets) - Math.min(f, ...frets) > SPAN) continue;
        rec(i + 1, [...frets, f], [...pcs, p]);
      }
    };
    rec(0, [], []);
  }
  out.sort((a, b) => a.cost - b.cost);
  const top = out.slice(0, 40);
  cache.set(id, top);
  return top;
}

const move = (a, b) => {
  let d = 0;
  for (let i = 0; i < 4; i++) d += Math.abs(a.notes[i] - b.notes[i]);
  return d + 0.4 * Math.abs((a.lo + a.hi) / 2 - (b.lo + b.hi) / 2) + (a.set !== b.set ? 1.5 : 0);
};

/**
 * One shape per chord, with the least movement overall.
 * @param {string[]} chords chord names, in order
 * @returns {({set:number,strings:number[],frets:number[],semis:number[],notes:number[],lo:number,hi:number}|null)[]}
 */
export function voiceForm(chords) {
  const parsed = chords.map((c) => parseChord(c) ?? { root: 0, quality: "maj7" });
  const options = parsed.map((c) => shapesFor(c.root, c.quality));
  const n = options.length;
  if (!n) return [];
  const best = options.map((o) => o.map(() => ({ cost: Infinity, from: -1 })));
  options[0].forEach((o, j) => (best[0][j].cost = o.cost));
  for (let i = 1; i < n; i++) {
    options[i].forEach((b, j) => {
      options[i - 1].forEach((a, k) => {
        const c = best[i - 1][k].cost + move(a, b) + b.cost;
        if (c < best[i][j].cost) best[i][j] = { cost: c, from: k };
      });
    });
  }
  let j = best[n - 1].reduce((m, x, idx, arr) => (x.cost < arr[m].cost ? idx : m), 0);
  const path = new Array(n);
  for (let i = n - 1; i >= 0; i--) {
    path[i] = options[i][j] ?? null;
    j = best[i][j]?.from ?? 0;
  }
  return path;
}

/** How the hand moves between two shapes, in words. */
export function handMove(a, b) {
  if (!a || !b) return "";
  const d = Math.round((b.lo + b.hi) / 2 - (a.lo + a.hi) / 2);
  if (d === 0) return a.frets.join() === b.frets.join() && a.set === b.set ? "same shape" : "same position";
  return `${d > 0 ? "up" : "down"} ${Math.abs(d)} fret${Math.abs(d) === 1 ? "" : "s"}`;
}
