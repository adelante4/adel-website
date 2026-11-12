// The Listen section: microphone on, notes timed against the band while you play, a report when you stop.
// Browser side. The hearing is in ear.js, the numbers in timefeel.js, the reading of them in coach.js.
import { createEar } from "./ear.js?v=20261112a";
import { openMic } from "./mic.js?v=20261112a";
import { probeSignal } from "./latency.js?v=20261112a";
import { analyzeTiming, analyzePacing } from "./timefeel.js?v=20261112a";
import { coach, coachNotes, SOURCES } from "./coach.js?v=20261112a";
import { analyzeHarmony, inside } from "./harmonymap.js?v=20261112a";
import { findLicks } from "./licks.js?v=20261112a";
import { noteName } from "./analysis.js?v=20261112a";
import { bandFeel } from "./groove.js?v=20261112a";

const CAL = "adelListenDelay";
const TAKES = "adelListenTakes";
const LINES = "adelListenLines"; // the notes of earlier takes, so a lick is known when it comes back
const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};
const load = (key, fallback) => {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
};
const store = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
};

/**
 * @param {{audio:object, transport:object, getState:()=>object, applyPatch:(patch:object)=>void, notice:(t:string)=>void}} o
 */
export function initListen({ audio, transport, getState, applyPatch, notice }) {
  let mic = null;
  let ear = null;
  let cal = load(CAL, null); // { ms, at }
  let notes = [];
  let taking = false;
  let measuring = false;
  let meterAt = 0;
  let lastResult = null;

  const ui = {
    mic: $("listen-mic"),
    status: $("listen-status"),
    meter: $("listen-meter"),
    live: $("listen-live"),
    delay: $("listen-delay"),
    measure: $("listen-measure"),
    report: $("listen-report"),
  };

  function roundTrip() {
    const st = ear ? ear.state : null;
    if (st && st.mode === "speakers" && st.roundTrip !== null) return { seconds: st.roundTrip, source: "speakers" };
    if (cal) return { seconds: cal.ms / 1000, source: "measured" };
    return { seconds: audio.outputLatency() + (mic ? mic.inputLatency : 0), source: "estimate" };
  }

  function showDelay() {
    const rt = roundTrip();
    const ms = Math.round(rt.seconds * 1000);
    ui.delay.textContent =
      rt.source === "speakers"
        ? `Delay ${ms} ms, measured from the band in the room as it plays.`
        : rt.source === "measured"
          ? `Delay ${ms} ms, measured ${new Date(cal.at).toLocaleDateString()}. Measure again after changing speakers or headphones.`
          : `Delay not measured (the browser's guess is ${ms} ms). The report will not say ahead or behind until it is.`;
  }

  function showStatus() {
    if (!mic) {
      ui.status.textContent = "Microphone off.";
      return;
    }
    const st = ear.state;
    const where = st.mode === "speakers" ? "It hears the band through the speakers and subtracts it." : st.mode === "headphones" ? "It does not hear the band: headphones or a plugged-in guitar. Best accuracy." : "Listening.";
    ui.status.textContent = `${mic.label}. ${where}${mic.processed ? " The browser is still processing the sound, which can blur the timing." : ""}`;
  }

  function onBlock(b) {
    if (!ear) return;
    const found = ear.push(b.mic, b.ref, b.start);
    const now = performance.now();
    if (now - meterAt > 80) {
      meterAt = now;
      const st = ear.state;
      ui.meter.value = Math.max(0, Math.min(1, (st.levelDb + 60) / 54));
      const speakers = st.mode === "speakers" && st.roundTrip !== null;
      if (speakers && (!cal || Math.abs(cal.ms - st.roundTrip * 1000) > 1)) {
        cal = { ms: Math.round(st.roundTrip * 10000) / 10, at: Date.now() };
        store(CAL, cal);
      }
      if (!measuring) {
        showStatus();
        showDelay();
      }
    }
    if (!taking) return;
    const rt = roundTrip();
    const st = ear.state;
    for (const n of found) {
      // With speakers, the first second after the band is found is still being learned: leave it out.
      if (st.mode === "speakers" && st.lockedAt !== null && n.t < st.lockedAt + 1) continue;
      const beat = transport.beatAt(n.t - rt.seconds);
      if (!(beat >= 0)) continue;
      notes.push({ beat, level: n.level, midi: n.midi, precise: n.precise, t: n.t });
      const d = beat - Math.round(beat);
      const ms = (d * 60000) / transport.bpmAt(beat);
      ui.live.textContent = Math.abs(d) <= 0.18 ? `${notes.length} notes. Last one ${ms >= 0 ? "+" : "−"}${Math.abs(Math.round(ms))} ms${rt.source === "estimate" ? " (delay not measured)" : ""}.` : `${notes.length} notes.`;
    }
  }

  async function micOn() {
    try {
      const ctx = await audio.resume();
      audio.setRecording(true);
      ear = createEar({ rate: ctx.sampleRate, hint: cal ? cal.ms / 1000 : null });
      mic = await openMic(ctx, audio.output, onBlock, { source: window.__benchMic || null });
      ui.mic.setAttribute("aria-pressed", "true");
      ui.mic.textContent = "Microphone on";
      ui.measure.disabled = false;
      showStatus();
      showDelay();
    } catch (err) {
      audio.setRecording(false);
      ear = null;
      mic = null;
      notice(err instanceof Error ? err.message : "The microphone could not be opened.");
    }
  }

  function micOff() {
    if (mic) mic.close();
    mic = null;
    ear = null;
    taking = false;
    audio.setRecording(false);
    ui.mic.setAttribute("aria-pressed", "false");
    ui.mic.textContent = "Turn microphone on";
    ui.measure.disabled = true;
    ui.meter.value = 0;
    ui.live.textContent = "";
    showStatus();
  }

  /** Plays a sweep and reads how long it takes to come back through the microphone. */
  async function measure() {
    if (!mic || measuring) return;
    if (transport.running) {
      notice("Stop the band first, then measure.");
      return;
    }
    measuring = true;
    ui.measure.disabled = true;
    ui.delay.textContent = "Measuring: a sweep plays twice. With headphones, hold one earcup against the microphone.";
    const ctx = audio.ctx;
    ear = createEar({ rate: ctx.sampleRate });
    const sig = probeSignal(ctx.sampleRate, 3.2);
    const buf = ctx.createBuffer(1, sig.length, ctx.sampleRate);
    buf.copyToChannel(sig, 0);
    const src = ctx.createBufferSource();
    const g = ctx.createGain();
    g.gain.value = 0.5;
    src.buffer = buf;
    src.connect(g);
    g.connect(audio.output);
    src.start();
    await new Promise((r) => setTimeout(r, 3900));
    try {
      g.disconnect();
    } catch {}
    const st = ear ? ear.state : null;
    measuring = false;
    ui.measure.disabled = !mic;
    if (st && st.roundTrip !== null) {
      cal = { ms: Math.round(st.roundTrip * 10000) / 10, at: Date.now() };
      store(CAL, cal);
      if (mic) ear = createEar({ rate: ctx.sampleRate, hint: cal.ms / 1000 });
      showDelay();
    } else {
      if (mic) ear = createEar({ rate: ctx.sampleRate, hint: cal ? cal.ms / 1000 : null });
      ui.delay.textContent = "The microphone did not hear the sweep. Turn the volume up, or hold the earcup closer, and measure again.";
    }
  }

  // ---- the report ----
  function chart(t, beats) {
    const W = 640;
    const H = 320;
    const left = 78;
    const right = 10;
    const top = 40;
    const bottom = 46;
    const span = Math.max(40, Math.min(120, Math.ceil(Math.max(...t.points.map((p) => Math.abs(p.ms)), 30) / 20) * 20));
    const cols = beats * 2;
    const cw = (W - left - right) / cols;
    const y = (ms) => top + ((Math.max(-span, Math.min(span, ms)) + span) / (2 * span)) * (H - top - bottom);
    const ns = "http://www.w3.org/2000/svg";
    const s = (tag, attrs, text) => {
      const e = document.createElementNS(ns, tag);
      for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
      if (text !== undefined) e.textContent = text;
      return e;
    };
    const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, class: "lr-chart", role: "img", "aria-label": "Each timed note by its place in the bar, in milliseconds ahead of or behind the band" });
    for (const ms of [-span, -span / 2, 0, span / 2, span]) {
      svg.append(s("line", { x1: left, x2: W - right, y1: y(ms), y2: y(ms), class: ms === 0 ? "lr-zero" : "lr-grid" }));
      svg.append(s("text", { x: left - 10, y: y(ms) + 7, class: "lr-tick", "text-anchor": "end" }, ms === 0 ? "band" : `${ms > 0 ? "+" : "−"}${Math.abs(ms)}`));
    }
    svg.append(s("text", { x: 4, y: top - 16, class: "lr-tick" }, "ahead (ms)"));
    svg.append(s("text", { x: 4, y: H - 4, class: "lr-tick" }, "behind"));
    const jitter = (i) => ((i * 0.61803) % 1) - 0.5;
    const sums = new Map();
    t.points.forEach((p, i) => {
      const col = p.slot * 2 + (p.kind === "up" ? 1 : 0);
      const x = left + (col + 0.5) * cw + jitter(i) * cw * 0.6;
      const c = s("circle", { cx: x.toFixed(1), cy: y(p.ms).toFixed(1), r: 6, class: p.kind === "up" ? "lr-up" : "lr-down" });
      c.append(s("title", {}, `${p.kind === "up" ? "Offbeat" : "Beat"} ${p.slot + 1}, bar ${p.bar + 1}: ${Math.abs(Math.round(p.ms))} ms ${p.ms >= 0 ? "behind" : "ahead"}`));
      svg.append(c);
      const e = sums.get(col) || { n: 0, sum: 0 };
      e.n++;
      e.sum += p.ms;
      sums.set(col, e);
    });
    for (let col = 0; col < cols; col++) {
      const cx = left + (col + 0.5) * cw;
      svg.append(s("text", { x: cx, y: H - bottom + 28, class: "lr-tick", "text-anchor": "middle" }, col % 2 ? "&" : String(col / 2 + 1)));
      const e = sums.get(col);
      if (e && e.n >= 4) svg.append(s("line", { x1: cx - cw * 0.36, x2: cx + cw * 0.36, y1: y(e.sum / e.n), y2: y(e.sum / e.n), class: "lr-mean" }));
    }
    return svg;
  }

  function cardsOf(headline) {
    const cards = el("div", "lr-cards");
    for (const h of headline) {
      const card = el("div", "lr-card");
      card.append(el("span", "lr-k", h.label), el("b", "lr-v", h.value), el("span", "lr-n", h.note));
      cards.append(card);
    }
    return cards;
  }

  function drillOf(drill) {
    const d = el("div", "lr-drill");
    d.append(el("span", "lr-k", "Practise next"), el("b", null, drill.title), el("p", "note", drill.how));
    if (Object.keys(drill.patch).length) {
      const b = el("button", "btn small", "Set this up");
      b.type = "button";
      b.addEventListener("click", () => {
        applyPatch(drill.patch);
        notice(`Set up: ${drill.title}. Press Start.`);
      });
      d.append(b);
    }
    return d;
  }

  function findingsOf(findings) {
    const list = el("div", "lr-findings");
    for (const f of findings) {
      const item = el("div", "lr-finding");
      item.append(el("b", null, f.title), el("p", "note", f.text));
      if (f.sources.length) {
        const src = el("p", "lr-src");
        src.append("From: ");
        f.sources.forEach((k, i) => {
          const a = el("a", null, SOURCES[k].short);
          a.href = SOURCES[k].url;
          a.target = "_blank";
          a.rel = "noopener";
          a.title = SOURCES[k].cite;
          if (i) src.append(", ");
          src.append(a);
        });
        item.append(src);
      }
      list.append(item);
    }
    return list;
  }

  /** The form as a grid of bars. The darker a bar, the more of your notes there were chord tones. */
  function heatmap(h, beats) {
    const grid = el("div", "lr-heat");
    grid.setAttribute("role", "table");
    grid.setAttribute("aria-label", "Share of chord tones in each bar of the form");
    const bars = new Map();
    for (const c of h.bySlot) {
      if (!bars.has(c.slot.bar)) bars.set(c.slot.bar, []);
      bars.get(c.slot.bar).push(c);
    }
    for (const [bar, cells] of bars) {
      const b = el("div", "lr-bar");
      b.setAttribute("role", "row");
      b.append(el("span", "lr-barno", String(bar + 1)));
      for (const c of cells) {
        const cell = el("div", "lr-cell");
        cell.setAttribute("role", "cell");
        const share = inside(c);
        cell.append(el("span", "lr-chord", c.slot.chord));
        if (c.n >= 4) {
          cell.style.setProperty("--heat", (0.06 + 0.74 * share).toFixed(2));
          cell.append(el("b", null, `${Math.round(share * 100)}%`), el("span", "lr-count", `${c.n} notes`));
          cell.title = `${c.slot.chord}: ${c.guide} on the 3rd or 7th, ${c.chord} on root or 5th, ${c.colour} colour notes, ${c.approach} approaches, ${c.avoid + c.outside} outside or held 4ths`;
        } else {
          cell.classList.add("few");
          cell.append(el("b", null, c.n ? "few" : "none"), el("span", "lr-count", c.n ? `${c.n} notes` : "not played"));
        }
        b.append(cell);
      }
      grid.append(b);
    }
    return grid;
  }

  /** What you played, by what it is in the chord. */
  function kindsTable(h) {
    const tbl = el("table", "lr-table");
    tbl.innerHTML = "<caption>What your notes are in the chord</caption><thead><tr><th></th><th>All</th><th>On the beat</th><th>Off the beat</th></tr></thead>";
    const body = el("tbody");
    const rows = [
      ["3rd or 7th", "guide"],
      ["Root or 5th", "chord"],
      ["Colour (9th, 11th, 13th)", "colour"],
      ["Chromatic approach", "approach"],
      ["4th held over a major or dominant chord", "avoid"],
      ["Outside the scale", "outside"],
    ];
    const share = (t, k) => (t.n ? `${Math.round((t[k] / t.n) * 100)}%` : "");
    for (const [label, k] of rows) {
      const tr = el("tr");
      tr.append(el("td", null, label), el("td", null, share(h.all, k)), el("td", null, share(h.onBeat, k)), el("td", null, share(h.offBeat, k)));
      body.append(tr);
    }
    tbl.append(body);
    return tbl;
  }

  function landingTable(h) {
    const words = { maj: "Major", dom: "Dominant", min: "Minor", hdim: "Half-diminished", dim: "Diminished" };
    const entries = Object.entries(h.landingBy).filter(([, c]) => c.n >= 2);
    if (!entries.length) return null;
    const tbl = el("table", "lr-table");
    tbl.innerHTML = "<caption>The first note you play on a new chord</caption><thead><tr><th>Chord</th><th>Times</th><th>You start on</th></tr></thead>";
    const body = el("tbody");
    for (const [cls, c] of entries) {
      const tr = el("tr");
      const top = Object.entries(c.degrees).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([d, n]) => `${d} ${Math.round((n / c.n) * 100)}%`).join(", ");
      tr.append(el("td", null, words[cls]), el("td", null, String(c.n)), el("td", null, top));
      body.append(tr);
    }
    tbl.append(body);
    return tbl;
  }

  let playing = null;
  async function hear(lick, bpm, sound) {
    if (transport.running) {
      notice("Stop the band to hear the lick.");
      return;
    }
    const ctx = await audio.resume();
    if (playing) playing.stop();
    const run = audio.createRun({ click: 0, chords: 0.8, bass: 0, groove: 0 });
    playing = run;
    const spb = 60 / bpm;
    const t0 = ctx.currentTime + 0.08;
    lick.example.forEach((midi, i) => {
      const at = lick.exampleBeats[i] * spb;
      const next = i + 1 < lick.example.length ? lick.exampleBeats[i + 1] * spb : at + spb;
      audio.chord(run, t0 + at, [midi], Math.min(1.2, Math.max(0.12, (next - at) * 0.95)), 0.8, sound);
    });
    const total = lick.exampleBeats[lick.exampleBeats.length - 1] * spb + 1.6;
    setTimeout(() => {
      if (playing === run) playing = null;
      run.stop();
    }, total * 1000);
  }

  function lickCard(lick, flats, bpm, sound) {
    const card = el("div", "lr-lick");
    const W = 220;
    const H = 64;
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.setAttribute("class", "lr-contour");
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", `The shape of the lick: ${lick.intervals.map((x) => (x > 0 ? `up ${x}` : x < 0 ? `down ${-x}` : "same")).join(", ")} semitones`);
    const lo = Math.min(...lick.example);
    const hi = Math.max(...lick.example);
    const last = lick.exampleBeats[lick.exampleBeats.length - 1] || 1;
    const pts = lick.example.map((m, i) => [8 + (lick.exampleBeats[i] / last) * (W - 16), H - 8 - ((m - lo) / Math.max(1, hi - lo)) * (H - 16)]);
    const line = document.createElementNS(ns, "polyline");
    line.setAttribute("points", pts.map((p) => p.map((v) => v.toFixed(1)).join(",")).join(" "));
    line.setAttribute("class", "lr-line");
    svg.append(line);
    for (const [x, y] of pts) {
      const c = document.createElementNS(ns, "circle");
      c.setAttribute("cx", x.toFixed(1));
      c.setAttribute("cy", y.toFixed(1));
      c.setAttribute("r", 3.5);
      c.setAttribute("class", "lr-dot");
      svg.append(c);
    }
    const names = lick.example.map((m) => noteName(m, flats)).join(" ");
    const where = [];
    if (lick.startBeat) where.push(`starts on ${lick.startBeat.value} ${Math.round(lick.startBeat.share * 100)}% of the time`);
    if (lick.over && lick.over.value) where.push(`over ${lick.over.value} ${Math.round(lick.over.share * 100)}%`);
    if (lick.from) where.push(`from the ${lick.from.value} ${Math.round(lick.from.share * 100)}%`);
    const kind = lick.shape === "lick" ? "Lick" : lick.shape === "scale" ? "Scale run" : "Arpeggio";
    const head = el("div", "lr-lickhead");
    head.append(el("b", null, `${kind}, ${lick.length} notes, ${lick.count} times`));
    const btn = el("button", "btn small", "Hear it");
    btn.type = "button";
    btn.addEventListener("click", () => hear(lick, bpm, sound));
    head.append(btn);
    card.append(head, svg, el("p", "lr-names", names));
    card.append(el("p", "note", `${lick.here} in this take${lick.takes > 1 ? `, also in ${lick.takes - 1} earlier take${lick.takes > 2 ? "s" : ""}` : ""}${where.length ? `. It ${where.join(", ")}.` : "."}`));
    return card;
  }

  function renderNotes(box, result) {
    const { h, L, n, bpm, beats, sound, chordsOn } = result;
    if (!n) return;
    box.append(el("h3", null, "Your notes against the chords"));
    if (!chordsOn) {
      box.append(el("p", "note", "The chords were off, so there was nothing to read your notes against. Turn Chords on in Sound and put in the tune to see this part. Your licks are below."));
    } else if (!n.enough) {
      box.append(el("p", "note", n.findings[0].text));
    } else {
      box.append(cardsOf(n.headline.filter((x) => x.label !== "Repeated")));
      box.append(el("p", "note", `${h.notes} single notes read${h.unpitched ? `, ${h.unpitched} left out (chords, or too unclear)` : ""}${Math.abs(h.tuningCents) >= 8 ? `. Your guitar is ${Math.abs(h.tuningCents)} cents ${h.tuningCents > 0 ? "sharp" : "flat"}; that was taken out` : ""}.`));
      if (n.drill) box.append(drillOf(n.drill));
      const fig = el("figure", "lr-fig");
      fig.append(el("figcaption", "label", "The form: how much of what you played in each bar was a chord tone"), heatmap(h, beats));
      const legend = el("div", "lr-legend");
      legend.innerHTML = '<span><i class="lr-ramp"></i>few chord tones to all chord tones</span><span><i class="lr-sw few"></i>too few notes to say</span>';
      fig.append(legend);
      box.append(fig);
      box.append(kindsTable(h));
      const lt = landingTable(h);
      if (lt) box.append(lt);
      box.append(findingsOf(n.findings.filter((f) => f.id !== "lick" && f.id !== "coverage")));
    }
    box.append(el("h3", null, "Your licks"));
    const shown = [...L.licks.filter((l) => l.shape === "lick").slice(0, 4), ...L.licks.filter((l) => l.shape !== "lick").slice(0, 1)];
    if (!shown.length) {
      box.append(el("p", "note", L.notes < 12 ? "Not enough single notes yet to look for licks." : "No figure of four notes or more came back in this take or the ones before it."));
      return;
    }
    const lickNotes = n.findings.filter((f) => f.id === "lick" || f.id === "coverage");
    const lead = n.findings.find((f) => f.id === "lick" && f.drill);
    if (lead && (!n.drill || n.drill.id !== lead.drill.id)) box.append(drillOf(lead.drill));
    const wrap = el("div", "lr-licks");
    for (const l of shown) wrap.append(lickCard(l, h ? h.flats : true, bpm, sound));
    box.append(wrap);
    if (lickNotes.length) box.append(findingsOf(lickNotes));
    box.append(el("p", "note", "A lick here is a run of intervals you played at least twice, in any key. The notes shown are from one of the times you played it."));
  }

  function render(result) {
    const { t, p, c, rt, bpm, beats } = result;
    const box = ui.report;
    box.replaceChildren();
    box.hidden = false;
    box.append(el("h3", null, "Your time"));
    if (!c.enough) {
      box.append(el("p", "note", c.findings[0].text));
      renderNotes(box, result);
      return;
    }
    box.append(cardsOf(c.headline));
    box.append(el("p", "note", `${t.timed} notes timed at ${bpm} BPM. ${t.other} fell between the eighths and ${t.unplaced} were too soft to place; those are left out.${rt.source === "estimate" ? "" : ` Delay used: ${Math.round(rt.seconds * 1000)} ms.`}`));
    if (c.drill) box.append(drillOf(c.drill));

    if (rt.source !== "estimate") {
      const fig = el("figure", "lr-fig");
      const legend = el("div", "lr-legend");
      legend.innerHTML = '<span><i class="lr-sw down"></i>on the beat</span><span><i class="lr-sw up"></i>offbeat</span><span><i class="lr-sw mean"></i>average</span>';
      fig.append(el("figcaption", "label", "Where your notes fall in the bar"), legend, chart(t, beats));
      box.append(fig);
    }
    box.append(findingsOf(c.findings));

    const takes = load(TAKES, []);
    if (takes.length > 1) {
      const tbl = el("table", "lr-table");
      tbl.innerHTML = "<caption>Your last takes</caption><thead><tr><th>When</th><th>BPM</th><th>Notes</th><th>Spread</th><th>Downbeats</th><th>Swing</th></tr></thead>";
      const body = el("tbody");
      for (const k of takes.slice(-6).reverse()) {
        const tr = el("tr");
        const cell = (v) => tr.append(el("td", null, v));
        cell(new Date(k.at).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }));
        cell(String(k.bpm));
        cell(String(k.n));
        cell(`±${k.sd} ms`);
        cell(k.down === null ? "?" : `${k.down >= 0 ? "+" : "−"}${Math.abs(k.down)} ms`);
        cell(k.swing === null ? "" : `${k.swing.toFixed(1)}:1`);
        body.append(tr);
      }
      tbl.append(body);
      box.append(tbl);
    }
    renderNotes(box, result);
    box.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  function finish() {
    const state = getState();
    const beats = state.pattern.beats;
    const last = notes.length ? notes[notes.length - 1].beat : 0;
    const bpm = Math.round(transport.bpmAt(last));
    const rt = roundTrip();
    const ctx = {
      beats,
      feel: bandFeel(state.groove, state.pattern),
      msPerBeat: (b) => 60000 / transport.bpmAt(b),
      bpmAt: (b) => transport.bpmAt(b),
      practice: state.practice,
    };
    const t = analyzeTiming(notes, ctx);
    const p = analyzePacing(notes, { beats, countIn: state.practice.countIn, totalBeats: Math.max(last, transport.beatAt(audio.ctx.currentTime - rt.seconds)) });
    const c = coach(t, p, { bpm, beats, calibrated: rt.source !== "estimate" });
    if (c.enough) {
      const takes = load(TAKES, []);
      takes.push({ at: Date.now(), bpm, n: t.timed, sd: Math.round(t.down.n >= 8 ? t.down.sd : t.all.sd), down: rt.source === "estimate" ? null : Math.round(t.down.mean), swing: t.swing.enough && t.swung ? t.swing.ratio : null });
      store(TAKES, takes.slice(-60));
    }
    // The notes: against the chords, and as figures that come back.
    const chordsOn = state.harmony.on;
    const h = analyzeHarmony(notes, { form: state.harmony.form, beats, countIn: state.practice.countIn });
    const eighth = (r) => {
      const inBar = (((r.beat - state.practice.countIn * beats) % beats) + beats) % beats;
      const k = Math.round(inBar * 2) % (beats * 2);
      return k % 2 ? `the "and" of ${(k - 1) / 2 + 1}` : `beat ${k / 2 + 1}`;
    };
    const rowAt = new Map(h.rows.map((r) => [Math.round(r.beat * 100), r]));
    const context = (note) => {
      if (note.ctx) return note.ctx; // a note from an earlier take carries its own
      const r = rowAt.get(Math.round(note.beat * 100));
      if (!r) return null;
      return { beatInBar: eighth(r), onBeat: r.onBeat, numeral: chordsOn ? r.slot.numeral : null, degree: chordsOn ? r.degree : null };
    };
    const earlier = load(LINES, []).map((k) => ({ id: k.at, notes: k.notes.map(([beat, midi, beatInBar, onBeat, numeral, degree]) => ({ beat, midi, ctx: { beatInBar, onBeat: Boolean(onBeat), numeral, degree } })), context }));
    const mine = { id: "now", notes: notes.map((x) => ({ beat: x.beat, midi: x.midi === null ? null : Math.round(x.midi - h.tuningCents / 100) })), context };
    const L = findLicks([...earlier, mine]);
    const n = coachNotes(h, L, { beats });
    if (h.notes >= 12) {
      const kept = h.rows.map((r) => {
        const cx = context({ beat: r.beat });
        return [Math.round(r.beat * 100) / 100, r.midi, cx.beatInBar, cx.onBeat ? 1 : 0, cx.numeral, cx.degree];
      });
      const lines = [...load(LINES, []), { at: Date.now(), notes: kept }].slice(-25);
      while (lines.length > 1 && lines.reduce((sum, k) => sum + k.notes.length, 0) > 5000) lines.shift();
      store(LINES, lines);
    }
    const result = { t, p, c, rt, bpm, beats, notes, h, L, n, chordsOn, sound: state.harmony.sound };
    lastResult = result;
    render(result);
    return result;
  }

  ui.mic.addEventListener("click", () => (mic ? micOff() : micOn()));
  ui.measure.addEventListener("click", measure);
  ui.measure.disabled = true;
  showStatus();
  showDelay();

  return {
    get on() {
      return mic !== null;
    },
    /** The band starts: a new take. */
    onStart() {
      notes = [];
      taking = mic !== null;
      if (taking) {
        ui.live.textContent = "Listening. Play.";
        ui.report.hidden = true;
      }
    },
    /** The band stops (call before the transport is stopped): the take is read. */
    onStop() {
      if (!taking) return null;
      taking = false;
      ui.live.textContent = "";
      return finish();
    },
    /** For the bench: the last report and the ear's view of the room. */
    get last() {
      return lastResult;
    },
    get room() {
      return ear ? ear.state : null;
    },
  };
}
