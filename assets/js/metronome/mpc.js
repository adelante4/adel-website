// Akai MPC Sample project writer: builds an .xpj (gzip of a 5-line header and JSON) from the band.
// No Web Audio in here, so Node can test it.
//
// The format is closed, so the project is built the way other open tools do it: start from a project saved
// by the device (the template), blank the 128 pads, then fill in the pads, the sample list and one sequence.
// Everything the template holds that we do not know about is kept as it is.
//
// One catch: the firmware reads some numbers as floats and wants "1.0", never "1". JSON.parse and
// JSON.stringify lose that. So float numbers (and integers too big for a JS number) are carried as marker
// strings like "@raw:1.0" while we work, and turned back into plain numbers when the file is written.

export const PPQ = 960; // pulses per quarter note in an MPC sequence
export const DEFAULT_HEADER = ["ACVS", "1.3.0.12", "SerialisableProjectData", "json", "Linux"];
const RAW = "@raw:";
const INT64 = `${RAW}9223372036854775807`;

/** A number that must be written with a decimal point. */
export const fl = (x) => RAW + (Number.isInteger(x) ? x.toFixed(1) : String(x));

/** Turn the number lexemes JS cannot round-trip (a point or exponent, or more than 15 digits) into markers. */
export function markNumbers(text) {
  const num = /-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/y;
  const n = text.length;
  let out = "";
  let from = 0;
  let i = 0;
  while (i < n) {
    const c = text.charCodeAt(i);
    if (c === 34) {
      i++;
      while (i < n) {
        const d = text.charCodeAt(i);
        if (d === 92) i += 2;
        else if (d === 34) {
          i++;
          break;
        } else i++;
      }
    } else if (c === 45 || (c >= 48 && c <= 57)) {
      num.lastIndex = i;
      const m = num.exec(text);
      if (!m) {
        i++;
        continue;
      }
      const lex = m[0];
      if (/[.eE]/.test(lex) || lex.replace("-", "").length > 15) {
        out += `${text.slice(from, i)}"${RAW}${lex}"`;
        from = i + lex.length;
      }
      i += lex.length;
    } else i++;
  }
  return out + text.slice(from);
}

export const unmark = (s) => s.replace(/"@raw:([^"]*)"/g, "$1");
export const stringify = (o) => unmark(JSON.stringify(o));

async function pipe(bytes, stream) {
  const w = stream.writable.getWriter();
  w.write(bytes);
  w.close();
  return new Uint8Array(await new Response(stream.readable).arrayBuffer());
}
export const gzip = (bytes) => pipe(bytes, new CompressionStream("gzip"));
export const gunzip = (bytes) => pipe(bytes, new DecompressionStream("gzip"));

const isGzip = (b) => b.length > 2 && b[0] === 0x1f && b[1] === 0x8b;

/** Read an .xpj saved by the device (or a plain-text one): the five header lines and the project JSON. */
export async function decodeXpj(bytes) {
  const raw = isGzip(bytes) ? await gunzip(bytes) : bytes;
  const text = new TextDecoder().decode(raw);
  const header = [];
  let pos = 0;
  for (let k = 0; k < 5; k++) {
    const j = text.indexOf("\n", pos);
    if (j < 0) throw new Error("That is not an MPC project file (.xpj).");
    header.push(text.slice(pos, j).replace(/\r$/, ""));
    pos = j + 1;
  }
  if (header[0] !== "ACVS" || header[2] !== "SerialisableProjectData" || header[3] !== "json") throw new Error("That is not an MPC Sample project file (.xpj).");
  return { header, payload: JSON.parse(markNumbers(text.slice(pos))) };
}

/** The bundled template: the JSON already carries its markers, gzipped. */
export async function decodeSkeleton(bytes) {
  return { header: DEFAULT_HEADER, payload: JSON.parse(new TextDecoder().decode(await gunzip(bytes))) };
}

export async function encodeXpj(header, payload) {
  return gzip(new TextEncoder().encode(`${header.join("\n")}\n${stringify(payload)}`));
}

/** Frames in a WAV file (any chunk order). 0 if it is not a WAV. */
export function wavFrames(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (o) => String.fromCharCode(bytes[o], bytes[o + 1], bytes[o + 2], bytes[o + 3]);
  if (bytes.length < 20 || tag(0) !== "RIFF" || tag(8) !== "WAVE") return 0;
  let align = 0;
  let size = 0;
  for (let o = 12; o + 8 <= bytes.length; ) {
    const len = dv.getUint32(o + 4, true);
    if (tag(o) === "fmt ") align = dv.getUint16(o + 8 + 12, true);
    else if (tag(o) === "data") size = Math.min(len, bytes.length - o - 8);
    o += 8 + len + (len & 1);
  }
  return align > 0 ? Math.floor(size / align) : 0;
}

/** The project name: what the MPC shows, and the stem of the file and folder names. Safe on a FAT card. */
export function projectName(tune, bpm) {
  const base =
    (tune || "Metronome")
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^A-Za-z0-9 _-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 28) || "Metronome";
  return `${base} ${bpm}`;
}

