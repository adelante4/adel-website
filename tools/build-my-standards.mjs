// Writes the "My standards" group (the tunes in Adel's Notion list) into standards.js from an
// iReal Pro playlist file (one rhythm-changes tune, I Got Rhythm, stands for the others), so the changes are the ones from his own charts.
// Usage: node tools/build-my-standards.mjs <file with the irealb:// link>
import fs from "node:fs";
import { parseIReal } from "./ireal.mjs";

const WANT = [
  ["my-all-of-me", /^All Of Me$/i],
  ["my-never-another-you", /^There Will Never Be Another You$/i],
  ["my-softly", /^Softly, As In A Morning Sunrise$/i],
  ["my-blue-monk", /^Blue Monk$/i],
  ["my-igr", /^I Got Rhythm$/i],
  ["my-stella", /^Stella By Starlight$/i],
  ["my-manha", /^Manha De Carnaval/i],
  ["my-wave", /^Wave$/i],
  ["my-autumn-leaves", /^Autumn Leaves$/i],
  ["my-so-what", /^So What$/i],
  ["my-tunisia", /^A Night In Tunisia$/i],
  ["my-maiden-voyage", /^Maiden Voyage$/i],
  ["my-days-of-wine", /^Days Of Wine And Roses$/i],
];
const NAMES = { "my-days-of-wine": "Days of Wine and Roses", "my-manha": "Manhã de Carnaval", "my-never-another-you": "There Will Never Be Another You", "my-tunisia": "A Night in Tunisia", "my-all-of-me": "All of Me", "my-softly": "Softly, as in a Morning Sunrise", "my-stella": "Stella by Starlight", "my-igr": "I Got Rhythm", "my-so-what": "So What", "my-autumn-leaves": "Autumn Leaves" };
const { songs } = parseIReal(fs.readFileSync(process.argv[2], "utf8"));
const rows = WANT.map(([id, re]) => {
  const s = songs.find((x) => re.test(x.title));
  if (!s) throw new Error(`Not in the playlist: ${id}`);
  const name = NAMES[id] ?? s.title;
  const key = s.key.replace(/-$/, "m");
  return `  [${JSON.stringify(id)}, ${JSON.stringify(`${name} (${key}, ${s.form.length})`)}, ${JSON.stringify(s.form.map((b) => b.join(" ")).join("|"))}],`;
});
const block = `// The tunes in Adel's Notion "My Standards" list, with the changes from his own iReal Pro charts
// (decoded once by tools/build-my-standards.mjs). Each row is [id, name, bars]; bars are
// separated by "|" and the one or two chords in a bar by a space.
const MY_ROWS = [
${rows.join("\n")}
];
export const MY_STANDARDS = MY_ROWS.map(([id, name, bars]) => ({ id, name, form: bars.split("|").map((b) => b.split(" ")) }));
`;
const path = new URL("../assets/js/metronome/standards.js", import.meta.url);
const src = fs.readFileSync(path, "utf8");
const cut = src.indexOf("// The tunes in Adel's Notion");
fs.writeFileSync(path, src.slice(0, cut) + block);
console.log(rows.map((r) => r.slice(0, 70)).join("\n"));
