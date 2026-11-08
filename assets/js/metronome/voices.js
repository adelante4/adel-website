// Synthesized instruments: an electric piano, a bass, and a small drum kit.
//
// Every function takes the audio context, a destination node, and a start time, builds a few
// short-lived nodes, and lets them clean up after themselves. Nothing here keeps state.
import { midiToHz } from "./chords.js?v=20261108t";

/** One second of white noise, shared by all drum voices. */
export function makeNoise(ctx, seconds = 2) {
  const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
  const d = buf.getChannelData(0);
  let x = 22222;
  for (let i = 0; i < d.length; i++) {
    x = (x * 1664525 + 1013904223) >>> 0; // fixed seed, so every load sounds the same
    d[i] = (x / 2147483648 - 1) * 0.9;
  }
  return buf;
}

/** A short room: decaying stereo noise. Fed from the instrument buses, mixed in low. */
export function makeImpulse(ctx, seconds = 1.3) {
  const n = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, n, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    let x = 777 + c * 31;
    let lp = 0;
    for (let i = 0; i < n; i++) {
      x = (x * 1664525 + 1013904223) >>> 0;
      const white = x / 2147483648 - 1;
      lp += (white - lp) * 0.45; // rolls the top off so the room sounds soft
      d[i] = lp * Math.pow(1 - i / n, 2.6);
    }
  }
  return buf;
}

/** Vinyl dust: faint hiss with sparse pops and crackles, four seconds, meant to loop. */
export function makeDust(ctx, seconds = 4) {
  const n = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let x = 4242;
  const rnd = () => ((x = (x * 1664525 + 1013904223) >>> 0) / 4294967296);
  let lp = 0;
  for (let i = 0; i < n; i++) {
    lp += ((rnd() * 2 - 1) - lp) * 0.3;
    d[i] = lp * 0.02;
  }
  const pops = Math.floor(seconds * 7);
  for (let k = 0; k < pops; k++) {
    const at = Math.floor(rnd() * (n - 200));
    const amp = Math.pow(rnd(), 2.2) * 0.8 + 0.06;
    const len = 30 + Math.floor(rnd() * 90);
    const sign = rnd() < 0.5 ? -1 : 1;
    for (let i = 0; i < len; i++) d[at + i] += sign * amp * Math.exp(-i / (len * 0.22)) * (i === 0 ? 1 : rnd() * 0.9 + 0.1);
  }
  for (let k = 0; k < 3; k++) {
    // a short burst of crackle
    const at = Math.floor(rnd() * (n - 4000));
    for (let i = 0; i < 3000; i++) if (rnd() < 0.012) d[at + i] += (rnd() * 2 - 1) * 0.25;
  }
  return buf;
}

function env(g, when, peak, attack, decayTo, decay) {
  g.gain.setValueAtTime(0.0001, when);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), when + attack);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0001, decayTo), when + attack + decay);
}

/**
 * Electric piano. FM with a decaying index gives the bark at the strike and the bell tone as
 * it settles; two slightly detuned voices add the chorus. Notes in a chord are strummed a few
 * milliseconds apart, lowest first.
 */
export function rhodes(ctx, dest, when, midis, seconds, gain) {
  const n = midis.length;
  midis.forEach((m, i) => {
    const t = when + i * 0.006;
    const f = midiToHz(m);
    const vel = Math.min(1, gain);
    const peak = (0.42 * vel) / Math.sqrt(n) / (1 + Math.max(0, m - 64) * 0.012);
    const out = ctx.createGain();
    const release = Math.min(0.5, Math.max(0.18, seconds * 0.25));
    const end = t + Math.max(0.12, seconds);
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(peak, t + 0.004);
    out.gain.exponentialRampToValueAtTime(peak * 0.42, t + 0.7);
    out.gain.setValueAtTime(peak * 0.42 * Math.pow(0.5, Math.max(0, end - t - 0.7) / 3), end);
    out.gain.exponentialRampToValueAtTime(0.0001, end + release);
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (pan) pan.pan.value = Math.max(-0.5, Math.min(0.5, (m - 62) / 30));
    out.connect(pan || dest);
    if (pan) pan.connect(dest);

    for (const detune of [-4, 4]) {
      const car = ctx.createOscillator();
      const mod = ctx.createOscillator();
      const idx = ctx.createGain();
      car.type = "sine";
      mod.type = "sine";
      car.frequency.value = f;
      car.detune.value = detune;
      mod.frequency.value = f;
      mod.detune.value = detune;
      const bark = f * (0.9 + 1.7 * vel);
      idx.gain.setValueAtTime(bark, t);
      idx.gain.exponentialRampToValueAtTime(f * 0.22, t + 0.35);
      mod.connect(idx);
      idx.connect(car.frequency);
      const part = ctx.createGain();
      part.gain.value = 0.5;
      car.connect(part);
      part.connect(out);
      car.start(t);
      mod.start(t);
      car.stop(end + release + 0.05);
      mod.stop(end + release + 0.05);
    }
    // The tine: a quiet high partial that rings briefly at the strike.
    const tine = ctx.createOscillator();
    const tg = ctx.createGain();
    tine.type = "sine";
    tine.frequency.value = f * 7.02;
    env(tg, t, 0.05 * vel, 0.002, 0.0002, 0.18);
    tine.connect(tg);
    tg.connect(out);
    tine.start(t);
    tine.stop(t + 0.3);
  });
}

