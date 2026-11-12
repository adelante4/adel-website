// The Tune room: the chart, a lens that changes what each bar shows, a Now/Next strip that follows
// the playhead, and what the tune shares with other tunes.
//
// Lenses (one at a time, so the chart never gets crowded):
//   chords    the chord names only
//   function  Roman numerals in the key each chord is working in, cadences bracketed
//   guide     the 3rd and 7th of each chord, with the 7th-to-3rd links that make a line
//   voicing   a four-string guitar shape per chord, chosen so the hand barely moves

import { analyze, noteName, keyName } from "./analysis.js";
import { voiceForm, degreeLabel, guideSemis, handMove } from "./voicing.js";
import { buildIndex, sharedPieces, shortName } from "./dna.js";
import { parseChord } from "./chords.js";
import { detectForm, locate } from "./sections.js?v=20261112b";
import { playFor, targetFor } from "./scales.js?v=20261112b";

const LENSES = [
  ["chords", "Chords", "Chord names only."],
  ["function", "Function", "Each chord by its job in the key. A line under bars marks a ii–V–I or similar; the key is named when it leaves home."],
  ["guide", "Guide tones", "The 3rd and 7th of each chord. Red marks where the last chord's 7th falls a half step (or stays) onto this chord's 3rd: play those two notes and the changes sing."],
  ["scale", "Scales", "The scale that fits each chord, its arpeggio, and a random tone to land on. A dominant that falls to a minor chord gets the altered scale; a major chord on IV gets Lydian."],
  ["voicing", "Voicings", "A four-string shape per chord. Red dots are the 3rd and 7th, a ring is the root. Shapes are chosen so the hand and the voices move as little as possible."],
];

const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

const STRING_NAMES = [["D", "G", "B", "e"], ["A", "D", "G", "B"]];

/** A small fretboard: four strings, a window of frets, dots for the notes. */
export function fretSvg(v, quality, big = false) {
  const first = v.lo <= 2 ? 1 : v.lo;
  const rows = Math.max(4, v.hi - first + 1);
  const x0 = 15;
  const gap = 12;
  const top = 8;
  const fh = 12;
  const w = x0 + 3 * gap + 9;
  const h = top + rows * fh + (big ? 12 : 3);
  const gt = guideSemis(quality);
  let s = `<svg class="fret${big ? " big" : ""}" viewBox="0 0 ${w} ${h}" role="img" aria-label="Frets ${v.frets.join(" ")} on strings ${STRING_NAMES[v.set].join(" ")}">`;
  s += `<line class="nut${first === 1 ? " on" : ""}" x1="${x0}" x2="${x0 + 3 * gap}" y1="${top}" y2="${top}"/>`;
  for (let r = 1; r <= rows; r++) s += `<line class="fl" x1="${x0}" x2="${x0 + 3 * gap}" y1="${top + r * fh}" y2="${top + r * fh}"/>`;
  for (let i = 0; i < 4; i++) s += `<line class="st" x1="${x0 + i * gap}" x2="${x0 + i * gap}" y1="${top}" y2="${top + rows * fh}"/>`;
  if (first > 1) s += `<text class="fn" x="${x0 - 5}" y="${top + 9}" text-anchor="end">${first}</text>`;
  v.frets.forEach((f, i) => {
    const cx = x0 + i * gap;
    const cy = top + (f - first) * fh + fh / 2;
    const semis = v.semis[i];
    const kind = semis === 0 ? "root" : semis === gt.third || semis === gt.seventh ? "gt" : "n";
    s += `<circle class="dot ${kind}" cx="${cx}" cy="${cy}" r="${big ? 5.2 : 4.6}"/>`;
    if (big) s += `<text class="dl ${kind}" x="${cx}" y="${cy + 2.3}" text-anchor="middle">${degreeLabel(semis, quality)}</text>`;
  });
  if (big) STRING_NAMES[v.set].forEach((n, i) => (s += `<text class="sn" x="${x0 + i * gap}" y="${h - 1}" text-anchor="middle">${n}</text>`));
  return s + "</svg>";
}

const MOVED = { 1: "up a half step", 2: "up a whole step", 3: "up a minor 3rd", 4: "up a major 3rd", 5: "up a 4th", 6: "a tritone away", 7: "down a 4th", 8: "down a major 3rd", 9: "down a minor 3rd", 10: "down a whole step", 11: "down a half step" };

/** What a section chip says when you hover it. */
function sectionTitle(det, i) {
  const s = det.sections[i];
  const firstOfLetter = det.sections.findIndex((x) => x.letter === s.letter);
  if (s.letter === "Tag") return `A tag: ${s.bars} bars after the last section.`;
  if (firstOfLetter === i) return `${s.letter}: bars ${s.start + 1} to ${s.start + s.bars}.`;
  const bits = [`Same changes as the first ${s.letter}`];
  if (s.shift) bits.push(`${MOVED[s.shift]}`);
  if (s.prime) bits.push("with a different ending");
  return `${bits.join(", ")}. Bars ${s.start + 1} to ${s.start + s.bars}.`;
}

