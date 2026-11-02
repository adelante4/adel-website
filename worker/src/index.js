// Cloudflare Worker: returns what I am playing on Spotify, or the last track I played.
// Secrets (set with `wrangler secret put`): SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, SPOTIFY_REFRESH_TOKEN
// Vars (wrangler.toml): ALLOWED_ORIGINS (comma separated), ENABLED ("false" hides the widget)

let cached = { token: null, expires: 0 };

async function getAccessToken(env, force = false) {
  if (!force && cached.token && Date.now() < cached.expires - 30_000) return cached.token;
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: "Basic " + btoa(`${env.SPOTIFY_CLIENT_ID}:${env.SPOTIFY_CLIENT_SECRET}`),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: env.SPOTIFY_REFRESH_TOKEN }),
  });
  if (!res.ok) throw new Error(`token request failed: ${res.status}`);
  const data = await res.json();
  cached = { token: data.access_token, expires: Date.now() + data.expires_in * 1000 };
  return cached.token;
}

async function spotify(env, path) {
  const call = async (force) =>
    fetch(`https://api.spotify.com/v1${path}`, {
      headers: { Authorization: `Bearer ${await getAccessToken(env, force)}` },
    });
  let res = await call(false);
  if (res.status === 401) res = await call(true); // token expired early, refresh once
  return res;
}

function shape(item, isPlaying) {
  if (!item) return null;
  const episode = item.type === "episode";
  return {
    isPlaying,
    title: item.name,
    artist: episode ? item.show?.name ?? "" : (item.artists ?? []).map((a) => a.name).join(", "),
    url: item.external_urls?.spotify ?? null,
  };
}

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=15", ...headers },
  });
}

export default {
  async fetch(request, env) {
    const allowed = (env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
    const origin = request.headers.get("Origin");
    const cors = {};
    if (origin) {
      if (!allowed.includes(origin)) return json({ error: "forbidden" }, 403);
      cors["Access-Control-Allow-Origin"] = origin;
      cors["Vary"] = "Origin";
    }

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: { ...cors, "Access-Control-Allow-Methods": "GET", "Access-Control-Max-Age": "86400" },
      });
    }

    const { pathname } = new URL(request.url);
    if (request.method !== "GET" || pathname !== "/now-playing") return json({ error: "not found" }, 404, cors);
    if (env.ENABLED === "false") return json({ enabled: false }, 200, cors);

    try {
      let result = null;

      const current = await spotify(env, "/me/player/currently-playing?additional_types=episode");
      if (current.status === 200) {
        const data = await current.json();
        result = shape(data.item, Boolean(data.is_playing));
      } else if (current.status !== 204) {
        throw new Error(`currently-playing ${current.status}`);
      }

      if (!result) {
        const recent = await spotify(env, "/me/player/recently-played?limit=1");
        if (!recent.ok) throw new Error(`recently-played ${recent.status}`);
        const data = await recent.json();
        result = shape(data.items?.[0]?.track, false);
      }

      return json(result ?? { enabled: false }, 200, cors);
    } catch (err) {
      // The detail is only a status line like "token request failed: 400", never a secret.
      return json({ error: "unavailable", detail: String(err?.message ?? err) }, 502, { ...cors, "Cache-Control": "no-store" });
    }
  },
};
