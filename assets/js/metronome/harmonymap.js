// The harmony map: every note of a take, read against the chord that was sounding. Pure code.
//
// For each note it answers: which chord was it played over, and what is it in that chord?
//   guide    the 3rd or the 7th (the 6th on a sixth chord): the two notes that say which chord it is
//   chord    the root or the 5th
//   colour   a note of the chord's scale that is not in the chord: 9th, 11th, 13th and their altered forms
//   avoid    in the scale, but it rubs against the chord when held: the natural 4th over a major or dominant chord
//   approach outside the scale, and the very next note is a chord tone a half step away: a chromatic approach
//   outside  outside the scale, and not resolved that way
//
// From that it builds what teachers look at in a transcription:
//   - chord tones on the beat against off the beat (the reason for the bebop scales: Baker's added passing tone
//     keeps chord tones on the beats);
//   - the first note on each new chord, by chord type ("landing notes");
//   - how the line crosses each chord change: by step into a guide tone, and whether a 7th falls to the next 3rd
//     (the voice leading in Ligon's outlines);
//   - a map of the form: how inside the playing is in each bar, over all choruses.
// Octaves do not matter here, only note names, so an octave slip of the pitch reader changes nothing.
import { parseChord } from "./chords.js?v=20261112b";
import { flattenForm } from "./comping.js?v=20261112b";
import { analyze, classOf, noteName } from "./analysis.js?v=20261112b";
import { scaleFor } from "./scales.js?v=20261112b";

const pc = (n) => ((n % 12) + 12) % 12;

// Chord tones by quality, as semitones above the root: [guide tones, other chord tones].
const TONES = {
  maj7: [[4, 11], [0, 7]], "6": [[4, 9], [0, 7]], maj: [[4], [0, 7]],
  "7": [[4, 10], [0, 7]], "9": [[4, 10], [0, 7]], "13": [[4, 10], [0, 7]], "7alt": [[4, 10], [0]], "7#11": [[4, 10], [0, 7]],
  sus4: [[5, 10], [0, 7]],
  m7: [[3, 10], [0, 7]], m9: [[3, 10], [0, 7]], m6: [[3, 9], [0, 7]], m: [[3], [0, 7]],
  m7b5: [[3, 10], [0, 6]], dim7: [[3, 9], [0, 6]],
};
const NAMES = ["root", "♭9", "9th", "♯9", "3rd", "11th", "♯11", "5th", "♭13", "13th", "7th", "7th"];
/** What a note is called over a chord: "3rd", "♭9", "13th"... */
export function degreeName(interval, quality) {
  const cls = classOf(quality);
  const [guides] = TONES[quality] ?? TONES.maj7;
  if (interval === 3 && (cls === "min" || cls === "hdim" || cls === "dim")) return "3rd";
  if (interval === 6 && (cls === "hdim" || cls === "dim")) return "♭5";
  if (interval === 9 && guides.includes(9)) return quality === "dim7" ? "7th" : "6th";
  if (interval === 5 && quality === "sus4") return "4th";
  if (interval === 11 && cls === "dom") return "maj 7th";
  if (interval === 10 && cls === "maj") return "♭7";
  return NAMES[interval];
}

const KINDS = ["guide", "chord", "colour", "avoid", "approach", "outside"];
const tally = () => ({ n: 0, guide: 0, chord: 0, colour: 0, avoid: 0, approach: 0, outside: 0 });
const add = (t, kind) => {
  t.n++;
  t[kind]++;
};
/** Share of chord tones (guide tones, roots and fifths) in a tally. */
export const inside = (t) => (t.n ? (t.guide + t.chord) / t.n : 0);

