// Export: the band as loop-ready WAV stems (for an Akai MPC, Ableton or any sampler), as a MIDI file, and the
// drum kit as one-shots for pads. Renders with the same audio engine as playback, into memory.
import { createAudio } from "./audio.js?v=20261108s";
import { createTransport } from "./transport.js?v=20261108s";
import { compileTimeline, timeAtBeat } from "./timeline.js?v=20261108s";
import { encodeWav, foldTail, peakOf } from "./wav.js?v=20261108s";
import { makeZip } from "./zip.js?v=20261108s";
import { buildMidi } from "./midi.js?v=20261108s";
import { DRUM_VOICES } from "./groove.js?v=20261108s";

const RATE = 44100;
const TAIL = 3; // seconds of ring-out folded back onto the start, so loops repeat seamlessly
const KIT_DIR = new URL("../../audio/kits/", import.meta.url);

const slug = (s) =>
  (s || "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

/** The setup to export: the current one, with the practice trainers off (they are for practising, not for a loop). */
function exportConfig(state) {
  const cfg = structuredClone(state);
  cfg.practice = { ...cfg.practice, countIn: 0, gap: null, trade: 0, ladder: null };
  return cfg;
}

/** Everything the band plays in `bars` bars, with times in seconds from 0. */
export function gatherEvents(state, bars) {
  const cfg = exportConfig(state);
  const p = cfg.pattern;
  const totalBeats = bars * p.beats;
  const seconds = timeAtBeat(compileTimeline(p.bpm, []), totalBeats);
  const tr = createTransport(() => cfg);
  tr.start(0, 0);
  const out = tr.pullAll(0, seconds + 0.02);
  const inLoop = (e) => e.beat < totalBeats - 1e-9;
  const events = { clicks: out.clicks.filter(inLoop), chords: out.chords.filter(inLoop), bass: out.bass.filter(inLoop), drums: out.drums.filter(inLoop) };
  return { cfg, events, seconds, totalBeats };
}

async function renderStem(cfg, events, seconds, mix) {
  const ctx = new OfflineAudioContext(2, Math.ceil((seconds + TAIL) * RATE), RATE);
  const audio = createAudio({ context: ctx });
  audio.ensure();
  const h = cfg.harmony;
  const b = cfg.bass;
  const g = cfg.groove;
  await audio.preload(cfg.pattern.sound);
  await audio.preloadBand({
    keys: h.on && mix.chords > 0 ? h.sound : undefined,
    bass: b.on && mix.bass > 0 ? b.sound : undefined,
    kit: g && g.style !== "off" && mix.groove > 0 ? g.kit : undefined,
  });
  const run = audio.createRun(mix);
  if (mix.click > 0) for (const e of events.clicks) audio.click(run, e.time, e.kind, e.gain, cfg.pattern.sound);
  if (mix.chords > 0) for (const e of events.chords) audio.chord(run, e.time, e.notes, e.seconds, e.gain, h.sound);
  if (mix.bass > 0) for (const e of events.bass) audio.bass(run, e.time, e.midi, e.seconds, e.gain, b.sound);
  if (mix.groove > 0) for (const e of events.drums) audio.drum(run, e.time, e.voice, e.gain, g.style, g.kit);
  const buf = await ctx.startRendering();
  return foldTail([buf.getChannelData(0), buf.getChannelData(1)], Math.round(seconds * RATE));
}

/**
 * @param {object} state  @param {{bars: number, parts: string[], bits: 16|24, name?: string, onStep?: (msg: string) => void}} o
 * parts: any of "full", "chords", "bass", "drums", "click"
 */
export async function renderLoops(state, o) {
  const { cfg, events, seconds } = gatherEvents(state, o.bars);
  const m = cfg.mix;
  const level = (v) => (v > 0 ? v : 0.7);
  const none = { click: 0, chords: 0, bass: 0, groove: 0, autoMute: false };
  const stems = {
    full: { ...none, click: m.click, chords: cfg.harmony.on ? m.chords : 0, bass: cfg.bass.on ? m.bass : 0, groove: cfg.groove.style !== "off" ? m.groove : 0 },
    chords: { ...none, chords: level(m.chords) },
    bass: { ...none, bass: level(m.bass) },
    drums: { ...none, groove: level(m.groove) },
    click: { ...none, click: level(m.click) },
  };
  const has = { full: true, chords: cfg.harmony.on && events.chords.length > 0, bass: cfg.bass.on && events.bass.length > 0, drums: cfg.groove.style !== "off" && events.drums.length > 0, click: events.clicks.length > 0 };
  const wanted = ["full", "chords", "bass", "drums", "click"].filter((k) => o.parts.includes(k) && has[k]);
  if (!wanted.length) throw new Error("Nothing to export: turn on chords, bass or drums, or pick the metronome.");
  // One gain for every stem, set by the full mix, so the stems still add up to it and nothing clips.
  o.onStep?.("Measuring the mix...");
  const fullPeak = peakOf(await renderStem(cfg, events, seconds, stems.full));
  const gain = Math.min(8, 0.891 / Math.max(fullPeak, 1e-4));
  const files = [];
  const base = `${slug(o.name) || "metronome"}-${cfg.pattern.bpm}bpm-${o.bars}bars`;
  for (const part of wanted) {
    o.onStep?.(`Rendering ${part === "full" ? "full mix" : part}...`);
    const ch = await renderStem(cfg, events, seconds, stems[part]);
    files.push({ name: `${base}-${part === "click" ? "metronome" : part}.wav`, data: encodeWav(ch.map((c) => c.map((x) => x * gain)), RATE, o.bits) });
  }
  const sec = seconds.toFixed(3);
  const readme = [
    `${o.name || "Metronome"}: ${cfg.pattern.bpm} BPM, ${cfg.pattern.beats}/${cfg.pattern.den}, ${o.bars} bars, ${sec} seconds.`,
    `WAV, ${o.bits}-bit, ${RATE} Hz, stereo. Every file is exactly one loop long and loops without a gap.`,
    "The stems share one level, so they add up to the full mix.",
    "",
    "Akai MPC Sample: copy the WAV files to a USB drive or SD card, then import them as samples.",
    "Set each sample to loop, or chop it to the bars. The tempo is in the file name.",
  ].join("\n");
  files.push({ name: "README.txt", data: new TextEncoder().encode(readme) });
  return { files, zip: makeZip(files), base };
}

export function renderMidi(state, o) {
  const { cfg, events, totalBeats } = gatherEvents(state, o.bars);
  const p = cfg.pattern;
  return buildMidi({
    events,
    bpm: p.bpm,
    beats: p.beats,
    den: p.den,
    totalBeats,
    name: o.name,
    keysSound: cfg.harmony.sound,
    bassSound: cfg.bass.sound,
  });
}

async function renderSynthShot(voice, gain, style) {
  const ctx = new OfflineAudioContext(2, Math.ceil(1.6 * RATE), RATE);
  const audio = createAudio({ context: ctx });
  audio.ensure();
  const run = audio.createRun({ click: 0, chords: 0, bass: 0, groove: 1, autoMute: false });
  audio.drum(run, 0.01, voice, gain, style, "synth");
  const buf = await ctx.startRendering();
  const l = buf.getChannelData(0);
  return l.slice(0, Math.ceil(1.5 * RATE));
}

/** The current drum kit as WAV one-shots, one file per velocity layer, ready to load on pads. */
export async function drumShots(state, o = {}) {
  const kit = state.groove.kit;
  const files = [];
  const lines = [];
  if (kit !== "synth") {
    const dir = new URL(`${kit}/`, KIT_DIR);
    const man = await (await fetch(new URL("manifest.json", dir))).json();
    for (const [voice, v] of Object.entries(man.voices)) {
      for (const h of v.hits) {
        const data = new Uint8Array(await (await fetch(new URL(h.file, dir))).arrayBuffer());
        const m = h.file.match(/-(\d+)\.(\w+)$/);
        files.push({ name: `${voice}-layer${h.layer + 1}of${v.layers}-${m?.[1] ?? "1"}.${m?.[2] ?? "wav"}`, data });
      }
      lines.push(`${voice}: ${v.layers} velocity layers, ${v.hits.length} files`);
    }
    lines.unshift(`${man.name} (${man.credit}). ${man.license}.`);
  } else {
    const gains = [0.35, 0.7, 1];
    const shots = [];
    for (const voice of DRUM_VOICES) for (let i = 0; i < gains.length; i++) shots.push({ voice, i, data: await renderSynthShot(voice, gains[i], state.groove.style) });
    const top = Math.max(...shots.map((s) => peakOf([s.data])));
    const g = 0.891 / Math.max(top, 1e-4);
    for (const s of shots) files.push({ name: `${s.voice}-layer${s.i + 1}of3-1.wav`, data: encodeWav([s.data.map((x) => x * g)], RATE, 16) });
    lines.push("Synth kit, rendered from the metronome's own drum synth.");
  }
  const readme = [
    ...lines,
    "",
    "Files are named voice-layerNofM-round.wav. A higher layer number is a harder hit.",
    "Suggested pads: 1 kick, 2 snare, 3 rim, 4 closed hat, 5 open hat, 6 pedal hat, 7 ride (or cowbell), 8 ghost snare.",
    "On an Akai MPC Sample: copy the files to USB or SD, import them, and put the loudest layer of each on its pad.",
  ].join("\n");
  files.push({ name: "README.txt", data: new TextEncoder().encode(readme) });
  return { files, zip: makeZip(files), kit };
}

// ---- The panel ---------------------------------------------------------------------------------------------

function save(name, data, type) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function initExport({ getState, getTuneName }) {
  const root = document.getElementById("export");
  if (!root) return;
  const $ = (id) => document.getElementById(id);
  const bars = $("ex-bars");
  const status = $("ex-status");
  const buttons = ["ex-loops", "ex-midi", "ex-shots"].map($);

  const fillBars = () => {
    const s = getState();
    const chart = s.harmony.form.length;
    const keep = bars.value;
    const opts = [];
    if (chart <= 32) opts.push([String(chart), `The whole chart (${chart} bars)`]);
    for (const n of [1, 2, 4, 8, 16, 32]) if (n !== chart) opts.push([String(n), `${n} ${n === 1 ? "bar" : "bars"}`]);
    bars.replaceChildren(...opts.map(([v, t]) => Object.assign(document.createElement("option"), { value: v, textContent: t })));
    bars.value = [...bars.options].some((o) => o.value === keep) ? keep : opts[0][0];
  };
  $("more-export").addEventListener("toggle", fillBars);
  fillBars();

  const busy = (on, msg) => {
    for (const b of buttons) b.disabled = on;
    if (msg) status.textContent = msg;
  };
  const run = (fn) => async () => {
    busy(true, "Working...");
    try {
      await fn();
    } catch (err) {
      status.textContent = err instanceof Error ? err.message : "Export failed.";
    } finally {
      busy(false);
    }
  };

  $("ex-loops").addEventListener(
    "click",
    run(async () => {
      const parts = ["full", "chords", "bass", "drums", "click"].filter((k) => $(`ex-${k}`).checked);
      const name = getTuneName();
      const r = await renderLoops(getState(), { bars: Number(bars.value), parts, bits: Number($("ex-bits").value), name, onStep: (m) => (status.textContent = m) });
      save(`${r.base}.zip`, r.zip, "application/zip");
      status.textContent = `Saved ${r.files.length - 1} loop files in ${r.base}.zip.`;
    }),
  );
  $("ex-midi").addEventListener(
    "click",
    run(async () => {
      const name = getTuneName();
      const s = getState();
      const data = renderMidi(s, { bars: Number(bars.value), name });
      save(`${slug(name) || "metronome"}-${s.pattern.bpm}bpm.mid`, data, "audio/midi");
      status.textContent = "Saved the MIDI file: chords, bass, drums and metronome on separate tracks.";
    }),
  );
  $("ex-shots").addEventListener(
    "click",
    run(async () => {
      status.textContent = "Collecting drum sounds...";
      const r = await drumShots(getState());
      save(`${r.kit}-drum-one-shots.zip`, r.zip, "application/zip");
      status.textContent = `Saved ${r.files.length - 1} drum sounds from the ${r.kit} kit.`;
    }),
  );
}
