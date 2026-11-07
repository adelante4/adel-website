// Harmonic analysis of a chord form: what each chord does, in the key it is working in.
// Pure functions. No DOM, no audio.
//
// The idea is the one jazz players use: find the cadences (ii-V-I, ii-V-i, V-I, tritone-substituted
// V-I), name each chord by its function in the key that cadence points at, and name everything else
// by its function in the key of the tune.

import { parseChord, ROOTS } from "./chords.js";

const pc = (n) => ((n % 12) + 12) % 12;

const CLASS = {
  maj7: "maj", "6": "maj", maj: "maj",
  "7": "dom", "9": "dom", "13": "dom", "7alt": "dom", "7#11": "dom", sus4: "dom",
  m7: "min", m9: "min", m6: "min", m: "min",
  m7b5: "hdim", dim7: "dim",
};
export const classOf = (quality) => CLASS[quality] ?? "maj";

const DEGREE = ["I", "bII", "II", "bIII", "III", "IV", "#IV", "V", "bVI", "VI", "bVII", "VII"];

/** Roman numeral for a chord `offset` semitones above the key's tonic. Lower case for minor-ish chords. */
export function numeral(offset, cls) {
  let n = DEGREE[pc(offset)];
  if (cls === "min" || cls === "hdim" || cls === "dim") n = n.replace(/[IV]+/, (m) => m.toLowerCase());
  return n + (cls === "hdim" ? "ø" : cls === "dim" ? "°" : "");
}

// Chord classes that belong to a key, by semitones above the tonic.
const DIATONIC = {
  major: { 0: ["maj", "dom"], 2: ["min"], 4: ["min"], 5: ["maj", "dom"], 7: ["dom", "maj", "min"], 9: ["min"], 11: ["hdim"] },
  minor: { 0: ["min"], 2: ["hdim", "min"], 3: ["maj"], 5: ["min"], 7: ["dom"], 8: ["maj"], 10: ["dom", "maj"] },
};

const FLAT_MAJOR = new Set([0, 5, 10, 3, 8, 1, 6]);
/** Whether to spell notes with flats in a key. */
export function prefersFlats(root, mode) {
  return FLAT_MAJOR.has(mode === "minor" ? pc(root + 3) : root);
}
const FLAT_NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
const SHARP_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
export const noteName = (n, flats) => (flats ? FLAT_NAMES : SHARP_NAMES)[pc(n)];
export const keyName = (root, mode) => `${ROOTS[pc(root)]}${mode === "minor" ? "m" : ""}`;

