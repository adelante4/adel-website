// The metronome page: wires the controls to the state, and the state to the audio.
//
// Flow: a control changes `state`, commit() cleans it, saves it, redraws, and tells the
// transport. Most changes are read by the click generator on its next pull, so they take
// effect within a fraction of a second. A tempo change calls retempo() so the beat does not
// jump; a change to the bar structure restarts the run so the bar count stays honest.
import { createAudio } from "./audio.js";
import { createTransport } from "./transport.js";
import { barPlays } from "./overlay.js";
import { clampBpm, tempoWord, createTapTempo } from "./tempo.js";
import { SIGNATURES, parseMeter, groupingOptions, groupingLabel, accentsFromGrouping, matchGrouping } from "./meter.js";
import { defaultState, defaultLevels, normalizeState, encodeShare, decodeShare } from "./share.js";

const $ = (id) => document.getElementById(id);
const STORE = "adelMetronome";

// ---- state ----
let state = defaultState();
let linkProblem = false;
let mode = "accent"; // what the beat bars set: "accent" or "chance"
{
  const hash = /^#p=(.+)$/.exec(location.hash);
  if (hash) {
    const fromLink = decodeShare(hash[1]);
    if (fromLink) state = fromLink;
    else linkProblem = true;
  }
  if (!hash || linkProblem) {
    try {
      const saved = localStorage.getItem(STORE);
      const restored = saved ? decodeShare(saved) : null;
      if (restored) state = restored;
    } catch {
      /* storage blocked: start from defaults */
    }
  }
}

// ---- audio and transport ----
const audio = createAudio();
const transport = createTransport(() => state);
const tapper = createTapTempo();
let run = null;
let timer = null;
let raf = 0;

const LOOKAHEAD = 0.2; // seconds of clicks queued ahead
const LOOKAHEAD_HIDDEN = 1.1; // background tabs run timers slowly, so queue further ahead

function tick() {
  const ctx = audio.ctx;
  if (!ctx || !run) return;
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  const events = transport.pull(ctx.currentTime, document.hidden ? LOOKAHEAD_HIDDEN : LOOKAHEAD);
  for (const e of events) {
    if (e.time < ctx.currentTime - 0.03) continue; // too late to be useful
    audio.click(run, Math.max(e.time, ctx.currentTime), e.kind, e.gain, state.pattern.sound);
  }
}

async function start() {
  if (transport.running) return;
  try {
    await audio.resume();
    // Recorded voices load first, but a slow connection never blocks the start for long.
    await Promise.race([audio.preload(state.pattern.sound), new Promise((r) => setTimeout(r, 1200))]);
  } catch (err) {
    notice(err instanceof Error ? err.message : "Could not start audio.");
    return;
  }
  run = audio.createRun();
  transport.start(audio.ctx.currentTime, 0.08);
  timer = setInterval(tick, 25);
  tick();
  setPlaying(true);
  raf = requestAnimationFrame(frame);
}

function stop() {
  clearInterval(timer);
  timer = null;
  cancelAnimationFrame(raf);
  transport.stop();
  if (run) run.stop();
  run = null;
  setPlaying(false);
  clearPlayhead();
  renderTempo();
  $("status").textContent = "Ready";
}

async function restart() {
  stop();
  await start();
}

function toggle() {
  if (transport.running) stop();
  else start();
}

// ---- changing state ----
function save() {
  try {
    localStorage.setItem(STORE, encodeShare(state));
  } catch {
    /* ignore */
  }
}

/** kind: "live" (read on the next pull), "tempo" (smooth tempo change), "restart" (new bar structure). */
function commit(kind = "live") {
  state = normalizeState(state);
  save();
  renderAll();
  if (!transport.running) return;
  if (kind === "tempo") transport.retempo();
  else if (kind === "restart") restart();
}

function setBpm(bpm) {
  state.pattern.bpm = clampBpm(bpm);
  commit("tempo");
}

