import { LISTENING_URL } from "./config.js";

const $ = (id) => document.getElementById(id);
const TZ = "Europe/Berlin";
const POLL_MS = 30_000;

const spotifyUrl = (u) => (typeof u === "string" && u.startsWith("https://open.spotify.com/") ? u : null);
const imageUrl = (u) => (typeof u === "string" && u.startsWith("https://") ? u : null);
const mmss = (ms) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};

// Arm geometry, in the 300 x 240 drawing: pivot, arm length, record centre, groove radii.
const PIVOT = { x: 270, y: 40 }, LEN = 160, CENTER = { x: 110, y: 120 };
const R_OUT = 92, R_IN = 42;
const D = Math.hypot(PIVOT.x - CENTER.x, PIVOT.y - CENTER.y);
const PHI = Math.atan2(CENTER.y - PIVOT.y, CENTER.x - PIVOT.x);
const armDeg = (progress) => {
  if (progress == null) return ((PHI + (45 * Math.PI) / 180) * 180) / Math.PI; // parked off the record
  const r = R_OUT - (R_OUT - R_IN) * Math.min(1, Math.max(0, progress));
  const theta = Math.acos((D * D + LEN * LEN - r * r) / (2 * D * LEN));
  return ((PHI - theta) * 180) / Math.PI;
};
const setArm = (progress) => {
  $("arm").style.transform = `translate(${PIVOT.x}px, ${PIVOT.y}px) rotate(${armDeg(progress).toFixed(2)}deg)`;
};

let state = { data: null, fetchedAt: 0, range: "medium_term", showAll: false };

function renderNow() {
  const { data, fetchedAt } = state;
  const cur = data.current ?? (data.recent[0] ? { ...data.recent[0], isPlaying: false } : null);
  $("now").hidden = !cur;
  if (!cur) return;
  const playing = Boolean(data.current?.isPlaying);
  $("now-h").textContent = playing ? "Now playing" : data.current ? "Paused" : "Last played";
  $("song").textContent = cur.title;
  $("who").textContent = cur.artist;
  const img = imageUrl(cur.image);
  if (img) $("cover").src = img; else $("cover").removeAttribute("src");
  const link = spotifyUrl(cur.url);
  if (link) $("open").href = link; else $("open").removeAttribute("href");
  $("rec").classList.toggle("spin", playing);

  const hasProgress = data.current && data.current.durationMs > 0;
  $("barwrap").hidden = $("times").hidden = !hasProgress;
  state.tick = () => {
    if (!hasProgress) return setArm(null);
    const elapsed = playing ? Date.now() - fetchedAt : 0;
    const pos = Math.min(data.current.durationMs, data.current.progressMs + elapsed);
    const p = pos / data.current.durationMs;
    $("bar").style.width = `${(p * 100).toFixed(1)}%`;
    $("t0").textContent = mmss(pos);
    $("t1").textContent = mmss(data.current.durationMs);
    setArm(playing ? p : null);
  };
  state.tick();
}

const dayKey = (d) => d.toLocaleDateString("en-CA", { timeZone: TZ });
function playedLabel(iso) {
  const d = new Date(iso);
  const time = d.toLocaleTimeString("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
  if (dayKey(d) === dayKey(new Date())) return `Today ${time}`;
  const day = d.toLocaleDateString("en-GB", { timeZone: TZ, weekday: "short", day: "numeric", month: "short" });
  return `${day} ${time}`;
}

function thumb(url, cls) {
  const u = imageUrl(url);
  if (!u) return el("span", "ph " + (cls || ""));
  const i = el("img");
  i.src = u; i.alt = ""; i.width = 40; i.height = 40; i.loading = "lazy";
  return i;
}
function titleBlock(title, sub, url) {
  const t = el("div", "t");
  const link = spotifyUrl(url);
  if (link) {
    const a = el("a", null, title);
    a.href = link; a.target = "_blank"; a.rel = "noopener";
    t.append(a);
  } else t.append(el("strong", null, title));
  if (sub) t.append(el("span", null, sub));
  return t;
}

function renderRecent() {
  const list = $("recent-list");
  const items = state.data.recent;
  $("recent").hidden = items.length === 0;
  list.replaceChildren();
  const shown = state.showAll ? items : items.slice(0, 10);
  for (const t of shown) {
    const li = el("li", "row");
    const time = el("time", null, playedLabel(t.playedAt));
    time.dateTime = t.playedAt;
    li.append(thumb(t.image), titleBlock(t.title, t.artist, t.url), time);
    list.append(li);
  }
  const more = $("more");
  more.hidden = items.length <= 10;
  more.textContent = state.showAll ? "Show fewer" : `Show all ${items.length}`;
}

function renderTop() {
  const top = state.data.top;
  $("top").hidden = !top;
  if (!top) return;
  const r = state.range;
  document.querySelectorAll("[data-range]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.range === r)));

  const artists = $("top-artists"), tracks = $("top-tracks"), genres = $("top-genres");
  artists.replaceChildren(); tracks.replaceChildren(); genres.replaceChildren();
  (top.artists[r] ?? []).forEach((a, i) => {
    const li = el("li", "row artist");
    li.append(el("span", "rank", String(i + 1)), thumb(a.image, "artist"), titleBlock(a.name, (a.genres ?? []).slice(0, 2).join(", "), a.url));
    artists.append(li);
  });
  (top.tracks[r] ?? []).forEach((t, i) => {
    const li = el("li", "row");
    li.append(el("span", "rank", String(i + 1)), thumb(t.image), titleBlock(t.title, t.artist, t.url));
    tracks.append(li);
  });
  const count = new Map();
  for (const a of top.artists[r] ?? []) for (const g of a.genres ?? []) count.set(g, (count.get(g) ?? 0) + 1);
  const sorted = [...count].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 8);
  $("genres-block").hidden = sorted.length === 0; // Spotify sometimes returns no genres
  const max = sorted[0]?.[1] ?? 1;
  for (const [g, n] of sorted) {
    const li = el("li");
    const bar = el("span", "gb");
    bar.style.width = `${(n / max) * 100}%`;
    const wrap = el("span");
    wrap.append(bar);
    li.append(el("span", "g", g), wrap, el("span", "n", String(n)));
    genres.append(li);
  }
}

function render() {
  $("status").textContent = "";
  renderNow(); renderRecent(); renderTop();
}

async function load() {
  if (document.hidden) return;
  try {
    const res = await fetch(LISTENING_URL);
    if (!res.ok) throw new Error(`Worker answered ${res.status}`);
    const d = await res.json();
    if (d.enabled === false) {
      $("status").textContent = "Listening is switched off right now.";
      return;
    }
    state.data = { current: d.current ?? null, recent: d.recent ?? [], top: d.top ?? null };
    state.fetchedAt = Date.now();
    render();
  } catch (err) {
    console.warn("listening unavailable:", err);
    if (!state.data) $("status").textContent = "I could not load my listening data. Try again in a minute.";
  }
}

document.querySelectorAll("[data-range]").forEach((b) =>
  b.addEventListener("click", () => { state.range = b.dataset.range; if (state.data) renderTop(); })
);
$("more").addEventListener("click", () => { state.showAll = !state.showAll; renderRecent(); });
setInterval(() => state.tick && !document.hidden && state.tick(), 1000);
setInterval(load, POLL_MS);
document.addEventListener("visibilitychange", load);
load();
