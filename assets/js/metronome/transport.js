// The transport keeps beats and audio-clock seconds in step.
//
// It holds an anchor: "beat B happens at audio time T". Pulling asks "which clicks fall
// between the last pull and now plus a little lookahead?" and returns them with their
// audio-clock times. Nothing here touches Web Audio, so tests can drive it with a fake clock.
//
// A smooth tempo change (retempo) moves the anchor to the first beat not yet handed out,
// so the beat that was already queued keeps its time and the next one follows at the new tempo.
import { compileTimeline, timeAtBeat, beatAtTime, bpmAtBeat } from "./timeline.js?v=20261106b";
import { generateEvents } from "./pattern.js?v=20261106b";
import { ladderMap } from "./overlay.js?v=20261106b";

/** @param {() => {pattern: import("./pattern.js").Pattern, practice: import("./overlay.js").Practice}} getConfig */
export function createTransport(getConfig) {
  let tl = null;
  let anchor = null; // { ctxTime, beat }
  let cursor = 0; // beats before this have been handed out

  function build() {
    const { pattern, practice } = getConfig();
    const map = practice.ladder
      ? ladderMap(practice.ladder, pattern.bpm, pattern.beats, practice.countIn)
      : [];
    tl = compileTimeline(pattern.bpm, map);
  }
  const ctxTimeOfBeat = (beat) => anchor.ctxTime + timeAtBeat(tl, beat) - timeAtBeat(tl, anchor.beat);
  const beatAtCtx = (t) => beatAtTime(tl, timeAtBeat(tl, anchor.beat) + (t - anchor.ctxTime));

  return {
    get running() {
      return anchor !== null;
    },
    start(nowCtx, lead = 0.08) {
      build();
      anchor = { ctxTime: nowCtx + lead, beat: 0 };
      cursor = 0;
    },
    stop() {
      anchor = null;
    },
    /** Apply a tempo change without a gap or a jump. */
    retempo() {
      if (!anchor) return;
      const t = ctxTimeOfBeat(cursor);
      build();
      anchor = { ctxTime: t, beat: cursor };
    },
    /** Clicks due before nowCtx + lookahead that have not been handed out yet. */
    pull(nowCtx, lookahead) {
      if (!anchor) return [];
      const horizon = beatAtCtx(nowCtx + lookahead);
      if (horizon <= cursor) return [];
      const { pattern, practice } = getConfig();
      const events = generateEvents(pattern, practice, cursor, horizon);
      cursor = horizon;
      return events.map((e) => ({ ...e, time: ctxTimeOfBeat(e.beat) }));
    },
    /** Playhead in beats at an audio-clock time (negative before the first beat). */
    beatAt(nowCtx) {
      return anchor ? beatAtCtx(nowCtx) : 0;
    },
    /** Tempo in force at a beat, which differs from the setting while a ladder runs. */
    bpmAt(beat) {
      return tl ? bpmAtBeat(tl, Math.max(0, beat)) : getConfig().pattern.bpm;
    },
  };
}
