import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeTiming, analyzePacing } from "../assets/js/metronome/timefeel.js";
import { coach, SOURCES, drills } from "../assets/js/metronome/coach.js";
import { normalizeState, defaultState } from "../assets/js/metronome/share.js";
import { mulberry32 } from "../assets/js/metronome/prng.js";

const gauss = (r) => Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r());
const practice = { gap: null, trade: 0, countIn: 0, ladder: null };
function run({ bpm = 140, feel = 2 / 3, downLate = 0, upLate = 0, spread = 9, beat4 = 0, upLouder = 0, rests = true, calibrated = true, bars = 48, seed = 2 }) {
  const r = mulberry32(seed);
  const ms = 60000 / bpm;
  const notes = [];
  for (let bar = 0; bar < bars; bar++) {
    if (rests && bar % 4 === 3) continue;
    for (let b = 0; b < 4; b++) {
      notes.push({ beat: bar * 4 + b + (downLate + (b === 3 ? beat4 : 0) + gauss(r) * spread) / ms, level: -20 + gauss(r) * 0.5 });
      notes.push({ beat: bar * 4 + b + feel + (upLate + gauss(r) * spread) / ms, level: -20 + upLouder + gauss(r) * 0.5 });
    }
  }
  const t = analyzeTiming(notes, { beats: 4, feel, msPerBeat: () => ms, practice, bpmAt: () => bpm });
  const p = analyzePacing(notes, { beats: 4, totalBeats: bars * 4 });
  return coach(t, p, { bpm, beats: 4, calibrated });
}
const ids = (c) => c.findings.map((f) => f.id);

test("coach: late downbeats with locked offbeats are named as the pattern from the records, not as a fault", () => {
  const c = run({ downLate: 30, upLate: 1 });
  const f = c.findings.find((x) => x.id === "laidback-locked");
  assert.ok(f, ids(c).join());
  assert.ok(!f.drill);
  assert.deepEqual(f.sources, ["nelias", "friberg"]);
  assert.match(f.text, /9% of a beat/);
});

test("coach: everything late, rushing, a rushed beat 4, heavy downbeats and no rests each get their own drill", () => {
  assert.equal(run({ downLate: 30, upLate: 30 }).drill.id, "offbeat");
  assert.equal(run({ downLate: -22, upLate: -20 }).drill.id, "halftime");
  const b4 = run({ beat4: -22 });
  assert.ok(ids(b4).includes("beat"));
  assert.equal(b4.drill.id, "backbeat");
  assert.equal(run({ upLouder: -4 }).findings.find((f) => f.id === "accent").drill.id, "offbeat");
  assert.equal(run({ rests: false }).drill.id, "playrest");
  assert.equal(run({ spread: 40 }).drill.id, "slow");
});

test("coach: without a measured delay it does not say ahead or behind", () => {
  const c = run({ downLate: 30, upLate: 30, calibrated: false });
  assert.ok(ids(c).includes("uncalibrated"));
  assert.ok(!ids(c).includes("all-late"));
  assert.equal(c.headline.find((h) => h.label === "Downbeats").value, "?");
  assert.ok(c.headline.find((h) => h.label === "Spread"));
});

test("coach: too few notes gives no numbers", () => {
  const t = analyzeTiming([{ beat: 1 }, { beat: 2 }], { beats: 4, feel: 0.5, msPerBeat: () => 500, practice });
  const c = coach(t, null, { bpm: 120, beats: 4, calibrated: true });
  assert.equal(c.enough, false);
  assert.equal(c.headline.length, 0);
});

test("coach: every source a finding or drill names exists, and every drill patch is a valid page state", () => {
  const ctx = { bpm: 150, beats: 4, calibrated: true };
  for (const make of Object.values(drills)) {
    const d = make(ctx);
    for (const s of d.sources) assert.ok(SOURCES[s], s);
    const base = defaultState();
    const merged = normalizeState({ ...base, pattern: { ...base.pattern, ...d.patch.pattern }, practice: { ...base.practice, ...d.patch.practice }, groove: { ...base.groove, ...d.patch.groove } });
    if (d.patch.pattern?.clickOn) assert.equal(merged.pattern.clickOn, d.patch.pattern.clickOn);
    if (d.patch.practice?.gap) assert.deepEqual(merged.practice.gap, d.patch.practice.gap);
  }
  for (const c of [run({}), run({ downLate: 30 }), run({ downLate: -20 }), run({ feel: 0.75, bpm: 150 })]) for (const f of c.findings) for (const s of f.sources) assert.ok(SOURCES[s], s);
  for (const s of Object.values(SOURCES)) {
    assert.match(s.url, /^https:\/\//);
    assert.ok(s.short && s.cite);
  }
});
