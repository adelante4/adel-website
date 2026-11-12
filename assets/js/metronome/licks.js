// Your licks: the melodic figures you play more than once. Pure code.
//
// The definition is the one used in the research on recorded solos: a pattern is a run of intervals (the steps
// between one note and the next, in semitones) that occurs at least twice. Counting intervals, not notes, makes
// a figure the same figure in any key. Norgaard (2014) found that 82.6% of the notes in 48 Charlie Parker solos
// begin a four-interval pattern that comes back; Frieler's work on the Weimar Jazz Database finds five-interval
// patterns (six notes) the most telling length. Repeating yourself is how the language works. The question a
// teacher asks is which figures, how often, and whether they always come out the same way.
//
// What this does:
//   - cuts the notes into phrases (a rest, or a note whose pitch could not be read, ends a phrase);
//   - finds every run of 3 to 8 intervals that occurs twice or more, in this take and in the takes kept from before;
//   - drops trills and repeated notes, and any figure that is only ever a piece of a longer one;
//   - sorts each into scale run, arpeggio, or lick (Frieler's rough classes);
//   - says where each one happens: which beat it starts on, over which chord, from which chord tone.

const key = (iv) => iv.join(",");

/** Phrases as lists of notes with a readable pitch. */
export function phrases(notes, rest = 1.5) {
  const out = [];
  let cur = [];
  let last = -Infinity;
  for (const n of [...notes].sort((a, b) => a.beat - b.beat)) {
    const ok = n.midi !== null && n.midi !== undefined;
    if (!ok || n.beat - last >= rest) {
      if (cur.length) out.push(cur);
      cur = [];
    }
    if (ok) cur.push({ ...n, midi: Math.round(n.midi) });
    last = n.beat;
  }
  if (cur.length) out.push(cur);
  return out;
}

/** Scale run, arpeggio, trill, repeat or lick. */
export function shapeOf(iv) {
  if (iv.every((x) => x === 0)) return "repeat";
  const dirs = new Set(iv.map(Math.sign));
  const oneWay = dirs.size === 1 && !dirs.has(0);
  if (oneWay && iv.every((x) => Math.abs(x) <= 2)) return "scale";
  if (oneWay && iv.every((x) => Math.abs(x) >= 3 && Math.abs(x) <= 4)) return "arpeggio";
  // A trill or a rocking figure: the same two or three notes over and over.
  if (iv.length >= 3) {
    let p = 0;
    const seen = new Set([0]);
    for (const x of iv) {
      p += x;
      seen.add(p);
    }
    if (seen.size <= 2 || (seen.size <= 3 && iv.length >= 5)) return "trill";
  }
  return "lick";
}

/**
 * @param {{id:string|number, notes:{beat:number, midi:number|null}[], context?:(note:object)=>object}[]} takes
 *   The newest take last. `context(note)` may give {beatInBar, onBeat, numeral, degree, chord} for a note.
 * @returns {{licks:object[], coverage:number, notes:number, distinct:number}}
 *   coverage: the share of this take's notes that sit inside a figure you played at least twice.
 */