/** The slot of the form sounding at a beat, counted after the count-in. */
function slotter(form, beats, countIn) {
  const slots = flattenForm(form, beats);
  const an = analyze(form);
  const info = slots.map((s, i) => {
    const c = parseChord(s.chord) ?? { root: 0, quality: "maj7" };
    const next = slots[(i + 1) % slots.length];
    const a = an.slots[i] ?? {};
    const scale = scaleFor(s.chord, next.chord, a.numeral ?? "");
    const [guides, others] = TONES[c.quality] ?? TONES.maj7;
    return { ...s, index: i, root: c.root, quality: c.quality, cls: classOf(c.quality), numeral: a.numeral ?? "", role: a.pos ?? null, guides, others, scale: scale ? scale.semis : [0, 2, 4, 5, 7, 9, 11] };
  });
  const byBar = new Map();
  for (const s of info) {
    if (!byBar.has(s.bar)) byBar.set(s.bar, []);
    byBar.get(s.bar).push(s);
  }
  const at = (beat) => {
    // A first note a little ahead of the bar line belongs to the first bar, not to the count-in.
    let b = beat - countIn * beats;
    if (b < -0.5) return null;
    if (b < 0) b = 0;
    const bar = Math.floor(b / beats);
    const inBar = b - bar * beats;
    const list = byBar.get(bar % form.length);
    const slot = list.length === 2 && inBar >= list[1].start ? list[1] : list[0];
    return { slot, chorus: Math.floor(bar / form.length), starts: (bar * beats + slot.start) + countIn * beats, ends: bar * beats + slot.start + slot.span + countIn * beats };
  };
  return { info, at, flats: an.flats, key: an.key };
}

function classify(interval, slot) {
  if (slot.guides.includes(interval)) return "guide";
  if (slot.others.includes(interval)) return "chord";
  if (slot.scale.includes(interval)) {
    const hard = (slot.cls === "maj" || (slot.cls === "dom" && slot.quality !== "sus4")) && interval === 5;
    return hard ? "avoid" : "colour";
  }
  return "outside";
}

/**
 * @param {{beat:number, midi:number|null}[]} notes
 * @param {{form:string[][], beats:number, countIn?:number}} ctx
 */
