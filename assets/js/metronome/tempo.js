// Tempo helpers: limits, the Italian word for a tempo, and tap tempo.

export const MIN_BPM = 20;
export const MAX_BPM = 400;

export function clampBpm(bpm) {
  const n = Number(bpm);
  if (!Number.isFinite(n)) return 80;
  return Math.min(MAX_BPM, Math.max(MIN_BPM, Math.round(n)));
}

const WORDS = [
  [40, "Grave"],
  [60, "Largo"],
  [66, "Larghetto"],
  [76, "Adagio"],
  [108, "Andante"],
  [120, "Moderato"],
  [156, "Allegro"],
  [176, "Vivace"],
  [200, "Presto"],
];

/** The traditional word for a tempo, e.g. 80 gives "Andante". */
export function tempoWord(bpm) {
  for (const [limit, word] of WORDS) if (bpm < limit) return word;
  return "Prestissimo";
}

/**
 * Tap tempo. Call tap(nowSeconds) on each tap. A pause longer than maxGap starts a new
 * count. Uses the median interval of the last few taps, so one slow tap does not drag it.
 */
export function createTapTempo({ maxGap = 2, keep = 6 } = {}) {
  let taps = [];
  return {
    tap(now) {
      if (taps.length && now - taps[taps.length - 1] > maxGap) taps = [];
      taps.push(now);
      taps = taps.slice(-keep);
      if (taps.length < 2) return null;
      const gaps = [];
      for (let i = 1; i < taps.length; i++) gaps.push(taps[i] - taps[i - 1]);
      gaps.sort((a, b) => a - b);
      const mid = gaps.length >> 1;
      const median = gaps.length % 2 ? gaps[mid] : (gaps[mid - 1] + gaps[mid]) / 2;
      if (!(median > 0)) return null;
      return clampBpm(60 / median);
    },
    reset() {
      taps = [];
    },
  };
}