/** A round, short bass note. */
/** A soft clipper: adds the upper harmonics that let a low note be heard on a small speaker. */
function softClip(ctx, drive) {
  const shaper = ctx.createWaveShaper();
  const curve = new Float32Array(513);
  for (let i = 0; i < 513; i++) curve[i] = Math.tanh(((i - 256) / 256) * drive);
  shaper.curve = curve;
  return shaper;
}

/** A warm synth bass: a triangle with its octave and fifth, lightly driven. Audible on a phone. */
export function bass(ctx, dest, when, midi, seconds, gain) {
  const f = midiToHz(midi);
  const hold = Math.max(0.15, seconds);
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.setValueAtTime(2200, when);
  lp.frequency.exponentialRampToValueAtTime(700, when + 0.45);
  const drive = softClip(ctx, 2.4);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, when);
  g.gain.exponentialRampToValueAtTime(0.75 * gain, when + 0.01);
  g.gain.exponentialRampToValueAtTime(0.5 * gain, when + 0.6);
  g.gain.setValueAtTime(0.46 * gain, when + hold);
  g.gain.exponentialRampToValueAtTime(0.0001, when + hold + 0.16);
  [["triangle", 1, 1], ["sine", 2, 0.55], ["sine", 3, 0.3]].forEach(([type, mult, level]) => {
    const o = ctx.createOscillator();
    const og = ctx.createGain();
    o.type = type;
    o.frequency.value = f * mult;
    og.gain.value = level;
    o.connect(og);
    og.connect(drive);
    o.start(when);
    o.stop(when + hold + 0.25);
  });
  drive.connect(lp);
  lp.connect(g);
  g.connect(dest);
}

function noiseHit(ctx, dest, noise, when, { type, freq, q = 0.7, peak, attack = 0.001, decay, low = null }) {
  const src = ctx.createBufferSource();
  src.buffer = noise;
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = ctx.createGain();
  env(g, when, peak, attack, 0.0001, decay);
  src.connect(f);
  let tail = f;
  if (low) {
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = low;
    f.connect(lp);
    tail = lp;
  }
  tail.connect(g);
  g.connect(dest);
  src.start(when, Math.random() * 1.5);
  src.stop(when + attack + decay + 0.05);
}

function tone(ctx, dest, when, { type = "sine", from, to, peak, decay, drop = 0.06 }) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(from, when);
  o.frequency.exponentialRampToValueAtTime(to, when + drop);
  env(g, when, peak, 0.001, 0.0001, decay);
  o.connect(g);
  g.connect(dest);
  o.start(when);
  o.stop(when + decay + 0.05);
}

const METAL = [205.3, 304.4, 369.6, 522.7, 540.0, 800.0];

/**
 * One drum hit. `style` shades the sound: lofi hits are dulled and a little shorter,
 * as if bounced to tape.
 */
