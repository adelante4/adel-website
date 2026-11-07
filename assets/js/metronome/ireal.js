// Reads iReal Pro playlist links (irealb://...) in the browser, so you can load your own charts.
// Nothing is sent anywhere and no charts ship with the site: you paste a link or choose a file,
// and the songs are decoded and kept on this device only.
//
// The link holds songs separated by "===" and a playlist name last. Each song is
// title=composer==style=key=transpose=MUSIC=...; MUSIC starts with a fixed prefix and is
// scrambled in 50-character blocks. Unscrambled it is a short markup: bar lines, repeats,
// endings and chords. This reads the bars and chords and ignores the rest.
import { cleanChord } from "./chords.js?v=20261107f";

const PREFIX = "1r34LbKcu7";
export const MAX_IMPORT_BARS = 64;

/** Undo the 50-character block scramble. The same swap scrambles and unscrambles. */
export function unscramble(s) {
  const swap = (p) => {
    const c = p.split("");
    for (let i = 0; i < 5; i++) {
      c[49 - i] = p[i];
      c[i] = p[49 - i];
    }
    for (let i = 10; i < 24; i++) {
      c[49 - i] = p[i];
      c[i] = p[49 - i];
    }
    return c.join("");
  };
  let out = "";
  let rest = s;
  while (rest.length > 50) {
    const block = rest.slice(0, 50);
    rest = rest.slice(50);
    out += rest.length < 2 ? block : swap(block);
  }
  return out + rest;
}

