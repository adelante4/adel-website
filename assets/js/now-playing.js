import { NOW_PLAYING_URL } from "./config.js";

const el = document.getElementById("now-playing");
const POLL_MS = 25_000;

// The track name is written around the record. The ring is a circle of radius 88 (viewBox 200).
const CIRC = 2 * Math.PI * 88;
const CHAR = 6.9; // rough width of one glyph plus spacing at 11px
const CAPACITY = Math.floor(CIRC / CHAR);

const clip = (s, n) => (s.length > n ? s.slice(0, Math.max(1, n - 1)) + "…" : s);

function ringText(label, title, artist) {
  let t = title;
  let a = artist;
  let unit = `${label} · ${t} · ${a} · `;
  if (unit.length > CAPACITY) {
    const room = CAPACITY - (label.length + 9);
    const tl = Math.max(8, Math.floor(room * 0.6));
    const al = Math.max(4, room - tl);
    t = clip(title, tl);
    a = clip(artist, al);
    unit = `${label} · ${t} · ${a} · `;
  }
  return unit.repeat(Math.max(1, Math.floor(CAPACITY / unit.length)));
}

if (el && NOW_PLAYING_URL) {
  const textPath = document.getElementById("np-textpath");
  const text = document.getElementById("np-text");

  const render = (d) => {
    const label = d.isPlaying ? "Now playing" : "Last played";
    textPath.textContent = ringText(label, d.title, d.artist);
    text.setAttribute("textLength", CIRC.toFixed(1));
    text.setAttribute("lengthAdjust", "spacing");
    el.setAttribute("aria-label", `${label}: ${d.title} by ${d.artist}. Opens Spotify.`);
    if (d.url) el.href = d.url; else el.removeAttribute("href");
    el.classList.toggle("playing", Boolean(d.isPlaying));
    el.hidden = false;
  };

  const load = async () => {
    if (document.hidden) return;
    try {
      const res = await fetch(NOW_PLAYING_URL);
      if (!res.ok) throw new Error(`Worker answered ${res.status}`);
      const d = await res.json();
      if (d.enabled === false || !d.title) {
        el.hidden = true;
      } else {
        render(d);
      }
    } catch (err) {
      // keep whatever is shown; try again on the next tick
      console.warn("now playing unavailable:", err);
    }
  };

  load();
  setInterval(load, POLL_MS);
  document.addEventListener("visibilitychange", load);
}