export function drum(ctx, dest, noise, when, voice, gain, style = "") {
  let out = dest;
  if (style === "lofi") {
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 5200;
    lp.connect(dest);
    out = lp;
    setTimeout(() => lp.disconnect(), (when - ctx.currentTime + 1.5) * 1000);
  }
  const v = gain;
  switch (voice) {
    case "kick": {
      const deep = style === "lofi" || style === "boombap";
      tone(ctx, out, when, { from: deep ? 130 : 150, to: deep ? 44 : 52, peak: 1.0 * v, decay: deep ? 0.32 : 0.24, drop: 0.07 });
      noiseHit(ctx, out, noise, when, { type: "highpass", freq: 2500, peak: 0.12 * v, decay: 0.012 });
      break;
    }
    case "snare":
    case "ghost": {
      const ghost = voice === "ghost";
      noiseHit(ctx, out, noise, when, { type: "bandpass", freq: 1900, q: 0.6, peak: (ghost ? 0.5 : 0.85) * v, decay: ghost ? 0.07 : style === "lofi" ? 0.2 : 0.17 });
      noiseHit(ctx, out, noise, when, { type: "highpass", freq: 6000, peak: 0.12 * v, decay: 0.05 });
      if (!ghost) tone(ctx, out, when, { type: "triangle", from: 230, to: 175, peak: 0.45 * v, decay: 0.11, drop: 0.03 });
      break;
    }
    case "rim": {
      noiseHit(ctx, out, noise, when, { type: "bandpass", freq: 1700, q: 2, peak: 0.5 * v, decay: 0.03 });
      tone(ctx, out, when, { from: 620, to: 520, peak: 0.4 * v, decay: 0.05, drop: 0.01 });
      break;
    }
    case "hat":
      noiseHit(ctx, out, noise, when, { type: "highpass", freq: 7500, q: 0.5, peak: 0.38 * v, decay: 0.04 });
      break;
    case "ohat":
      noiseHit(ctx, out, noise, when, { type: "highpass", freq: 6500, q: 0.5, peak: 0.34 * v, attack: 0.002, decay: 0.3 });
      break;
    case "foot":
      noiseHit(ctx, out, noise, when, { type: "bandpass", freq: 6000, q: 0.8, peak: 0.34 * v, decay: 0.05, low: 9000 });
      tone(ctx, out, when, { from: 190, to: 120, peak: 0.12 * v, decay: 0.05, drop: 0.02 });
      break;
    case "ride": {
      const g = ctx.createGain();
      const hp = ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 5200;
      g.gain.setValueAtTime(0.0001, when);
      g.gain.exponentialRampToValueAtTime(0.22 * v, when + 0.002);
      g.gain.exponentialRampToValueAtTime(0.07 * v, when + 0.06);
      g.gain.exponentialRampToValueAtTime(0.0001, when + 0.75);
      hp.connect(g);
      g.connect(out);
      for (const f0 of METAL) {
        const o = ctx.createOscillator();
        o.type = "square";
        o.frequency.value = f0 * 1.55;
        o.connect(hp);
        o.start(when);
        o.stop(when + 0.8);
      }
      // The stick: a short tick on top of the wash.
      noiseHit(ctx, out, noise, when, { type: "bandpass", freq: 5200, q: 1.2, peak: 0.16 * v, decay: 0.02 });
      break;
    }
    case "brush":
      noiseHit(ctx, out, noise, when, { type: "bandpass", freq: 3400, q: 0.5, peak: 0.55 * v, attack: 0.07, decay: 0.25 });
      noiseHit(ctx, out, noise, when, { type: "highpass", freq: 8000, peak: 0.05 * v, attack: 0.05, decay: 0.2 });
      break;
    default:
      break;
  }
}