function setMeter(sig) {
  const m = parseMeter(sig);
  if (!m) return;
  const p = state.pattern;
  p.beats = m.beats;
  p.den = m.den;
  p.levels = defaultLevels(m.beats, p.bars);
  p.chances = new Array(m.beats * p.bars).fill(1);
  commit("restart");
}

function setBars(n) {
  const p = state.pattern;
  const slots = p.beats * n;
  p.levels = Array.from({ length: slots }, (_, j) => p.levels[j] ?? p.levels[j % p.beats]);
  p.chances = Array.from({ length: slots }, (_, j) => p.chances[j] ?? p.chances[j % p.beats]);
  p.bars = n;
  commit("restart");
}

function setGrouping(index) {
  const p = state.pattern;
  const one = accentsFromGrouping(groupingOptions(p.beats)[index]);
  p.levels = Array.from({ length: p.beats * p.bars }, (_, j) => one[j % p.beats]);
  commit();
}

function setSlot(slot, ratio) {
  const p = state.pattern;
  if (mode === "accent") {
    const level = ratio < 0.2 ? 0 : ratio < 0.65 ? 1 : 2;
    if (p.levels[slot] === level) return;
    p.levels[slot] = level;
  } else {
    const chance = Math.round(ratio * 20) / 20;
    if (p.chances[slot] === chance) return;
    p.chances[slot] = chance;
  }
  commit();
}

function nudgeSlot(slot, dir) {
  const p = state.pattern;
  if (mode === "accent") p.levels[slot] = Math.min(2, Math.max(0, p.levels[slot] + dir));
  else p.chances[slot] = Math.min(1, Math.max(0, Math.round((p.chances[slot] + dir * 0.05) * 20) / 20));
  commit();
}

// ---- controls ----
function makeSeg(el, options, onPick) {
  const key = JSON.stringify(options);
  if (el.dataset.key !== key) {
    el.dataset.key = key;
    el.replaceChildren(
      ...options.map(([value, text]) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "seg";
        b.textContent = text;
        b.dataset.value = JSON.stringify(value);
        b.addEventListener("click", () => onPick(value));
        return b;
      }),
    );
  }
  return (current) => {
    const want = JSON.stringify(current);
    for (const b of el.children) b.setAttribute("aria-pressed", String(b.dataset.value === want));
  };
}

const fillSelect = (el, values, label = (v) => String(v)) => {
  el.replaceChildren(...values.map((v) => Object.assign(document.createElement("option"), { value: String(v), textContent: label(v) })));
};
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

fillSelect($("gap-audible"), range(1, 8));
fillSelect($("gap-silent"), range(1, 8));
fillSelect($("ladder-step"), [1, 2, 3, 4, 5, 8, 10, 15, 20, 30, 40]);
fillSelect($("ladder-every"), [1, 2, 4, 8, 16, 32]);
fillSelect($("ladder-rungs"), range(1, 32));
// What the toggles start from the first time they are switched on.
$("gap-audible").value = "2";
$("gap-silent").value = "2";
$("ladder-step").value = "5";
$("ladder-every").value = "4";
$("ladder-rungs").value = "6";

function swingWord(s) {
  if (s < 0.53) return "straight";
  if (s < 0.62) return "light";
  if (s < 0.7) return "triplet";
  return "hard";
}
const pct = (x) => `${Math.round(x * 100)}%`;
const humanWord = (h) => (h === 0 ? "exact" : pct(h));

// ---- drawing ----
const els = {
  beats: $("beats"),
  dial: $("dial"),
};

function renderTempo() {
  const bpm = state.pattern.bpm;
  $("bpm").textContent = String(bpm);
  $("tempo-word").textContent = tempoWord(bpm);
  $("bpm-slider").value = String(Math.min(240, bpm));
}

