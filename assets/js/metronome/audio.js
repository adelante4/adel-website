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
import { rhodes, bass, bassSynth, organ, pad, drum, makeNoise, makeImpulse, makeDust } from "./voices.js?v=20261108b";
import { createSampler } from "./sampler.js?v=20261108b";
import { KEYS, BASSES, trimOf, drumTrim } from "./instruments.js?v=20261108b";

const SYNTH_KEYS = new Set(["rhodes", "organ", "pad"]);
const SYNTH_BASS = new Set(["round", "moog", "sub"]);
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
  let sampler = null;
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

  // iPhones mute Web Audio while the ring switch is on silent. Declaring a "playback" session
  // (iOS 17+) or playing a silent <audio> element (older iOS) lets the sound through.
  let keepAlive = null;
  function unlockSilentSwitch() {
    try {
      if (navigator.audioSession) navigator.audioSession.type = "playback";
    } catch {}
    try {
      if (!keepAlive) {
        const n = 800;
        const buf = new Uint8Array(44 + n * 2);
        const v = new DataView(buf.buffer);
        const w = (o, t) => [...t].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
        w(0, "RIFF"); v.setUint32(4, 36 + n * 2, true); w(8, "WAVEfmt "); v.setUint32(16, 16, true);
        v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, 8000, true);
        v.setUint32(28, 16000, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
        w(36, "data"); v.setUint32(40, n * 2, true);
        keepAlive = new Audio(URL.createObjectURL(new Blob([buf], { type: "audio/wav" })));
        keepAlive.loop = true;
        keepAlive.volume = 0.01;
      }
      keepAlive.play().catch(() => {});
    } catch {}
  }

  /** A bus with a fixed trim in front of it, so each sound sits at the same loudness. */
  function via(run, bus, v) {
    if (v === 1) return run[bus];
    const key = `${bus}${v}`;
    let g = run.trims.get(key);
    if (!g) {
      g = ctx.createGain();
      g.gain.value = v;
      g.connect(run[bus]);
      run.trims.set(key, g);
    }
    return g;
  }

  function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) throw new Error("This browser has no Web Audio.");
    ctx = new AC({ latencyHint: "interactive" });
    master = ctx.createGain();
    master.gain.value = 0.8;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    comp.attack.value = 0.003;
    comp.release.value = 0.15;
    // A fast limiter after the compressor keeps a full band from clipping.
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -3;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.001;
    limiter.release.value = 0.08;
    master.connect(comp);
    comp.connect(limiter);
    limiter.connect(ctx.destination);
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
    sampler = createSampler(ctx);
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
      unlockSilentSwitch();
      if (ctx.state !== "running") {
        // iOS can leave the context "suspended" or "interrupted"; try again before giving up.
        for (let i = 0; i < 3 && ctx.state !== "running"; i++) {
          await Promise.race([ctx.resume().catch(() => {}), new Promise((r) => setTimeout(r, 400))]);
        }
      }
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
    createRun(mix = { click: 0.7, chords: 0.7, bass: 0.7, groove: 0.7 }) {
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
      const bassBus = ctx.createGain();
      bassBus.connect(run);
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
        bassBus.gain.value = m.bass ?? 0.6;
        grooveBus.gain.value = m.groove;
        if (dust) dust.gain.value = 0.5 * m.groove;
      };
      setMix(mix);
      return {
        trims: new Map(),
        out: clickBus,
        chords: chordBus,
        bass: bassBus,
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
    /** Start loading recordings. Safe to call often; synth voices need nothing. */
    preloadBand({ keys, bass: bassId, kit } = {}) {
      ensure();
      const jobs = [];
      if (keys && !SYNTH_KEYS.has(keys)) jobs.push(sampler.loadInstrument(keys));
      if (bassId && !SYNTH_BASS.has(bassId)) jobs.push(sampler.loadInstrument(bassId));
      if (kit && kit !== "synth") jobs.push(sampler.loadKit(kit));
      return Promise.all(jobs);
    },
    chord(run, when, notes, seconds, gain, id = "rhodes") {
      const out = via(run, "chords", trimOf(KEYS, id));
      if (id === "organ") return organ(ctx, out, when, notes, seconds, gain);
      if (id === "pad") return pad(ctx, out, when, notes, seconds, gain);
      if (id !== "rhodes") {
        // A recorded instrument plays each note on its own; the strum is a few milliseconds.
        let ok = true;
        notes.forEach((m, i) => {
          ok = sampler.note(id, out, when + i * 0.006, m, seconds, (gain * 0.9) / Math.sqrt(notes.length) * 0.65) && ok;
        });
        if (ok) return;
      }
      rhodes(ctx, out, when, notes, seconds, gain);
    },
    bass(run, when, midi, seconds, gain, id = "round") {
      const out = via(run, "bass", trimOf(BASSES, id));
      if (SYNTH_BASS.has(id)) return bassSynth(ctx, out, when, midi, seconds, gain, id);
      if (sampler.note(id, out, when, midi, seconds, gain * (id === "doublebass" ? 1.7 : 1.1))) return;
      bassSynth(ctx, via(run, "bass", trimOf(BASSES, "round")), when, midi, seconds, gain, "round");
    },
    drum(run, when, voice, gain, style, kit = "synth") {
      const out = via(run, "groove", drumTrim(kit, style));
      if (kit !== "synth" && sampler.drum(kit, out, when, voice, gain)) return;
      drum(ctx, out, noise, when, voice, gain, kit === "synth" ? style : "");
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