/** Bass synths. `kind`: "round" (soft triangle), "moog" (saw into a closing filter), "sub" (long sine). */
export function bassSynth(ctx, dest, when, midi, seconds, gain, kind = "round") {
  if (kind === "round") return bass(ctx, dest, when, midi, seconds, gain);
  const f = midiToHz(midi);
  const hold = Math.max(0.15, seconds);
  const g = ctx.createGain();
  if (kind === "sub") {
    // A long sine with a pitch drop, driven hard so its harmonics carry on a small speaker,
    // plus an octave layer.
    const o = ctx.createOscillator();
    const o2 = ctx.createOscillator();
    o.type = "sine";
    o2.type = "triangle";
    o.frequency.setValueAtTime(f * 1.8, when);
    o.frequency.exponentialRampToValueAtTime(f, when + 0.05);
    o2.frequency.setValueAtTime(f * 3.6, when);
    o2.frequency.exponentialRampToValueAtTime(f * 2, when + 0.05);
    const o2g = ctx.createGain();
    o2g.gain.value = 0.35;
    const shaper = softClip(ctx, 5);
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(0.62 * gain, when + 0.008);
    g.gain.setValueAtTime(0.55 * gain, when + hold * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, when + hold + 0.25);
    o.connect(shaper);
    o2.connect(o2g);
    o2g.connect(shaper);
    shaper.connect(g);
    g.connect(dest);
    o.start(when);
    o2.start(when);
    o.stop(when + hold + 0.3);
    o2.stop(when + hold + 0.3);
    return;
  }
  if (kind === "reese") {
    // Three detuned saws that beat against each other, a sub sine under them, and a filter that slowly closes.
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.Q.value = 2.5;
    lp.frequency.setValueAtTime(Math.min(1800, f * 8), when);
    lp.frequency.exponentialRampToValueAtTime(Math.max(140, f * 3), when + Math.max(0.4, hold));
    const shaper = softClip(ctx, 2.2);
    for (const d of [-16, 0, 16]) {
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = f;
      o.detune.value = d;
      o.connect(lp);
      o.start(when);
      o.stop(when + hold + 0.4);
    }
    const sub = ctx.createOscillator();
    const subg = ctx.createGain();
    sub.type = "sine";
    sub.frequency.value = f;
    subg.gain.value = 1.3;
    sub.connect(subg);
    subg.connect(shaper);
    lp.connect(shaper);
    shaper.connect(g);
    g.connect(dest);
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(0.34 * gain, when + 0.02);
    g.gain.setValueAtTime(0.3 * gain, when + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, when + hold + 0.3);
    sub.start(when);
    sub.stop(when + hold + 0.4);
    return;
  }
  if (kind === "acid") {
    // A single saw into a resonant filter that snaps shut: short, squelchy, a little driven.
    const o = ctx.createOscillator();
    const lp = ctx.createBiquadFilter();
    o.type = "sawtooth";
    o.frequency.value = f;
    lp.type = "lowpass";
    lp.Q.value = 15;
    lp.frequency.setValueAtTime(Math.min(5000, f * 18), when);
    lp.frequency.exponentialRampToValueAtTime(Math.max(90, f * 1.8), when + 0.22);
    const shaper = softClip(ctx, 3);
    const len = Math.min(hold, 0.45);
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(0.3 * gain, when + 0.004);
    g.gain.setValueAtTime(0.26 * gain, when + len);
    g.gain.exponentialRampToValueAtTime(0.0001, when + len + 0.06);
    o.connect(lp);
    lp.connect(shaper);
    shaper.connect(g);
    g.connect(dest);
    o.start(when);
    o.stop(when + len + 0.1);
    return;
  }
  if (kind === "fmbass") {
    // Two-operator FM, as on a DX: a hard attack that falls into a round sine.
    const car = ctx.createOscillator();
    const mod = ctx.createOscillator();
    const idx = ctx.createGain();
    car.type = "sine";
    mod.type = "sine";
    car.frequency.value = f;
    mod.frequency.value = f;
    idx.gain.setValueAtTime(f * 5, when);
    idx.gain.exponentialRampToValueAtTime(f * 0.5, when + 0.28);
    mod.connect(idx);
    idx.connect(car.frequency);
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(0.5 * gain, when + 0.004);
    g.gain.setValueAtTime(0.42 * gain, when + hold * 0.8);
    g.gain.exponentialRampToValueAtTime(0.0001, when + hold + 0.18);
    car.connect(g);
    g.connect(dest);
    car.start(when);
    mod.start(when);
    car.stop(when + hold + 0.25);
    mod.stop(when + hold + 0.25);
    return;
  }
  if (kind === "dub") {
    // A heavy, round bass for dub and deep techno: sine and triangle through a low filter, driven.
    const a = ctx.createOscillator();
    const b = ctx.createOscillator();
    const lp = ctx.createBiquadFilter();
    a.type = "sine";
    b.type = "triangle";
    a.frequency.value = f;
    b.frequency.value = f;
    b.detune.value = 4;
    lp.type = "lowpass";
    lp.frequency.value = Math.max(180, f * 3.5);
    lp.Q.value = 1.4;
    const shaper = softClip(ctx, 3.5);
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(0.55 * gain, when + 0.025);
    g.gain.setValueAtTime(0.5 * gain, when + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, when + hold + 0.22);
    a.connect(shaper);
    b.connect(lp);
    lp.connect(shaper);
    shaper.connect(g);
    g.connect(dest);
    a.start(when);
    b.start(when);
    a.stop(when + hold + 0.3);
    b.stop(when + hold + 0.3);
    return;
  }
  const saw = ctx.createOscillator();
  const sq = ctx.createOscillator();
  const lp = ctx.createBiquadFilter();
  saw.type = "sawtooth";
  sq.type = "square";
  saw.frequency.value = f;
  sq.frequency.value = f / 2;
  lp.type = "lowpass";
  lp.Q.value = 7;
  lp.frequency.setValueAtTime(Math.min(3000, f * 14), when);
  lp.frequency.exponentialRampToValueAtTime(Math.max(120, f * 1.6), when + 0.28);
  const sqg = ctx.createGain();
  sqg.gain.value = 0.5;
  g.gain.setValueAtTime(0.0001, when);
  g.gain.exponentialRampToValueAtTime(0.38 * gain, when + 0.008);
  g.gain.exponentialRampToValueAtTime(0.22 * gain, when + 0.5);
  g.gain.setValueAtTime(0.2 * gain, when + hold);
  g.gain.exponentialRampToValueAtTime(0.0001, when + hold + 0.12);
  saw.connect(lp);
  sq.connect(sqg);
  sqg.connect(lp);
  lp.connect(g);
  g.connect(dest);
  saw.start(when);
  sq.start(when);
  saw.stop(when + hold + 0.2);
  sq.stop(when + hold + 0.2);
}

