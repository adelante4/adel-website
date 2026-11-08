// The transport keeps beats and audio-clock seconds in step.
//
// It holds an anchor: "beat B happens at audio time T". Pulling asks "which clicks fall
// between the last pull and now plus a little lookahead?" and returns them with their
// audio-clock times. Nothing here touches Web Audio, so tests can drive it with a fake clock.
//
// A smooth tempo change (retempo) moves the anchor to the first beat not yet handed out,
// so the beat that was already queued keeps its time and the next one follows at the new tempo.
import { compileTimeline, timeAtBeat, beatAtTime, bpmAtBeat } from "./timeline.js?v=20261108u";
import { generateEvents } from "./pattern.js?v=20261108u";
import { ladderMap } from "./overlay.js?v=20261108u";
import { generateHarmony } from "./comping.js?v=20261108u";
import { generateGroove, grooveSounds, bandFeel, swingBeat } from "./groove.js?v=20261108u";
import { generateBass } from "./bassline.js?v=20261108u";

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
    /** Everything due before nowCtx + lookahead that has not been handed out yet. */
    pullAll(nowCtx, lookahead) {
      const none = { clicks: [], chords: [], bass: [], drums: [] };
      if (!anchor) return none;
      const horizon = beatAtCtx(nowCtx + lookahead);
      if (horizon <= cursor) return none;
      const { pattern, practice, harmony, groove, bass, mix } = getConfig();
      const at = (e) => ({ ...e, time: ctxTimeOfBeat(e.beat) });
      // The band swings together: keys and bass follow the drums' feel, or the swing control when it is set.
      const feel = bandFeel(groove, pattern);
      const swung = (e) => ({ ...e, beat: swingBeat(e.beat, feel) });
      // While the drums play, the click steps aside. It returns in count-in bars and in the
      // bars where trade fours takes the drums out.
      const quiet = mix?.autoMute ? (bar) => grooveSounds(groove, pattern, practice, bar) : () => false;
      const clicks = generateEvents(pattern, practice, cursor, horizon)
        .filter((e) => !quiet(e.bar))
        .map(at);
      const chords = harmony?.on
        ? generateHarmony(harmony, pattern, practice, cursor, horizon).map(swung).map((e) => ({
            ...at(e),
            seconds: ctxTimeOfBeat(e.beat + e.dur) - ctxTimeOfBeat(e.beat),
          }))
        : [];
      const bassNotes = bass?.on
        ? generateBass(bass, harmony, pattern, practice, cursor, horizon).map(swung).map((e) => ({
            ...at(e),
            seconds: ctxTimeOfBeat(e.beat + e.dur) - ctxTimeOfBeat(e.beat),
          }))
        : [];
      // Pocket: the bass sits a touch behind the beat, the ride a touch on top. Small, in seconds.
      const pocket = groove?.pocket !== false && groove?.style !== "off";
      const late = (e, ms) => (pocket ? { ...e, time: e.time + ms / 1000 } : e);
      const DRUM_POCKET = { ride: -5, snare: 5, ghost: 5, foot: 3 };
      const drums = groove && groove.style !== "off"
        ? generateGroove(groove, pattern, practice, cursor, horizon).map(at).map((e) => late(e, DRUM_POCKET[e.voice] ?? 0))
        : [];
      cursor = horizon;
      return { clicks, chords: chords.map((e) => late(e, 4)), bass: bassNotes.map((e) => late(e, 10)), drums };
    },
    /** Clicks only. */
    pull(nowCtx, lookahead) {
      return this.pullAll(nowCtx, lookahead).clicks;
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
