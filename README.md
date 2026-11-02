# adel-website

Personal site. Plain HTML, CSS and a little JavaScript. No build step.

## Pages

- `index.html`: home, floating sections (About me, Notes)
- `notes.html`: posts as tracks on a spinning vinyl, three per record
- `post.html?slug=...`: a single note
- `about.html`

## Now playing

The home page shows what I am playing on Spotify through a small Cloudflare Worker in `worker/`.
Setup steps are in `worker/README.md`. Until `assets/js/config.js` has the Worker URL, the chip stays hidden.

## Add a note

1. Add an entry to `assets/js/posts.js` (newest first).
2. Create `posts/<slug>.html` with the post content as an HTML fragment (no `<html>` or `<body>`).

Every three posts make a new vinyl.

## Run locally

Modules and `fetch` need a server, not `file://`:

```
python3 -m http.server 8000
```

## Deploy

GitHub Pages: Settings, Pages, deploy from branch `main`, folder `/ (root)`.
