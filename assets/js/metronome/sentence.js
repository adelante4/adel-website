// Says in plain words what the page is playing, from the same state the transport reads.
// Pure functions: no DOM, no audio.
import { KEYS, BASSES } from "./instruments.js?v=20261108u";

export const GROOVE_NAMES = {
  lofi: "Lofi", dilla: "Neo-soul", halftime: "Halftime", boombap: "Boom-bap", jazz: "Jazz swing",
  brushes: "Brushes", bossa: "Bossa", shuffle: "Shuffle", funk: "Funk", waltz: "Jazz waltz", trap: "Trap", house: "House", techno: "Techno", twostep: "2-step", idm: "IDM", minimal: "Minimal clicks",
  five4: "5/4 jazz", five8: "5/8 (3+2)", seven223: "7/8 (2+2+3)", seven322: "7/8 (3+2+2)", nine: "9/8 (2+2+2+3)", eleven: "11/8 (3+3+3+2)",
  teental: "Teental (16)", rupak: "Rupak (7)", jhaptal: "Jhaptal (10)", keharwa: "Keharwa (8)", dadra: "Dadra (6)",
};

const nameOf = (list, id) => list.find((x) => x.id === id)?.name ?? id;
const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;

export function swingWord(s) {
  if (s < 0.53) return "straight";
  if (s < 0.62) return "light";
  if (s < 0.7) return "triplet";
  return "hard";
}

/** Short values for each chip, the sentence, and whether the chart is silent. */
export function describeSound(s, tuneName = "") {
  const { pattern: p, practice: pr, harmony: h, bass: b, groove: g, mix } = s;
  const drumsOn = g.style !== "off";
  const clickOff = mix.click === 0;
  const clickMode = clickOff ? "off" : mix.autoMute && drumsOn ? "auto" : "on";
  const meter = `${p.beats}/${p.den}`;

  const values = {
    click: `${clickMode === "off" ? "Off" : clickMode === "auto" ? "Auto" : "On"}, ${meter}`,
    keys: h.on ? nameOf(KEYS, h.sound) : "adds a backing",
    bass: b.on ? nameOf(BASSES, b.sound) : "adds a bass line",
    drums: drumsOn ? GROOVE_NAMES[g.style] ?? g.style : "adds a groove",
    feel: [p.swing > 0.5 ? `swing: ${swingWord(p.swing)}` : "straight", p.humanize > 0 ? "loose" : ""].filter(Boolean).join(", "),
    countin: pr.countIn > 0 ? plural(pr.countIn, "bar") : "off",
    gap: pr.gap ? `${pr.gap.audible} on, ${pr.gap.silent} off` : "off",
    ladder: pr.ladder ? `+${pr.ladder.step} per ${pr.ladder.everyBars} bars` : "off",
    trade: pr.trade > 0 ? (drumsOn ? `every ${pr.trade} bars` : "needs drums") : "off",
  };

  const voices = [h.on && "chords", b.on && "bass", drumsOn && "drums"].filter(Boolean);
  const out = [];
  if (!voices.length) {
    out.push(clickOff ? "Silence: the metronome is off and no band is on." : `Metronome only. ${meter}, ${pattern(p)}.`);
  } else {
    const list = voices.length > 1 ? `${voices.slice(0, -1).join(", ")} and ${voices[voices.length - 1]}` : voices[0];
    const chords = h.on || b.on;
    out.push(`${cap(list)} ${chords ? `play ${tuneName ? tuneName : "the chart below"}` : "play"}.`);
    if (clickOff) out.push("Metronome is off.");
    else if (clickMode === "auto") out.push("The metronome steps aside while the drums play.");
    else out.push("The metronome plays on top of the band.");
  }
  if (p.swing > 0.5) out.push(`Swing is ${swingWord(p.swing)}, on everything.`);
  if (pr.countIn > 0) out.push(`${cap(plural(pr.countIn, "bar"))} of count-in first.`);
  if (pr.gap) out.push(`Gap trainer: ${plural(pr.gap.audible, "bar")} on, ${pr.gap.silent} silent.`);
  if (pr.ladder) out.push(`Tempo climbs ${pr.ladder.step} BPM every ${plural(pr.ladder.everyBars, "bar")}.`);
  if (pr.trade > 0) out.push(drumsOn ? `The drums drop out every other ${pr.trade} bars.` : "Trade fours does nothing: the drums are off.");

  return { values, text: out.join(" "), chartSilent: !h.on && !b.on, clickMode, drumsOn };
}

function pattern(p) {
  if (p.clickOn !== "all") return { backbeat: "on 2 and 4", downbeat: "on the downbeat only", upbeats: "on the upbeats" }[p.clickOn] ?? "on every beat";
  return p.subdivision > 1 ? `${p.subdivision} ticks to the beat` : "one tick a beat";
}
const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
