// Writes assets/mpc/skeleton.json.gz: the project template the MPC export starts from.
// Run: node tools/build-mpc-template.mjs <path to template.skeleton.json>
//
// The input is the template skeleton of WorldLinkStudio/mpcsample (src/xpj/template.skeleton.json), a project
// saved from an MPC Sample with its pads blanked. Float numbers are replaced by marker strings, so JSON.parse
// and JSON.stringify cannot turn 1.0 into 1 (the firmware needs the point). Licence: see assets/mpc/NOTICE.md.
//
// To start from a project saved on your own device instead, pass its .xpj: node tools/build-mpc-template.mjs my.xpj
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { gzipSync, gunzipSync } from "node:zlib";
import { markNumbers } from "../assets/js/metronome/mpc.js";

const src = process.argv[2];
if (!src) {
  console.error("usage: node tools/build-mpc-template.mjs <template.skeleton.json | project.xpj>");
  process.exit(1);
}
let bytes = readFileSync(src);
if (bytes[0] === 0x1f && bytes[1] === 0x8b) bytes = gunzipSync(bytes);
let text = bytes.toString("utf8");
// A device-saved .xpj starts with five header lines before the JSON.
if (text.startsWith("ACVS")) text = text.split("\n").slice(5).join("\n");
const marked = markNumbers(text.trim());
const tree = JSON.parse(marked);
if (!tree.data || !Array.isArray(tree.data.tracks) || !Array.isArray(tree.data.sequences)) throw new Error("This does not look like an MPC project.");
mkdirSync("assets/mpc", { recursive: true });
writeFileSync("assets/mpc/skeleton.json.gz", gzipSync(Buffer.from(JSON.stringify(tree)), { level: 9 }));
console.log(`assets/mpc/skeleton.json.gz: ${tree.data.tracks.length} tracks, ${tree.data.sequences.length} sequences`);