/** An iReal chord quality as one of this page's qualities. */
export function qualityOf(q) {
  const t = q.replace(/\/.*$/, "");
  if (t === "" || t === "5" || t === "2" || t === "add9") return "maj";
  if (t === "6" || t === "69" || t === "6/9") return "6";
  if (t.startsWith("^")) return "maj7";
  if (t.startsWith("-")) {
    if (t.startsWith("-^")) return "m7";
    if (t === "-") return "m";
    if (/^-6/.test(t)) return "m6";
    if (/^-9$/.test(t)) return "m9";
    return "m7";
  }
  if (t.startsWith("h")) return "m7b5";
  if (t.startsWith("o")) return "dim7";
  if (t.startsWith("+")) return "7alt";
  if (/sus/.test(t)) return "sus4";
  if (/alt|b9|#9|b5|#5|b13/.test(t)) return "7alt";
  if (/#11/.test(t)) return "7#11";
  if (/^13/.test(t)) return "13";
  if (/^9/.test(t)) return "9";
  if (/\d/.test(t)) return "7";
  return "maj";
}

/** "Bb-7/Eb" to "Bbm7", or null for something that is not a chord. */
export function convertChord(text) {
  const m = /^([A-G])([#b]?)([^/]*)/.exec(text);
  if (!m) return null;
  const c = cleanChord(m[1] + m[2] + qualityOf(m[3]), "");
  return c || null;
}

/** Bars of the unscrambled markup, repeats and endings written out. */
export function readMusic(raw) {
  let measures = [];
  let startRepeat = null;
  let endRepeat = null;
  let lastChord = null;
  let timeSig = null;
  let coda = null;
  let segno = null;
  let fine = null;
  const jumps = { dcFine: false, dcCoda: false, dsCoda: false, third: false };
  const fresh = () => {
    if (measures.length === 0 || measures[measures.length - 1].length !== 0) measures.push([]);
  };
  const current = () => {
    if (measures.length === 0) measures.push([]);
    return measures[measures.length - 1];
  };
  const copyOf = (list) => list.map((m) => [...m]);
  const pending = () => jumps.dcFine || jumps.dcCoda || jumps.dsCoda || jumps.third;
  const finishJumps = () => {
    if (jumps.third) {
      measures.push(...copyOf(measures.slice(startRepeat ?? 0, endRepeat ?? measures.length)));
      jumps.third = false;
    }
    if (jumps.dcFine) {
      measures.push(...copyOf(measures.slice(0, fine ?? measures.length)));
      jumps.dcFine = false;
    }
    if (jumps.dcCoda) {
      measures.push(...copyOf(measures.slice(0, coda ?? measures.length)));
      jumps.dcCoda = false;
    }
    if (jumps.dsCoda) {
      measures.push(...copyOf(measures.slice(segno ?? 0, coda ?? measures.length)));
      jumps.dsCoda = false;
    }
    fresh();
  };
  let i = 0;
  const s = raw;
  while (i < s.length) {
    const rest = s.slice(i);
    let m;
    if (rest.startsWith("XyQ")) i += 3;
    else if ((m = /^\*\w/.exec(rest))) i += m[0].length;
    else if ((m = /^<(.*?)>/.exec(rest))) {
      const note = m[1].toLowerCase();
      if (note === "d.c. al 3rd ending") jumps.third = true;
      else if (note === "d.c. al fine") jumps.dcFine = true;
      else if (note === "d.c. al coda") jumps.dcCoda = true;
      else if (note === "d.s. al coda") jumps.dsCoda = true;
      else if (note === "fine") fine = measures.length;
      i += m[0].length;
    } else if ((m = /^T(\d\d)/.exec(rest))) {
      timeSig = m[1];
      i += 3;
    } else if (rest.startsWith("Kcl")) {
      if (measures.length) measures.push([...measures[measures.length - 1]]);
      i += 3;
    } else if (rest[0] === "x") {
      if (measures.length >= 2) measures[measures.length - 1] = [...measures[measures.length - 2]];
      i += 1;
    } else if (rest[0] === "r") {
      if (measures.length >= 3) {
        measures[measures.length - 1] = [...measures[measures.length - 3]];
        measures[measures.length] = [...measures[measures.length - 2]];
      }
      i += 1;
    } else if ((m = /^Y+/.exec(rest))) i += m[0].length;
    else if (rest[0] === "n") {
      current().push(null);
      i += 1;
    } else if (rest[0] === "S") {
      segno = measures.length - 1;
      i += 1;
    } else if (rest[0] === "Q") {
      coda = measures.length;
      i += 1;
    } else if (rest[0] === "{") {
      fresh();
      startRepeat = measures.length - 1;
      endRepeat = null;
      i += 1;
    } else if (rest[0] === "}") {
      const end = endRepeat ?? measures.length;
      measures.push(...copyOf(measures.slice(startRepeat ?? 0, end)));
      fresh();
      i += 1;
    } else if (rest.startsWith("LZ") || rest[0] === "|" || rest[0] === "[") {
      fresh();
      i += rest.startsWith("LZ") ? 2 : 1;
    } else if ((m = /^N(\d)/.exec(rest))) {
      if (m[1] === "1") endRepeat = measures.length - 1;
      i += 2;
    } else if (rest[0] === "]" || rest[0] === "Z") {
      if (pending()) finishJumps();
      else fresh();
      i += 1;
    } else if (rest[0] === "(") {
      // an alternate chord shown above the main one: skip it
      const close = rest.indexOf(")");
      i += close < 0 ? 1 : close + 1;
    } else if ((m = /^[A-GW][+\-^\dhob#suadlt]*(\/[A-G][#b]?)?/.exec(rest))) {
      let chord = m[0];
      if (chord.startsWith("W") && lastChord) chord = chord.replace("W", lastChord);
      else lastChord = chord.split("/")[0];
      current().push(chord);
      i += m[0].length;
    } else i += 1;
  }
  measures = measures.filter((x) => x.length !== 0);
  return { measures, timeSig };
}

/** One or two chords for a bar: the form holds at most two. */
function barOf(chords, carry) {
  const named = chords.map((c) => (c === null ? null : convertChord(c)));
  const real = named.filter(Boolean);
  if (real.length === 0) return carry ? [carry] : null;
  const pick = real.length <= 2 ? real : [real[0], real[real.length === 3 ? 2 : Math.floor(real.length / 2)]];
  return pick.filter((c, k) => k === 0 || c !== pick[k - 1]);
}

function makeSong(text) {
  const parts = text.split(/=+/).filter((x) => x !== "");
  const mi = parts.findIndex((x) => x.startsWith(PREFIX));
  if (mi < 4) return null;
  const music = unscramble(parts[mi].slice(PREFIX.length));
  const { measures, timeSig } = readMusic(music);
  const form = [];
  let carry = null;
  for (const m of measures) {
    const bar = barOf(m, carry);
    if (bar) {
      form.push(bar);
      carry = bar[bar.length - 1];
    }
  }
  if (form.length === 0) return null;
  const beats = timeSig ? Number(timeSig[0]) : 4;
  const den = timeSig ? Number(timeSig[1]) : 4;
  return {
    title: parts[0].trim().slice(0, 80),
    composer: parts[1].trim().slice(0, 80),
    style: parts[2].trim().slice(0, 60),
    key: parts[3].trim().slice(0, 12),
    beats,
    den,
    truncated: form.length > MAX_IMPORT_BARS,
    form: form.slice(0, MAX_IMPORT_BARS),
  };
}

/** Every iReal link in a pasted text or file. Returns the songs and how many links were read. */
export function parseIReal(text) {
  const songs = [];
  let links = 0;
  let src = String(text ?? "");
  if (/irealb?%3A/i.test(src) && !/irealb?:\/\//i.test(src)) {
    try {
      src = decodeURIComponent(src);
    } catch {}
  }
  const re = /irealb:\/\/([^"'\s<>]*)/gi;
  let m;
  while ((m = re.exec(src))) {
    links++;
    let body = m[1];
    try {
      body = decodeURIComponent(body);
    } catch {}
    const parts = body.split("===");
    if (parts.length > 1) parts.pop(); // the playlist name
    for (const p of parts) {
      let song = null;
      try {
        song = makeSong(p);
      } catch {}
      if (song) songs.push(song);
    }
  }
  return { songs, links };
}
