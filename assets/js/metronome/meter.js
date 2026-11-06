// Time signatures and how a bar is counted.

export const SIGNATURES = ["2/4", "3/4", "4/4", "5/4", "6/8", "7/8"];

/** "7/8" gives { beats: 7, den: 8 }. Returns null for anything else. */
export function parseMeter(text) {
  const m = /^\s*(\d{1,2})\s*\/\s*(\d{1,2})\s*$/.exec(String(text));
  if (!m) return null;
  const beats = Number(m[1]);
  const den = Number(m[2]);
  if (beats < 1 || beats > 16) return null;
  if (den !== 4 && den !== 8) return null;
  return { beats, den };
}

export function formatMeter(beats, den) {
  return `${beats}/${den}`;
}

/** Every way to split a bar into groups of 2 and 3 (and the whole bar when it is short). */
export function groupingOptions(beats) {
  const out = [];
  const walk = (left, acc) => {
    if (left === 0) {
      out.push(acc);
      return;
    }
    for (const part of [2, 3]) if (part <= left) walk(left - part, [...acc, part]);
  };
  walk(beats, []);
  if (beats <= 4 && !out.some((g) => g.length === 1)) out.unshift([beats]);
  return out;
}

const DEFAULTS = { 2: [2], 3: [3], 4: [4], 5: [3, 2], 6: [3, 3], 7: [2, 2, 3] };

export function defaultGrouping(beats) {
  return DEFAULTS[beats] ? [...DEFAULTS[beats]] : (groupingOptions(beats)[0] ?? [beats]);
}

export function isValidGrouping(groups, beats) {
  if (!Array.isArray(groups) || groups.length === 0) return false;
  let sum = 0;
  for (const g of groups) {
    if (!Number.isInteger(g) || g < 1) return false;
    sum += g;
  }
  return sum === beats;
}

/** Levels for one bar: the first beat of each group is an accent (2), the rest are normal (1). */
export function accentsFromGrouping(groups) {
  const levels = [];
  for (const g of groups) for (let i = 0; i < g; i++) levels.push(i === 0 ? 2 : 1);
  return levels;
}

export function groupingLabel(groups) {
  return groups.join("+");
}

/** Which grouping option the levels of one bar match, or -1 when they are hand-made. */
export function matchGrouping(levels, beats) {
  const options = groupingOptions(beats);
  for (let i = 0; i < options.length; i++) {
    const want = accentsFromGrouping(options[i]);
    if (want.length === levels.length && want.every((v, k) => v === levels[k])) return i;
  }
  return -1;
}