function renderBars() {
  const p = state.pattern;
  const slots = p.beats * p.bars;
  const key = `${p.beats}x${p.bars}`;
  if (els.beats.dataset.key !== key) {
    els.beats.dataset.key = key;
    els.beats.replaceChildren(
      ...Array.from({ length: slots }, (_, j) => {
        const col = document.createElement("div");
        col.className = "col" + ((j + 1) % p.beats === 0 && j < slots - 1 ? " bar-end" : "");
        const bar = document.createElement("div");
        bar.className = "bar";
        bar.dataset.slot = String(j);
        bar.tabIndex = 0;
        bar.setAttribute("role", "slider");
        bar.append(document.createElement("i"));
        const n = document.createElement("span");
        n.className = "n";
        n.textContent = String((j % p.beats) + 1);
        col.append(bar, n);
        return col;
      }),
    );
  }
  els.beats.querySelectorAll(".bar").forEach((bar) => {
    const j = Number(bar.dataset.slot);
    const level = p.levels[j];
    const chance = p.chances[j];
    const fill = mode === "accent" ? [0, 50, 100][level] : chance * 100;
    bar.firstChild.style.height = `${fill}%`;
    bar.dataset.level = mode === "accent" ? String(level) : chance === 0 ? "0" : "1";
    const barNo = Math.floor(j / p.beats) + 1;
    bar.setAttribute("aria-label", `Beat ${(j % p.beats) + 1}${p.bars > 1 ? ` of bar ${barNo}` : ""}`);
    if (mode === "accent") {
      bar.setAttribute("aria-valuemin", "0");
      bar.setAttribute("aria-valuemax", "2");
      bar.setAttribute("aria-valuenow", String(level));
      bar.setAttribute("aria-valuetext", ["silent", "normal", "accent"][level]);
    } else {
      bar.setAttribute("aria-valuemin", "0");
      bar.setAttribute("aria-valuemax", "100");
      bar.setAttribute("aria-valuenow", String(Math.round(chance * 100)));
      bar.setAttribute("aria-valuetext", pct(chance));
    }
  });
}

function renderAll() {
  const p = state.pattern;
  const r = state.practice;
  if (!transport.running) renderTempo();
  else $("bpm-slider").value = String(Math.min(240, p.bpm));

  makeSeg($("meter"), SIGNATURES.map((s) => [s, s]), setMeter)(`${p.beats}/${p.den}`);
  const groups = groupingOptions(p.beats);
  $("grouping-field").hidden = groups.length < 2;
  makeSeg($("grouping"), groups.map((g, i) => [i, groupingLabel(g)]), setGrouping)(matchGrouping(p.levels.slice(0, p.beats), p.beats));
  makeSeg($("bars"), [1, 2, 3, 4].map((n) => [n, String(n)]), setBars)(p.bars);
  makeSeg($("mode"), [["accent", "Accent"], ["chance", "Chance"]], (m) => {
    mode = m;
    renderAll();
  })(mode);
  $("mode-note").textContent =
    mode === "accent"
      ? "Touch a bar at the height you want: tall is an accent, middle is a normal click, empty is silent."
      : "Touch a bar to set how often that beat sounds. Full height always plays.";

  makeSeg($("subdiv"), [[1, "Quarters"], [2, "Eighths"], [3, "Triplets"], [4, "16ths"]], (v) => {
    p.subdivision = v;
    commit();
  })(p.subdivision);
  makeSeg($("clickon"), [["all", "All"], ["backbeat", "2 & 4"], ["downbeat", "Downbeat"], ["upbeats", "&"]], (v) => {
    p.clickOn = v;
    commit();
  })(p.clickOn);
  makeSeg($("sound"), [["tock", "Tock"], ["soft", "Soft"], ["woodblock", "Woodblock"], ["claves", "Claves"], ["log", "Log drum"], ["frame", "Frame drum"], ["brake", "Brake drum"]], (v) => {
    p.sound = v;
    if (audio.ctx) audio.preload(v);
    commit();
  })(p.sound);

  $("swing").value = String(p.swing);
  $("swing-val").textContent = swingWord(p.swing);
  $("humanize").value = String(p.humanize);
  $("humanize-val").textContent = humanWord(p.humanize);
  $("density").value = String(p.density);
  $("density-val").textContent = pct(p.density);
  $("freeze").setAttribute("aria-pressed", String(p.freeze));

  $("gap-toggle").setAttribute("aria-pressed", String(r.gap !== null));
  if (r.gap) {
    $("gap-audible").value = String(r.gap.audible);
    $("gap-silent").value = String(r.gap.silent);
  }
  $("ladder-toggle").setAttribute("aria-pressed", String(r.ladder !== null));
  if (r.ladder) {
    $("ladder-step").value = String(r.ladder.step);
    $("ladder-every").value = String(r.ladder.everyBars);
    $("ladder-rungs").value = String(r.ladder.rungs);
  }
  makeSeg($("countin"), [[0, "Off"], [1, "1 bar"], [2, "2 bars"]], (v) => {
    r.countIn = v;
    commit("restart");
  })(r.countIn);

  renderBars();
}

