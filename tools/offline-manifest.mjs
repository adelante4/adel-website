// Writes offline-manifest.json: the list of files the service worker saves for offline use.
// Run: node tools/offline-manifest.mjs   (the tests fail if the file is out of date)
import { readdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, relative } from "node:path";

const walk = (dir, out = []) => {
  for (const f of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, f.name);
    if (f.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
};
const rel = (p) => relative(".", p).split("\\").join("/");

export function buildManifest() {
  const shell = [
    "metronome.html",
    "manifest.webmanifest",
    "assets/css/site.css",
    "assets/css/metronome.css",
    ...walk("assets/js/metronome").filter((p) => p.endsWith(".js")).map(rel).sort(),
    ...walk("assets/icons").filter((p) => p.endsWith(".png")).map(rel).sort(),
  ];
  const audio = walk("assets/audio")
    .filter((p) => /\.(wav|mp3|json)$/.test(p))
    .map((p) => ({ p: rel(p), s: statSync(p).size, h: createHash("sha1").update(readFileSync(p)).digest("hex").slice(0, 10) }))
    .sort((a, b) => (a.p < b.p ? -1 : 1));
  return { shell, audio };
}

if (process.argv[1] && process.argv[1].endsWith("offline-manifest.mjs")) {
  const m = buildManifest();
  writeFileSync("offline-manifest.json", JSON.stringify(m) + "\n");
  console.log(`offline-manifest.json: ${m.shell.length} app files, ${m.audio.length} sound files, ${(m.audio.reduce((a, x) => a + x.s, 0) / 1e6).toFixed(1)} MB`);
}
