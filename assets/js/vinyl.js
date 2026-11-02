import { posts } from "./posts.js";

const PER_VINYL = 3;
const RADII = [340, 262, 184];
const FONT_SIZES = [22, 20, 18];
const OFFSETS = [7, 7, 6];
const PIVOT = { x: 860, y: 90 };
const ARM_LENGTH = 420;
const PARK_DEG = 78;

const tracksEl = document.getElementById("tracks");
const swapEl = document.getElementById("swap");
const armEl = document.getElementById("arm");
const prevBtn = document.getElementById("prev");
const nextBtn = document.getElementById("next");
const countEl = document.getElementById("count");
const labelNo = document.getElementById("label-no");

const totalPages = Math.max(1, Math.ceil(posts.length / PER_VINYL));
let page = 0;

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// Angle at which the arm's needle lands on a ring of radius R around (450, 450).
function armAngleFor(R) {
  for (let deg = 90; deg < 200; deg += 0.25) {
    const rad = (deg * Math.PI) / 180;
    const x = PIVOT.x + ARM_LENGTH * Math.cos(rad);
    const y = PIVOT.y + ARM_LENGTH * Math.sin(rad);
    if (Math.hypot(x - 450, y - 450) <= R) return deg;
  }
  return 140;
}

function setArm(deg) {
  armEl.style.transform = `rotate(${deg}deg)`;
}

function render() {
  const slice = posts.slice(page * PER_VINYL, page * PER_VINYL + PER_VINYL);
  tracksEl.innerHTML = slice
    .map((p, i) => `
      <a class="trk" href="post.html?slug=${encodeURIComponent(p.slug)}" data-i="${i}" aria-label="${esc(p.title)}">
        <circle class="band" cx="450" cy="450" r="${RADII[i]}" fill="none" stroke="#fff" stroke-width="62"/>
        <text font-size="${FONT_SIZES[i]}" letter-spacing="1">
          <textPath href="#t${i}" dy="${OFFSETS[i]}">${esc(p.title)}  ·  ${esc(p.date)}</textPath>
        </text>
      </a>`)
    .join("");

  tracksEl.querySelectorAll(".trk").forEach((a) => {
    const i = Number(a.dataset.i);
    const lower = () => setArm(armAngleFor(RADII[i]));
    const lift = () => setArm(PARK_DEG);
    a.addEventListener("mouseenter", lower);
    a.addEventListener("focus", lower);
    a.addEventListener("mouseleave", lift);
    a.addEventListener("blur", lift);
  });

  labelNo.textContent = `No. ${page + 1}`;
  countEl.textContent = `${page + 1} / ${totalPages}`;
  prevBtn.disabled = page === 0;
  nextBtn.disabled = page >= totalPages - 1;
  setArm(PARK_DEG);
}

function go(delta) {
  page = Math.min(totalPages - 1, Math.max(0, page + delta));
  render();
  swapEl.classList.remove("enter");
  void swapEl.offsetWidth; // restart the slide-in animation
  swapEl.classList.add("enter");
}

prevBtn.addEventListener("click", () => go(-1));
nextBtn.addEventListener("click", () => go(1));
render();
