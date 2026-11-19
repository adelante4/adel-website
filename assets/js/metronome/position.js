// Form position: where in the tune a bar or a beat falls. Pure code, no Web Audio.
//
// A run starts with count-in bars, then plays the form over and over. A bar of the form holds one
// chord, or two (a split bar: the second chord starts in the middle of the bar). Comping, bass, the
// playhead, the harmony map and Listen all ask this module instead of working it out themselves.

/** The chords of a form in playing order, with where each one starts in its bar. */
export function flattenForm(form, beats) {
  const half = Math.ceil(beats / 2);
  const slots = [];
  form.forEach((bar, b) => {
    if (bar.length === 2) {
      slots.push({ bar: b, k: 0, chord: bar[0], start: 0, span: half });
      slots.push({ bar: b, k: 1, chord: bar[1], start: half, span: beats - half });
    } else {
      slots.push({ bar: b, k: 0, chord: bar[0], start: 0, span: beats });
    }
  });
  return slots;
}

/**
 * @param {string[][]} form  @param {number} beats beats per bar  @param {number} countIn count-in bars
 * `slots`: the form's chords in order, each with its `index`.
 * `ofBar(bar)`: null in the count-in; otherwise { bar, playBar (counted after the count-in), formBar, chorus, slots }.
 * `at(beat, lead)`: the same for the bar a beat falls in, plus `inBar`, the `slot` sounding and `beatInSlot`.
 *   A beat up to `lead` beats before the first bar counts as its downbeat (a player comes in a touch early).
 */
export function formPosition(form, beats, countIn = 0) {
  const slots = flattenForm(form, beats).map((s, index) => ({ ...s, index }));
  const byBar = form.map((_, b) => slots.filter((s) => s.bar === b));
  const ofBar = (bar) => {
    const playBar = bar - countIn;
    if (playBar < 0 || form.length === 0) return null;
    const formBar = playBar % form.length;
    return { bar, playBar, formBar, chorus: Math.floor(playBar / form.length), slots: byBar[formBar] };
  };
  const at = (beat, lead = 0) => {
    let b = beat - countIn * beats;
    if (b < -lead) return null;
    if (b < 0) b = 0;
    const playBar = Math.floor(b / beats);
    const p = ofBar(playBar + countIn);
    if (!p) return null;
    const inBar = b - playBar * beats;
    const slot = p.slots.length === 2 && inBar >= p.slots[1].start ? p.slots[1] : p.slots[0];
    return { ...p, inBar, slot, beatInSlot: inBar - slot.start };
  };
  return { slots, ofBar, at };
}

/** Which step of a tempo ladder a bar is on (1 = the start tempo), or null without a ladder or in the count-in. */
export function ladderStep(practice, bar) {
  const l = practice.ladder;
  const playBar = bar - practice.countIn;
  if (!l || playBar < 0) return null;
  return Math.min(l.rungs, Math.floor(playBar / l.everyBars) + 1);
}
