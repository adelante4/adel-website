import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { encodeWav } from "../assets/js/metronome/wav.js";
import { fl, markNumbers, stringify, decodeSkeleton, decodeXpj, encodeXpj, wavFrames, projectName, sequenceTiming, buildNoteEvents, buildPayload, noteForPads, findDrumTrack } from "../assets/js/metronome/mpc.js";

const skeleton = () => decodeSkeleton(new Uint8Array(readFileSync("assets/mpc/skeleton.json.gz")));

test("floats keep their decimal point and big integers keep every digit", () => {
  const src = '{"a":1.0,"b":1,"c":9223372036854775807,"d":"x 1.0 \\" 2.50","e":-2.50,"f":1e-7,"g":[0.0,3]}';
  assert.equal(stringify(JSON.parse(markNumbers(src))), src);
  assert.equal(stringify({ x: fl(1), y: fl(0.25), z: 7 }), '{"x":1.0,"y":0.25,"z":7}');
});

test("wavFrames reads the length of a WAV", () => {
  assert.equal(wavFrames(encodeWav([new Float32Array(1234), new Float32Array(1234)], 44100, 16)), 1234);
  assert.equal(wavFrames(encodeWav([new Float32Array(10)], 44100, 24)), 10);
  assert.equal(wavFrames(new Uint8Array(50)), 0);
});

test("project names are safe for a card and carry the tempo", () => {
  assert.equal(projectName("Autumn Leaves", 120), "Autumn Leaves 120");
  assert.equal(projectName("Café: Bb/F #1", 90), "Cafe Bb F 1 90");
  assert.equal(projectName("", 70), "Metronome 70");
});

test("sequence timing: a beat is a unit of the denominator, the tempo counts quarters", () => {
  assert.deepEqual(sequenceTiming({ bpm: 120, beats: 4, den: 4, bars: 2 }), { beatPulses: 960, barPulses: 3840, seqPulses: 7680, quarterBpm: 120 });
  const t = sequenceTiming({ bpm: 140, beats: 7, den: 8, bars: 4 });
  assert.equal(t.beatPulses, 480);
  assert.equal(t.quarterBpm, 70);
  assert.equal(t.seqPulses, 4 * 7 * 480);
});

test("note events: loops first at 0 for the whole length, hits on the grid, sorted, inside the sequence", () => {
  const noteOf = Array.from({ length: 128 }, (_, i) => 36 + i);
  const ev = buildNoteEvents({ hits: [{ beat: 3.999999, pad: 1, gain: 0.5 }, { beat: 1, pad: 2, gain: 1 }, { beat: 0, pad: 1, gain: 0.3 }], loopPads: [9], noteOf, seqPulses: 3840, beatPulses: 960 });
  assert.deepEqual(ev.map((e) => [e.time, e.note.note]), [[0, 37], [0, 45], [960, 38], [3839, 37]]);
  assert.equal(ev.find((e) => e.note.note === 45).note.length, 3840);
  assert.equal(ev[0].note.velocity, "@raw:0.3");
  assert.equal(ev[0].type, 3);
});