function setPlaying(on) {
  const b = $("start");
  b.textContent = on ? "Stop" : "Start";
  b.setAttribute("aria-pressed", String(on));
}

function clearPlayhead() {
  els.beats.querySelectorAll(".col.on").forEach((c) => c.classList.remove("on"));
  els.dial.style.setProperty("--p", "0");
}

function frame() {
  if (!transport.running) return;
  const p = state.pattern;
  const pr = state.practice;
  const beat = transport.beatAt(audio.ctx.currentTime - audio.outputLatency());
  if (beat >= 0) {
    const whole = Math.floor(beat);
    const slot = whole % (p.beats * p.bars);
    els.beats.querySelectorAll(".col").forEach((c, j) => c.classList.toggle("on", j === slot));
    els.dial.style.setProperty("--p", Math.max(0, 1 - (beat - whole) * 3).toFixed(3));
    const bpm = Math.round(transport.bpmAt(beat));
    $("bpm").textContent = String(bpm);
    $("tempo-word").textContent = tempoWord(bpm);
    const bar = Math.floor(beat / p.beats);
    const parts = [];
    if (bar < pr.countIn) parts.push(`Count-in, bar ${bar + 1} of ${pr.countIn}`);
    else parts.push(`Bar ${bar - pr.countIn + 1}`);
    if (pr.gap && bar >= pr.countIn) parts.push(barPlays(pr, bar).click ? "click on" : "click off");
    if (pr.ladder && bar >= pr.countIn) parts.push(`step ${Math.min(pr.ladder.rungs, Math.floor((bar - pr.countIn) / pr.ladder.everyBars) + 1)} of ${pr.ladder.rungs}`);
    $("status").textContent = parts.join(", ");
  }
  raf = requestAnimationFrame(frame);
}

function notice(text) {
  const el = $("notice");
  el.textContent = text;
  clearTimeout(notice.t);
  notice.t = setTimeout(() => (el.textContent = ""), 5000);
}

// ---- wiring ----
$("start").addEventListener("click", toggle);
$("tap").addEventListener("click", () => {
  const bpm = tapper.tap(performance.now() / 1000);
  if (bpm) setBpm(bpm);
});
$("bpm-down").addEventListener("click", () => setBpm(state.pattern.bpm - 1));
$("bpm-up").addEventListener("click", () => setBpm(state.pattern.bpm + 1));
$("bpm-slider").addEventListener("input", (e) => setBpm(Number(e.target.value)));

$("swing").addEventListener("input", (e) => {
  state.pattern.swing = Number(e.target.value);
  commit();
});
$("humanize").addEventListener("input", (e) => {
  state.pattern.humanize = Number(e.target.value);
  commit();
});
$("density").addEventListener("input", (e) => {
  state.pattern.density = Number(e.target.value);
  commit();
});
$("freeze").addEventListener("click", () => {
  state.pattern.freeze = !state.pattern.freeze;
  commit();
});

