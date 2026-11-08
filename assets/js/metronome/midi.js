// Standard MIDI File writer (format 1) for the band: chords, bass, drums and the metronome, each on its own track.
// No Web Audio in here, so Node can test it.

const PPQ = 480;
/** General MIDI drum notes for our drum voices. */
export const GM_DRUMS = { kick: 36, snare: 38, ghost: 38, rim: 37, hat: 42, ohat: 46, foot: 44, ride: 51, brush: 38 };
/** General MIDI programs for our chord and bass sounds (0-based). */
export const GM_KEYS = {
  rhodes: 4, grand: 0, kawai: 0, fmpiano: 5, upright: 0, vibes: 11, clavisynth: 7, organ: 19, harpsichord: 6, harp: 46,
  marimba: 12, kalimba: 108, strings: 48, horn: 60, trumpet: 56, pipeorgan: 19, pad: 89, juno: 90, supersaw: 81, drone: 94, glass: 98,
};
export const GM_BASS = { doublebass: 32, fashionbass: 33, swagbass: 33, fingerbass: 33, growlybass: 34, moog: 38, sub: 38, round: 39, reese: 38, acid: 87, fmbass: 38, dub: 38 };

const vlq = (n) => {
  const b = [n & 127];
  while ((n >>= 7)) b.unshift((n & 127) | 128);
  return b;
};
const u32 = (n) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const u16 = (n) => [(n >>> 8) & 255, n & 255];
const str = (s) => [...new TextEncoder().encode(s)];
const meta = (delta, type, data) => [...vlq(delta), 0xff, type, ...vlq(data.length), ...data];
const vel = (g) => Math.max(1, Math.min(127, Math.round(g * 127)));

function track(items) {
  // items: {tick, order, bytes}. Note-offs sort before note-ons at the same tick.
  items.sort((a, b) => a.tick - b.tick || a.order - b.order);
  const body = [];
  let last = 0;
  for (const it of items) {
    body.push(...vlq(it.tick - last), ...it.bytes);
    last = it.tick;
  }
  body.push(...meta(0, 0x2f, []));
  return [...str("MTrk"), ...u32(body.length), ...body];
}

function noteTrack(name, channel, program, notes, tickOf, minTicks = 1) {
  const items = [{ tick: 0, order: 0, bytes: [0xff, 0x03, name.length, ...str(name)] }];
  items.push({ tick: 0, order: 1, bytes: [0xc0 | channel, program] });
  for (const n of notes) {
    const on = tickOf(n.beat);
    const off = Math.max(on + minTicks, tickOf(n.beat + n.dur));
    items.push({ tick: on, order: 2, bytes: [0x90 | channel, n.note, vel(n.gain)] });
    items.push({ tick: off, order: 1, bytes: [0x80 | channel, n.note, 0] });
  }
  return track(items);
}

/**
 * @param {{events: {clicks: any[], chords: any[], bass: any[], drums: any[]}, bpm: number, beats: number, den: number, name?: string,
 *          keysSound?: string, bassSound?: string, totalBeats: number}} o
 * One beat is one unit of the denominator (an eighth in 7/8); bpm counts those beats, as the metronome does.
 */
export function buildMidi(o) {
  const tpb = (PPQ * 4) / o.den;
  const tickOf = (beat) => Math.round(beat * tpb);
  const usPerQuarter = Math.round((60e6 / o.bpm) * (o.den / 4));
  const log2 = Math.round(Math.log2(o.den));
  const conductor = track([
    { tick: 0, order: 0, bytes: [0xff, 0x03, ...vlq((o.name || "Metronome").length), ...str(o.name || "Metronome")] },
    { tick: 0, order: 1, bytes: [0xff, 0x51, 3, (usPerQuarter >> 16) & 255, (usPerQuarter >> 8) & 255, usPerQuarter & 255] },
    { tick: 0, order: 1, bytes: [0xff, 0x58, 4, o.beats, log2, 24, 8] },
    { tick: tickOf(o.totalBeats), order: 9, bytes: [0xff, 0x06, 3, ...str("end")] },
  ]);
  const tracks = [conductor];
  const e = o.events;
  if (e.chords.length) {
    const notes = e.chords.flatMap((c) => c.notes.map((m) => ({ beat: c.beat, dur: Math.max(0.05, c.dur * 0.98), note: m, gain: c.gain })));
    tracks.push(noteTrack("Chords", 0, GM_KEYS[o.keysSound] ?? 0, notes, tickOf));
  }
  if (e.bass.length) {
    const notes = e.bass.map((b) => ({ beat: b.beat, dur: Math.max(0.05, b.dur * 0.95), note: b.midi, gain: b.gain }));
    tracks.push(noteTrack("Bass", 1, GM_BASS[o.bassSound] ?? 33, notes, tickOf));
  }
  if (e.drums.length) {
    const notes = e.drums.map((d) => ({ beat: d.beat, dur: 0.1, note: GM_DRUMS[d.voice] ?? 38, gain: d.voice === "ghost" ? Math.min(d.gain, 0.4) : d.gain }));
    tracks.push(noteTrack("Drums", 9, 0, notes, tickOf, 30));
  }
  if (e.clicks.length) {
    const notes = e.clicks.map((c) => ({ beat: c.beat, dur: 0.1, note: c.kind === "accent" ? 77 : c.kind === "sub" ? 69 : 76, gain: c.gain }));
    tracks.push(noteTrack("Metronome", 15, 115, notes, tickOf, 30));
  }
  const header = [...str("MThd"), ...u32(6), ...u16(1), ...u16(tracks.length), ...u16(PPQ)];
  return new Uint8Array([...header, ...tracks.flat()]);
}
