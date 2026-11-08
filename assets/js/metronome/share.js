// Saving and sharing a setup.
//
// The whole setup is a small object. normalizeState() is the one gate every outside value
// passes through (a link, localStorage, a hand-edited URL): numbers are clamped, unknown
// words are replaced by defaults, arrays are resized. The click generator never sees raw input.
//
// Links store only what differs from the defaults, so they stay short, and a link made
// today keeps its meaning if a new setting is added later.
import { accentsFromGrouping, defaultGrouping } from "./meter.js?v=20261108w";
import { clampBpm } from "./tempo.js?v=20261108w";
import { cleanChord } from "./chords.js?v=20261108w";
import { COMP_STYLES } from "./comping.js?v=20261108w";
import { GROOVE_STYLES } from "./groove.js?v=20261108w";
import { BASS_STYLES } from "./bassline.js?v=20261108w";
import { KEYS, BASSES, KITS, ids } from "./instruments.js?v=20261108w";

export const CLICK_ON = ["all", "backbeat", "downbeat", "upbeats"];
export const SOUNDS = ["tock", "wood", "soft", "woodblock", "claves", "log", "frame", "brake"];
const MAX_LINK_LENGTH = 4000;

const isObj = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
const numeric = (x) => typeof x === "number" || (typeof x === "string" && x.trim() !== "");
const num = (x, lo, hi, d) => {
  if (!numeric(x)) return d;
  const n = Number(x);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d;
};
const int = (x, lo, hi, d) => Math.round(num(x, lo, hi, d));
const pick = (x, allowed, d) => (allowed.includes(x) ? x : d);

/** Accent levels for `bars` bars of a meter, from its default grouping. */
export function defaultLevels(beats, bars) {
  const one = accentsFromGrouping(defaultGrouping(beats));
  const out = [];
  for (let b = 0; b < bars; b++) out.push(...one);
  return out;
}

export function defaultState() {
  return {
    pattern: {
      bpm: 80,
      beats: 4,
      den: 4,
      bars: 1,
      levels: defaultLevels(4, 1),
      chances: [1, 1, 1, 1],
      subdivision: 1,
      swing: 0.5,
      clickOn: "all",
      humanize: 0,
      density: 1,
      seed: 1,
      freeze: false,
      sound: "tock",
    },
    practice: { gap: null, trade: 0, countIn: 0, ladder: null },
    harmony: {
      on: false,
      form: [["Cmaj7"], ["Am7"], ["Dm7"], ["G7"]],
      comp: "charleston",
      sound: "rhodes",
    },
    bass: { on: false, style: "walking", sound: "doublebass" },
    groove: { style: "off", kit: "synth", dust: false, intensity: 0.5, fills: true, pocket: true },
    mix: { click: 0.7, chords: 0.7, bass: 0.7, groove: 0.7, autoMute: false },
  };
}

export const MAX_FORM_BARS = 64;

export function normalizeHarmony(raw) {
  const d = defaultState().harmony;
  const r = isObj(raw) ? raw : {};
  let form = d.form;
  if (Array.isArray(r.form) && r.form.length > 0) {
    form = r.form.slice(0, MAX_FORM_BARS).map((bar) => {
      const list = Array.isArray(bar) ? bar : [bar];
      return list.slice(0, 2).map((c) => cleanChord(c));
    });
    form = form.map((bar) => (bar.length ? bar : ["Cmaj7"]));
  }
  return { on: r.on === true, form, comp: pick(r.comp, COMP_STYLES, d.comp), sound: pick(r.sound, ids(KEYS), d.sound) };
}

export function normalizeGroove(raw) {
  const r = isObj(raw) ? raw : {};
  return {
    style: pick(r.style, GROOVE_STYLES, "off"),
    kit: pick(r.kit, ids(KITS), "synth"),
    dust: r.dust === true,
    intensity: Math.round(num(r.intensity, 0, 1, 0.5) * 20) / 20,
    fills: r.fills !== false,
    pocket: r.pocket !== false,
  };
}

export function normalizeBass(raw) {
  const d = defaultState().bass;
  const r = isObj(raw) ? raw : {};
  return { on: r.on === true, style: pick(r.style, BASS_STYLES, d.style), sound: pick(r.sound, ids(BASSES), d.sound) };
}

export function normalizeMix(raw) {
  const d = defaultState().mix;
  const r = isObj(raw) ? raw : {};
  const level = (x, def) => Math.round(num(x, 0, 1, def) * 100) / 100;
  return {
    click: level(r.click, d.click),
    chords: level(r.chords, d.chords),
    bass: level(r.bass, d.bass),
    groove: level(r.groove, d.groove),
    autoMute: r.autoMute === true,
  };
}