// ---- reading the template -----------------------------------------------------------------------------------

export function findDrumTrack(data) {
  const tracks = data.tracks;
  if (Array.isArray(tracks))
    for (let i = 0; i < tracks.length; i++) {
      const p = tracks[i]?.program;
      if (p?.type === 0 && Array.isArray(p.drum?.instruments) && p.drum.instruments.length) return i;
    }
  throw new Error("The template has no drum program.");
}

/** MIDI note that plays each pad (0-127), read from the template's pad map. */
export function noteForPads(data) {
  const m = data.tracks[findDrumTrack(data)].program.padNoteMap?.noteForPad;
  if (!m) throw new Error("The template has no pad map.");
  return Array.from({ length: 128 }, (_, i) => {
    const v = Number(m[`value${i}`]);
    if (!Number.isFinite(v)) throw new Error(`The template's pad map has no pad ${i + 1}.`);
    return v;
  });
}

// ---- the sequence --------------------------------------------------------------------------------------------

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

function noteEvent(time, note, velocity, length) {
  const n = { version: 1, note, velocity: fl(Math.round(clamp(velocity, 0.02, 1) * 1e4) / 1e4), length, probability: 100, ratchet: 1, articulation: 197 };
  for (let k = 0; k < 16; k++) {
    n[`modifierValue${k}`] = fl(k === 0 || k === 1 || k === 5 ? 0.5 : k === 6 ? 1 : 0);
    n[`modifierActiveState${k}`] = false;
  }
  n["EnumCerealisationWrapper(selectedModifierType)"] = "Tuning (coarse)";
  return { version: 2, time, type: 3, channel: 0, selected: false, muted: false, invented: false, note: n };
}

/**
 * Sequence timing. One metronome beat is one unit of the denominator, so a beat is 4*PPQ/den pulses, and the
 * MPC tempo counts quarter notes (as the MIDI export does).
 */
export function sequenceTiming({ bpm, beats, den, bars }) {
  const beatPulses = (PPQ * 4) / den;
  if (!Number.isInteger(beatPulses)) throw new Error(`A /${den} meter does not fit the MPC's pulse grid.`);
  return { beatPulses, barPulses: beats * beatPulses, seqPulses: bars * beats * beatPulses, quarterBpm: Math.round(((bpm * 4) / den) * 1e3) / 1e3 };
}

/**
 * @param {{beat: number, pad: number, gain: number}[]} hits  one-shot hits, beat counted in metronome beats
 * @param {number[]} loopPads  pads that play a loop: one note at the start, as long as the sequence
 * @param {number[]} noteOf  MIDI note for every pad
 */
export function buildNoteEvents({ hits, loopPads, noteOf, seqPulses, beatPulses }) {
  const events = [];
  for (const p of loopPads) events.push(noteEvent(0, noteOf[p], 1, seqPulses));
  const len = Math.max(1, Math.round(beatPulses / 4));
  for (const h of hits) events.push(noteEvent(Math.min(seqPulses - 1, Math.max(0, Math.round(h.beat * beatPulses))), noteOf[h.pad], h.gain, len));
  return events.sort((a, b) => a.time - b.time || a.note.note - b.note.note);
}

// ---- the project ----------------------------------------------------------------------------------------------

function blankInstrument(insts) {
  const found = insts.find((i) => Array.isArray(i.layersv) && i.layersv[0] && !i.layersv[0].sampleFile) ?? insts[0];
  const b = structuredClone(found);
  b.coarseTune = 0;
  b.fineTune = 0;
  b.triggerMode = 0;
  for (const l of b.layersv) {
    l.active = false;
    l.sampleName = "";
    l.sampleFile = "";
    l.sampleStart = 0;
    l.sampleEnd = 0;
    if (l.sliceInfo) Object.assign(l.sliceInfo, { Start: 0, End: 0, LoopStart: 0 });
  }
  return b;
}

function assignPad(inst, p) {
  const loop = Boolean(p.loop);
  const end = Math.max(0, p.frames - 1);
  inst.coarseTune = 0;
  inst.fineTune = 0;
  // A loop plays as a loop right after loading only with triggerMode 3 (checked on the device by others).
  inst.triggerMode = loop ? 3 : 0;
  const l = inst.layersv[0];
  Object.assign(l, {
    active: true,
    sampleName: p.name,
    sampleFile: p.file,
    sampleStart: 0,
    sampleEnd: 0, // the length lives in sliceInfo.End, as in projects the device saves
    sliceIndex: 129,
    loop: false,
    loopMode: loop ? 1 : 0,
    layerLoopModeOverridesSliceLoopMode: loop,
    coarseTune: 0,
    fineTune: 0,
    pitch: fl(0),
    loopStart: 0,
    loopEnd: loop ? end : 0,
  });
  const s = (l.sliceInfo ??= {});
  Object.assign(s, { Start: 0, End: end, LoopStart: 0, LoopMode: loop ? 1 : 0, LoopCrossfadeLength: loop ? -1 : 0 });
  s.PulsePosition ??= 0;
  s.LoopCrossfadeType ??= 0;
  s.TailLength ??= fl(0);
  s.TailLoopPosition ??= fl(0.5);
}