export function findLicks(takes, { minLen = 3, maxLen = 8, coverLen = 4 } = {}) {
  const table = new Map();
  const current = takes.length - 1;
  takes.forEach((take, t) => {
    phrases(take.notes).forEach((ph, pi) => {
      const iv = [];
      for (let i = 0; i + 1 < ph.length; i++) iv.push(ph[i + 1].midi - ph[i].midi);
      for (let n = minLen; n <= maxLen; n++) {
        for (let i = 0; i + n <= iv.length; i++) {
          const slice = iv.slice(i, i + n);
          if (slice.some((x) => Math.abs(x) > 12)) continue;
          const k = key(slice);
          let e = table.get(k);
          if (!e) table.set(k, (e = { intervals: slice, at: [] }));
          e.at.push({ take: t, phrase: pi, index: i, all: iv, phraseNotes: ph, first: ph[i], notes: ph.slice(i, i + n + 1), context: take.context });
        }
      }
    });
  });

  // A figure longer than the longest window shows up as a row of overlapping windows. Grow each window to
  // the left and right for as long as every one of its copies agrees, so the whole figure is found once.
  const grown = new Map();
  for (const e of table.values()) {
    if (e.at.length < 2) continue;
    let left = 0;
    let right = 0;
    const n = e.intervals.length;
    const agree = (offset) => {
      const v = e.at[0].all[e.at[0].index + offset];
      if (v === undefined || Math.abs(v) > 12) return false;
      return e.at.every((a) => a.all[a.index + offset] === v);
    };
    while (left < 24 && agree(-left - 1)) left++;
    while (right < 24 && agree(n + right)) right++;
    if (!left && !right) {
      if (!grown.has(key(e.intervals))) grown.set(key(e.intervals), e);
      continue;
    }
    const a0 = e.at[0];
    const intervals = a0.all.slice(a0.index - left, a0.index + n + right);
    const k = key(intervals);
    if (grown.has(k)) continue;
    grown.set(k, {
      intervals,
      at: e.at.map((a) => {
        const ph = a.phraseNotes;
        const i = a.index - left;
        return { ...a, index: i, first: ph[i], notes: ph.slice(i, i + intervals.length + 1) };
      }),
    });
  }

  // Keep what comes back, and is not a trill or a repeated note.
  let found = [...grown.values()].filter((e) => e.at.length >= 2).map((e) => ({ ...e, shape: shapeOf(e.intervals) })).filter((e) => e.shape !== "repeat" && e.shape !== "trill");
  // Two overlapping copies inside one long scale run are one run, not two uses.
  for (const e of found) {
    const kept = [];
    for (const a of e.at) {
      const prev = kept[kept.length - 1];
      const same = prev && prev.take === a.take && prev.phrase === a.phrase;
      if (same && a.index < prev.index + e.intervals.length) continue;
      // A run or an arpeggio that simply carries on in the same direction is still the same run.
      if (same && (e.shape === "scale" || e.shape === "arpeggio")) {
        const dir = Math.sign(e.intervals[0]);
        const big = e.shape === "arpeggio";
        const between = a.all.slice(prev.index + e.intervals.length, a.index);
        if (between.every((x) => Math.sign(x) === dir && (big ? Math.abs(x) >= 3 && Math.abs(x) <= 4 : Math.abs(x) <= 2))) continue;
      }
      kept.push(a);
    }
    e.at = kept;
  }
  found = found.filter((e) => e.at.length >= 2);
  // A figure that only appears as part of a longer one (give or take one use) is not a figure of its own.
  const byLen = [...found].sort((a, b) => b.intervals.length - a.intervals.length);
  const kept = [];
  for (const e of byLen) {
    const k = key(e.intervals);
    const inside = kept.find((big) => big.intervals.length > e.intervals.length && big.at.length >= e.at.length - 1 && `,${key(big.intervals)},`.includes(`,${k},`));
    if (!inside) kept.push(e);
  }

  // Coverage of the newest take, by figures of at least `coverLen` intervals.
  const cur = takes[current];
  const curPhrases = cur ? phrases(cur.notes) : [];
  const total = curPhrases.reduce((s, p) => s + p.length, 0);
  const covered = curPhrases.map((p) => new Uint8Array(p.length));
  for (const e of found) {
    if (e.intervals.length < coverLen) continue;
    for (const a of e.at) if (a.take === current) for (let j = 0; j <= e.intervals.length; j++) covered[a.phrase][a.index + j] = 1;
  }
  const inFigure = covered.reduce((s, c) => s + c.reduce((x, y) => x + y, 0), 0);

  const licks = kept.map((e) => {
    const here = e.at.filter((a) => a.take === current);
    const ctx = e.at.map((a) => (a.context ? a.context(a.first) : null)).filter(Boolean);
    const count = (f) => {
      const m = new Map();
      for (const c of ctx) {
        const v = f(c);
        if (v !== undefined && v !== null) m.set(v, (m.get(v) ?? 0) + 1);
      }
      return [...m.entries()].sort((a, b) => b[1] - a[1]);
    };
    const top = (list) => (list.length ? { value: list[0][0], share: list[0][1] / ctx.length } : null);
    const example = (here[0] ?? e.at[e.at.length - 1]).notes;
    return {
      intervals: e.intervals,
      shape: e.shape,
      length: e.intervals.length + 1,
      count: e.at.length,
      here: here.length,
      takes: new Set(e.at.map((a) => a.take)).size,
      example: example.map((n) => n.midi),
      exampleBeats: example.map((n) => n.beat - example[0].beat),
      startBeat: top(count((c) => c.beatInBar)),
      onBeat: ctx.length ? ctx.filter((c) => c.onBeat).length / ctx.length : null,
      over: top(count((c) => c.numeral)),
      from: top(count((c) => c.degree)),
      // How much of your playing this one figure is, in this take.
      weight: total ? (here.length * (e.intervals.length + 1)) / total : 0,
    };
  });
  // The ones worth looking at first: real licks before runs, long and frequent before short and rare.
  const rank = (l) => (l.shape === "lick" ? 3 : 1) * l.count * Math.sqrt(l.length);
  licks.sort((a, b) => rank(b) - rank(a));
  return { licks, coverage: total ? inFigure / total : 0, notes: total, distinct: licks.filter((l) => l.shape === "lick").length };
}
