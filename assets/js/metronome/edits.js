// Edits: what one choice on the page does to the setup. Pure code, no DOM, no Web Audio.
//
// Each edit takes the current setup and returns { setup, kind, notice? } with a new setup; the
// one it was given is not changed. `kind` tells commit() what the transport must do: "live"
// (picked up on the next pull) or "restart" (the bar structure changed). `notice` is a line to
// show the player. The rules that tie choices together live here, once: a new meter resets
// accents and chances, and a groove only plays in its own meter.
import { parseMeter } from "./meter.js?v=20261119c";
import { defaultLevels } from "./share.js?v=20261119c";
import { GROOVE_STYLES, GROOVE_NAMES, grooveFits, grooveMeter } from "./groove.js?v=20261119c";

/** Puts a pattern in a new meter: accents go back to the meter's default, every chance to 1. */
function meterTo(pattern, beats, den) {
  pattern.beats = beats;
  pattern.den = den;
  pattern.levels = defaultLevels(beats, pattern.bars);
  pattern.chances = new Array(beats * pattern.bars).fill(1);
}

/** Sets the groove, and moves the meter to the groove's own when it does not fit. */
function grooveIn(s, style) {
  s.groove.style = style;
  if (style === "off" || grooveFits(s.pattern, style)) return { setup: s, kind: "live" };
  const [beats, den] = grooveMeter(style);
  meterTo(s.pattern, beats, den);
  return { setup: s, kind: "restart", notice: `${GROOVE_NAMES[style]} plays in ${beats}/${den}, so the meter changed.` };
}

/** A time signature such as "7/8". Returns null when it does not parse. */
export function setMeter(setup, sig) {
  const m = parseMeter(sig);
  if (!m) return null;
  const s = structuredClone(setup);
  meterTo(s.pattern, m.beats, m.den);
  return { setup: s, kind: "restart" };
}

/** The number of bars in the pattern. New bars repeat the accents and chances of the first. */
export function setBars(setup, n) {
  const s = structuredClone(setup);
  const p = s.pattern;
  const slots = p.beats * n;
  p.levels = Array.from({ length: slots }, (_, j) => p.levels[j] ?? p.levels[j % p.beats]);
  p.chances = Array.from({ length: slots }, (_, j) => p.chances[j] ?? p.chances[j % p.beats]);
  p.bars = n;
  return { setup: s, kind: "restart" };
}

/** A groove from the drums picker. */
export function pickGroove(setup, style) {
  return grooveIn(structuredClone(setup), style);
}

/**
 * The drums switch. Off remembers the groove; on brings back `lastGroove`. When that groove does not
 * fit the meter, a groove that does fit is chosen, so the meter stays; only when none fits does the
 * meter move. Also returns the groove to remember.
 */
export function toggleDrums(setup, lastGroove) {
  const s = structuredClone(setup);
  if (s.groove.style !== "off") {
    const remembered = s.groove.style;
    s.groove.style = "off";
    return { setup: s, kind: "live", lastGroove: remembered };
  }
  const fitting = grooveFits(s.pattern, lastGroove) ? lastGroove : GROOVE_STYLES.find((g) => g !== "off" && grooveFits(s.pattern, g));
  return { ...grooveIn(s, fitting ?? lastGroove), lastGroove };
}

/**
 * A band style: meter, tempo, groove, bass and keys in one choice. The tune stays. `undo(current)`
 * puts the sound back as it was and keeps whatever tune is loaded by then.
 */
export function applyBand(setup, band) {
  const s = structuredClone(setup);
  const before = structuredClone({ pattern: setup.pattern, harmony: setup.harmony, bass: setup.bass, groove: setup.groove });
  const [beats, den] = band.meter;
  if (s.pattern.beats !== beats || s.pattern.den !== den) meterTo(s.pattern, beats, den);
  s.pattern.bpm = band.bpm;
  s.groove = structuredClone(band.groove);
  s.bass = { on: true, ...structuredClone(band.bass) };
  s.harmony.on = true;
  s.harmony.sound = band.keys.sound;
  s.harmony.comp = band.keys.comp;
  const undo = (current) => {
    const u = structuredClone(current);
    u.pattern = structuredClone(before.pattern);
    u.harmony = { ...u.harmony, on: before.harmony.on, sound: before.harmony.sound, comp: before.harmony.comp };
    u.bass = structuredClone(before.bass);
    u.groove = structuredClone(before.groove);
    return { setup: u, kind: "restart" };
  };
  return { setup: s, kind: "restart", notice: `${band.name}: ${band.bpm} BPM (was ${setup.pattern.bpm}).`, undo };
}

/** A chart from the library or your own: its chords, and its meter when it has one (a waltz plays in 3/4). */
export function loadChart(setup, chart) {
  const s = structuredClone(setup);
  s.harmony.form = chart.form.map((bar) => [...bar]);
  if (chart.beats && (s.pattern.beats !== chart.beats || s.pattern.den !== 4)) {
    meterTo(s.pattern, chart.beats, 4);
    return { setup: s, kind: "restart" };
  }
  return { setup: s, kind: "live" };
}

/** A drill from the Listen report: a few settings laid over the current ones. */
export function applyDrill(setup, patch) {
  const s = structuredClone(setup);
  for (const key of Object.keys(patch)) s[key] = { ...s[key], ...structuredClone(patch[key]) };
  return { setup: s, kind: "restart" };
}
