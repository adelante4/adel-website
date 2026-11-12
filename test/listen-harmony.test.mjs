import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeHarmony, degreeName, inside } from "../assets/js/metronome/harmonymap.js";
import { findLicks, phrases, shapeOf } from "../assets/js/metronome/licks.js";

const iiVI = [["Dm7"], ["G7"], ["Cmaj7"], ["Cmaj7"]];
const ctx = { form: iiVI, beats: 4 };
// Notes as [beat, note name with octave].
const NOTE = { C: 0, "C#": 1, Db: 1, D: 2, Eb: 3, E: 4, F: 5, "F#": 6, G: 7, Ab: 8, A: 9, Bb: 10, B: 11 };
const m = (name) => 12 * (Number(name.slice(-1)) + 1) + NOTE[name.slice(0, -1)];
const line = (list) => list.map(([beat, name]) => ({ beat, midi: m(name) }));

test("harmony: each note is named against the chord under it", () => {
  // Bar 1 Dm7: F (3rd) A (5th) C (7th) E (9th). Bar 2 G7: B (3rd) C (avoid) Ab then G (approach, root). Bar 3 C: Eb alone (outside).
  const h = analyzeHarmony(line([[0, "F4"], [1, "A4"], [2, "C5"], [3, "E5"], [4, "B4"], [5, "C5"], [6, "Ab4"], [6.5, "G4"], [8, "Eb4"]]), ctx);
  assert.deepEqual(h.rows.map((r) => r.kind), ["guide", "chord", "guide", "colour", "guide", "avoid", "approach", "chord", "outside"]);
  assert.deepEqual(h.rows.map((r) => r.degree), ["3rd", "5th", "7th", "9th", "3rd", "11th", "♭9", "root", "♯9"]);
  assert.equal(h.all.n, 9);
  assert.ok(Math.abs(inside(h.all) - 5 / 9) < 1e-9);
  assert.equal(degreeName(9, "6"), "6th");
  assert.equal(degreeName(6, "m7b5"), "♭5");
});

test("harmony: an anticipation belongs to the chord it leans into, and a detuned guitar is read right", () => {
  // The B on the "and" of 4 in bar 1, held into bar 2, is the 3rd of G7, not the 13th of Dm7.
  const h = analyzeHarmony([{ beat: 0, midi: m("F4") }, { beat: 3.5, midi: m("B4") }, { beat: 5, midi: m("D5") }], ctx);
  assert.equal(h.rows[1].degree, "3rd");
  assert.equal(h.rows[1].early, true);
  // A quarter tone flat of nothing, 30 cents flat of everything: still the same notes.
  const flat = analyzeHarmony(line([[0, "F4"], [1, "A4"], [4, "B4"], [8, "E4"]]).map((n) => ({ ...n, midi: n.midi - 0.3 })), ctx);
  assert.deepEqual(flat.rows.map((r) => r.degree), ["3rd", "5th", "3rd", "3rd"]);
  assert.equal(flat.tuningCents, -30);
});

test("harmony: landing notes, crossing by step into a guide tone, and the 7th falling to the 3rd", () => {
  // Two choruses of the classic outline: 7th of Dm7 (C) falls to the 3rd of G7 (B); 7th of G7 (F) falls to the 3rd of C (E).
  const notes = [];
  for (const c of [0, 1]) {
    const o = c * 16;
    notes.push(...line([[o + 0, "F4"], [o + 1, "A4"], [o + 2, "D5"], [o + 3, "C5"], [o + 4, "B4"], [o + 5, "D5"], [o + 6, "G4"], [o + 7, "F4"], [o + 8, "E4"], [o + 9, "G4"]]));
  }
  const h = analyzeHarmony(notes, ctx);
  assert.equal(h.landings.length, 6);
  assert.equal(h.landingBy.dom.degrees["3rd"], 2);
  assert.equal(h.landingBy.maj.guide, 2);
  assert.equal(h.crossings.n, 4);
  assert.equal(h.crossings.seventhToThird, 4);
  assert.equal(h.crossings.stepIntoGuide, 4);
  // The map of the form: bars 1 to 3 played in both choruses, bar 4 never.
  assert.deepEqual(h.bySlot.map((c) => c.choruses), [2, 2, 2, 0]);
  assert.equal(h.bySlot[3].n, 0);
});

test("harmony: chord tones on and off the beat are counted apart, and the line's shape is described", () => {
  // A descending G bebop scale over G7 from the root: chord tones land on the beats, the rest between them.
  const scale = ["G5", "F#5", "F5", "E5", "D5", "C5", "B4", "A4"];
  const h = analyzeHarmony(line(scale.map((n, i) => [4 + i * 0.5, n])), ctx);
  assert.equal(h.onBeat.n, 4);
  assert.equal(inside(h.onBeat), 1);
  assert.equal(inside(h.offBeat), 0);
  assert.equal(h.moves.step, 7);
  assert.equal(h.moves.down, 7);
  assert.deepEqual(h.range, { low: m("A4"), high: m("G5"), middle: m("E5") });
});

