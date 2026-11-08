// Export: the band as loop-ready WAV stems (for an Akai MPC, Ableton or any sampler), as a MIDI file, and the
// drum kit as one-shots for pads. Renders with the same audio engine as playback, into memory.
import { createAudio } from "./audio.js?v=20261109c";
import { createTransport } from "./transport.js?v=20261109c";
import { compileTimeline, timeAtBeat } from "./timeline.js?v=20261109c";
import { encodeWav, foldTail, peakOf } from "./wav.js?v=20261109c";
import { makeZip } from "./zip.js?v=20261109c";
import { buildMidi } from "./midi.js?v=20261109c";
import { DRUM_VOICES } from "./groove.js?v=20261109c";
import { drumLevel, drumTrim } from "./instruments.js?v=20261109c";
import { trimTail, masterProject } from "./mpcdsp.js?v=20261109c";
import { projectName, decodeSkeleton, decodeXpj, buildPayload, encodeXpj, wavFrames } from "./mpc.js?v=20261109c";

const RATE = 44100;
const SKELETON_URL = new URL("../../mpc/skeleton.json.gz", import.meta.url);
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
  if (!wanted.length && !o.gainOnly) throw new Error("Nothing to export: turn on chords, bass or drums, or pick the metronome.");
  // One gain for every stem, set by the full mix, so the stems still add up to it and nothing clips.
  o.onStep?.("Measuring the mix...");
  const fullPeak = peakOf(await renderStem(cfg, events, seconds, stems.full));
  const gain = Math.min(8, 0.891 / Math.max(fullPeak, 1e-4));
  const files = [];
  const raw = {};
  const base = `${slug(o.name) || "metronome"}-${cfg.pattern.bpm}bpm-${o.bars}bars`;
  for (const part of wanted) {
    o.onStep?.(`Rendering ${part === "full" ? "full mix" : part}...`);
    const ch = await renderStem(cfg, events, seconds, stems[part]);
    if (o.keepRaw) raw[part] = ch;
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
  return { files, zip: makeZip(files), base, gain, raw, seconds };
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
    const dec = new OfflineAudioContext(2, 44100, 44100);
    for (const [voice, v] of Object.entries(man.voices)) {
      for (const h of v.hits) {
        const raw = await (await fetch(new URL(h.file, dir))).arrayBuffer();
        const buf = await dec.decodeAudioData(raw);
        const chans = Array.from({ length: buf.numberOfChannels }, (_, c) => buf.getChannelData(c));
        const n = h.file.match(/-(\d+)\.\w+$/)?.[1] ?? "1";
        files.push({ name: `${voice}-layer${h.layer + 1}of${v.layers}-${n}.wav`, data: encodeWav(chans, buf.sampleRate, 16) });
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

// ---- MPC project -------------------------------------------------------------------------------------------

const PAD_NAMES = { kick: "Kick", snare: "Snare", ghost: "Ghost snare", rim: "Rim", hat: "Closed hat", ohat: "Open hat", foot: "Pedal hat", ride: "Ride", brush: "Brush", tom1: "Tom high", tom2: "Tom mid", tom3: "Tom low", crash: "Crash" };
// Fixed pads, so every project has the same layout: drums on A1 to A13 in the order of DRUM_VOICES, loops on A15 and A16.
const CHORDS_PAD = 14;
const BASS_PAD = 15;

async function loadTemplate(own) {
  if (own) return decodeXpj(own);
  const res = await fetch(SKELETON_URL);
  if (!res.ok) throw new Error("Could not load the MPC project template.");
  return decodeSkeleton(new Uint8Array(await res.arrayBuffer()));
}

const CYMBAL = new Set(["hat", "ohat", "foot", "ride", "brush"]);

/** The page plays cymbals through a 11 kHz low-pass; the sampler does not, so do it here, where the pad gets the sound. */
async function lowpass(chans, hz) {
  const ctx = new OfflineAudioContext(chans.length, chans[0].length, RATE);
  const buf = ctx.createBuffer(chans.length, chans[0].length, RATE);
  chans.forEach((c, i) => buf.copyToChannel(c, i));
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = hz;
  lp.Q.value = 0.5;
  src.connect(lp).connect(ctx.destination);
  src.start();
  const out = await ctx.startRendering();
  return chans.map((_, i) => out.getChannelData(i).slice());
}

/**
 * One sound per drum voice for the pads: the hardest velocity layer, at the level it has in the band mix, with the
 * cymbals filtered as on the page and the dead air after each hit cut off. Float channels at RATE.
 * @returns {Promise<{voice: string, chans: Float32Array[]}[]>}
 */
async function projectShots(cfg, voices, gain) {
  const { kit, style } = cfg.groove;
  const bus = cfg.mix.groove;
  let man = null;
  let dir = null;
  let dec = null;
  if (kit !== "synth") {
    dir = new URL(`${kit}/`, KIT_DIR);
    man = await (await fetch(new URL("manifest.json", dir))).json();
    dec = new OfflineAudioContext(2, RATE, RATE); // decodes at RATE, so every sound shares one rate
  }
  const out = [];
  for (const voice of voices) {
    let chans;
    let scale;
    const v = man?.voices[voice];
    if (v) {
      const top = Math.max(...v.hits.map((h) => h.layer));
      const hit = v.hits.find((h) => h.layer === top);
      const buf = await dec.decodeAudioData(await (await fetch(new URL(hit.file, dir))).arrayBuffer());
      chans = Array.from({ length: buf.numberOfChannels }, (_, c) => buf.getChannelData(c).slice());
      if (CYMBAL.has(voice)) chans = await lowpass(chans, 11000);
      scale = drumLevel(kit, voice) * drumTrim(kit, style);
    } else {
      // The synth kit, or a voice this kit does not have (the band falls back to the synth for it too).
      chans = [await renderSynthShot(voice, 1, kit === "synth" ? style : "")];
      scale = kit === "synth" ? 1 : drumTrim(kit, style);
    }
    scale *= bus * gain;
    const peak = peakOf(chans);
    if (peak * scale > 0.98) scale = 0.98 / peak;
    out.push({ voice, chans: trimTail(chans.map((c) => c.map((x) => x * scale)), RATE) });
  }
  return out;
}

/** Pad velocity for a hit. The page plays a hit at 0.55 + 0.6 * gain of full level, so the softest is about half the loudest. */
const padVelocity = (g) => 0.48 + 0.52 * Math.min(1, Math.max(0, g));

/**
 * The band as an Akai MPC Sample project: the drum kit as one-shots on pads A1 to A13, the band's drum pattern as
 * a sequence, and the chords and the bass as loops on A15 and A16 that play from the first bar.
 * @param {object} state @param {{bars: number, name?: string, template?: {header: string[], payload: object}, onStep?: (msg: string) => void}} o
 */
export async function renderMpcProject(state, o) {
  o.onStep?.("Gathering the band...");
  const { cfg, events } = gatherEvents(state, o.bars);
  const hasChords = cfg.harmony.on && events.chords.length > 0;
  const hasBass = cfg.bass.on && events.bass.length > 0;
  const hasDrums = cfg.groove.style !== "off" && events.drums.length > 0;
  if (!hasChords && !hasBass && !hasDrums) throw new Error("Nothing to export: turn on chords, bass or drums.");
  const p = cfg.pattern;
  const name = projectName(o.name, p.bpm);
  const tpl = o.template ?? (await loadTemplate());

  const loud = o.loud !== false;
  const loops = await renderLoops(state, { bars: o.bars, parts: ["chords", "bass"], bits: 16, name: o.name, onStep: o.onStep, gainOnly: true, keepRaw: true });
  const bedPads = [];
  if (hasChords && loops.raw.chords) bedPads.push({ pad: CHORDS_PAD, label: "Chords loop", file: "Chords.wav", chans: loops.raw.chords });
  if (hasBass && loops.raw.bass) bedPads.push({ pad: BASS_PAD, label: "Bass loop", file: "Bass.wav", chans: loops.raw.bass });
  const n = bedPads[0]?.chans[0].length ?? Math.round(loops.seconds * RATE);
  const padOf = {};
  const shots = new Map();
  const names = new Map();
  if (hasDrums) {
    const voices = DRUM_VOICES.filter((v) => events.drums.some((e) => e.voice === v));
    o.onStep?.("Collecting drum sounds...");
    for (const s of await projectShots(cfg, voices, loops.gain)) {
      const pad = DRUM_VOICES.indexOf(s.voice);
      padOf[s.voice] = pad;
      shots.set(pad, s.chans);
      names.set(pad, { label: PAD_NAMES[s.voice] ?? s.voice, file: `${s.voice}.wav` });
    }
  }
  const secPerBeat = 60 / p.bpm;
  const hits = events.drums
    .filter((e) => padOf[e.voice] !== undefined)
    .map((e) => ({ beat: e.beat, pad: padOf[e.voice], gain: padVelocity(e.voice === "ghost" ? Math.min(e.gain, 0.4) : e.gain) }));

  o.onStep?.(loud ? "Setting the levels..." : "Writing the sounds...");
  const bed = bedPads.map((b) => b.chans.map((c) => c.map((x) => x * loops.gain)));
  const mastered = masterProject({ n, rate: RATE, shots, hits: hits.map((h) => ({ time: h.beat * secPerBeat, pad: h.pad, vel: h.gain })), bed, loud });
  const pads = [];
  const data = [];
  const add = (pad, label, file, chans, loop) => {
    const bytes = encodeWav(chans, RATE, 16);
    pads.push({ pad, name: label, file, frames: wavFrames(bytes), loop });
    data.push({ name: `${name}_[ProjectData]/${file}`, data: bytes });
  };
  for (const [pad, chans] of mastered.shots) add(pad, names.get(pad).label, names.get(pad).file, chans, false);
  bedPads.forEach((b, i) => add(b.pad, b.label, b.file, mastered.bed[i], true));

  o.onStep?.("Writing the project...");
  const built = buildPayload(tpl.payload, { name, bpm: p.bpm, beats: p.beats, den: p.den, bars: o.bars, pads, hits });
  const xpj = await encodeXpj(tpl.header, built.payload);
  const layout = pads.map((x) => `  A${x.pad + 1}: ${x.name}${x.loop ? " (loops)" : ""}`);
  const readme = [
    `${name}: ${p.bpm} BPM, ${p.beats}/${p.den}, ${o.bars} bars. An Akai MPC Sample project.`,
    "",
    "To open it: copy BOTH of these to the Projects folder on the MPC's microSD card, next to your saved projects:",
    `  ${name}.xpj`,
    `  ${name}_[ProjectData]  (the folder with the sounds)`,
    "Then load it on the MPC like any saved project.",
    "",
    "Pads (bank A):",
    ...layout,
    "",
    `The sequence has ${built.events} notes: the drum pattern on the drum pads, and one long note on each loop pad so the chords and the bass play from bar 1.`,
    "The loops are cut to whole bars at the project tempo and repeat with no gap.",
    loud ? `Levels: the sounds are made louder than the page plays them (about ${(mastered.stats.afterRmsDb - mastered.stats.beforeRmsDb).toFixed(0)} dB), with the peaks held at ${mastered.stats.peakDb.toFixed(1)} dBFS, so the whole project plays at a healthy volume. Drum pads follow the velocity of each hit.` : "Levels follow the band mix on the page. Adjust them on the MPC if you like.",
  ].join("\n");
  const files = [{ name: `${name}.xpj`, data: xpj }, ...data, { name: "README.txt", data: new TextEncoder().encode(readme) }];
  return { files, zip: makeZip(files), name, events: built.events, pads: pads.length, stats: mastered.stats };
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
  const buttons = ["ex-mpc", "ex-loops", "ex-midi", "ex-shots"].map($);

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

  $("ex-mpc").addEventListener(
    "click",
    run(async () => {
      const file = $("ex-mpc-template").files?.[0];
      const template = file ? await decodeXpj(new Uint8Array(await file.arrayBuffer())) : undefined;
      const r = await renderMpcProject(getState(), { bars: Number(bars.value), name: getTuneName(), template, loud: $("ex-mpc-loud").value !== "page", onStep: (m) => (status.textContent = m) });
      save(`${r.name}.zip`, r.zip, "application/zip");
      status.textContent = `Saved ${r.name}.zip: ${r.pads} sounds and a sequence with ${r.events} notes. Copy the .xpj and its _[ProjectData] folder to the MPC's card.`;
    }),
  );
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
