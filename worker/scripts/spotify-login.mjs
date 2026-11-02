// One-time helper: log in to Spotify in your browser and print a refresh token.
//
//   SPOTIFY_CLIENT_ID=... SPOTIFY_CLIENT_SECRET=... node scripts/spotify-login.mjs
//
// The redirect URI http://127.0.0.1:8888/callback must be added to your Spotify app
// in the developer dashboard. Nothing is written to disk.
import http from "node:http";

const id = process.env.SPOTIFY_CLIENT_ID;
const secret = process.env.SPOTIFY_CLIENT_SECRET;
if (!id || !secret) {
  console.error("Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET first.");
  process.exit(1);
}

const redirect = "http://127.0.0.1:8888/callback";
const scope = "user-read-currently-playing user-read-recently-played";
const state = crypto.randomUUID();

const authUrl =
  "https://accounts.spotify.com/authorize?" +
  new URLSearchParams({ client_id: id, response_type: "code", redirect_uri: redirect, scope, state });

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://127.0.0.1:8888");
  if (url.pathname !== "/callback") { res.writeHead(404).end(); return; }
  if (url.searchParams.get("state") !== state || !url.searchParams.get("code")) {
    res.writeHead(400).end("Login failed or state mismatch.");
    return;
  }
  const tokenRes = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: "Basic " + Buffer.from(`${id}:${secret}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ grant_type: "authorization_code", code: url.searchParams.get("code"), redirect_uri: redirect }),
  });
  const data = await tokenRes.json();
  if (!data.refresh_token) {
    res.writeHead(500).end("No refresh token returned. See terminal.");
    console.error(data);
  } else {
    res.writeHead(200, { "Content-Type": "text/plain" }).end("Done. You can close this tab and go back to the terminal.");
    console.log("\nRefresh token (keep it secret):\n\n" + data.refresh_token + "\n");
  }
  server.close();
});

server.listen(8888, "127.0.0.1", () => {
  console.log("Open this URL in your browser and approve access:\n\n" + authUrl + "\n");
});
