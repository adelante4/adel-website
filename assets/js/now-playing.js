import { NOW_PLAYING_URL } from "./config.js";

const el = document.getElementById("now-playing");
const POLL_MS = 25_000;

if (el && NOW_PLAYING_URL) {
  const label = document.getElementById("np-label");
  const title = document.getElementById("np-title");
  const artist = document.getElementById("np-artist");

  const render = (d) => {
    label.textContent = d.isPlaying ? "Now playing" : "Last played";
    title.textContent = d.title;
    artist.textContent = d.artist;
    el.classList.toggle("playing", Boolean(d.isPlaying));
    if (d.url) el.href = d.url; else el.removeAttribute("href");
    el.hidden = false;
  };

  const load = async () => {
    if (document.hidden) return;
    try {
      const res = await fetch(NOW_PLAYING_URL);
      if (!res.ok) throw new Error(String(res.status));
      const d = await res.json();
      if (d.enabled === false || !d.title) el.hidden = true;
      else render(d);
    } catch {
      // keep whatever is shown; try again on the next tick
    }
  };

  load();
  setInterval(load, POLL_MS);
  document.addEventListener("visibilitychange", load);
}
