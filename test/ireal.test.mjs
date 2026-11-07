import test from "node:test";
import assert from "node:assert/strict";
import { unscramble, readMusic, convertChord, parseIReal } from "../assets/js/metronome/ireal.js";

const PREFIX = "1r34LbKcu7";
const scramble = unscramble; // the block swap undoes itself
const song = (title, music, key = "C") => `${title}=Nobody==Medium Swing=${key}=n=${PREFIX}${scramble(music)}=0=0`;
const link = (songs, name = "List") => "irealb://" + encodeURIComponent(songs.join("===") + "===" + name);
const bars = (music) => readMusic(music).measures;

test("unscramble: undoes itself, any length", () => {
  for (const n of [0, 1, 49, 50, 51, 52, 99, 100, 101, 170]) {
    const s = Array.from({ length: n }, (_, i) => String.fromCharCode(65 + (i % 26))).join("");
    assert.equal(unscramble(unscramble(s)), s, `length ${n}`);
  }
  assert.notEqual(unscramble("A".repeat(10) + "B".repeat(40) + "xyz"), "A".repeat(10) + "B".repeat(40) + "xyz");
});

test("convertChord: iReal qualities become this page's", () => {
  const cases = {
    "C^7": "Cmaj7", C: "Cmaj", "D-7": "Dm7", "Bb-7/Eb": "Bbm7", "F#o7": "F#dim7", Dh7: "Dm7b5", G7: "G7", G9: "G9", G13: "G13",
    G7b9: "G7alt", "G7#9": "G7alt", G7alt: "G7alt", G7sus: "Gsus4", "A-^7": "Am7", "E-6": "Em6", C6: "C6", C69: "C6", "Gb^7": "F#maj7",
    Cadd9: "Cmaj", "A-": "Am", "D-9": "Dm9", "C^7#11": "Cmaj7", "G7#11": "G7#11",
  };
  for (const [from, to] of Object.entries(cases)) assert.equal(convertChord(from), to, from);
  assert.equal(convertChord("H7"), null);
});

test("readMusic: bars, chords, time signature, comments and alternates", () => {
  const r = readMusic("T34*A[C^7 D-7|G7sus|Bh7 E7b9<Some note>|C6/E (Db7)Z");
  assert.equal(r.timeSig, "34");
  assert.deepEqual(r.measures, [["C^7", "D-7"], ["G7sus"], ["Bh7", "E7b9"], ["C6/E"]]);
});

test("readMusic: repeat with endings writes the form out", () => {
  assert.deepEqual(bars("{C^7|D-7|N1G7}N2A7|C^7Z").map((b) => b[0]), ["C^7", "D-7", "G7", "C^7", "D-7", "A7", "C^7"]);
  assert.deepEqual(bars("{C|D}E|F").map((b) => b[0]), ["C", "D", "C", "D", "E", "F"]);
});

test("readMusic: repeated bars, W, N.C. and Kcl", () => {
  assert.deepEqual(bars("C^7|D-7|x|G7").map((b) => b[0]), ["C^7", "D-7", "D-7", "G7"]);
  assert.deepEqual(bars("C7 W/E|F").map((b) => b), [["C7", "C7/E"], ["F"]]);
});

test("readMusic: D.C. al Fine plays back to the start", () => {
  assert.deepEqual(bars("C|D|E <Fine>|F|G<D.C. al Fine>Z").map((b) => b[0]), ["C", "D", "E", "F", "G", "C", "D", "E"]);
});

test("parseIReal: reads a link, decodes it, shapes the form", () => {
  const text = `<html><a href="${link([
    song("Tune One", "T44{C^7 D-7 E-7 F^7|G7|N1C^7}N2A7 D7|C^7Z", "C"),
    song("Waltz Two", "T34F^7|G-7|C7|F6Z", "F"),
  ])}">Click</a></html>`;
  const { songs, links } = parseIReal(text);
  assert.equal(links, 1);
  assert.equal(songs.length, 2);
  const [a, b] = songs;
  assert.equal(a.title, "Tune One");
  assert.equal(a.key, "C");
  assert.deepEqual([a.beats, a.den], [4, 4]);
  assert.deepEqual(a.form[0], ["Cmaj7", "Em7"]); // four chords in a bar keep beats 1 and 3
  assert.equal(a.form.length, 7);
  assert.deepEqual([b.beats, b.den, b.form.length], [3, 4, 4]);
  assert.deepEqual(b.form.map((x) => x[0]), ["Fmaj7", "Gm7", "C7", "F6"]);
});

test("parseIReal: percent-wrapped link, junk, and no link at all", () => {
  const wrapped = encodeURIComponent(link([song("Wrapped", "C^7|D-7|G7|C^7Z")]));
  assert.equal(parseIReal(wrapped).songs.length, 1);
  assert.equal(parseIReal("just some words").links, 0);
  assert.equal(parseIReal(null).songs.length, 0);
  assert.equal(parseIReal("irealb://garbage").songs.length, 0);
  const longForm = song("Long", Array.from({ length: 80 }, (_, i) => (i % 2 ? "G7" : "C^7")).join("|") + "Z");
  const s = parseIReal(link([longForm])).songs[0];
  assert.equal(s.form.length, 64);
  assert.equal(s.truncated, true);
});
