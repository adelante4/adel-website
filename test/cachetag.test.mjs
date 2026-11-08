// Every ?v= cache tag must be the same. A stale tag makes the browser load a second copy of a module
// (old lists of sounds, kits and grooves) next to the new one, and the page quietly rejects new choices.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const files = (dir, out = []) => {
  for (const f of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, f.name);
    if (f.isDirectory()) files(p, out);
    else if (/\.(js|html|css)$/.test(f.name)) out.push(p);
  }
  return out;
};

test("all cache tags match", () => {
  const tags = new Map();
  for (const f of [...files("assets/js"), ...files("assets/css"), "metronome.html"]) {
    for (const m of readFileSync(f, "utf8").matchAll(/\?v=([0-9a-z]+)/g)) tags.set(m[1], f);
  }
  assert.equal(tags.size, 1, `different cache tags: ${[...tags].map(([t, f]) => `${t} (${f})`).join(", ")}`);
});
