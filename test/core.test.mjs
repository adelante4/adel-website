import { test } from "node:test";
import assert from "node:assert/strict";

import { hashInts, mulberry32, slotRng } from "../assets/js/metronome/prng.js";
import { compileTimeline, timeAtBeat, beatAtTime, bpmAtBeat, subFraction } from "../assets/js/metronome/timeline.js";
import { parseMeter, groupingOptions, defaultGrouping, accentsFromGrouping, matchGrouping, isValidGrouping } from "../assets/js/metronome/meter.js";
import { barPlays, ladderMap } from "../assets/js/metronome/overlay.js";
import { generateEvents } from "../assets/js/metronome/pattern.js";
import { createTransport } from "../assets/js/metronome/transport.js";
import { createTapTempo, clampBpm, tempoWord } from "../assets/js/metronome/tempo.js";
import { defaultState, defaultLevels, normalizeState, encodeShare, decodeShare } from "../assets/js/metronome/share.js";

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} is not within ${eps} of ${b}`);
const stateWith = (patch = {}, practice = {}) => {
  const s = defaultState();
  Object.assign(s.pattern, patch);
  Object.assign(s.practice, practice);
  return normalizeState(s);
};

// ---- prng ----
test("slot generator is deterministic and varies with the slot", () => {
  assert.equal(slotRng(1, 2, 3, 0)(), slotRng(1, 2, 3, 0)());
  assert.notEqual(slotRng(1, 2, 3, 0)(), slotRng(1, 3, 3, 0)());
  assert.notEqual(slotRng(1, 2, 3, 0)(), slotRng(2, 2, 3, 0)());
  assert.ok(hashInts(1, 2, 3) >= 0);
});

test("generator output is in [0, 1) and roughly uniform", () => {
  const r = mulberry32(42);
  let sum = 0;
  for (let i = 0; i < 20000; i++) {
    const x = r();
    assert.ok(x >= 0 && x < 1);
    sum += x;
  }
  near(sum / 20000, 0.5, 0.02);
});

// ---- timeline ----
test("steady tempo maps beats to seconds both ways", () => {
  const tl = compileTimeline(120);
  near(timeAtBeat(tl, 4), 2);
  near(beatAtTime(tl, 2), 4);
  near(beatAtTime(tl, timeAtBeat(tl, 7.3)), 7.3);
});

test("tempo map: time accumulates across segments and inverts", () => {
  const tl = compileTimeline(60, [{ atBeat: 4, bpm: 120 }, { atBeat: 8, bpm: 240 }]);
  near(timeAtBeat(tl, 4), 4);
  near(timeAtBeat(tl, 8), 6);
  near(timeAtBeat(tl, 12), 7);
  for (const b of [0, 1.5, 4, 5.25, 8, 11.9, 20]) near(beatAtTime(tl, timeAtBeat(tl, b)), b, 1e-9);
  assert.equal(bpmAtBeat(tl, 3.9), 60);
  assert.equal(bpmAtBeat(tl, 4), 120);
});

test("a map point at beat 0 replaces the starting tempo", () => {
  const tl = compileTimeline(60, [{ atBeat: 0, bpm: 90 }]);
  assert.equal(tl.segments.length, 1);
  assert.equal(tl.segments[0].bpm, 90);
});

test("swing delays the second note of each pair; triplets stay even", () => {
  near(subFraction(0, 2, 0.5), 0);
  near(subFraction(1, 2, 0.5), 0.5);
  near(subFraction(1, 2, 2 / 3), 2 / 3);
  near(subFraction(1, 4, 0.5), 0.25);
  near(subFraction(2, 4, 0.5), 0.5);
  near(subFraction(3, 4, 0.5), 0.75);
  near(subFraction(1, 3, 0.9), 1 / 3);
  near(subFraction(2, 3, 0.9), 2 / 3);
});

// ---- meter ----
test("meters parse and reject nonsense", () => {
  assert.deepEqual(parseMeter("7/8"), { beats: 7, den: 8 });
  assert.deepEqual(parseMeter(" 4 / 4 "), { beats: 4, den: 4 });
  for (const bad of ["", "7", "0/4", "17/4", "4/5", "a/b", "4/4/4", null, undefined]) assert.equal(parseMeter(bad), null);
});

test("groupings add up and match their accents", () => {
  for (let n = 1; n <= 16; n++) {
    for (const g of groupingOptions(n)) assert.ok(isValidGrouping(g, n), `${n}: ${g}`);
  }
  assert.deepEqual(defaultGrouping(7), [2, 2, 3]);
  assert.deepEqual(accentsFromGrouping([2, 2, 3]), [2, 1, 2, 1, 2, 1, 1]);
  assert.deepEqual(groupingOptions(7).map((g) => g.join("+")).sort(), ["2+2+3", "2+3+2", "3+2+2"]);
  const levels = accentsFromGrouping([2, 3]);
  assert.equal(groupingOptions(5)[matchGrouping(levels, 5)].join("+"), "2+3");
  assert.equal(matchGrouping([2, 2, 1, 1, 1], 5), -1);
});

// ---- practice rules ----
test("gap trainer alternates audible and silent bars", () => {
  const practice = { gap: { audible: 2, silent: 2 }, trade: 0, countIn: 0, ladder: null };
  const clicks = [0, 1, 2, 3, 4, 5, 6, 7].map((b) => barPlays(practice, b).click);
  assert.deepEqual(clicks, [true, true, false, false, true, true, false, false]);
});

test("trade: the groove drops out, the click stays", () => {
  const practice = { gap: null, trade: 4, countIn: 0, ladder: null };
  const g = [...Array(16).keys()].map((b) => barPlays(practice, b).groove);
  assert.deepEqual(g, [...Array(4).fill(true), ...Array(4).fill(false), ...Array(4).fill(true), ...Array(4).fill(false)]);
  assert.ok([...Array(16).keys()].every((b) => barPlays(practice, b).click));
});

test("count-in is click only, and the cycles start after it", () => {
  const practice = { gap: { audible: 1, silent: 1 }, trade: 0, countIn: 2, ladder: null };
  assert.deepEqual(barPlays(practice, 0), { click: true, groove: false });
  assert.deepEqual(barPlays(practice, 1), { click: true, groove: false });
  assert.equal(barPlays(practice, 2).click, true);
  assert.equal(barPlays(practice, 3).click, false);
  assert.equal(barPlays(practice, 4).click, true);
});

test("ladder raises the tempo every N bars after the count-in", () => {
  const map = ladderMap({ step: 5, everyBars: 4, rungs: 3 }, 80, 4, 1);
  assert.deepEqual(map, [
    { atBeat: 0, bpm: 80 },
    { atBeat: 20, bpm: 85 },
    { atBeat: 36, bpm: 90 },
  ]);
  const capped = ladderMap({ step: 40, everyBars: 1, rungs: 3 }, 380, 4, 0);
  assert.equal(capped[2].bpm, 400);
});

// ---- click generation ----
test("4/4 straight: one click per beat, accent on one", () => {
  const { pattern, practice } = stateWith();
  const ev = generateEvents(pattern, practice, 0, 4);
  assert.deepEqual(ev.map((e) => e.beat), [0, 1, 2, 3]);
  assert.deepEqual(ev.map((e) => e.kind), ["accent", "beat", "beat", "beat"]);
  assert.equal(ev[0].gain, 1);
  assert.equal(ev[1].gain, 0.6);
});

test("a silent beat makes no click, and neither do its subdivisions", () => {
  const s = stateWith({ levels: [2, 0, 1, 1], subdivision: 2 });
  const ev = generateEvents(s.pattern, s.practice, 0, 4);
  assert.ok(ev.every((e) => e.i !== 1));
  assert.equal(ev.length, 6);
});

test("swing places the off-beats late", () => {
  const s = stateWith({ subdivision: 2, swing: 2 / 3 });
  const ev = generateEvents(s.pattern, s.practice, 0, 1);
  near(ev[0].beat, 0);
  near(ev[1].beat, 0.667); // swing is stored to three decimals
  assert.equal(ev[1].kind, "sub");
});

test("click-on modes pick the right beats", () => {
  const at = (clickOn, patch = {}) => {
    const s = stateWith({ clickOn, ...patch });
    return generateEvents(s.pattern, s.practice, 0, 4).map((e) => e.beat);
  };
  assert.deepEqual(at("backbeat"), [1, 3]);
  assert.deepEqual(at("downbeat"), [0]);
  assert.deepEqual(at("upbeats"), [0.5, 1.5, 2.5, 3.5]);
});

test("upbeats needs eighths, so the subdivision moves there", () => {
  const s = stateWith({ clickOn: "upbeats", subdivision: 1 });
  assert.equal(s.pattern.subdivision, 2);
});

test("multi-bar patterns use each bar's own levels", () => {
  const s = stateWith({ bars: 2, levels: [2, 1, 1, 1, 0, 1, 1, 1] });
  const ev = generateEvents(s.pattern, s.practice, 0, 8);
  assert.equal(ev.length, 7);
  assert.ok(!ev.some((e) => e.beat === 4));
  const next = generateEvents(s.pattern, s.practice, 8, 16);
  assert.ok(!next.some((e) => e.beat === 12));
  assert.equal(next.length, 7);
});

test("chance 0 never plays and chance 1 always plays", () => {
  const never = stateWith({ chances: [0, 0, 0, 0] });
  assert.equal(generateEvents(never.pattern, never.practice, 0, 400).length, 0);
  const always = stateWith({ density: 1 });
  assert.equal(generateEvents(always.pattern, always.practice, 0, 400).length, 400);
});

test("chance is random but near its value over many bars", () => {
  const s = stateWith({ chances: [0.5, 0.5, 0.5, 0.5] });
  const n = generateEvents(s.pattern, s.practice, 0, 4000).length;
  assert.ok(n > 1800 && n < 2200, `got ${n}`);
});

test("splitting a range gives the same clicks as one call", () => {
  const s = stateWith({ chances: [0.7, 0.7, 0.7, 0.7], subdivision: 2, humanize: 0.8, swing: 0.6 });
  const whole = generateEvents(s.pattern, s.practice, 0, 64);
  const parts = [];
  for (let from = 0; from < 64; from += 3.7) parts.push(...generateEvents(s.pattern, s.practice, from, Math.min(64, from + 3.7)));
  parts.sort((a, b) => a.beat - b.beat);
  assert.deepEqual(parts.map((e) => [e.beat, e.gain]), whole.map((e) => [e.beat, e.gain]));
});

test("freeze repeats the same random choices every bar", () => {
  const s = stateWith({ chances: [0.5, 0.5, 0.5, 0.5], freeze: true });
  const ev = generateEvents(s.pattern, s.practice, 0, 40);
  const perBar = (bar) => ev.filter((e) => e.bar === bar).map((e) => e.i).join();
  for (let bar = 1; bar < 10; bar++) assert.equal(perBar(bar), perBar(0));
});

test("human feel stays off by default and moves clicks when raised", () => {
  const exact = stateWith();
  assert.ok(generateEvents(exact.pattern, exact.practice, 0, 40).every((e) => Number.isInteger(e.beat)));
  const loose = stateWith({ humanize: 1 });
  const ev = generateEvents(loose.pattern, loose.practice, 0, 40);
  assert.ok(ev.some((e) => !Number.isInteger(e.beat)));
  assert.ok(ev.every((e) => Math.abs(e.beat - Math.round(e.beat)) <= 0.0401));
  assert.ok(ev.every((e) => e.beat >= 0));
});

test("gap trainer silences the clicks in its bars", () => {
  const s = stateWith({}, { gap: { audible: 1, silent: 1 } });
  const ev = generateEvents(s.pattern, s.practice, 0, 16);
  assert.deepEqual([...new Set(ev.map((e) => e.bar))], [0, 2]);
});

// ---- transport ----
function makeTransport(patch = {}, practice = {}) {
  let cfg = stateWith(patch, practice);
  const t = createTransport(() => cfg);
  return { t, set: (p, r = {}) => (cfg = stateWith(p, r)) };
}

test("transport times clicks on the audio clock", () => {
  const { t } = makeTransport({ bpm: 120 });
  t.start(10, 0.1);
  const ev = t.pull(10, 1.15); // window ends 11.15 s, i.e. just past the third beat
  assert.deepEqual(ev.map((e) => Number(e.time.toFixed(6))), [10.1, 10.6, 11.1]);
});

test("pulling in small steps never repeats or skips a click", () => {
  const { t } = makeTransport({ bpm: 133, subdivision: 3, humanize: 0.5, chances: [0.8, 0.8, 0.8, 0.8] });
  t.start(0, 0.05);
  const seen = [];
  for (let now = 0; now < 30; now += 0.025) seen.push(...t.pull(now, 0.2));
  const keys = seen.map((e) => `${e.bar}:${e.i}:${e.s}`);
  assert.equal(new Set(keys).size, keys.length);
  const times = seen.map((e) => e.time);
  assert.deepEqual(times, [...times].sort((a, b) => a - b));
  const ref = generateEvents(stateWith({ bpm: 133, subdivision: 3, humanize: 0.5, chances: [0.8, 0.8, 0.8, 0.8] }).pattern, stateWith().practice, 0, seen.at(-1).beat + 1e-9);
  assert.equal(keys.length, ref.length);
});

test("a tempo change keeps queued clicks and continues without a jump", () => {
  const { t, set } = makeTransport({ bpm: 60 });
  t.start(0, 0);
  const first = t.pull(0, 2.5); // beats 0, 1, 2 queued at 0, 1, 2 s
  assert.deepEqual(first.map((e) => e.time), [0, 1, 2]);
  set({ bpm: 120 });
  t.retempo();
  const next = t.pull(2.5, 1.2);
  // cursor was at beat 2.5; the next click is beat 3, half a beat (0.25 s at 120) later
  near(next[0].time, 2 + 0.5 + 0.25, 1e-9);
  near(next[1].time - next[0].time, 0.5, 1e-9);
});

test("a ladder speeds the clicks up as the bars pass", () => {
  const { t } = makeTransport({ bpm: 60, beats: 2, levels: [2, 1], chances: [1, 1] }, { ladder: { step: 40, everyBars: 2, rungs: 2 } });
  t.start(0, 0);
  const ev = t.pull(0, 6);
  const gaps = ev.slice(1).map((e, i) => e.time - ev[i].time);
  near(gaps[0], 1); // 60 bpm for the first two bars (four beats)
  near(gaps[2], 1);
  near(gaps[4], 0.6); // then 100 bpm
});

test("before the first beat the playhead is negative and nothing is due", () => {
  const { t } = makeTransport();
  t.start(5, 0.5);
  assert.deepEqual(t.pull(5, 0.2), []);
  assert.ok(t.beatAt(5) < 0);
  t.stop();
  assert.equal(t.running, false);
  assert.deepEqual(t.pull(6, 1), []);
});

// ---- tap tempo ----
test("tap tempo reads the median interval and restarts after a pause", () => {
  const tap = createTapTempo();
  assert.equal(tap.tap(0), null);
  assert.equal(tap.tap(0.5), 120);
  assert.equal(tap.tap(1.0), 120);
  assert.equal(tap.tap(1.9), 120); // one slow tap does not drag the median
  assert.equal(tap.tap(10), null); // long pause starts over
  assert.equal(tap.tap(10.6), 100);
});

test("tempo limits and words", () => {
  assert.equal(clampBpm(5), 20);
  assert.equal(clampBpm(999), 400);
  assert.equal(clampBpm("abc"), 80);
  assert.equal(tempoWord(80), "Andante");
  assert.equal(tempoWord(130), "Allegro");
  assert.equal(tempoWord(250), "Prestissimo");
});

// ---- share ----
test("the default setup encodes to a very short link and decodes to itself", () => {
  const d = defaultState();
  const code = encodeShare(d);
  assert.ok(code.length < 12, code);
  assert.deepEqual(decodeShare(code), d);
});

test("a changed setup survives a round trip", () => {
  const s = stateWith(
    { bpm: 132, beats: 7, den: 8, levels: [2, 1, 2, 1, 2, 1, 0], chances: [1, 1, 0.5, 1, 1, 1, 1], subdivision: 2, swing: 0.667, clickOn: "all", humanize: 0.3, density: 0.9, seed: 99, freeze: true, sound: "wood" },
    { gap: { audible: 2, silent: 1 }, trade: 4, countIn: 1, ladder: { step: 4, everyBars: 8, rungs: 5 } },
  );
  assert.deepEqual(decodeShare(encodeShare(s)), s);
});

test("a changed meter keeps short links and default accents", () => {
  const s = stateWith({ beats: 7, den: 8, levels: defaultLevels(7, 1) });
  const back = decodeShare(encodeShare(s));
  assert.deepEqual(back, s);
  assert.deepEqual(back.pattern.levels, [2, 1, 2, 1, 2, 1, 1]);
});

const hand = (obj) => btoa(JSON.stringify(obj)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

test("hostile links are clamped, not trusted", () => {
  const s = decodeShare(hand({ v: 1, p: { bpm: 99999, beats: 500, bars: -3, subdivision: 9, swing: "x", clickOn: "<script>", humanize: 7, density: -2, seed: 1e99, freeze: "yes", sound: "../../etc", levels: "no", chances: [5, "a"] }, r: { gap: { audible: 1e9, silent: 0 }, trade: 3, countIn: 9, ladder: { step: -5, everyBars: 0, rungs: 1e6 } } }));
  assert.ok(s);
  const p = s.pattern;
  assert.equal(p.bpm, 400);
  assert.equal(p.beats, 16);
  assert.equal(p.bars, 1);
  assert.equal(p.subdivision, 1);
  assert.equal(p.swing, 0.5);
  assert.equal(p.clickOn, "all");
  assert.equal(p.humanize, 1);
  assert.equal(p.density, 0);
  assert.equal(p.seed, 2147483647);
  assert.equal(p.freeze, false);
  assert.equal(p.sound, "tock");
  assert.equal(p.levels.length, 16);
  assert.ok(p.levels.every((v) => v === 0 || v === 1 || v === 2));
  assert.equal(p.chances.length, 16);
  assert.ok(p.chances.every((c) => c >= 0 && c <= 1));
  assert.deepEqual(s.practice, { gap: { audible: 16, silent: 1 }, trade: 0, countIn: 0, ladder: { step: 1, everyBars: 1, rungs: 32 } });
});

test("garbage and prototype tricks are rejected or ignored", () => {
  for (const bad of ["", "!!!", "e30", "bm90LWpzb24", null, undefined, 5, "a".repeat(5000)]) assert.equal(decodeShare(bad), null);
  assert.equal(decodeShare(hand({ v: 2 })), null);
  assert.equal(decodeShare(hand([1, 2])), null);
  const evil = decodeShare(btoa('{"v":1,"p":{"__proto__":{"polluted":true},"bpm":100}}').replace(/=+$/, ""));
  assert.equal(evil.pattern.bpm, 100);
  assert.equal({}.polluted, undefined);
  assert.equal(evil.pattern.polluted, undefined);
});

test("unicode survives the link format", () => {
  const code = encodeShare(stateWith({ bpm: 101 }));
  assert.equal(decodeShare(code).pattern.bpm, 101);
});

test("normalizeState repairs arrays that no longer fit the meter", () => {
  const s = normalizeState({ pattern: { beats: 3, levels: [2, 1, 1, 1, 1, 1, 1], chances: [1, 1, 1, 1, 1] } });
  assert.deepEqual(s.pattern.levels, [2, 1, 1]);
  assert.equal(s.pattern.chances.length, 3);
});
