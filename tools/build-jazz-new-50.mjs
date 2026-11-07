// Turns an iReal Pro playlist link into assets/js/metronome/jazznew50.js.
// Usage: node tools/build-jazz-new-50.mjs <file containing the irealb:// link>
// The charts are the playlist owner's; check the changes against your own chart.
import fs from "node:fs";
import { parseIReal } from "./ireal.mjs";

const file = process.argv[2];
if (!file) throw new Error("Give the file that holds the irealb:// link.");
const { songs } = parseIReal(fs.readFileSync(file, "utf8"));
const nice = (t) => t.replace(/^(.*), (The|A)$/, "$2 $1").replace(/\s+/g, " ").trim();
const keyName = (k) => k.replace(/-$/, "m");
const slug = (t) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const rows = songs.map((s) => {
  const title = nice(s.title);
  const meter = s.den === 4 && (s.beats === 3 || s.beats === 4) ? s.beats : 4;
  const bars = s.form.map((b) => b.join(" ")).join("|");
  return `  ["jn50-${slug(title)}", ${JSON.stringify(`${title} (${keyName(s.key)}${s.truncated ? ", first 64 bars" : ""})`)}, ${meter}, ${JSON.stringify(bars)}],`;
});
const out = `// "Jazz New 50": the changes from an iReal Pro playlist of that name, decoded once by
// tools/build-jazz-new-50.mjs. Typical changes in the key of the chart: check them against your
// own chart. Each row is [id, name, beats per bar, bars]; bars are separated by "|" and the
// one or two chords in a bar by a space.
const ROWS = [
${rows.join("\n")}
];

export const JAZZ_NEW_50 = ROWS.map(([id, name, beats, bars]) => ({
  id,
  name,
  beats,
  form: bars.split("|").map((bar) => bar.split(" ")),
}));
`;
fs.writeFileSync(new URL("../assets/js/metronome/jazznew50.js", import.meta.url), out);
console.log(`${songs.length} songs written`);