const gapFromControls = () => ({ audible: Number($("gap-audible").value), silent: Number($("gap-silent").value) });
$("gap-toggle").addEventListener("click", () => {
  state.practice.gap = state.practice.gap ? null : gapFromControls();
  commit("restart");
});
for (const id of ["gap-audible", "gap-silent"]) {
  $(id).addEventListener("change", () => {
    if (state.practice.gap) {
      state.practice.gap = gapFromControls();
      commit("restart");
    }
  });
}
const ladderFromControls = () => ({
  step: Number($("ladder-step").value),
  everyBars: Number($("ladder-every").value),
  rungs: Number($("ladder-rungs").value),
});
$("ladder-toggle").addEventListener("click", () => {
  state.practice.ladder = state.practice.ladder ? null : ladderFromControls();
  commit("restart");
});
for (const id of ["ladder-step", "ladder-every", "ladder-rungs"]) {
  $(id).addEventListener("change", () => {
    if (state.practice.ladder) {
      state.practice.ladder = ladderFromControls();
      commit("restart");
    }
  });
}

// Beat bars: touch, or drag across several, to set them.
let painting = false;
function paint(e) {
  const bar = document.elementFromPoint(e.clientX, e.clientY)?.closest?.(".bar");
  if (!bar) return;
  const rect = bar.getBoundingClientRect();
  const ratio = Math.min(1, Math.max(0, 1 - (e.clientY - rect.top) / rect.height));
  setSlot(Number(bar.dataset.slot), ratio);
}
els.beats.addEventListener("pointerdown", (e) => {
  if (!e.target.closest(".bar")) return;
  painting = true;
  els.beats.setPointerCapture(e.pointerId);
  paint(e);
  e.preventDefault();
});
els.beats.addEventListener("pointermove", (e) => painting && paint(e));
for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) els.beats.addEventListener(type, () => (painting = false));
els.beats.addEventListener("keydown", (e) => {
  const bar = e.target.closest?.(".bar");
  if (!bar) return;
  const slot = Number(bar.dataset.slot);
  const dir = e.key === "ArrowUp" || e.key === "ArrowRight" ? 1 : e.key === "ArrowDown" || e.key === "ArrowLeft" ? -1 : 0;
  if (!dir) return;
  e.preventDefault();
  nudgeSlot(slot, dir);
  els.beats.querySelector(`.bar[data-slot="${slot}"]`)?.focus();
});

// Share
$("share-copy").addEventListener("click", async () => {
  const url = `${location.origin}${location.pathname}#p=${encodeShare(state)}`;
  const input = $("share-url");
  input.value = url;
  try {
    await navigator.clipboard.writeText(url);
    notice("Link copied.");
  } catch {
    input.select();
    notice("Select the link and copy it.");
  }
});
$("reset").addEventListener("click", () => {
  state = defaultState();
  mode = "accent";
  commit("restart");
  notice("Back to the defaults.");
});
window.addEventListener("hashchange", () => {
  const hash = /^#p=(.+)$/.exec(location.hash);
  if (!hash) return;
  const next = decodeShare(hash[1]);
  if (next) {
    state = next;
    commit("restart");
  } else notice("That link could not be read.");
});

// Keyboard
document.addEventListener("keydown", (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.target.closest?.("input, select, textarea, button, [role=slider]")) return;
  if (e.code === "Space") {
    e.preventDefault();
    toggle();
  } else if (e.key === "t" || e.key === "T") {
    const bpm = tapper.tap(performance.now() / 1000);
    if (bpm) setBpm(bpm);
  }
});

// Stop cleanly if the page is closed or hidden for good.
window.addEventListener("pagehide", () => transport.running && stop());

renderAll();
if (linkProblem) notice("That shared link could not be read, so your last setup is shown.");
