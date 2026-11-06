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
import { rhodes, bass, drum, makeNoise, makeImpulse, makeDust } from "./voices.js?v=20261106d";

const SAMPLE_VOICES = ["woodblock", "claves", "log", "frame", "brake"];
const FILE = { woodblock: "wood", claves: "claves", log: "log", frame: "frame", brake: "brake" };
const KINDS = ["accent", "beat", "sub"];
const SAMPLE_DIR = new URL("../../audio/clicks/", import.meta.url);

export function createAudio() {
  let ctx = null;
  let master = null;
  let reverbIn = null;
  let noise = null;
  let dustBuf = null;
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
    // A small room shared by the piano and the drums.
    reverbIn = ctx.createGain();
    const room = ctx.createConvolver();
    room.buffer = makeImpulse(ctx);
    const roomOut = ctx.createGain();
    roomOut.gain.value = 0.55;
    reverbIn.connect(room);
    room.connect(roomOut);
    roomOut.connect(master);
    noise = makeNoise(ctx);
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
    /**
     * The buses for one run: click, chords and groove each have their own level, so Stop can
     * silence everything already queued and the mix can change while playing.
     */
    createRun(mix = { click: 1, chords: 0.7, groove: 0.8 }) {
      ensure();
      const run = ctx.createGain();
      run.connect(master);
      const clickBus = ctx.createGain();
      clickBus.connect(run);
      // Piano: a soft low-pass tames the FM brightness before it reaches the mix.
      const chordBus = ctx.createGain();
      const chordTone = ctx.createBiquadFilter();
      chordTone.type = "lowpass";
      chordTone.frequency.value = 4200;
      chordBus.connect(chordTone);
      chordTone.connect(run);
      const chordSend = ctx.createGain();
      chordSend.gain.value = 0.22;
      chordTone.connect(chordSend);
      chordSend.connect(reverbIn);
      const grooveBus = ctx.createGain();
      grooveBus.connect(run);
      const grooveSend = ctx.createGain();
      grooveSend.gain.value = 0.12;
      grooveBus.connect(grooveSend);
      grooveSend.connect(reverbIn);
      let dust = null;
      const setMix = (m) => {
        clickBus.gain.value = m.click;
        chordBus.gain.value = m.chords;
        grooveBus.gain.value = m.groove;
        if (dust) dust.gain.value = 0.5 * m.groove;
      };
      setMix(mix);
      return {
        out: clickBus,
        chords: chordBus,
        groove: grooveBus,
        setMix,
        /** Vinyl dust under the groove. */
        setDust(on, level = 0.8) {
          if (on && !dust) {
            dustBuf = dustBuf || makeDust(ctx);
            const src = ctx.createBufferSource();
            src.buffer = dustBuf;
            src.loop = true;
            const hp = ctx.createBiquadFilter();
            hp.type = "highpass";
            hp.frequency.value = 600;
            dust = ctx.createGain();
            dust.gain.value = 0.5 * level;
            src.connect(hp);
            hp.connect(dust);
            dust.connect(run);
            src.start();
            dust.src = src;
          } else if (!on && dust) {
            const d = dust;
            dust = null;
            d.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
            setTimeout(() => {
              d.src.stop();
              d.disconnect();
            }, 400);
          }
        },
        stop() {
          const t = ctx.currentTime;
          run.gain.cancelScheduledValues(t);
          run.gain.setValueAtTime(0, t);
          this.setDust(false);
          setTimeout(() => run.disconnect(), 400);
        },
        /** Let what is already sounding finish, then free the nodes. */
        end(ms = 3000) {
          this.setDust(false);
          setTimeout(() => run.disconnect(), ms);
        },
      };
    },
    chord(run, when, notes, seconds, gain) {
      rhodes(ctx, run.chords, when, notes, seconds, gain);
    },
    bass(run, when, midi, seconds, gain) {
      bass(ctx, run.chords, when, midi, seconds, gain);
    },
    drum(run, when, voice, gain, style) {
      drum(ctx, run.groove, noise, when, voice, gain, style);
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
