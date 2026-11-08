// The service worker saves the files listed in offline-manifest.json. If a file is added or a sound rebuilt
// and the list is not regenerated, offline users would get stale or missing files. Run: node tools/offline-manifest.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { buildManifest } from "../tools/offline-manifest.mjs";

test("offline-manifest.json is up to date", () => {
  const saved = JSON.parse(readFileSync("offline-manifest.json", "utf8"));
  assert.deepEqual(saved, buildManifest(), "run: node tools/offline-manifest.mjs");
});

test("every saved app file exists and the manifest points at real icons", () => {
  const m = buildManifest();
  for (const f of m.shell) assert.ok(existsSync(f), f);
  const web = JSON.parse(readFileSync("manifest.webmanifest", "utf8"));
  for (const i of web.icons) assert.ok(existsSync(i.src), i.src);
  assert.equal(web.start_url, "metronome.html");
});
