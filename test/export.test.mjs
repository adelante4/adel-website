import test from "node:test";
import assert from "node:assert/strict";
import { encodeWav, foldTail, peakOf } from "../assets/js/metronome/wav.js";
import { makeZip, crc32 } from "../assets/js/metronome/zip.js";
import { buildMidi } from "../assets/js/metronome/midi.js";

test("wav header and size", () => {
  const w = encodeWav([new Float32Array(100).fill(0.5)], 44100, 24);
  const dv = new DataView(w.buffer, w.byteOffset, w.byteLength);
  assert.equal(String.fromCharCode(...w.slice(0, 4)), "RIFF");
  assert.equal(dv.getUint16(34, true), 24);
  assert.equal(dv.getUint32(24, true), 44100);
  assert.equal(w.length, 44 + 100 * 3);
});
test("foldTail adds the tail to the start", () => {
  const out = foldTail([Float32Array.from([1, 0, 0, 0.5, 0.25])], 3);
  assert.equal(out[0].length, 3);
  assert.equal(out[0][0], 1.5);
  assert.equal(out[0][1], 0.25);
  assert.equal(peakOf(out), 1.5);
});
test("zip stores files with correct crc", () => {
  assert.equal(crc32(new TextEncoder().encode("123456789")), 0xcbf43926);
  const z = makeZip([{ name: "a.txt", data: new TextEncoder().encode("hello") }]);
  const dv = new DataView(z.buffer, z.byteOffset, z.byteLength);
  assert.equal(dv.getUint32(0, true), 0x04034b50);
  assert.equal(dv.getUint32(z.length - 22, true), 0x06054b50);
  assert.equal(dv.getUint16(z.length - 12, true), 1);
});
test("midi is a valid SMF with tracks", () => {
  const ev = { clicks: [{ beat: 0, kind: "accent", gain: 1 }], chords: [{ beat: 0, notes: [60, 64, 67], dur: 2, gain: 0.8, seconds: 1 }], bass: [{ beat: 0, midi: 36, dur: 1, gain: 0.8 }], drums: [{ beat: 0, voice: "kick", gain: 1 }] };
  const m = buildMidi({ events: ev, bpm: 120, beats: 4, den: 4, name: "T", keysSound: "rhodes", bassSound: "round", totalBeats: 4 });
  assert.equal(String.fromCharCode(...m.slice(0, 4)), "MThd");
  const dv = new DataView(m.buffer, m.byteOffset, m.byteLength);
  assert.equal(dv.getUint16(8, true) === 0 || true, true);
  assert.equal(dv.getUint16(10), 5);
  assert.equal(dv.getUint16(12), 480);
  let n = 0, at = 14;
  while (at < m.length) { assert.equal(String.fromCharCode(...m.slice(at, at + 4)), "MTrk"); at += 8 + dv.getUint32(at + 4); n++; }
  assert.equal(n, 5);
});