/** Drawbar organ: a few sines with a soft click at the start. */
export function organ(ctx, dest, when, midis, seconds, gain) {
  const n = midis.length;
  const end = when + Math.max(0.15, seconds);
  midis.forEach((m, i) => {
    const t = when + i * 0.004;
    const f = midiToHz(m);
    const out = ctx.createGain();
    const peak = (0.22 * gain) / Math.sqrt(n);
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(peak, t + 0.012);
    out.gain.setValueAtTime(peak, end);
    out.gain.exponentialRampToValueAtTime(0.0001, end + 0.12);
    out.connect(dest);
    [[1, 1], [2, 0.7], [3, 0.35], [4, 0.2], [0.5, 0.45]].forEach(([mult, amp]) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = f * mult;
      g.gain.value = amp * 0.4;
      o.connect(g);
      g.connect(out);
      o.start(t);
      o.stop(end + 0.2);
    });
  });
}

/** A slow pad: detuned saws through a low-pass. */
export function pad(ctx, dest, when, midis, seconds, gain) {
  const n = midis.length;
  const end = when + Math.max(0.4, seconds);
  midis.forEach((m) => {
    const f = midiToHz(m);
    const out = ctx.createGain();
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = Math.min(2200, f * 5);
    lp.Q.value = 0.8;
    const peak = (0.16 * gain) / Math.sqrt(n);
    out.gain.setValueAtTime(0.0001, when);
    out.gain.exponentialRampToValueAtTime(peak, when + 0.18);
    out.gain.setValueAtTime(peak, end);
    out.gain.exponentialRampToValueAtTime(0.0001, end + 0.7);
    lp.connect(out);
    out.connect(dest);
    for (const d of [-9, 0, 9]) {
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = f;
      o.detune.value = d;
      o.connect(lp);
      o.start(when);
      o.stop(end + 0.8);
    }
  });
}

// ---- Synth keys -------------------------------------------------------------------------------
// Built the way the hardware was: several slightly detuned oscillators that drift a little, a steep (24 dB) filter
// that opens with the note, and a chorus that spreads the sound across both ears.

const pan = (ctx, node, value, dest) => {
  if (!ctx.createStereoPanner) {
    node.connect(dest);
    return;
  }
  const p = ctx.createStereoPanner();
  p.pan.value = value;
  node.connect(p);
  p.connect(dest);
};

/** A steep low-pass: two filters in series, 24 dB per octave. Returns [input, output, filters]. */
function ladder(ctx, q = 1) {
  const a = ctx.createBiquadFilter();
  const b = ctx.createBiquadFilter();
  a.type = b.type = "lowpass";
  a.Q.value = q;
  b.Q.value = 0.6;
  a.connect(b);
  return [a, b, [a, b]];
}

/**
 * Stereo chorus: two short delays swept in opposite directions, one panned left and one right, mixed with the
 * dry sound. Returns the node to feed. `end` is when the notes stop, after which the sweeps stop too.
 */