export function analyze(form) {
  const slots = [];
  form.forEach((bar, b) =>
    bar.forEach((text, k) => {
      const c = parseChord(text) ?? { root: 0, quality: "maj7" };
      slots.push({ bar: b, k, root: c.root, quality: c.quality, cls: classOf(c.quality) });
    }),
  );
  const n = slots.length;

  // 1. Cadences: a dominant that falls a fifth (or a half step) onto a major or minor chord.
  const found = [];
  for (let i = 0; i < n; i++) {
    const s = slots[i];
    if (s.cls !== "dom") continue;
    const t = (i + 1) % n;
    const T = slots[t];
    if (t === i || T.cls === "hdim" || T.cls === "dim") continue;
    const gap = pc(s.root - T.root);
    if (gap !== 7 && gap !== 1) continue;
    const mode = T.cls === "min" ? "minor" : "major";
    let ii = -1;
    const p = (i - 1 + n) % n;
    if (p !== i && p !== t) {
      const P = slots[p];
      if (pc(P.root - T.root) === 2 && (P.cls === "min" || (mode === "minor" && P.cls === "hdim"))) ii = p;
    }
    found.push({ ii, v: i, t, keyRoot: T.root, mode, sub: gap === 1, domTarget: T.cls === "dom" });
  }
  // 2. The key of the tune: the one that fits the chords best and that the tune comes home to.
  let best = { score: -1, root: 0, mode: "major" };
  for (const mode of ["major", "minor"]) {
    for (let root = 0; root < 12; root++) {
      let score = 0;
      for (const s of slots) if (DIATONIC[mode][pc(s.root - root)]?.includes(s.cls)) score += 1;
      for (const c of found) if (!c.domTarget && c.keyRoot === root && c.mode === mode) score += 1;
      const home = (s) => pc(s.root - root) === 0 && (mode === "major" ? s.cls === "maj" || s.cls === "dom" : s.cls === "min");
      const last = slots[n - 1];
      if (home(slots[0])) score += 3;
      if (home(last) || (last.cls === "dom" && pc(last.root - root) === 7 && home(slots[0]))) score += 4;
      if (score > best.score) best = { score, root, mode };
    }
  }
  const key = { root: best.root, mode: best.mode, name: keyName(best.root, best.mode) };

  // A dominant chord is only a home (as in the blues) when it is the tonic of the key.
  const kept = found.filter((c) => !c.domTarget || (c.keyRoot === key.root && key.mode === "major"));
  // A target that is itself the ii of another cadence is a passing goal ("V of ii"), not a key.
  const iiSet = new Set(kept.filter((c) => c.ii >= 0).map((c) => c.ii));
  const cadences = [];
  const secondary = [];
  for (const c of kept) (iiSet.has(c.t) ? secondary : cadences).push(c);

  // 3. Name every chord.
  // In a minor key, chords that sit in the relative major (bIII, bVI, bVII) are read there: Eb in Gm is IV of Bb.
  const plainNumeral = (s) => {
    if (key.mode === "minor") {
      const off = pc(s.root - key.root);
      const rel = pc(s.root - (key.root + 3));
      if ([3, 8, 10].includes(off) && DIATONIC.major[rel]?.includes(s.cls)) return numeral(rel, s.cls);
    }
    return numeral(pc(s.root - key.root), s.cls);
  };
  const out = slots.map((s) => ({
    bar: s.bar,
    k: s.k,
    numeral: plainNumeral(s),
    keyRoot: key.root,
    keyMode: key.mode,
    cad: null,
    pos: null,
  }));
  const list = cadences.map((c, id) => {
    const { ii, v, t } = c;
    const role = (i, text, pos) => {
      out[i].numeral = text;
      out[i].keyRoot = c.keyRoot;
      out[i].keyMode = c.mode;
      out[i].cad = id;
      out[i].pos = pos;
    };
    if (ii >= 0) role(ii, numeral(pc(slots[ii].root - c.keyRoot), slots[ii].cls), "start");
    role(v, c.sub ? "subV" : "V", ii >= 0 ? "mid" : "start");
    role(t, c.mode === "major" ? "I" : "i", "end");
    const parts = [ii >= 0 ? numeral(2, slots[ii].cls) : null, c.sub ? "subV" : "V", c.mode === "major" ? "I" : "i"].filter(Boolean);
    const kk = { root: c.keyRoot, mode: c.mode, name: keyName(c.keyRoot, c.mode) };
    return {
      id,
      kind: parts.join("–"),
      key: kk,
      first: ii >= 0 ? ii : v,
      last: t,
      away: kk.root !== key.root || kk.mode !== key.mode,
    };
  });
  for (const c of secondary) out[c.v].numeral = `V/${out[c.t].numeral}`;

  // 4. What is in the tune, as a short list.
  const counts = new Map();
  for (const c of list) counts.set(c.kind, (counts.get(c.kind) ?? 0) + 1);
  let turnarounds = 0;
  const plain = out.map((o) => o.numeral);
  for (let i = 0; i + 3 < n; i++) {
    if (key.mode === "major" && !out[i].cad && plain[i] === "I" && plain[i + 1] === "vi" && plain[i + 2] === "ii" && plain[i + 3] === "V") turnarounds++;
  }
  const idioms = [...counts].map(([label, count]) => ({ label, count }));
  if (turnarounds) idioms.push({ label: "I–vi–ii–V turnaround", count: turnarounds });
  if (secondary.length) idioms.push({ label: "secondary dominant", count: secondary.length });
  const centers = [key.name, ...list.filter((c) => c.away).map((c) => c.key.name)].filter((x, i, a) => a.indexOf(x) === i);

  return { key, slots: out, cadences: list, idioms, centers, flats: prefersFlats(key.root, key.mode) };
}