export function analyzeHarmony(notes, { form, beats, countIn = 0 }) {
  const { info, at, flats } = slotter(form, beats, countIn);
  const pitched = notes.filter((n) => n.midi !== null && n.midi !== undefined && n.beat >= countIn * beats - 0.5).sort((a, b) => a.beat - b.beat);
  // The guitar may be tuned a little off concert pitch: find the common offset and take it out.
  let sx = 0;
  let sy = 0;
  for (const n of pitched) {
    const f = (n.midi - Math.round(n.midi)) * 2 * Math.PI;
    sx += Math.cos(f);
    sy += Math.sin(f);
  }
  const tuning = pitched.length ? Math.atan2(sy, sx) / (2 * Math.PI) : 0;

  const rows = [];
  pitched.forEach((n, i) => {
    let where = at(n.beat);
    if (!where) return;
    const midi = Math.round(n.midi - tuning);
    // A note just before a chord change, held across it, belongs to the new chord: an anticipation.
    const next = pitched[i + 1];
    let early = false;
    if (where.ends - n.beat <= 0.55 && (!next || next.beat - where.ends >= 0.3)) {
      const after = at(where.ends + 0.01);
      if (after && after.slot.index !== where.slot.index && after.slot.chord !== where.slot.chord) {
        where = after;
        early = true;
      }
    }
    const slot = where.slot;
    const interval = pc(midi - slot.root);
    const d = n.beat - Math.round(n.beat);
    rows.push({ beat: n.beat, midi, slot, chorus: where.chorus, starts: where.starts, interval, kind: classify(interval, slot), degree: degreeName(interval, slot.quality), onBeat: Math.abs(d) <= 0.18, early });
  });
  // Chromatic approach: an outside or avoid note whose next note, soon after, is a chord tone a half step away.
  for (let i = 0; i + 1 < rows.length; i++) {
    const a = rows[i];
    const b = rows[i + 1];
    if ((a.kind === "outside" || a.kind === "avoid") && b.beat - a.beat <= 1.05 && Math.abs(b.midi - a.midi) === 1 && (b.kind === "guide" || b.kind === "chord")) a.kind = "approach";
  }

  const all = tally();
  const onBeat = tally();
  const offBeat = tally();
  const bySlot = info.map((s) => ({ slot: s, ...tally(), choruses: new Set() }));
  const byClass = {};
  const degrees = {};
  for (const r of rows) {
    add(all, r.kind);
    add(r.onBeat ? onBeat : offBeat, r.kind);
    const cell = bySlot[r.slot.index];
    add(cell, r.kind);
    cell.choruses.add(r.chorus);
    byClass[r.slot.cls] ??= tally();
    add(byClass[r.slot.cls], r.kind);
    degrees[r.slot.cls] ??= {};
    degrees[r.slot.cls][r.degree] = (degrees[r.slot.cls][r.degree] ?? 0) + 1;
  }

  // Landing notes and crossings: one per chord change that was played over.
  const landings = [];
  const seen = new Set();
  rows.forEach((r, i) => {
    const id = `${r.chorus}:${r.slot.index}`;
    if (seen.has(id)) return;
    seen.add(id);
    if (r.beat - r.starts > 1.0) return; // came in late: not a landing
    // The same chord carried over the bar line is not a change.
    const before = info[(r.slot.index - 1 + info.length) % info.length];
    if (info.length > 1 && before.chord === r.slot.chord) return;
    const prev = rows[i - 1];
    const crossed = prev && r.beat - prev.beat <= 1.05 && prev.slot.index !== r.slot.index;
    const step = crossed ? Math.abs(r.midi - prev.midi) : null;
    landings.push({
      beat: r.beat,
      slot: r.slot,
      degree: r.degree,
      kind: r.kind,
      crossed: Boolean(crossed),
      byStep: crossed && step >= 1 && step <= 2,
      // The 7th of the old chord falling a step to the 3rd of the new one.
      seventhToThird: crossed && prev.slot.guides[1] !== undefined && prev.interval === prev.slot.guides[1] && r.interval === r.slot.guides[0] && r.midi - prev.midi <= -1 && r.midi - prev.midi >= -2,
      fromSeventh: crossed && prev.slot.guides[1] !== undefined && prev.interval === prev.slot.guides[1],
    });
  });
  const landingBy = {};
  for (const l of landings) {
    const c = (landingBy[l.slot.cls] ??= { n: 0, degrees: {}, guide: 0, root: 0 });
    c.n++;
    c.degrees[l.degree] = (c.degrees[l.degree] ?? 0) + 1;
    if (l.kind === "guide") c.guide++;
    if (l.degree === "root") c.root++;
  }
  const crossings = landings.filter((l) => l.crossed);

  // The shape of the lines: how notes follow each other inside a phrase.
  const moves = { n: 0, repeat: 0, step: 0, third: 0, leap: 0, up: 0, down: 0 };
  for (let i = 0; i + 1 < rows.length; i++) {
    if (rows[i + 1].beat - rows[i].beat > 1.5) continue;
    const d = rows[i + 1].midi - rows[i].midi;
    const a = Math.abs(d);
    moves.n++;
    if (a === 0) moves.repeat++;
    else if (a <= 2) moves.step++;
    else if (a <= 4) moves.third++;
    else moves.leap++;
    if (d > 0) moves.up++;
    if (d < 0) moves.down++;
  }
  const midis = rows.map((r) => r.midi).sort((a, b) => a - b);

  return {
    notes: rows.length,
    unpitched: notes.filter((n) => n.beat >= countIn * beats - 0.5).length - pitched.length,
    tuningCents: Math.round(tuning * 100),
    flats,
    all,
    onBeat,
    offBeat,
    bySlot: bySlot.map((c) => ({ ...c, choruses: c.choruses.size })),
    byClass,
    degrees,
    landings,
    landingBy,
    crossings: {
      n: crossings.length,
      byStep: crossings.filter((l) => l.byStep).length,
      intoGuide: crossings.filter((l) => l.kind === "guide").length,
      stepIntoGuide: crossings.filter((l) => l.byStep && l.kind === "guide").length,
      fromSeventh: crossings.filter((l) => l.fromSeventh).length,
      seventhToThird: crossings.filter((l) => l.seventhToThird).length,
    },
    moves,
    range: midis.length ? { low: midis[0], high: midis[midis.length - 1], middle: midis[midis.length >> 1] } : null,
    rows,
    slots: info,
    kinds: KINDS,
    name: (midi) => noteName(midi, flats),
  };
}
