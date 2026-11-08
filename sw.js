// Service worker for the metronome: saves the app so it opens with no connection, and keeps the sounds
// (about 50 MB) once the person asks. The page registers it as sw.js?v=TAG, so a new tag installs a new worker.
const TAG = new URL(self.location.href).searchParams.get("v") || "dev";
const APP = `metro-app-${TAG}`;
const AUDIO = "metro-audio";

async function manifest() {
  try {
    const res = await fetch("offline-manifest.json", { cache: "no-cache" });
    return await res.json();
  } catch {
    const hit = await caches.match("offline-manifest.json", { ignoreSearch: true });
    return hit ? hit.json() : { shell: [], audio: [] };
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const m = await manifest();
      const cache = await caches.open(APP);
      await cache.addAll([...m.shell.map((p) => new Request(`${p}?v=${TAG}`, { cache: "reload" })), "offline-manifest.json"]);
      // keep the manifest too, so a cold offline start still knows the file list
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const k of await caches.keys()) if (k.startsWith("metro-app-") && k !== APP) await caches.delete(k);
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) {
    // fonts: use the saved copy at once, refresh it in the background
    if (/fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) event.respondWith(staleWhileRevalidate(req));
    return;
  }
  if (url.pathname.includes("/assets/audio/")) {
    event.respondWith(cacheFirst(req, AUDIO));
  } else if (req.mode === "navigate" || url.pathname.endsWith(".html") || url.pathname.endsWith("offline-manifest.json")) {
    event.respondWith(networkFirst(req));
  } else {
    event.respondWith(cacheFirst(req, APP));
  }
});

async function cacheFirst(req, name) {
  const cache = await caches.open(name);
  const hit = await cache.match(req, { ignoreSearch: true });
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone());
  return res;
}

async function networkFirst(req) {
  const cache = await caches.open(APP);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    const hit = (await cache.match(req, { ignoreSearch: true })) || (await cache.match("metronome.html", { ignoreSearch: true }));
    if (hit) return hit;
    throw new Error("offline and not saved");
  }
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(APP);
  const hit = await cache.match(req);
  const fresh = fetch(req)
    .then((res) => {
      if (res.ok || res.type === "opaque") cache.put(req, res.clone());
      return res;
    })
    .catch(() => hit);
  return hit || fresh;
}

// ---- Saving the sounds on request --------------------------------------------------------------------

const say = async (msg) => {
  for (const c of await self.clients.matchAll()) c.postMessage(msg);
};

async function audioStatus() {
  const m = await manifest();
  const cache = await caches.open(AUDIO);
  let have = 0;
  let bytes = 0;
  for (const f of m.audio) {
    const hit = await cache.match(f.p);
    if (hit && hit.headers.get("x-hash") === f.h) {
      have++;
      bytes += f.s;
    }
  }
  return { type: "status", have, total: m.audio.length, bytes, totalBytes: m.audio.reduce((a, f) => a + f.s, 0) };
}

let saving = false;
async function saveAudio() {
  if (saving) return;
  saving = true;
  try {
    const m = await manifest();
    const cache = await caches.open(AUDIO);
    let done = 0;
    const queue = [...m.audio];
    const work = async () => {
      for (let f = queue.shift(); f; f = queue.shift()) {
        const hit = await cache.match(f.p);
        if (!(hit && hit.headers.get("x-hash") === f.h)) {
          const res = await fetch(f.p, { cache: "reload" });
          if (!res.ok) throw new Error(`${f.p}: ${res.status}`);
          const headers = new Headers(res.headers);
          headers.set("x-hash", f.h);
          await cache.put(f.p, new Response(await res.blob(), { status: 200, headers }));
        }
        done++;
        if (done % 4 === 0 || done === m.audio.length) await say({ type: "progress", done, total: m.audio.length });
      }
    };
    await Promise.all([work(), work(), work(), work()]);
    await say({ ...(await audioStatus()), type: "saved" });
  } catch (err) {
    await say({ type: "error", message: String(err && err.message ? err.message : err) });
  } finally {
    saving = false;
  }
}

self.addEventListener("message", (event) => {
  const t = event.data && event.data.type;
  if (t === "status") event.waitUntil(audioStatus().then((s) => event.source && event.source.postMessage(s)));
  else if (t === "save-audio") event.waitUntil(saveAudio());
});