test("full build from the bundled template", async () => {
  const { header, payload } = await skeleton();
  const before = Object.keys(payload.data).sort();
  const pads = [
    { pad: 0, name: "Kick", file: "kick.wav", frames: 20000 },
    { pad: 1, name: "Snare", file: "snare.wav", frames: 15000 },
    { pad: 8, name: "Chords", file: "Chords.wav", frames: 352800, loop: true },
    { pad: 9, name: "Bass", file: "Bass.wav", frames: 352800, loop: true },
  ];
  const hits = [{ beat: 0, pad: 0, gain: 1 }, { beat: 1, pad: 1, gain: 0.8 }, { beat: 2.5, pad: 1, gain: 0.25 }];
  const r = buildPayload(payload, { name: "Test 120", bpm: 120, beats: 4, den: 4, bars: 2, pads, hits });
  assert.equal(r.events, 5);
  assert.deepEqual(Object.keys(r.payload.data).sort(), before, "no top-level fields added or lost");
  const d = r.payload.data;
  const noteOf = noteForPads(d);
  const insts = d.tracks[findDrumTrack(d)].program.drum.instruments;
  assert.equal(insts.length, 128);
  assert.equal(insts.filter((i) => i.layersv[0].sampleFile).length, 4, "only the four pads we filled");
  assert.equal(insts[0].layersv[0].sampleFile, "kick.wav");
  assert.equal(insts[0].layersv[0].sliceInfo.End, 19999);
  assert.equal(insts[0].triggerMode, 0);
  assert.equal(insts[8].triggerMode, 3, "a loop pad is in loop mode");
  assert.equal(insts[8].layersv[0].loopMode, 1);
  assert.equal(insts[8].layersv[0].loopEnd, 352799);
  assert.equal(insts[2].layersv[0].sampleFile, "");
  assert.equal(d.samples.length, 4);
  assert.equal(d.tracks[findDrumTrack(d)].samples.length, 4);
  assert.equal(d.tracks[findDrumTrack(d)].name, "Test 120");
  assert.equal(d.sequences.length, 1);
  const seq = d.sequences[0].value;
  assert.equal(d.sequences[0].key, 0);
  assert.equal(seq.lengthBars, 2);
  assert.equal(seq.lengthPulses, 7680);
  assert.deepEqual(seq.timeSignatureTrack.timeSignatures, [{ beatsPerBar: 4, beatLength: 960, barStart: 0 }]);
  const clips = seq.trackClipMaps[0];
  const drumClip = clips.find((c) => c.key === "Test 120").value;
  assert.deepEqual(drumClip.eventList.events.map((e) => e.note.note), [noteOf[0], noteOf[8], noteOf[9], noteOf[1], noteOf[1]]);
  for (const c of clips) if (c.key !== "Test 120") assert.equal(c.value.eventList.events.length, 0);
  assert.equal(d.currentSequence, 0);
  const text = stringify(r.payload);
  assert.ok(!text.includes("@raw:"), "every marker was turned back into a number");
  assert.ok(text.includes('"length":9223372036854775807'));
  // The numbers we write ourselves keep their point (the template's own fields are copied as they were).
  const written = stringify(drumClip.eventList.events) + stringify({ bpm: seq.bpm, masterTempo: d.masterTempo, samples: d.samples.map((s) => s.metadata) });
  for (const m of written.matchAll(/"(?:velocity|modifierValue\d+|bpm|masterTempo|tempo|tune)":([^,}]+)/g)) assert.match(m[1], /\./, `float written without a point: ${m[0]}`);
  assert.match(written, /"bpm":120\.0/);
  const bytes = await encodeXpj(header, r.payload);
  assert.equal(bytes[0], 0x1f);
  const back = await decodeXpj(bytes);
  assert.deepEqual(back.header, header);
  assert.equal(stringify(back.payload), text, "writes and reads back to the same project");
});

test("rejects what the MPC cannot hold", async () => {
  const { payload } = await skeleton();
  const many = Array.from({ length: 129 }, (_, i) => ({ pad: i % 128, name: `s${i}`, file: `s${i}.wav`, frames: 10 }));
  assert.throws(() => buildPayload(payload, { name: "x", bpm: 100, beats: 4, den: 4, bars: 1, pads: many, hits: [] }), /128/);
  assert.throws(() => buildPayload({ data: { tracks: [] } }, { name: "x", bpm: 100, beats: 4, den: 4, bars: 1, pads: [], hits: [] }), /drum program/);
  assert.throws(() => sequenceTiming({ bpm: 100, beats: 4, den: 7, bars: 1 }), /pulse grid/);
});

test("a file that is not an MPC project is refused", async () => {
  await assert.rejects(decodeXpj(new TextEncoder().encode("hello\nworld\n")), /MPC/);
});