test("licks: a figure played in three keys is one lick, with where it starts", () => {
  // 1-2-3-5 up and back down a third: +2 +2 +3 -3, in C, F and G, with other notes around it.
  const fig = [0, 2, 4, 7, 4];
  const notes = [];
  const put = (start, root) => fig.forEach((s, i) => notes.push({ beat: start + i * 0.5, midi: root + s }));
  put(0, 60);
  notes.push({ beat: 2.5, midi: 58 }, { beat: 3, midi: 55 });
  put(8, 65);
  notes.push({ beat: 10.5, midi: 70 }, { beat: 11, midi: 61 });
  put(16, 67);
  const context = (n) => ({ beatInBar: Math.floor(n.beat % 4) + 1, onBeat: true, numeral: n.beat < 8 ? "I" : "IV", degree: "root" });
  const { licks, coverage } = findLicks([{ id: 1, notes, context }]);
  const top = licks[0];
  assert.deepEqual(top.intervals, [2, 2, 3, -3]);
  assert.equal(top.count, 3);
  assert.equal(top.shape, "lick");
  assert.deepEqual(top.example, [60, 62, 64, 67, 64]);
  assert.equal(top.startBeat.value, 1);
  assert.equal(top.startBeat.share, 1);
  assert.equal(top.from.value, "root");
  // Its pieces (+2 +2 +3 and so on) are not listed as licks of their own.
  assert.ok(!licks.some((l) => l !== top && top.intervals.join().includes(l.intervals.join())));
  assert.ok(Math.abs(coverage - 15 / 19) < 1e-9, String(coverage));
});

test("licks: runs, arpeggios and trills are told apart, and a long scale is not counted against itself", () => {
  assert.equal(shapeOf([2, 2, 1, 2]), "scale");
  assert.equal(shapeOf([3, 4, 3]), "arpeggio");
  assert.equal(shapeOf([2, -2, 2, -2]), "trill");
  assert.equal(shapeOf([0, 0, 0]), "repeat");
  assert.equal(shapeOf([-1, -2, 4, -3]), "lick");
  // One chromatic run of 12 notes: "+1 +1 +1" appears nine times inside it, but it is one run, played once.
  const run = Array.from({ length: 12 }, (_, i) => ({ beat: i * 0.5, midi: 60 + i }));
  assert.equal(findLicks([{ id: 1, notes: run }]).licks.length, 0);
});

test("licks: a figure from an earlier take is recognised, a rest or an unread pitch ends a phrase", () => {
  const fig = (start, root) => [0, -1, -3, 2, 4].map((s, i) => ({ beat: start + i * 0.5, midi: root + s }));
  const old = { id: "a", notes: fig(0, 70) };
  const now = { id: "b", notes: [...fig(0, 62), { beat: 2.5, midi: null }, { beat: 3, midi: 65 }, { beat: 3.5, midi: 67 }] };
  const { licks } = findLicks([old, now]);
  assert.equal(licks[0].count, 2);
  assert.equal(licks[0].takes, 2);
  assert.equal(licks[0].here, 1);
  assert.equal(phrases(now.notes).length, 2);
  assert.equal(phrases([{ beat: 0, midi: 60 }, { beat: 0.5, midi: 62 }, { beat: 3, midi: 64 }]).length, 2);
});

import { coachNotes, SOURCES, noteDrills } from "../assets/js/metronome/coach.js";

test("coach for the notes: root landings, a weak bar and a fixed lick each get named, with real sources", () => {
  // Three choruses. Every chord starts on its root; bar 3 (Cmaj7) is played with notes outside the chord; one lick every chorus on beat 1 of bar 1.
  const notes = [];
  for (let c = 0; c < 3; c++) {
    const o = c * 16;
    notes.push(...line([[o, "D4"], [o + 0.5, "E4"], [o + 1, "F4"], [o + 1.5, "A4"], [o + 2, "F4"], [o + 3, "C5"], [o + 4, "G4"], [o + 5, "B4"], [o + 6, "D5"], [o + 7, "F5"]]));
    notes.push(...line([[o + 8, "C5"], [o + 8.5, "Eb5"], [o + 9, "F#5"], [o + 9.5, "Ab5"], [o + 10, "Bb4"], [o + 10.5, "Db5"], [o + 11, "Eb5"], [o + 11.5, "F#5"]]));
  }
  const h = analyzeHarmony(notes, ctx);
  const byBeat = new Map(h.rows.map((r) => [r.beat, r]));
  const context = (n) => { const r = byBeat.get(n.beat); return { beatInBar: `beat ${Math.floor(n.beat % 4) + 1}`, onBeat: r.onBeat, numeral: r.slot.numeral, degree: r.degree }; };
  const L = findLicks([{ id: 1, notes, context }]);
  const c = coachNotes(h, L, { beats: 4 });
  const ids = c.findings.map((f) => f.id);
  assert.ok(ids.includes("landing") && /root 100%/.test(c.findings.find((f) => f.id === "landing").title), ids.join());
  assert.ok(ids.includes("weak-bar") && /bar 3/.test(c.findings.find((f) => f.id === "weak-bar").title), ids.join());
  const lick = c.findings.find((f) => f.id === "lick");
  assert.ok(lick && /starts on beat 1 100%/.test(lick.text), lick && lick.text);
  assert.ok(c.drill);
  for (const f of c.findings) for (const s of f.sources) assert.ok(SOURCES[s], s);
  for (const make of Object.values(noteDrills)) for (const s of make({ beats: 4 }, { chord: "G7", bar: 1, startBeat: { value: "beat 1" } }).sources) assert.ok(SOURCES[s], s);
  assert.equal(coachNotes(analyzeHarmony(notes.slice(0, 5), ctx), findLicks([{ id: 1, notes: notes.slice(0, 5) }]), { beats: 4 }).enough, false);
});