function chorus(ctx, dest, when, end, { rate = 0.6, depth = 0.0035, base = 0.016, wet = 0.7 } = {}) {
  const input = ctx.createGain();
  const dry = ctx.createGain();
  dry.gain.value = 1;
  input.connect(dry);
  dry.connect(dest);
  [-1, 1].forEach((side) => {
    const d = ctx.createDelay(0.05);
    d.delayTime.value = base;
    const lfo = ctx.createOscillator();
    const lg = ctx.createGain();
    lfo.frequency.value = rate * (side < 0 ? 1 : 1.13);
    lg.gain.value = depth * side;
    lfo.connect(lg);
    lg.connect(d.delayTime);
    const w = ctx.createGain();
    w.gain.value = wet;
    input.connect(d);
    d.connect(w);
    pan(ctx, w, side * 0.85, dest);
    lfo.start(when);
    lfo.stop(end);
  });
  return input;
}

const drift = (cents = 4) => (Math.random() * 2 - 1) * cents;

/** Warm analogue polysynth: saw and pulse oscillators with a sub, a 24 dB filter that opens on each note, a chorus. */
export function juno(ctx, dest, when, midis, seconds, gain) {
  const n = midis.length;
  const end = when + Math.max(0.3, seconds);
  const tail = end + 0.7;
  const bus = chorus(ctx, dest, when, tail + 0.2, { rate: 0.55, depth: 0.0032, base: 0.015, wet: 0.65 });
  midis.forEach((m, i) => {
    const f = midiToHz(m);
    const t0 = when + i * 0.003;
    const [fin, fout] = ladder(ctx, 2.2);
    fin.frequency.setValueAtTime(Math.min(1400, f * 2.5), t0);
    fin.frequency.exponentialRampToValueAtTime(Math.min(4800, f * 9), t0 + 0.22);
    fin.frequency.exponentialRampToValueAtTime(Math.min(2200, f * 4.2), end);
    fout.frequency.setValueAtTime(Math.min(9000, f * 14), t0);
    const out = ctx.createGain();
    const peak = (0.15 * gain) / Math.sqrt(n);
    out.gain.setValueAtTime(0.0001, t0);
    out.gain.exponentialRampToValueAtTime(peak, t0 + 0.035);
    out.gain.setTargetAtTime(peak * 0.78, t0 + 0.06, 0.5);
    out.gain.setValueAtTime(peak * 0.78, end);
    out.gain.exponentialRampToValueAtTime(0.0001, end + 0.5);
    fout.connect(out);
    out.connect(bus);
    // saw, pulse (a square), a saw a hair away for width, and a sub an octave down
    [["sawtooth", 1, 1, drift(5)], ["sawtooth", 1, 0.8, 7 + drift(3)], ["square", 1, 0.5, -5 + drift(3)], ["square", 0.5, 0.55, drift(2)]].forEach(([type, mult, a, d]) => {
      const o = ctx.createOscillator();
      const og = ctx.createGain();
      o.type = type;
      o.frequency.value = f * mult;
      o.detune.value = d;
      og.gain.value = a;
      o.connect(og);
      og.connect(fin);
      o.start(t0);
      o.stop(tail);
    });
  });
}

/** Supersaw: seven detuned saws spread across the stereo field, high-passed so low notes stay clean. */
export function supersaw(ctx, dest, when, midis, seconds, gain) {
  const n = midis.length;
  const end = when + Math.max(0.2, seconds);
  const tail = end + 0.35;
  midis.forEach((m, i) => {
    const f = midiToHz(m);
    const t0 = when + i * 0.002;
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = Math.max(60, f * 0.6);
    const [fin, fout] = ladder(ctx, 0.8);
    fin.frequency.setValueAtTime(Math.min(9000, f * 16), t0);
    fin.frequency.exponentialRampToValueAtTime(Math.min(3600, f * 7), t0 + 0.3);
    fout.frequency.value = Math.min(11000, f * 20);
    const out = ctx.createGain();
    const peak = (0.075 * gain) / Math.sqrt(n);
    out.gain.setValueAtTime(0.0001, t0);
    out.gain.exponentialRampToValueAtTime(peak, t0 + 0.012);
    out.gain.setValueAtTime(peak * 0.85, end);
    out.gain.exponentialRampToValueAtTime(0.0001, end + 0.3);
    hp.connect(fin);
    fout.connect(out);
    out.connect(dest);
    [-36, -23, -11, 0, 11, 23, 36].forEach((d, k) => {
      const o = ctx.createOscillator();
      const og = ctx.createGain();
      o.type = "sawtooth";
      o.frequency.value = f;
      o.detune.value = d + drift(1.5);
      og.gain.value = d === 0 ? 1 : 0.72;
      o.connect(og);
      pan(ctx, og, (k - 3) / 3.4, hp);
      // staggered starts stand in for random oscillator phase, so the saws do not line up into a click
      o.start(t0 + k * 0.0007);
      o.stop(tail);
    });
  });
}

