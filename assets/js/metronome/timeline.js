// Beats to seconds.
//
// A timeline is a list of tempo segments. A steady tempo is one segment. A tempo ladder
// is a few segments. Everything that needs a time in seconds goes through here, so a
// tempo change is data, not a special case.
//
// "Beat" means one counted pulse. In 6/8 the counted pulse is an eighth note, and bpm
// is the speed of that pulse.

/**
 * @param {number} bpm tempo before the first map point
 * @param {{atBeat:number,bpm:number}[]} tempoMap points where the tempo changes
 */
export function compileTimeline(bpm, tempoMap = []) {
  const points = tempoMap
    .filter((p) => p && Number.isFinite(p.atBeat) && p.atBeat >= 0 && p.bpm > 0)
    .slice()
    .sort((a, b) => a.atBeat - b.atBeat);
  const segments = [{ startBeat: 0, startTime: 0, bpm }];
  for (const p of points) {
    const prev = segments[segments.length - 1];
    if (p.atBeat === prev.startBeat) {
      prev.bpm = p.bpm;
      continue;
    }
    segments.push({
      startBeat: p.atBeat,
      startTime: prev.startTime + ((p.atBeat - prev.startBeat) * 60) / prev.bpm,
      bpm: p.bpm,
    });
  }
  return { segments };
}

function segmentForBeat(tl, beat) {
  let seg = tl.segments[0];
  for (let i = 1; i < tl.segments.length; i++) {
    if (tl.segments[i].startBeat <= beat) seg = tl.segments[i];
    else break;
  }
  return seg;
}

export function timeAtBeat(tl, beat) {
  const s = segmentForBeat(tl, beat);
  return s.startTime + ((beat - s.startBeat) * 60) / s.bpm;
}

export function bpmAtBeat(tl, beat) {
  return segmentForBeat(tl, beat).bpm;
}

/** Inverse of timeAtBeat. */
export function beatAtTime(tl, seconds) {
  let seg = tl.segments[0];
  for (let i = 1; i < tl.segments.length; i++) {
    if (tl.segments[i].startTime <= seconds) seg = tl.segments[i];
    else break;
  }
  return seg.startBeat + ((seconds - seg.startTime) * seg.bpm) / 60;
}

/**
 * Position of a subdivision inside its beat, as a fraction of the beat.
 * For even subdivisions the notes come in pairs and swing delays the second of each
 * pair: swing 0.5 is straight, about 0.667 is triplet swing, higher is harder.
 * Odd subdivisions (triplets) stay evenly spaced.
 */
export function subFraction(subStep, subdivision, swing) {
  if (subdivision % 2 === 0) {
    const pairStart = (Math.floor(subStep / 2) * 2) / subdivision;
    if (subStep % 2 === 0) return pairStart;
    return pairStart + swing * (2 / subdivision);
  }
  return subStep / subdivision;
}
