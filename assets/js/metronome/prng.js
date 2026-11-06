// Seeded randomness for the metronome.
//
// Every random choice (does this click play, how far is it nudged, how loud) is a pure
// function of where the click sits: seed, bar, beat, subdivision. Nothing depends on
// call order, so a pattern replays identically, can be frozen, and survives a restart.

/** Mix integers into one unsigned 32-bit hash. */
export function hashInts(...xs) {
  let h = 0x811c9dc5;
  for (const x of xs) {
    h = Math.imul(h ^ ((x | 0) >>> 0), 0x01000193) >>> 0;
    h ^= h >>> 13;
    h = Math.imul(h, 0x5bd1e995) >>> 0;
    h ^= h >>> 15;
  }
  return h >>> 0;
}

/** Small, fast seeded generator. Returns numbers in [0, 1). */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The generator for one click slot. */
export function slotRng(seed, bar, beat, sub) {
  return mulberry32(hashInts(seed, bar, beat, sub));
}