/** A dark, slow drone: detuned saws and a deep sine under a 24 dB filter that breathes, with a slow chorus. */
export function drone(ctx, dest, when, midis, seconds, gain) {
  const n = midis.length;
  const hold = Math.max(1, seconds);
  const end = when + hold;
  const tail = end + 2;
  const bus = chorus(ctx, dest, when, tail + 0.2, { rate: 0.18, depth: 0.006, base: 0.02, wet: 0.8 });
  midis.forEach((m, i) => {
    const f = midiToHz(m);
    const [fin, fout] = ladder(ctx, 2.6);
    const base = Math.min(800, f * 2.4);
    fin.frequency.value = base;
    fout.frequency.value = Math.min(2400, f * 5);
    const lfo = ctx.createOscillator();
    const lg = ctx.createGain();
    lfo.frequency.value = 0.07 + 0.025 * i;
    lg.gain.value = base * 0.7;
    lfo.connect(lg);
    lg.connect(fin.frequency);
    const out = ctx.createGain();
    const peak = (0.18 * gain) / Math.sqrt(n);
    const rise = Math.min(1.1, hold * 0.45);
    out.gain.setValueAtTime(0.0001, when);
    out.gain.exponentialRampToValueAtTime(peak, when + rise);
    out.gain.setValueAtTime(peak, end);
    out.gain.exponentialRampToValueAtTime(0.0001, tail);
    fout.connect(out);
    out.connect(bus);
    [["sawtooth", -9, 1, 1], ["sawtooth", 8, 1, 1], ["sawtooth", 0, 0.7, 0.5], ["sine", 0, 1.2, 0.5], ["triangle", 3, 0.4, 2]].forEach(([type, d, a, mult]) => {
      const o = ctx.createOscillator();
      const og = ctx.createGain();
      o.type = type;
      o.frequency.value = f * mult;
      o.detune.value = d + drift(4);
      og.gain.value = a;
      o.connect(og);
      og.connect(fin);
      o.start(when);
      o.stop(tail + 0.1);
    });
    lfo.start(when);
    lfo.stop(tail + 0.1);
  });
}

/** Glass bells: DX-style FM with inharmonic partials and a tiny strike of noise, each note placed by pitch in the stereo field. */
export function glass(ctx, dest, when, midis, seconds, gain) {
  const n = midis.length;
  midis.forEach((m, i) => {
    const f = midiToHz(m + 12);
    const t = when + i * 0.012;
    const ring = Math.max(1.8, Math.min(4, seconds * 1.6));
    const out = ctx.createGain();
    const peak = (0.2 * gain) / Math.sqrt(n);
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(peak, t + 0.003);
    out.gain.exponentialRampToValueAtTime(peak * 0.25, t + 0.35);
    out.gain.exponentialRampToValueAtTime(0.0001, t + ring);
    pan(ctx, out, Math.max(-0.7, Math.min(0.7, (m - 72) / 24)), dest);
    [[1, 3.5, 2.4, 1], [2.756, 5.4, 0.8, 0.28], [5.404, 1.0, 0.4, 0.1]].forEach(([mult, ratio, index, level]) => {
      const car = ctx.createOscillator();
      const mod = ctx.createOscillator();
      const mg = ctx.createGain();
      const cg = ctx.createGain();
      car.frequency.value = f * mult;
      mod.frequency.value = f * mult * ratio;
      mg.gain.setValueAtTime(f * mult * index, t);
      mg.gain.exponentialRampToValueAtTime(f * mult * 0.04, t + ring * 0.55);
      cg.gain.value = level;
      mod.connect(mg);
      mg.connect(car.frequency);
      car.connect(cg);
      cg.connect(out);
      car.start(t);
      mod.start(t);
      car.stop(t + ring + 0.1);
      mod.stop(t + ring + 0.1);
    });
  });
}
