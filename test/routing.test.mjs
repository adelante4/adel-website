import { test } from "node:test";
import assert from "node:assert/strict";
import { createTransport, routeEvents, dueEvents } from "../assets/js/metronome/transport.js";
import { defaultState } from "../assets/js/metronome/share.js";
import { gatherEvents } from "../assets/js/metronome/export.js";

// A full band in 4/4 at 120 BPM, with one bar of count-in.
function band(patch = {}) {
  const s = defaultState();
  s.pattern.bpm = 120;
  s.practice.countIn = 1;
  s.harmony.on = true;
  s.bass.on = true;
  s.groove = { ...s.groove, style: "funk", kit: "synth" };
  for (const k of Object.keys(patch)) s[k] = { ...s[k], ...patch[k] };
  return s;
}
function pullBars(s, bars) {
  const t = createTransport(() => s);
  t.start(0, 0);
  return t.pullAll(0, bars * s.pattern.beats * (60 / s.pattern.bpm) - 1e-6);
}

test("every routed event names its layer and its sound", () => {
  const s = band();
  const ev = routeEvents(pullBars(s, 3), s);
  const layers = new Set(ev.map((e) => e.part));
  assert.deepEqual([...layers].sort(), ["bass", "chords", "click", "groove"]);
  for (const e of ev) {
    if (e.part === "click") assert.equal(e.sound, s.pattern.sound);
    if (e.part === "chords") assert.equal(e.sound, s.harmony.sound);
    if (e.part === "bass") assert.equal(e.sound, s.bass.sound);
    if (e.part === "groove") assert.deepEqual([e.style, e.kit], ["funk", "synth"]);
    assert.equal(typeof e.time, "number");
  }
});

test("with the click off, the count-in still goes to the count-in bus", () => {
  const s = band({ mix: { click: 0 } });
  const clicks = routeEvents(pullBars(s, 2), s).filter((e) => e.part === "click");
  const countIn = clicks.filter((e) => e.bar < 1);
  assert.ok(countIn.length > 0);
  assert.ok(countIn.every((e) => e.bus === "count"));
  assert.ok(clicks.filter((e) => e.bar >= 1).every((e) => e.bus === "main"));
});

test("with the click on, the count-in plays on the main bus", () => {
  const s = band({ mix: { click: 0.7 } });
  const clicks = routeEvents(pullBars(s, 2), s).filter((e) => e.part === "click");
  assert.ok(clicks.every((e) => e.bus === "main"));
});

test("an event already in the past is dropped; one just late is played now", () => {
  const ev = [
    { part: "click", time: 9.9 },
    { part: "click", time: 9.98 },
    { part: "click", time: 10.2 },
  ];
  assert.deepEqual(dueEvents(ev, 10).map((e) => e.time), [10, 10.2]);
});

test("export and live playback route the same events", () => {
  const s = band({ practice: { countIn: 0 } });
  const { cfg, events } = gatherEvents(s, 2);
  const routed = routeEvents(events, cfg);
  assert.equal(routed.length, events.clicks.length + events.chords.length + events.bass.length + events.drums.length);
  assert.ok(routed.every((e) => e.part !== "click" || e.bus === "main"));
});
