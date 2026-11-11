// The timing analysis against takes with planted, known habits.
import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeTiming, analyzePacing, summarize } from "../assets/js/metronome/timefeel.js";
import { mulberry32 } from "../assets/js/metronome/prng.js";

const gauss = (r) => Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r());
const practice = { gap: null, trade: 0, countIn: 1, ladder: null };

/** Eighth-note lines with planted habits. All amounts in ms. */
function take({ bars = 48, bpm = 140, feel = 2 / 3, downLate = 0, upLate = 0, spread = 8, beat4 = 0, driftPerMin = 0, upLouder = 0, seed = 1, rests = true }) {
  const r = mulberry32(seed);
  const ms = 60000 / bpm;
  const notes = [];
  for (let bar = 1; bar <= bars; bar++) {
    if (rests && bar % 4 === 0) continue;
    for (let b = 0; b < 4; b++) {
      const at = bar * 4 + b;
      const drift = (driftPerMin * (at * ms)) / 60000;
      const d = downLate + (b === 3 ? beat4 : 0) + drift + gauss(r) * spread;
      notes.push({ beat: at + d / ms, level: -20 + gauss(r) });
      if (r() < 0.8) notes.push({ beat: at + feel + (upLate + drift + gauss(r) * spread) / ms, level: -20 + upLouder + gauss(r) });
    }
  }
  return { notes, ctx: { beats: 4, feel, msPerBeat: () => ms, practice, bpmAt: () => bpm } };
}

test("timefeel: recovers a laid-back downbeat with locked offbeats, and the swing ratio that follows from it", () => {
  const { notes, ctx } = take({ downLate: 28, upLate: 2, spread: 9 });
  const t = analyzeTiming(notes, ctx);
  assert.ok(Math.abs(t.down.mean - 28) < 3, `downbeats ${t.down.mean.toFixed(1)}`);
  assert.ok(t.down.sure);
  assert.ok(Math.abs(t.up.mean - 2) < 3, `offbeats ${t.up.mean.toFixed(1)}`);
  assert.ok(Math.abs(t.down.sd - 9) < 2, `spread ${t.down.sd.toFixed(1)}`);
  // 28 ms later downbeat, offbeat nearly in place, at 140: the pair is (0.667*428.6 + 2 - 28) / 428.6 = 0.606 of a beat.
  assert.ok(Math.abs(t.swing.share - 0.606) < 0.01, `share ${t.swing.share.toFixed(3)}`);
  assert.ok(Math.abs(t.swing.ratio - 1.54) < 0.08, `ratio ${t.swing.ratio.toFixed(2)}`);
  assert.ok(Math.abs(t.swing.band - 2) < 0.01);
  assert.ok(Math.abs(t.down.percent - 6.5) < 0.8);
});

test("timefeel: a rushed beat 4 is found and the other beats are not accused", () => {
  const { notes, ctx } = take({ beat4: -18, spread: 8, seed: 4 });
  const t = analyzeTiming(notes, ctx);
  const b4 = t.byBeat[3];
  assert.ok(b4.sure && Math.abs(b4.mean - -13.5) < 4, `beat 4: ${b4.mean.toFixed(1)}`); // -18 against an average that it pulls down by 4.5
  for (const b of t.byBeat.slice(0, 3)) assert.ok(Math.abs(b.mean) < 8, `beat ${b.beat}: ${b.mean.toFixed(1)}`);
});

test("timefeel: a steady player is not told anything", () => {
  let wrong = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const { notes, ctx } = take({ spread: 10, seed, bars: 32 });
    const t = analyzeTiming(notes, ctx);
    if (t.byBeat.some((b) => b.sure)) wrong++;
    if (t.drift.sure && Math.abs(t.drift.msPerMinute) > 6) wrong++;
    assert.ok(Math.abs(t.down.mean) < 4);
  }
  // Twenty takes, four beats and a drift each: by chance alone a few flags are expected, most takes none.
  assert.ok(wrong <= 4, `${wrong} false statements in 20 clean takes`);
});

test("timefeel: drift over the take, in ms per minute", () => {
  const { notes, ctx } = take({ driftPerMin: 20, spread: 8, bars: 64, seed: 3 });
  const t = analyzeTiming(notes, ctx);
  assert.ok(t.drift.sure);
  assert.ok(Math.abs(t.drift.msPerMinute - 20) < 5, `drift ${t.drift.msPerMinute.toFixed(1)}`);
});

test("timefeel: offbeat accents in dB, straight eighths, and too few notes", () => {
  const { notes, ctx } = take({ upLouder: 3, feel: 0.5, seed: 6 });
  const t = analyzeTiming(notes, ctx);
  assert.ok(t.accent.sure && Math.abs(t.accent.mean - 3) < 0.6, `accent ${t.accent.mean.toFixed(2)}`);
  assert.ok(Math.abs(t.swing.ratio - 1) < 0.05);
  const few = analyzeTiming(notes.slice(0, 5), ctx);
  assert.equal(few.swing.enough, false);
  assert.equal(few.down.sure, false);
});

test("timefeel: in the silent bars of the gap trainer, speeding up shows as a shift per bar", () => {
  const r = mulberry32(9);
  const ms = 500;
  const p = { gap: { audible: 2, silent: 2 }, trade: 0, countIn: 0, ladder: null };
  const notes = [];
  for (let bar = 0; bar < 64; bar++) {
    const k = bar % 4;
    for (let b = 0; b < 4; b++) {
      const early = k >= 2 ? -6 * ((k - 2) * 4 + b + 1) : 0; // 6 ms earlier on every beat without the band
      notes.push({ beat: bar * 4 + b + (early + gauss(r) * 7) / ms });
    }
  }
  const t = analyzeTiming(notes, { beats: 4, feel: 0.5, msPerBeat: () => ms, practice: p });
  assert.ok(t.silence.sure && Math.abs(t.silence.msPerBar - -24) < 5, `per bar ${t.silence.msPerBar.toFixed(1)}`);
  assert.ok(t.silence.byBar[1].mean < t.silence.byBar[0].mean);
  assert.ok(Math.abs(t.down.mean) < 3, "the bars with the band are judged on their own");
});

test("timefeel: outliers do not move the summary", () => {
  const s = summarize([1, 2, 3, 2, 1, 2, 3, 2, 400]);
  assert.equal(s.outliers, 1);
  assert.ok(Math.abs(s.mean - 2) < 0.1);
});

test("pacing: phrases, rest share and where phrases start", () => {
  const { notes } = take({ bars: 32 });
  const p = analyzePacing(notes, { beats: 4, countIn: 1, totalBeats: 33 * 4 });
  assert.equal(p.count, 8); // three bars of playing, one of rest, eight times
  assert.ok(Math.abs(p.restShare - 0.25) < 0.05, `rest ${p.restShare.toFixed(2)}`);
  assert.ok(Math.abs(p.medianLength - 12) < 0.8, `length ${p.medianLength}`);
  assert.equal(p.startOnOne, 1);
  const none = analyzePacing(take({ bars: 16, rests: false }).notes, { beats: 4, countIn: 1, totalBeats: 68 });
  assert.equal(none.count, 1);
  assert.ok(none.restShare < 0.05);
});
