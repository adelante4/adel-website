import assert from "node:assert/strict";
import worker from "../src/index.js";

const env = {
  SPOTIFY_CLIENT_ID: "id",
  SPOTIFY_CLIENT_SECRET: "secret",
  SPOTIFY_REFRESH_TOKEN: "refresh",
  ALLOWED_ORIGINS: "https://adelante4.github.io",
  ENABLED: "true",
};

const track = {
  name: "So What",
  type: "track",
  artists: [{ name: "Miles Davis" }],
  external_urls: { spotify: "https://open.spotify.com/track/abc" },
};

function mockSpotify({ current, recent }) {
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.includes("accounts.spotify.com/api/token")) {
      return new Response(JSON.stringify({ access_token: "tok", expires_in: 3600 }), { status: 200 });
    }
    if (u.includes("currently-playing")) {
      return current ? new Response(JSON.stringify(current), { status: 200 }) : new Response(null, { status: 204 });
    }
    if (u.includes("recently-played")) {
      return new Response(JSON.stringify(recent ?? { items: [] }), { status: 200 });
    }
    throw new Error("unexpected " + u);
  };
}

const get = (origin = "https://adelante4.github.io", path = "/now-playing") =>
  worker.fetch(new Request("https://w.example" + path, { headers: origin ? { Origin: origin } : {} }), env);

// 1. playing
mockSpotify({ current: { is_playing: true, item: track } });
let res = await get();
assert.equal(res.status, 200);
assert.equal(res.headers.get("Access-Control-Allow-Origin"), "https://adelante4.github.io");
assert.deepEqual(await res.json(), { isPlaying: true, title: "So What", artist: "Miles Davis", url: "https://open.spotify.com/track/abc" });

// 2. nothing playing falls back to last played
mockSpotify({ current: null, recent: { items: [{ track }] } });
res = await get();
assert.equal((await res.json()).isPlaying, false);

// 3. paused track is reported as not playing
mockSpotify({ current: { is_playing: false, item: track } });
assert.equal((await (await get()).json()).isPlaying, false);

// 4. other origins are refused
res = await get("https://evil.example");
assert.equal(res.status, 403);

// 5. unknown path
assert.equal((await get("https://adelante4.github.io", "/x")).status, 404);

// 6. disabled
res = await worker.fetch(new Request("https://w.example/now-playing"), { ...env, ENABLED: "false" });
assert.deepEqual(await res.json(), { enabled: false });

// 7. Spotify down gives 502, not a crash
globalThis.fetch = async () => new Response("no", { status: 500 });
res = await worker.fetch(new Request("https://w.example/now-playing"), { ...env, SPOTIFY_REFRESH_TOKEN: "other" });
assert.equal(res.status, 502);

console.log("worker tests passed");

// 6. /listening with top lists
{
  const item = { ...track, duration_ms: 300000, album: { images: [{ url: "big" }, { url: "mid" }] } };
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.includes("accounts.spotify.com/api/token")) return new Response(JSON.stringify({ access_token: "tok", expires_in: 3600 }), { status: 200 });
    if (u.includes("currently-playing")) return new Response(JSON.stringify({ is_playing: true, progress_ms: 1000, item }), { status: 200 });
    if (u.includes("recently-played")) return new Response(JSON.stringify({ items: [{ track: item, played_at: "2026-11-02T10:00:00Z" }] }), { status: 200 });
    if (u.includes("/me/top/artists")) return new Response(JSON.stringify({ items: [{ name: "Miles Davis", genres: ["jazz"], images: [{ url: "a" }], external_urls: { spotify: "u" } }] }), { status: 200 });
    if (u.includes("/me/top/tracks")) return new Response(JSON.stringify({ items: [item] }), { status: 200 });
    throw new Error("unexpected " + u);
  };
  const d = await (await get("https://adelante4.github.io", "/listening")).json();
  assert.equal(d.current.title, "So What");
  assert.equal(d.current.image, "mid");
  assert.equal(d.current.progressMs, 1000);
  assert.equal(d.recent[0].playedAt, "2026-11-02T10:00:00Z");
  assert.deepEqual(d.top.artists.medium_term[0].genres, ["jazz"]);
  assert.equal(d.top.tracks.long_term[0].title, "So What");
}

// 7. /listening still works when the login has no top-read permission
{
  const item = { ...track, album: { images: [] } };
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.includes("accounts.spotify.com/api/token")) return new Response(JSON.stringify({ access_token: "tok", expires_in: 3600 }), { status: 200 });
    if (u.includes("currently-playing")) return new Response(null, { status: 204 });
    if (u.includes("recently-played")) return new Response(JSON.stringify({ items: [{ track: item, played_at: "x" }] }), { status: 200 });
    if (u.includes("/me/top/")) return new Response("{}", { status: 403 });
    throw new Error("unexpected " + u);
  };
  // the previous test cached top lists, so move the clock past the cache
  const realNow = Date.now; Date.now = () => realNow() + 2 * 3_600_000;
  const d = await (await get("https://adelante4.github.io", "/listening")).json();
  Date.now = realNow;
  assert.equal(d.current, null);
  assert.equal(d.top, null);
  assert.equal(d.recent.length, 1);
}
console.log("ok");
