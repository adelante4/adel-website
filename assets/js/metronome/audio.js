// Web Audio side of the metronome: one context, one master chain, synthesized clicks.
//
// Clicks are made from a short oscillator burst with a quick pitch drop and an exponential
// decay, so there are no sample files to load. Each run gets its own gain node, which lets
// Stop silence clicks that are already queued.

const SOUNDS = {
  tock: {
    wave: "triangle",
    freq: { accent: 1500, beat: 1000, sub: 760 },
    decay: { accent: 0.06, beat: 0.05, sub: 0.035 },
    drop: 1.35,
  },
  wood: {
    wave: "sine",
    freq: { accent: 1900, beat: 1250, sub: 950 },
    decay: { accent: 0.035, beat: 0.03, sub: 0.022 },
    drop: 1.9,
  },
  soft: {
    wave: "sine",
    freq: { accent: 880, beat: 660, sub: 520 },
    decay: { accent: 0.1, beat: 0.085, sub: 0.06 },
    drop: 1.05,
  },
};

// Recorded hits (Versilian Community Sample Library, CC0). Each voice has three files.
const SAMPLE_VOICES = ["woodblock", "claves", "log", "frame", "brake"];
const FILE = { woodblock: "wood", claves: "claves", log: "log", frame: "frame", brake: "brake" };
const KINDS = ["accent", "beat", "sub"];
const SAMPLE_DIR = new URL("../../audio/clicks/", import.meta.url);

export function createAudio() {
  let ctx = null;
  let master = null;
  /** voice -> kind -> AudioBuffer, or a promise while loading */
  const buffers = new Map();

  function load(voice) {
    if (buffers.has(voice)) return buffers.get(voice);
    const done = Promise.all(
      KINDS.map(async (k) => {
        const res = await fetch(new URL(`${FILE[voice]}-${k}.wav`, SAMPLE_DIR));
        if (!res.ok) throw new Error("sample missing");
        return ctx.decodeAudioData(await res.arrayBuffer());
      }),
    ).then(
      (list) => buffers.set(voice, Object.fromEntries(KINDS.map((k, i) => [k, list[i]]))),
      () => buffers.set(voice, null), // fall back to the synthesized click
    );
    buffers.set(voice, done);
    return done;
  }

  function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) throw new Error("This browser has no Web Audio.");
    ctx = new AC({ latencyHint: "interactive" });
    master = ctx.createGain();
    master.gain.value = 0.9;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    comp.attack.value = 0.003;
    comp.release.value = 0.15;
    master.connect(comp);
    comp.connect(ctx.destination);
    return ctx;
  }

  return {
    ensure,
    get ctx() {
      return ctx;
    },
    /** Must be called from a click or key press the first time. */
    async resume() {
      ensure();
      if (ctx.state !== "running") await ctx.resume();
      return ctx;
    },
    /** Start loading a voice's recordings. Safe to call often. Synth voices need nothing. */
    preload(sound) {
      if (!SAMPLE_VOICES.includes(sound)) return Promise.resolve();
      ensure();
      return load(sound);
    },
    /** Seconds between a sound being scheduled and reaching the speakers, as the browser reports it. */
    outputLatency() {
      return ctx ? (ctx.outputLatency || 0) + (ctx.baseLatency || 0) : 0;
    },
    /** A gain node for one run. Call .stop() to silence what is already queued. */
    createRun() {
      ensure();
      const gain = ctx.createGain();
      gain.connect(master);
      return {
        out: gain,
        stop() {
          const t = ctx.currentTime;
          gain.gain.cancelScheduledValues(t);
          gain.gain.setValueAtTime(0, t);
          setTimeout(() => gain.disconnect(), 120);
        },
      };
    },
    /** Schedule one click at an audio-clock time. kind is "accent", "beat" or "sub". */
    click(run, when, kind, gain, sound) {
      if (SAMPLE_VOICES.includes(sound)) {
        const set = buffers.get(sound);
        if (set && !(set instanceof Promise)) {
          const src = ctx.createBufferSource();
          const env = ctx.createGain();
          src.buffer = set[kind] || set.beat;
          env.gain.value = Math.max(0.0002, gain);
          src.connect(env);
          env.connect(run.out);
          src.start(when);
          return;
        }
        load(sound); // not ready yet: this click is synthesized, the next ones are recorded
        sound = "tock";
      }
      const s = SOUNDS[sound] || SOUNDS.tock;
      const f = s.freq[kind] ?? s.freq.beat;
      const decay = s.decay[kind] ?? s.decay.beat;
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      osc.type = s.wave;
      osc.frequency.setValueAtTime(f * s.drop, when);
      osc.frequency.exponentialRampToValueAtTime(f, when + 0.008);
      env.gain.setValueAtTime(0.0001, when);
      env.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain * 0.9), when + 0.002);
      env.gain.exponentialRampToValueAtTime(0.0001, when + decay);
      osc.connect(env);
      env.connect(run.out);
      osc.start(when);
      osc.stop(when + decay + 0.03);
    },
  };
}
