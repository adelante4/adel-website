// Rooms and pedals: shows only what matters. Three rooms (Beat, Band, Train), one at a time.
// Every setting that changes the sound sits in a pedal: closed by default, lit when it is doing
// something, and listed in the "On now" strip under the dial. The controls themselves stay in
// metronome.js; this module only decides what is visible.

const $ = (id) => document.getElementById(id);
const ROOMS = [["beat", "Beat"], ["tune", "Tune"], ["band", "Band"], ["train", "Train"]];

const pressed = (id) => $(id).querySelector('[aria-pressed="true"]')?.textContent ?? "";

// name: shown on the tile. on: is it changing the sound? read: the short value on the tile.
// reset: put it back (return a commit kind, or false when it handled itself).
const PEDALS = {
  subdiv: { room: "beat", on: (s) => s.pattern.subdivision !== 1, read: () => pressed("subdiv"), reset: (s) => void (s.pattern.subdivision = 1) },
  clickon: { room: "beat", on: (s) => s.pattern.clickOn !== "all", read: () => pressed("clickon"), reset: (s) => void (s.pattern.clickOn = "all") },
  swing: { room: "beat", on: (s) => s.pattern.swing > 0.5, read: () => $("swing-val").textContent, reset: (s) => void (s.pattern.swing = 0.5) },
  humanize: { room: "beat", on: (s) => s.pattern.humanize > 0, read: () => $("humanize-val").textContent, reset: (s) => void (s.pattern.humanize = 0) },
  chance: {
    room: "beat",
    on: (s) => s.pattern.density < 1 || s.pattern.chances.some((c) => c < 1),
    read: (s) => (s.pattern.density < 1 ? $("density-val").textContent : s.pattern.chances.some((c) => c < 1) ? "per beat" : "always"),
    reset: (s) => {
      s.pattern.density = 1;
      s.pattern.freeze = false;
      s.pattern.chances = s.pattern.chances.map(() => 1);
    },
  },
  sound: { room: "beat", on: (s) => s.pattern.sound !== "tock", read: () => pressed("sound"), reset: (s) => void (s.pattern.sound = "tock") },
  edit: { room: "tune", on: () => false, read: () => "", reset: null },
  countin: { room: "train", on: (s) => s.practice.countIn > 0, read: () => pressed("countin"), reset: (s) => { s.practice.countIn = 0; return "restart"; } },
  gap: {
    room: "train",
    on: (s) => s.practice.gap !== null,
    read: (s) => (s.practice.gap ? `${s.practice.gap.audible} on, ${s.practice.gap.silent} off` : "off"),
    reset: () => ($("gap-toggle").click(), false),
  },
  ladder: {
    room: "train",
    on: (s) => s.practice.ladder !== null,
    read: (s) => (s.practice.ladder ? `+${s.practice.ladder.step} every ${s.practice.ladder.everyBars}` : "off"),
    reset: () => ($("ladder-toggle").click(), false),
  },
  trade: { room: "train", on: (s) => s.practice.trade > 0, read: () => pressed("trade"), reset: (s) => void (s.practice.trade = 0) },
};

const LAYERS = [
  ["keys", "Keys", (s) => s.harmony.on],
  ["bass", "Bass", (s) => s.bass.on],
  ["drums", "Drums", (s) => s.groove.style !== "off"],
];