export function createTuneView({ chart, nowNext, lensBar, lensNote, dna, library, loadTune, formStrip, pickBar }) {
  let lens = "chords";
  try {
    const saved = localStorage.getItem("metro-lens");
    if (LENSES.some(([id]) => id === saved)) lens = saved;
  } catch {
    /* no storage: start on the chord names */
  }

  const index = buildIndex(library);
  let data = null; // the analysis of the form on screen
  let chartKey = "";
  let nnKey = "";
  let dnaKey = "";
  let current = 0; // slot shown as Now
  let beats = 4;
  let beatDots = [];
  let lastBeat = -1;
  let lap = 0; // chord changes heard since play started: drives the random target tone

  // ---- data for a form ----
  function dataFor(form) {
    const key = JSON.stringify(form);
    if (data?.key === key) return data;
    const a = analyze(form);
    const at = [];
    const chords = [];
    form.forEach((bar, b) => {
      at[b] = [];
      bar.forEach((text, k) => {
        at[b][k] = chords.length;
        chords.push(text);
      });
    });
    data = { key, form, a, at, chords, voices: null, det: detectForm(form) };
    return data;
  }
  const voices = (d) => (d.voices ??= voiceForm(d.chords));
  const flats = (d) => d.a.flats;

  /** What the chart shows for a chord under the current lens. */
  function guide(d, i) {
    const c = parseChord(d.chords[i]) ?? { root: 0, quality: "maj7" };
    const g = guideSemis(c.quality);
    const third = (c.root + g.third) % 12;
    const seventh = (c.root + g.seventh) % 12;
    return {
      third,
      seventh,
      thirdName: noteName(third, flats(d)),
      seventhName: noteName(seventh, flats(d)),
      sevenLabel: g.seventh === 9 && c.quality !== "dim7" ? "6" : g.seventh === 7 ? "5" : "7",
      quality: c.quality,
    };
  }
  /** Does the previous chord's 7th fall (a half step) or stay onto this chord's 3rd? */
  function tied(d, i) {
    if (i === 0) return false;
    const gap = (guide(d, i - 1).seventh - guide(d, i).third + 12) % 12;
    return gap === 0 || gap === 1;
  }

  function info(d, i) {
    if (lens === "function") return el("span", "num", d.a.slots[i].numeral);
    if (lens === "guide") {
      const g = guide(d, i);
      const box = el("span", "gts");
      const a = el("span", "gt" + (tied(d, i) ? " tie" : ""));
      a.append(el("i", "", "3"), g.thirdName);
      const b = el("span", "gt");
      b.append(el("i", "", g.sevenLabel), g.seventhName);
      box.append(a, b);
      return box;
    }
    if (lens === "scale") {
      const p = playFor(d.chords[i], flats(d), d.chords[(i + 1) % d.chords.length], d.a.slots[i].numeral);
      return p ? el("span", "scl", p.name) : null;
    }
    if (lens === "voicing") {
      const v = voices(d)[i];
      if (!v) return null;
      const box = el("span", "fretbox");
      box.innerHTML = fretSvg(v, guide(d, i).quality);
      return box;
    }
    return null;
  }

  // ---- the chart ----
  function buildChart(d, sel) {
    return d.form.map((bar, b) => {
      const cell = el("div", "cell");
      const no = el("span", "no");
      const loc = locate(d.det, b);
      if (loc) {
        cell.dataset.tint = String(loc.section.letter === "Tag" ? 1 : "ABCDEFGHIJKLMNOPQRSTUVWXYZ".indexOf(loc.section.letter) % 4);
        if (b === loc.section.start) {
          cell.classList.add("sec-start");
          const tag = el("b", "sec", loc.section.label);
          tag.title = sectionTitle(d.det, loc.index);
          no.append(tag);
        }
      }
      no.append(`Bar ${b + 1}`);
      const pair = el("div", "pair");
      bar.forEach((text, k) => {
        const i = d.at[b][k];
        const s = d.a.slots[i];
        const half = el("div", "half");
        if (lens === "function" && s.cad !== null) {
          half.dataset.cad = s.pos;
          const cad = d.a.cadences[s.cad];
          if (cad.away && (s.pos === "start")) no.append(el("b", "kt", ` → ${cad.key.name}`));
        }
        const btn = el("button", "chord", text);
        btn.type = "button";
        btn.dataset.bar = String(b);
        btn.dataset.k = String(k);
        btn.setAttribute("aria-pressed", String(b === sel.bar && k === sel.k));
        btn.setAttribute("aria-label", `Bar ${b + 1}${bar.length === 2 ? (k ? ", second half" : ", first half") : ""}: ${text}`);
        half.append(btn);
        const extra = info(d, i);
        if (extra) half.append(extra);
        pair.append(half);
      });
      cell.append(no, pair);
      return cell;
    });
  }

  // ---- now / next ----
  function card(d, i, role, from) {
    const box = el("div", `nn-card ${role}`);
    const s = d.a.slots[i];
    const top = el("div", "nn-top");
    top.append(el("span", "nn-role", role === "now" ? "Now" : "Next"));
    const where = locate(d.det, s.bar);
    const nnBar = el("span", "nn-bar", `Bar ${s.bar + 1}${d.form[s.bar].length === 2 ? (s.k ? ", 2nd half" : ", 1st half") : ""}`);
    if (where) {
      const w = where.section;
      nnBar.append(" · ", el("b", "", w.label), ` ${where.bar}/${w.bars}`);
    }
    top.append(nnBar);
    box.append(top);
    box.append(el("div", "nn-chord", d.chords[i]));
    const fn = el("div", "nn-fn");
    fn.append(el("b", "", s.numeral));
    if (s.cad !== null) {
      const cad = d.a.cadences[s.cad];
      fn.append(` in ${cad.kind} · ${cad.key.name}`);
    } else fn.append(` in ${d.a.key.name}`);
    box.append(fn);
    if (lens === "guide") {
      const g = guide(d, i);
      const row = el("div", "nn-gt");
      const a = el("span", "gt big" + (tied(d, i) ? " tie" : ""));
      a.append(el("i", "", "3"), g.thirdName);
      const b = el("span", "gt big");
      b.append(el("i", "", g.sevenLabel), g.seventhName);
      row.append(a, b);
      box.append(row);
      if (from !== undefined && tied(d, i)) {
        const p = guide(d, from);
        box.append(el("div", "nn-hint", `${p.seventhName} falls to ${g.thirdName}`));
      }
    } else if (lens === "scale") {
      const p = playFor(d.chords[i], flats(d), d.chords[(i + 1) % d.chords.length], s.numeral);
      if (p) {
        box.append(el("div", "nn-scale", p.name));
        const sc = el("div", "nn-notes");
        const inArp = new Set(p.arp.map((t) => t.note));
        for (const n of p.scale) sc.append(el("span", "nt" + (inArp.has(n) ? " ct" : ""), n));
        box.append(sc);
        const ar = el("div", "nn-arp");
        for (const t of p.arp) {
          const x = el("span", "gt");
          x.append(el("i", "", t.label), t.note);
          ar.append(x);
        }
        box.append(ar);
        const tg = targetFor(d.chords[i], flats(d), role === "now" ? lap : lap + 1);
        if (tg) box.append(el("div", "nn-target", `Land on the ${tg.label}: ${tg.note}`));
      }
    } else if (lens === "voicing") {
      const v = voices(d)[i];
      if (v) {
        const f = el("div", "nn-fret");
        f.innerHTML = fretSvg(v, guide(d, i).quality, true);
        box.append(f);
        if (from !== undefined) box.append(el("div", "nn-hint", handMove(voices(d)[from], v)));
      }
    }
    if (role === "now") {
      const dots = el("div", "nn-beats");
      dots.setAttribute("aria-hidden", "true");
      beatDots = Array.from({ length: beats }, () => dots.appendChild(el("i")));
      box.append(dots);
    }
    return box;
  }

  function renderNow(d) {
    const key = JSON.stringify([d.key, current, lens, beats, lap]);
    if (key === nnKey) return;
    nnKey = key;
    lastBeat = -1;
    const n = d.chords.length;
    nowNext.replaceChildren(card(d, current, "now"), card(d, (current + 1) % n, "next", current));
  }

  // ---- what the tune shares ----
  function renderDna(d, tuneName) {
    const key = JSON.stringify([d.key, tuneName]);
    if (key === dnaKey) return;
    dnaKey = key;
    const box = el("div", "dna-body");
    const k = el("p", "dna-line");
    k.append(el("b", "", "Key "), `${d.a.key.name}`);
    if (d.a.centers.length > 1) k.append(`, also visits ${d.a.centers.slice(1).join(", ")}`);
    box.append(k);
    if (d.a.idioms.length) {
      const list = el("div", "dna-chips");
      for (const x of d.a.idioms) list.append(el("span", "dna-chip", `${x.count} × ${x.label}`));
      box.append(list);
    }
    const pieces = sharedPieces(d.form, index, tuneName);
    if (pieces.length) {
      box.append(el("p", "dna-head", "Four-bar pieces other tunes share"));
      for (const p of pieces) {
        const row = el("div", "dna-piece");
        const bars = p.starts.map((b) => `${b + 1}–${b + 4}`).join(", ");
        row.append(el("b", "", `Bars ${bars}`), el("code", "", p.chords));
        const who = el("span", "dna-who", "Also in ");
        p.tunes.slice(0, 4).forEach((t, n) => {
          const b = el("button", "dna-tune", shortName(t.name));
          b.type = "button";
          b.addEventListener("click", () => loadTune(t.id));
          who.append(n ? ", " : "", b);
        });
        if (p.tunes.length > 4) who.append(` and ${p.tunes.length - 4} more`);
        row.append(who);
        box.append(row);
      }
    } else if (d.form.length >= 4) box.append(el("p", "dna-line", "No four-bar piece here matches another tune in the library."));
    dna.replaceChildren(box);
  }

  // ---- the form strip: AABA, one chip a section ----
  let stripKey = "";
  let stripChips = [];
  function renderStrip(d) {
    if (!formStrip) return;
    const key = JSON.stringify(d.key);
    if (key === stripKey) return;
    stripKey = key;
    stripChips = [];
    if (!d.det) {
      formStrip.hidden = true;
      formStrip.replaceChildren();
      return;
    }
    formStrip.hidden = false;
    const name = el("span", "form-name", d.det.kind ?? `Form ${d.det.name}`);
    const kids = [name];
    if (d.det.kind) kids.push(el("span", "form-name", d.det.name));
    d.det.sections.forEach((s, i) => {
      const b = el("button", "form-chip", s.label);
      b.type = "button";
      b.title = sectionTitle(d.det, i);
      b.setAttribute("aria-label", `${s.letter === "Tag" ? "Tag" : `Section ${s.label}`}, bars ${s.start + 1} to ${s.start + s.bars}. Select its first bar.`);
      b.append(el("small", "", `${s.start + 1}\u2013${s.start + s.bars}`));
      b.addEventListener("click", () => pickBar?.(s.start));
      kids.push(b);
      stripChips.push(b);
    });
    formStrip.replaceChildren(...kids);
  }
  /** Mark the section the playhead (or the selected bar) is in. */
  function paintStrip(d, bar) {
    const loc = locate(d.det, bar);
    stripChips.forEach((b, i) => b.setAttribute("aria-pressed", String(!!loc && loc.index === i)));
  }

  // ---- lens switch ----
  const buttons = LENSES.map(([id, name]) => {
    const b = el("button", "seg", name);
    b.type = "button";
    b.addEventListener("click", () => {
      lens = userLens = id;
      try {
        localStorage.setItem("metro-lens", id);
      } catch {
        /* the choice just won't be remembered */
      }
      chartKey = "";
      api.render(api.last);
    });
    lensBar.append(b);
    return b;
  });

  let userLens = lens;
  const api = {
    last: null,
    /** Show a fixed lens (or null to go back to the one the player chose) without remembering it. */
    force(id) {
      lens = id ?? userLens;
      chartKey = "";
      if (api.last) api.render(api.last);
    },
    /** Draw everything for the current form. */
    render(ctx) {
      api.last = ctx;
      const { form, sel, beats: nb, tuneName } = ctx;
      beats = nb;
      const d = dataFor(form);
      buttons.forEach((b, i) => b.setAttribute("aria-pressed", String(LENSES[i][0] === lens)));
      lensNote.textContent = LENSES.find(([id]) => id === lens)[2];
      const key = JSON.stringify([d.key, sel, lens]);
      if (key !== chartKey) {
        chartKey = key;
        chart.dataset.lens = lens;
        chart.replaceChildren(...buildChart(d, sel));
      }
      if (!api.playing) current = d.at[Math.min(sel.bar, d.form.length - 1)][Math.min(sel.k, d.form[Math.min(sel.bar, d.form.length - 1)].length - 1)];
      renderNow(d);
      renderDna(d, tuneName);
      renderStrip(d);
      paintStrip(d, api.playing ? (d.a.slots[current]?.bar ?? 0) : sel.bar);
    },
    playing: false,
    /** The slot sounding now (or null when stopped), and how far into the bar we are. */
    follow(slot, inBar) {
      const d = data;
      if (!d) return;
      if (slot === null) {
        if (api.playing) {
          api.playing = false;
          lap = 0;
          nnKey = "";
          api.render(api.last);
        }
        return;
      }
      api.playing = true;
      const i = d.at[slot.bar]?.[slot.k];
      if (i === undefined) return;
      if (i !== current) {
        current = i;
        lap++;
        renderNow(d);
        paintStrip(d, slot.bar);
      }
      const dot = Math.min(beatDots.length - 1, Math.floor(inBar));
      if (dot !== lastBeat) {
        lastBeat = dot;
        beatDots.forEach((x, n) => x.classList.toggle("on", n === dot));
      }
    },
  };
  return api;
}
