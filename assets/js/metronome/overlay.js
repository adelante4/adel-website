// Practice modes, written as rules about which bars are audible.
//
// A rule never touches the pattern. It only says, for a given bar number, whether the
// click and the drum groove play. That keeps every mode small and easy to test, and
// lets new modes be added without changing how clicks are generated.
import { clampBpm } from "./tempo.js?v=20261108k";

/**
 * @typedef {Object} Practice
 * @property {{audible:number,silent:number}|null} gap  play N bars, then stay silent M bars
 * @property {0|4|8} trade     the groove plays N bars, then drops out N bars (click stays)
 * @property {0|1|2} countIn   bars of click only before everything else starts
 * @property {{step:number,everyBars:number,rungs:number}|null} ladder  raise the tempo
 */

/** Whether the click, the drum groove and the chords sound in a given bar (bar 0 is the first). */
export function barPlays(practice, bar) {
  const pb = bar - practice.countIn;
  if (pb < 0) return { click: true, groove: false, harmony: false };
  let click = true;
  let groove = true;
  let harmony = true;
  if (practice.gap) {
    const { audible, silent } = practice.gap;
    if (pb % (audible + silent) >= audible) {
      click = false;
      groove = false;
      harmony = false;
    }
  }
  if (practice.trade > 0 && pb % (2 * practice.trade) >= practice.trade) groove = false;
  return { click, groove, harmony };
}

/** Tempo map for a ladder: start tempo, then +step every N bars, after any count-in. */
export function ladderMap(ladder, startBpm, beatsPerBar, countIn = 0) {
  const map = [];
  for (let r = 0; r < ladder.rungs; r++) {
    map.push({
      atBeat: r === 0 ? 0 : (countIn + r * ladder.everyBars) * beatsPerBar,
      bpm: clampBpm(startBpm + r * ladder.step),
    });
  }
  return map;
}
