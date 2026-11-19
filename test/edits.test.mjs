import { test } from "node:test";
import assert from "node:assert/strict";
import { setMeter, setBars, pickGroove, toggleDrums, applyBand, loadChart, applyDrill } from "../assets/js/metronome/edits.js";
import { defaultState, defaultLevels } from "../assets/js/metronome/share.js";
import { BAND_STYLES } from "../assets/js/metronome/bands.js";

const fresh = () => defaultState();
const in34 = () => setMeter(fresh(), "3/4").setup;

test("an edit never changes the setup it was given", () => {
  const s = fresh();
  const copy = structuredClone(s);
  setMeter(s, "7/8");
  setBars(s, 3);
  pickGroove(s, "waltz");
  toggleDrums(s, "lofi");
  applyBand(s, BAND_STYLES[0]);
  loadChart(s, { form: [["Dm7"], ["G7"]], beats: 3 });
  applyDrill(s, { groove: { style: "off" } });
  assert.deepEqual(s, copy);
});

test("a new meter resets accents and chances and restarts", () => {
  const r = setMeter(fresh(), "7/8");
  assert.equal(r.kind, "restart");
  assert.equal(r.setup.pattern.beats, 7);
  assert.equal(r.setup.pattern.den, 8);
  assert.deepEqual(r.setup.pattern.levels, defaultLevels(7, r.setup.pattern.bars));
  assert.equal(r.setup.pattern.chances.length, 7 * r.setup.pattern.bars);
  assert.ok(r.setup.pattern.chances.every((c) => c === 1));
});

test("a meter that does not parse changes nothing", () => {
  assert.equal(setMeter(fresh(), "nonsense"), null);
});

test("more bars repeat the accents of the first bar", () => {
  const s = fresh();
  s.pattern.levels = [2, 0, 1, 0];
  const r = setBars(s, 2);
  assert.equal(r.kind, "restart");
  assert.equal(r.setup.pattern.bars, 2);
  assert.deepEqual(r.setup.pattern.levels, [2, 0, 1, 0, 2, 0, 1, 0]);
});

test("a groove in the current meter plays live", () => {
  const r = pickGroove(fresh(), "funk");
  assert.equal(r.kind, "live");
  assert.equal(r.setup.groove.style, "funk");
  assert.equal(r.notice, undefined);
});

test("a groove written for another meter moves the meter there", () => {
  const r = pickGroove(fresh(), "teental");
  assert.equal(r.kind, "restart");
  assert.equal(r.setup.pattern.beats, 16);
  assert.equal(r.setup.pattern.den, 4);
  assert.equal(r.setup.pattern.levels.length, 16 * r.setup.pattern.bars);
  assert.match(r.notice, /plays in 16\/4, so the meter changed/);
});

test("drums off remembers the groove; drums on brings it back", () => {
  const on = pickGroove(fresh(), "funk").setup;
  const off = toggleDrums(on, "lofi");
  assert.equal(off.setup.groove.style, "off");
  assert.equal(off.lastGroove, "funk");
  const back = toggleDrums(off.setup, off.lastGroove);
  assert.equal(back.setup.groove.style, "funk");
  assert.equal(back.kind, "live");
});

test("drums on in a meter the remembered groove does not fit picks one that fits", () => {
  const r = toggleDrums(in34(), "lofi");
  assert.equal(r.setup.groove.style, "waltz");
  assert.equal(r.setup.pattern.beats, 3);
  assert.equal(r.kind, "live");
});

test("drums on in a meter no groove fits moves the meter to the remembered groove", () => {
  const r = toggleDrums(setMeter(fresh(), "2/4").setup, "lofi");
  assert.equal(r.setup.groove.style, "lofi");
  assert.equal(r.setup.pattern.beats, 4);
  assert.equal(r.kind, "restart");
  assert.ok(r.notice);
});

test("a band style sets every layer, and its undo puts them back", () => {
  const s = in34();
  s.pattern.bpm = 140;
  s.harmony.form = [["C"], ["F"]];
  const band = BAND_STYLES.find((b) => b.id === "lofi");
  const r = applyBand(s, band);
  assert.equal(r.kind, "restart");
  assert.equal(r.setup.pattern.bpm, band.bpm);
  assert.equal(r.setup.pattern.beats, 4);
  assert.equal(r.setup.groove.style, "lofi");
  assert.equal(r.setup.bass.on, true);
  assert.equal(r.setup.harmony.comp, band.keys.comp);
  assert.match(r.notice, /\(was 140\)/);

  // The tune itself stays: undo only puts the sound back.
  const later = structuredClone(r.setup);
  later.harmony.form = [["Bb"]];
  const u = r.undo(later);
  assert.equal(u.kind, "restart");
  assert.equal(u.setup.pattern.bpm, 140);
  assert.equal(u.setup.pattern.beats, 3);
  assert.deepEqual(u.setup.groove, s.groove);
  assert.deepEqual(u.setup.harmony.form, [["Bb"]]);
});

test("a chart in 3/4 plays in 3/4; a chart with no meter keeps the current one", () => {
  const r = loadChart(fresh(), { form: [["Dm7"], ["G7"]], beats: 3 });
  assert.equal(r.kind, "restart");
  assert.equal(r.setup.pattern.beats, 3);
  assert.equal(r.setup.pattern.den, 4);
  assert.deepEqual(r.setup.harmony.form, [["Dm7"], ["G7"]]);

  const plain = loadChart(in34(), { form: [["C"]] });
  assert.equal(plain.kind, "live");
  assert.equal(plain.setup.pattern.beats, 3);
});

test("a drill lays its settings over the current ones and restarts", () => {
  const s = pickGroove(fresh(), "funk").setup;
  s.pattern.bpm = 99;
  const r = applyDrill(s, { pattern: { clickOn: "backbeat" }, groove: { style: "off" } });
  assert.equal(r.kind, "restart");
  assert.equal(r.setup.pattern.clickOn, "backbeat");
  assert.equal(r.setup.pattern.bpm, 99);
  assert.equal(r.setup.groove.style, "off");
  assert.equal(r.setup.groove.kit, s.groove.kit);
});