export function normalizePattern(raw) {
  const r = isObj(raw) ? raw : {};
  const beats = int(r.beats, 1, 16, 4);
  const bars = int(r.bars, 1, 4, 1);
  const slots = beats * bars;
  const fallback = defaultLevels(beats, bars);
  const levels = Array.from({ length: slots }, (_, i) => {
    const v = Array.isArray(r.levels) ? r.levels[i] : undefined;
    return v === 0 || v === 1 || v === 2 ? v : fallback[i];
  });
  const chances = Array.from({ length: slots }, (_, i) =>
    Array.isArray(r.chances) ? Math.round(num(r.chances[i], 0, 1, 1) * 100) / 100 : 1,
  );
  const clickOn = pick(r.clickOn, CLICK_ON, "all");
  let subdivision = pick(r.subdivision, [1, 2, 3, 4], 1);
  if (clickOn === "upbeats" && subdivision < 2) subdivision = 2;
  return {
    bpm: clampBpm(num(r.bpm, 20, 400, 80)),
    beats,
    den: pick(r.den, [4, 8], 4),
    bars,
    levels,
    chances,
    subdivision,
    swing: Math.round(num(r.swing, 0.5, 0.8, 0.5) * 1000) / 1000,
    clickOn,
    humanize: Math.round(num(r.humanize, 0, 1, 0) * 100) / 100,
    density: Math.round(num(r.density, 0, 1, 1) * 100) / 100,
    seed: int(r.seed, 0, 2147483647, 1),
    freeze: r.freeze === true,
    sound: pick(r.sound, SOUNDS, "tock"),
  };
}

export function normalizePractice(raw) {
  const r = isObj(raw) ? raw : {};
  const gap = isObj(r.gap)
    ? { audible: int(r.gap.audible, 1, 16, 2), silent: int(r.gap.silent, 1, 16, 2) }
    : null;
  const ladder = isObj(r.ladder)
    ? {
        step: int(r.ladder.step, 1, 40, 5),
        everyBars: int(r.ladder.everyBars, 1, 32, 4),
        rungs: int(r.ladder.rungs, 1, 32, 6),
      }
    : null;
  return {
    gap,
    trade: pick(r.trade, [0, 4, 8], 0),
    countIn: pick(r.countIn, [0, 1, 2], 0),
    ladder,
  };
}

export function normalizeState(raw) {
  const r = isObj(raw) ? raw : {};
  return {
    pattern: normalizePattern(r.pattern),
    practice: normalizePractice(r.practice),
    harmony: normalizeHarmony(r.harmony),
    bass: normalizeBass(r.bass),
    groove: normalizeGroove(r.groove),
    mix: normalizeMix(r.mix),
  };
}

const sameArray = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

/** State to a URL-safe string holding only non-default values. */
export function encodeShare(state) {
  const s = normalizeState(state);
  const d = defaultState();
  const p = {};
  for (const k of Object.keys(d.pattern)) {
    if (k === "levels" || k === "chances") continue;
    if (s.pattern[k] !== d.pattern[k]) p[k] = s.pattern[k];
  }
  if (!sameArray(s.pattern.levels, defaultLevels(s.pattern.beats, s.pattern.bars))) {
    p.levels = s.pattern.levels;
  }
  if (s.pattern.chances.some((c) => c !== 1)) p.chances = s.pattern.chances;
  const r = {};
  for (const k of Object.keys(d.practice)) {
    if (JSON.stringify(s.practice[k]) !== JSON.stringify(d.practice[k])) r[k] = s.practice[k];
  }
  const diff = (a, b) => {
    const o = {};
    for (const k of Object.keys(b)) if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) o[k] = a[k];
    return o;
  };
  const h = diff(s.harmony, d.harmony);
  const g = diff(s.groove, d.groove);
  const b = diff(s.bass, d.bass);
  const m = diff(s.mix, d.mix);
  const out = { v: 1 };
  if (Object.keys(p).length) out.p = p;
  if (Object.keys(r).length) out.r = r;
  if (Object.keys(h).length) out.h = h;
  if (Object.keys(g).length) out.g = g;
  if (Object.keys(b).length) out.b = b;
  if (Object.keys(m).length) out.m = m;
  const bytes = new TextEncoder().encode(JSON.stringify(out));
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** A string from encodeShare back to a state, or null if it cannot be read. */
export function decodeShare(text) {
  try {
    if (typeof text !== "string" || text.length === 0 || text.length > MAX_LINK_LENGTH) return null;
    const b64 = text.replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    const obj = JSON.parse(new TextDecoder().decode(bytes));
    if (!isObj(obj) || obj.v !== 1) return null;
    const d = defaultState();
    return normalizeState({
      pattern: { ...d.pattern, levels: undefined, chances: undefined, ...(isObj(obj.p) ? obj.p : {}) },
      practice: { ...d.practice, ...(isObj(obj.r) ? obj.r : {}) },
      harmony: { ...d.harmony, ...(isObj(obj.h) ? obj.h : {}) },
      groove: { ...d.groove, ...(isObj(obj.g) ? obj.g : {}) },
      // Links made before the bass had its own layer: chords on meant a root note on each change.
      bass: { ...d.bass, ...(isObj(obj.b) ? obj.b : {}), ...(obj.b === undefined && isObj(obj.h) && obj.h.on === true && obj.h.bass !== false ? { on: true, style: "roots", sound: "round" } : {}) },
      mix: { ...d.mix, ...(isObj(obj.m) ? obj.m : {}) },
    });
  } catch {
    return null;
  }
}
