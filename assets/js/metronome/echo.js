// Taking the band back out of the microphone.
//
// With speakers, the microphone hears the guitar plus the band coming back through the room. The page knows the
// band's signal exactly, so it can learn what the room does to it and subtract that. What is left is the guitar.
//
// "What the room does" is an impulse response: the direct sound, then the reflections, about a tenth of a second
// in all. It is learned as the band plays, in two layers.
//
//   The quick learner. Predict the echo with the current response, look at what is left after subtracting it,
//   and correct the response so less is left next time. The correction is worked out per frequency and scaled by
//   how much of the band's signal is there, so it settles in about a second whatever the band is playing. But
//   the guitar is in the leftover too, so every correction also carries a little guitar. The quick learner is
//   always roughly right and always a bit shaky.
//
//   The steady answer. The average of the quick learner's responses over time. The guitar's pushes go in every
//   direction and cancel in the average; the room does not. This is what is used for the subtraction. It keeps
//   getting better for as long as the band plays, and a loud guitar only slows it down.
//
// If the quick learner starts doing clearly better than the steady answer (the phone was moved, or the steady
// answer has not caught up yet), the steady answer is set to the quick one and the averaging starts again.
//
// The echo is the band's signal convolved with the response, in the time domain. A drum hit stays a sharp hit in
// the estimate, so it can be subtracted sample by sample and does not smear over the notes next to it.
// (In the literature: an overlap-save, constrained frequency-domain adaptive filter, with Polyak-Ruppert
// averaging of the iterates.)
// Pure code, no Web Audio.
import { createFFT, nextPow2 } from "./fft.js?v=20261111a";

/**
 * @param {{rate:number, tail?:number, part?:number}} o
 *   tail: length of the room response in seconds. part: how many samples each step handles.
 */
export function createEchoModel({ rate, tail = 0.12, part = 2048, step = 0.35, memory = 30 }) {
  const Lh = Math.round(tail * rate);
  const F = nextPow2(Lh + part);
  const fft = createFFT(F);
  const Xre = new Float64Array(F);
  const Xim = new Float64Array(F);
  const Hre = new Float64Array(F); // the quick learner
  const Him = new Float64Array(F);
  const Are = new Float64Array(F); // the steady answer
  const Aim = new Float64Array(F);
  const are = new Float64Array(F);
  const aim = new Float64Array(F);
  const power = new Float64Array(F); // smoothed power of the band's signal, per frequency
  const quick = new Float64Array(part);
  const fade = Math.round(0.04 * rate);
  const off = F - part;
  const most = Math.round((memory * rate) / part); // the average looks back this many steps at most
  let steps = 0; // steps that had band signal in them
  let count = 0; // steps in the average
  let leftQuick = 0; // smoothed leftover energy of each layer
  let leftSteady = 0;

  return {
    F,
    part,
    length: Lh,
    get ready() {
      return steps > 0;
    },
    /** The steady room response (a copy). For tests and for showing. */
    response() {
      for (let i = 0; i < F; i++) {
        are[i] = Are[i];
        aim[i] = Aim[i];
      }
      fft.inverse(are, aim);
      return Float64Array.from(are.subarray(0, Lh));
    },
    reset() {
      Hre.fill(0);
      Him.fill(0);
      Are.fill(0);
      Aim.fill(0);
      power.fill(0);
      steps = 0;
      count = 0;
      leftQuick = 0;
      leftSteady = 0;
    },
    /**
     * One step, for the newest `part` samples.
     * @param refTail  the last F samples of the band's signal, the newest last
     * @param mic      the newest `part` samples of the microphone
     * @param echo     out: the estimated echo for those samples
     * @param learn    false to subtract without learning
     */
    step(refTail, mic, echo, learn = true) {
      let e0 = 0;
      for (let i = 0; i < F; i++) {
        Xre[i] = refTail[i];
        Xim[i] = 0;
        e0 += refTail[i] * refTail[i];
      }
      fft.forward(Xre, Xim);
      // The echo by the steady answer: this is the one that is subtracted.
      for (let i = 0; i < F; i++) {
        are[i] = Xre[i] * Are[i] - Xim[i] * Aim[i];
        aim[i] = Xre[i] * Aim[i] + Xim[i] * Are[i];
      }
      fft.inverse(are, aim);
      for (let i = 0; i < part; i++) echo[i] = are[off + i];
      if (!learn || e0 / F < 1e-10) return;
      // The echo by the quick learner, and what it leaves.
      for (let i = 0; i < F; i++) {
        are[i] = Xre[i] * Hre[i] - Xim[i] * Him[i];
        aim[i] = Xre[i] * Him[i] + Xim[i] * Hre[i];
      }
      fft.inverse(are, aim);
      let eq = 0;
      let es = 0;
      for (let i = 0; i < part; i++) {
        quick[i] = mic[i] - are[off + i];
        eq += quick[i] * quick[i];
        const s = mic[i] - echo[i];
        es += s * s;
      }
      leftQuick = 0.9 * leftQuick + eq;
      leftSteady = 0.9 * leftSteady + es;
      // The quick learner's leftover, placed where it sits in the long frame, matched against the band's signal.
      are.fill(0, 0, off);
      for (let i = 0; i < part; i++) are[off + i] = quick[i];
      aim.fill(0);
      fft.forward(are, aim);
      let meanX = 0;
      for (let k = 0; k < F; k++) meanX += power[k];
      const floor = (meanX / F) * 1e-3 + 1e-12;
      for (let k = 0; k < F; k++) {
        const p = Xre[k] * Xre[k] + Xim[k] * Xim[k];
        const was = steps === 0 ? p : power[k];
        power[k] = 0.9 * was + 0.1 * p;
        // A burst is scaled by its own size, not by the quiet before it.
        const w = step / (Math.max(power[k], p) + floor + 1e-30);
        const re = (Xre[k] * are[k] + Xim[k] * aim[k]) * w;
        aim[k] = (Xre[k] * aim[k] - Xim[k] * are[k]) * w;
        are[k] = re;
      }
      fft.inverse(are, aim);
      // Only the first tenth of a second can be room. The rest is noise: drop it.
      for (let n = 0; n < Lh; n++) are[n] *= Math.min(1, (Lh - n) / fade);
      are.fill(0, Lh);
      aim.fill(0);
      fft.forward(are, aim);
      for (let k = 0; k < F; k++) {
        Hre[k] += are[k];
        Him[k] += aim[k];
      }
      steps++;
      // The steady answer: restart it from the quick learner when that one is clearly ahead, else average on.
      if (count === 0 || (steps > 4 && leftQuick < 0.7 * leftSteady)) {
        Are.set(Hre);
        Aim.set(Him);
        count = 1;
        leftSteady = leftQuick;
      } else {
        count = Math.min(most, count + 1);
        const a = 1 / count;
        for (let k = 0; k < F; k++) {
          Are[k] += a * (Hre[k] - Are[k]);
          Aim[k] += a * (Him[k] - Aim[k]);
        }
      }
    },
  };
}
