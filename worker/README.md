# Now playing Worker

A tiny Cloudflare Worker. The site calls `GET /now-playing`; the Worker asks Spotify what I am
playing (or the last track if nothing is playing) and returns `{ isPlaying, title, artist, url }`.
Spotify keys never reach the browser or this repo.

## Set up (once)

1. **Spotify app.** https://developer.spotify.com/dashboard, create an app. Add the redirect URI
   `http://127.0.0.1:8888/callback`. Copy the client ID and client secret.
2. **Refresh token.** From this `worker/` folder:
   ```
   SPOTIFY_CLIENT_ID=... SPOTIFY_CLIENT_SECRET=... node scripts/spotify-login.mjs
   ```
   Open the printed URL, approve, and copy the refresh token it prints.
3. **Deploy.**
   ```
   npm install
   npx wrangler login
   npx wrangler secret put SPOTIFY_CLIENT_ID
   npx wrangler secret put SPOTIFY_CLIENT_SECRET
   npx wrangler secret put SPOTIFY_REFRESH_TOKEN
   npx wrangler deploy
   ```
   Type each command exactly as shown. The name (`SPOTIFY_CLIENT_ID` and so on) is part of the command;
   wrangler then asks `Enter a secret value:` and you paste the value there. Never put the value in the
   command itself. Check with `npx wrangler secret list`: it must show exactly those three names.
   Wrangler prints the Worker URL, like `https://adel-now-playing.<you>.workers.dev`.
4. **Connect the site.** Put `https://adel-now-playing.<you>.workers.dev/now-playing` in
   `assets/js/config.js` and push.

## Listening page

The Worker has a second route, `GET /listening`. It returns the current track (with progress and cover),
the last 50 plays, and top artists and tracks for three time ranges. The page `listening.html` uses it.

Top lists need the `user-top-read` permission. If you set up before this route existed, run steps 2 and 3
again: run the login script, approve, then `npx wrangler secret put SPOTIFY_REFRESH_TOKEN` with the new
token and `npx wrangler deploy`. Until you do, the page works and hides the Top music section.

## Hide it

Set `ENABLED = "false"` in `wrangler.toml` and run `npx wrangler deploy`. The widget disappears.

## Test

```
npm test
```
