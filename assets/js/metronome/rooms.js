// The page's interface logic: one detail panel per section, chips that show state, the sentence that says
// what is sounding. The controls themselves stay in metronome.js; this module decides what is visible and
// what the chips say. Every control exists once in the page.
import { describeSound } from "./sentence.js?v=20261108v";

const $ = (id) => document.getElementById(id);

export function initRooms({ getState, commit, getTuneName }) {
  let lastGroove = "lofi";

  // ---- chips open one panel at a time, under their own section ----
  const sections = [...document.querySelectorAll("[data-detail]")];
  function panelsOf(box) {
    return [...box.querySelectorAll(":scope > .panel")];
  }
  function openPanel(box, id) {
    const chips = document.querySelectorAll(`#${box.closest("section").id} [data-chip]`);
    for (const p of panelsOf(box)) p.hidden = p.dataset.panel !== id;
    for (const c of chips) c.setAttribute("aria-expanded", String(c.dataset.chip === id));
  }
  for (const box of sections) {
    const section = box.closest("section");
    for (const chip of section.querySelectorAll("[data-chip]")) {
      chip.addEventListener("click", () => {
        const open = chip.getAttribute("aria-expanded") === "true";
        openPanel(box, open ? null : chip.dataset.chip);
      });
    }
    for (const close of box.querySelectorAll(".close")) {
      close.addEventListener("click", () => {
        const id = close.closest(".panel").dataset.panel;
        openPanel(box, null);
        section.querySelector(`[data-chip="${id}"]`)?.focus();
      });
    }
    section.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      const open = panelsOf(box).find((p) => !p.hidden);
      if (!open) return;
      openPanel(box, null);
      section.querySelector(`[data-chip="${open.dataset.panel}"]`)?.focus();
    });
  }

  // ---- switches ----
  $("drums-toggle").addEventListener("click", () => {
    const s = getState();
    if (s.groove.style !== "off") {
      lastGroove = s.groove.style;
      s.groove = { ...s.groove, style: "off" };
    } else s.groove = { ...s.groove, style: lastGroove };
    commit();
  });
  $("pc-gap").addEventListener("click", () => $("gap-toggle").click());
  $("pc-ladder").addEventListener("click", () => $("ladder-toggle").click());

  // ---- the chord editor appears once a chord is picked ----
  $("form").addEventListener("click", () => ($("chord-editor").hidden = false));

  function setSwitch(el, on) {
    const text = on ? "On" : "Off";
    if (el.textContent !== text) el.textContent = text;
    el.setAttribute("aria-pressed", String(on));
  }

  let last = "";
  function sync() {
    const s = getState();
    const d = describeSound(s, getTuneName?.() ?? "");
    for (const [k, v] of Object.entries(d.values)) {
      const el = $(`cv-${k}`);
      if (el && el.textContent !== v) el.textContent = v;
    }
    setSwitch($("drums-toggle"), d.drumsOn);
    setSwitch($("pc-gap"), s.practice.gap !== null);
    setSwitch($("pc-ladder"), s.practice.ladder !== null);
    for (const [chip, on] of [["keys", s.harmony.on], ["bass", s.bass.on], ["drums", d.drumsOn], ["gap", s.practice.gap !== null], ["ladder", s.practice.ladder !== null], ["countin", s.practice.countIn > 0], ["trade", s.practice.trade > 0 && d.drumsOn], ["feel", s.pattern.swing > 0.5 || s.pattern.humanize > 0], ["click", d.clickMode !== "off"]]) {
      document.querySelector(`[data-chip="${chip}"]`).classList.toggle("lit", on);
    }
    if ($("sentence").textContent !== d.text) $("sentence").textContent = d.text;
    $("chart-note").hidden = !(d.chartSilent && (getTuneName?.() ?? ""));
    $("trade-hint").hidden = d.drumsOn;
    $("freeze").hidden = !(s.pattern.density < 1 || s.pattern.freeze);
    // A setting that changes the sound is never hidden away closed.
    const loose = s.pattern.humanize > 0 || s.pattern.density < 1;
    const key = JSON.stringify([loose]);
    if (key !== last) {
      last = key;
      if (loose) $("looseness").open = true;
    }
  }

  return {
    sync,
    open(id) {
      if (id === "write") $("more-write").open = true;
    },
  };
}