export function initRooms({ getState, commit }) {
  let room = "beat";
  let first = true;
  let chipKey = "";
  const pedalEls = new Map();

  // ---- rooms (tabs) ----
  const bar = $("rooms");
  const tabs = ROOMS.map(([id, name]) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "room-tab";
    b.id = `tab-${id}`;
    b.setAttribute("role", "tab");
    b.setAttribute("aria-controls", `room-${id}`);
    b.innerHTML = `<span>${name}</span><sup class="count" aria-hidden="true"></sup>`;
    b.addEventListener("click", () => show(id));
    bar.append(b);
    $(`room-${id}`).setAttribute("aria-labelledby", b.id);
    return b;
  });
  bar.addEventListener("keydown", (e) => {
    const i = ROOMS.findIndex(([id]) => id === room);
    const next = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: ROOMS.length - 1 }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    const n = (next + ROOMS.length) % ROOMS.length;
    show(ROOMS[n][0]);
    tabs[n].focus();
  });

  function show(id) {
    room = id;
    ROOMS.forEach(([r], i) => {
      const on = r === id;
      $(`room-${r}`).hidden = !on;
      tabs[i].setAttribute("aria-selected", String(on));
      tabs[i].tabIndex = on ? 0 : -1;
    });
  }

  // ---- pedals ----
  for (const el of document.querySelectorAll(".pedal")) {
    const id = el.dataset.pedal;
    const def = PEDALS[id];
    const body = document.createElement("div");
    body.className = "pedal-body";
    body.hidden = true;
    body.id = `pedal-${id}`;
    body.append(...el.childNodes);
    const head = document.createElement("button");
    head.type = "button";
    head.className = "pedal-head";
    head.setAttribute("aria-expanded", "false");
    head.setAttribute("aria-controls", body.id);
    head.innerHTML = `<i class="led" aria-hidden="true"></i><span class="pn"></span><span class="pr"></span>`;
    head.querySelector(".pn").textContent = el.dataset.name;
    head.addEventListener("click", () => toggle(id));
    el.append(head, body);
    if (def.reset) {
      const r = document.createElement("button");
      r.type = "button";
      r.className = "btn small pedal-reset";
      r.textContent = "Turn off";
      r.addEventListener("click", () => {
        const s = getState();
        const kind = def.reset(s);
        if (kind !== false) commit(kind || "live");
      });
      body.append(r);
    }
    pedalEls.set(id, { el, head, body, read: head.querySelector(".pr"), reset: body.querySelector(".pedal-reset") });
    if (el.dataset.openOn) $(el.dataset.openOn).addEventListener("click", () => open(id, true));
  }

  function open(id, yes) {
    const p = pedalEls.get(id);
    p.body.hidden = !yes;
    p.head.setAttribute("aria-expanded", String(yes));
    p.el.classList.toggle("open", yes);
  }
  const toggle = (id) => open(id, pedalEls.get(id).body.hidden);

  function jump(roomId, pedalId) {
    show(roomId);
    if (!pedalId) return;
    open(pedalId, true);
    const p = pedalEls.get(pedalId);
    p.head.focus();
    p.el.scrollIntoView({ block: "nearest", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }

  // ---- sync: called after every render ----
  function sync() {
    const s = getState();
    const chips = [];
    const counts = { beat: 0, tune: 0, band: 0, train: 0 };

    const { beats, den, bars } = s.pattern;
    if (beats !== 4 || den !== 4) chips.push([`${beats}/${den}`, "beat", null]);
    if (bars > 1) chips.push([`${bars} bars`, "beat", null]);
    if (s.mix.click === 0) chips.push(["click off", "beat", null]);
    else if (s.mix.autoMute && s.groove.style !== "off") chips.push(["click steps aside", "beat", null]);

    for (const [id, p] of pedalEls) {
      const def = PEDALS[id];
      const on = def.on(s);
      p.el.classList.toggle("active", on);
      if (def.reset) p.reset.hidden = !on;
      const text = def.read(s);
      if (p.read.textContent !== text) p.read.textContent = text;
      if (on) {
        counts[def.room]++;
        chips.push([`${p.head.querySelector(".pn").textContent.toLowerCase()} ${text}`.trim(), def.room, id]);
        if (first) open(id, true);
      }
    }

    for (const [id, name, isOn] of LAYERS) {
      const on = isOn(s);
      const el = document.querySelector(`[data-layer="${id}"]`);
      el.classList.toggle("on", on);
      el.querySelector(".layer-body").hidden = !on;
      if (on) {
        counts.band++;
        chips.push([name.toLowerCase(), "band", null]);
      }
    }
    const any = LAYERS.some(([, , isOn]) => isOn(s));
    $("levels").hidden = !any;
    for (const lv of document.querySelectorAll("[data-lv]")) {
      const k = lv.dataset.lv;
      lv.hidden = !(k === "chords" ? s.harmony.on : k === "bass" ? s.bass.on : s.groove.style !== "off");
    }
    $("trade-hint").hidden = s.groove.style !== "off";
    $("freeze").hidden = !(s.pattern.density < 1 || s.pattern.freeze);

    tabs.forEach((t, i) => {
      const n = counts[ROOMS[i][0]];
      const c = t.querySelector(".count");
      c.textContent = n ? String(n) : "";
      t.classList.toggle("lit", n > 0);
    });

    const key = JSON.stringify(chips);
    if (key !== chipKey) {
      chipKey = key;
      const box = $("on-now");
      if (!chips.length) {
        box.replaceChildren(Object.assign(document.createElement("span"), { className: "plain", textContent: "Plain click" }));
      } else {
        box.replaceChildren(
          ...chips.map(([text, r, pedal]) => {
            const b = document.createElement("button");
            b.type = "button";
            b.className = "tag";
            b.textContent = text;
            b.addEventListener("click", () => jump(r, pedal));
            return b;
          }),
        );
      }
    }
    first = false;
  }

  show("beat");
  return { sync, show };
}
