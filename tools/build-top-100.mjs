// Builds assets/js/metronome/top100.js: the JazzStandards.com top 100 (tools/top100.txt, in rank
// order), with the changes taken from an iReal Pro playlist that holds them.
// Usage: node tools/build-top-100.mjs <file containing the irealb:// link>
import fs from "node:fs";
import { parseIReal } from "./ireal.mjs";

const norm = (t) =>
  t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\([^)]*\)/g, " ").replace(/&/g, " and ")
    .replace(/[^a-z0-9 ]+/g, "").replace(/\b(the|a|an)\b/g, " ").replace(/\s+/g, " ").trim();
const flip = (t) => t.replace(/^(.*), (The|A|An)$/i, "$2 $1");
// The playlist spells a few titles differently.
const ALIASES = { "love is here to stay": "Our Love is Here to Stay", "polka dots and moonbeams": "Polkadots And Moonbeams", "do nothin till you hear from me": "Do Nothin' Til You Hear From Me" };
const SHOW = { "I Can't Get Started (with You)": "I Can't Get Started", "Lover Man (Oh, Where Can You Be?)": "Lover Man", "Autumn Leaves (Les Feuilles Mortes)": "Autumn Leaves", "Cherokee (Indian Love Song)": "Cherokee", "Indiana (Back Home Again in Indiana)": "Indiana", "(I Don't Stand A) Ghost of a Chance": "Ghost of a Chance", "I Got It Bad (and That Ain't Good)": "I Got It Bad" };
const slug = (t) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const { songs } = parseIReal(fs.readFileSync(process.argv[2], "utf8"));
const index = new Map();
for (const s of songs) {
  const k = norm(flip(s.title));
  if (!index.has(k)) index.set(k, s);
}
const top = fs.readFileSync(new URL("./top100.txt", import.meta.url), "utf8").trim().split("\n");
const rows = top.map((title, i) => {
  const k = norm(title);
  const s = index.get(k) ?? index.get(norm(ALIASES[k] ?? ""));
  if (!s) throw new Error(`Not in the playlist: ${title}`);
  const shown = SHOW[title] ?? title;
  const meter = s.den === 4 && (s.beats === 3 || s.beats === 4) ? s.beats : 4;
  const key = s.key.replace(/-$/, "m");
  const cut = s.truncated ? ", first 64 bars" : "";
  return `  [${JSON.stringify("top-" + slug(shown))}, ${JSON.stringify(`${i + 1}. ${shown} (${key}${cut})`)}, ${meter}, ${JSON.stringify(s.form.map((b) => b.join(" ")).join("|"))}],`;
});
const out = `// The JazzStandards.com top 100, in rank order, with the changes from an iReal Pro playlist
// (decoded once by tools/build-top-100.mjs). Typical changes in the key of the chart: check them
// against your own chart. Each row is [id, name, beats per bar, bars]; bars are separated by "|"
// and the one or two chords in a bar by a space.
const ROWS = [
${rows.join("\n")}
];

export const TOP_100 = ROWS.map(([id, name, beats, bars]) => ({
  id,
  name,
  beats,
  form: bars.split("|").map((bar) => bar.split(" ")),
}));
`;
fs.writeFileSync(new URL("../assets/js/metronome/top100.js", import.meta.url), out);
console.log(`${rows.length} written, ${rows.filter((r) => r.includes("first 64")).length} cut at 64 bars`);