/**
 * @param {{data: object}} template  parsed template (markers in place)
 * @param {{name: string, bpm: number, beats: number, den: number, bars: number,
 *          pads: {pad: number, name: string, file: string, frames: number, loop?: boolean}[],
 *          hits: {beat: number, pad: number, gain: number}[]}} o
 */
export function buildPayload(template, o) {
  const payload = structuredClone(template);
  const data = payload.data;
  const ti = findDrumTrack(data);
  const track = data.tracks[ti];
  const program = track.program;
  const insts = program.drum.instruments;
  if (insts.length < 128) throw new Error("The template has fewer than 128 pads.");
  if (o.pads.length > 128) throw new Error("The MPC Sample holds at most 128 samples in a project.");
  const noteOf = noteForPads(data);
  const t = sequenceTiming(o);

  const blank = blankInstrument(insts);
  for (let k = 0; k < 128; k++) insts[k] = structuredClone(blank);
  for (const p of o.pads) assignPad(insts[p.pad], p);

  const key = typeof data.key === "string" && data.key ? data.key : "C Major";
  const entries = o.pads.map((p) => ({ version: 1, name: p.name, path: p.file, loadImpl: 1, metadata: { tempo: fl(t.quarterBpm), rootNote: 60, tune: fl(0), key } }));
  data.samples = entries;
  track.samples = entries;

  const oldName = track.name;
  track.name = o.name;
  program.name = o.name;
  const transport = data.clipPlayerData?.trackClipTransportMap;
  if (Array.isArray(transport)) for (const e of transport) if (e.key === oldName) e.key = o.name;

  // Keep the drum track and the routing tracks (submixes, outputs); drop any other instrument track.
  const kept = data.tracks.filter((tr, i) => i === ti || ![0, 1, 2, 3, 4, 5, 6].includes(tr.program?.type));
  for (const tr of kept) {
    if ("arrangementClipMap" in tr) tr.arrangementClipMap = [];
    if ("sharedClipMap" in tr) tr.sharedClipMap = [];
  }
  data.tracks = kept;
  const drumIndex = kept.indexOf(track);

  const proto = data.sequences?.[0]?.value;
  const row = proto?.trackClipMaps?.[0];
  if (!proto || !Array.isArray(row) || !row.length) throw new Error("The template has no sequence to copy.");
  const clipProto = row[0].value;
  const listProto = clipProto.eventList ?? proto.seqEventList ?? {};
  const eventList = (events) => ({
    ...structuredClone(listProto),
    length: INT64,
    events,
    version: 2,
    quantisation: listProto.quantisation ?? { version: 1, pulses: 0, swing: fl(0), strength: fl(1) },
    numFilterTypes: 30,
  });
  const events = buildNoteEvents({ hits: o.hits, loopPads: o.pads.filter((p) => p.loop).map((p) => p.pad), noteOf, seqPulses: t.seqPulses, beatPulses: t.beatPulses });
  const byName = new Map(
    kept.map((tr, i) => [
      tr.name,
      {
        ...structuredClone(clipProto),
        version: 2,
        launchQuantisation: 1,
        startPulses: 0,
        endPulses: t.seqPulses,
        loopStartPulses: 0,
        loopEndPulses: t.seqPulses,
        loop: true,
        legato: true,
        launch: 0,
        name: tr.name,
        colour: 0,
        eventList: eventList(i === drumIndex ? events : []),
        perClipParameterValues: clipProto.perClipParameterValues ?? { perClipParameterValues: [] },
      },
    ]),
  );
  const order = row.map((c) => (c.key === oldName ? o.name : c.key)).filter((k) => byName.has(k));
  for (const k of byName.keys()) if (!order.includes(k)) order.push(k);

  const seq = structuredClone(proto);
  Object.assign(seq, {
    name: o.name,
    bpm: fl(t.quarterBpm),
    lengthBars: o.bars,
    loopStartBar: 0,
    loopEndBar: o.bars,
    loop: true,
    tempoEnable: true,
    transposition: 0,
    lengthPulses: t.seqPulses,
    loopStartPulses: 0,
    loopEndPulses: t.seqPulses,
    autoSelectTrackIndex: -1,
    timeSignatureTrack: { timeSignatures: [{ beatsPerBar: o.beats, beatLength: t.beatPulses, barStart: 0 }] },
    trackClipMaps: [order.map((k) => ({ key: k, value: byName.get(k) }))],
    seqEventList: eventList([]),
  });
  data.sequences = [{ key: 0, value: seq }];
  data.currentSequence = 0;
  data.currentTrackIndex = drumIndex;
  data.masterTempo = fl(t.quarterBpm);
  data.masterTempoEnabled = false;
  data.sharedClipMatrixData = [];
  if (Array.isArray(data.songs)) for (const s of data.songs) if (s && Array.isArray(s.items)) s.items = [];
  if (data.info && typeof data.info === "object") data.info.title = o.name;
  return { payload, events: events.length, ...t };
}
