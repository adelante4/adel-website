// Progressions you write yourself: typing them, saving them, and keeping them on this device.
import { parseChord, cleanChord } from "./chords.js";
import { MAX_FORM_BARS } from "./share.js";

const KEY = "adelProgressions";

/** [["Dm7","G7"],["Cmaj7"]] to "Dm7 G7 | Cmaj7". */
export const formToText = (form) => form.map((bar) => bar.join(" ")).join(" | ");

/**
 * "Dm7 G7 | Cmaj7 | %" to a form. Bars are separated by | or a new line, chords by spaces,
 * and % repeats the bar before.
 * @returns {{form:string[][]}|{error:string}}
 */
export function textToForm(text) {
  const bars = String(text)
    .split(/[|\n]/)
    .map((b) => b.trim())
    .filter(Boolean);
  if (!bars.length) return { error: "Type some chords, for example: Dm7 G7 | Cmaj7 | Cmaj7" };
  const form = [];
  for (const [i, bar] of bars.entries()) {
    const tokens = bar.split(/[\s,]+/).filter(Boolean);
    if (tokens.length === 1 && tokens[0] === "%") {
      if (!form.length) return { error: "Bar 1 cannot be %. Write a chord first." };
      form.push([...form[form.length - 1]]);
      continue;
    }
    if (tokens.length > 2) return { error: `Bar ${i + 1} has ${tokens.length} chords. A bar holds one or two.` };
    const chords = [];
    for (const t of tokens) {
      if (!parseChord(t)) return { error: `Bar ${i + 1}: "${t}" is not a chord I know. Try Cmaj7, Dm7, G7, Bm7b5, F#dim7.` };
      chords.push(cleanChord(t));
    }
    form.push(chords);
  }
  if (form.length > MAX_FORM_BARS) return { error: `That is ${form.length} bars. The limit is ${MAX_FORM_BARS}.` };
  return { form };
}

/** Drops anything that is not a usable saved progression. */
export function sanitizeMine(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const r of raw) {
    if (!r || typeof r.id !== "string" || typeof r.name !== "string" || !Array.isArray(r.form)) continue;
    const parsed = textToForm(formToText(r.form.filter((b) => Array.isArray(b) && b.length)));
    if (!("form" in parsed)) continue;
    out.push({ id: r.id, name: r.name.slice(0, 60), form: parsed.form, beats: r.beats === 3 ? 3 : 4, mine: true });
  }
  return out;
}

export function loadMine() {
  try {
    return sanitizeMine(JSON.parse(localStorage.getItem(KEY) ?? "[]"));
  } catch {
    return [];
  }
}

export function storeMine(list) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.map(({ id, name, form, beats }) => ({ id, name, form, beats }))));
    return true;
  } catch {
    return false;
  }
}

/** Adds or replaces (same name) and returns the new list. */
export function withSaved(list, name, form, beats) {
  const clean = name.trim().slice(0, 60);
  const old = list.find((p) => p.name.toLowerCase() === clean.toLowerCase());
  const entry = { id: old?.id ?? `mine-${Date.now().toString(36)}`, name: clean, form: form.map((b) => [...b]), beats: beats === 3 ? 3 : 4, mine: true };
  return [entry, ...list.filter((p) => p !== old)];
}
