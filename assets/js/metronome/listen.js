// The Listen section: microphone on, notes timed against the band while you play, a report when you stop.
// Browser side. The hearing is in ear.js, the numbers in timefeel.js, the reading of them in coach.js.
import { createEar } from "./ear.js?v=20261111a";
import { openMic } from "./mic.js?v=20261111a";
import { probeSignal } from "./latency.js?v=20261111a";
import { analyzeTiming, analyzePacing } from "./timefeel.js?v=20261111a";
import { coach, SOURCES } from "./coach.js?v=20261111a";
import { bandFeel } from "./groove.js?v=20261111a";

const CAL = "adelListenDelay";
const TAKES = "adelListenTakes";
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

  function render(result) {
    const { t, p, c, rt, bpm, beats } = result;
    const box = ui.report;
    box.replaceChildren();
    box.hidden = false;
    box.append(el("h3", null, "Your take"));
    if (!c.enough) {
      box.append(el("p", "note", c.findings[0].text));
      return;
    }
    const cards = el("div", "lr-cards");
    for (const h of c.headline) {
      const card = el("div", "lr-card");
      card.append(el("span", "lr-k", h.label), el("b", "lr-v", h.value), el("span", "lr-n", h.note));
      cards.append(card);
    }
    box.append(cards);
    box.append(el("p", "note", `${t.timed} notes timed at ${bpm} BPM. ${t.other} fell between the eighths and ${t.unplaced} were too soft to place; those are left out.${rt.source === "estimate" ? "" : ` Delay used: ${Math.round(rt.seconds * 1000)} ms.`}`));

    if (c.drill) {
      const d = el("div", "lr-drill");
      d.append(el("span", "lr-k", "Practise next"), el("b", null, c.drill.title), el("p", "note", c.drill.how));
      if (Object.keys(c.drill.patch).length) {
        const b = el("button", "btn small", "Set this up");
        b.type = "button";
        b.addEventListener("click", () => {
          applyPatch(c.drill.patch);
          notice(`Set up: ${c.drill.title}. Press Start.`);
        });
        d.append(b);
      }
      box.append(d);
    }

    if (rt.source !== "estimate") {
      const fig = el("figure", "lr-fig");
      const legend = el("div", "lr-legend");
      legend.innerHTML = '<span><i class="lr-sw down"></i>on the beat</span><span><i class="lr-sw up"></i>offbeat</span><span><i class="lr-sw mean"></i>average</span>';
      fig.append(el("figcaption", "label", "Where your notes fall in the bar"), legend, chart(t, beats));
      box.append(fig);
    }

    const list = el("div", "lr-findings");
    for (const f of c.findings) {
      const item = el("div", "lr-finding");
      item.append(el("b", null, f.title), el("p", "note", f.text));
      if (f.sources.length) {
        const src = el("p", "lr-src");
        src.append("From: ");
        f.sources.forEach((k, i) => {
          const a = el("a", null, SOURCES[k].cite.split(",")[0].split(" (")[0] + (SOURCES[k].cite.match(/\((\d{4})\)/) ? ` ${SOURCES[k].cite.match(/\((\d{4})\)/)[1]}` : ""));
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
    box.append(list);

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
    const result = { t, p, c, rt, bpm, beats, notes };
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
