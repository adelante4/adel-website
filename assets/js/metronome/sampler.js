// Plays recorded instruments and drum kits.
//
// An instrument is a handful of recorded notes with their exact pitch in a manifest. To play a
// note, the nearest recording is used and its speed is changed to reach the pitch. Notes far
// outside the recorded range move by whole octaves first, so nothing is stretched far.
//
// Loading is lazy and forgiving: a failed load leaves the caller to use the synthesized voice.

const base = (sub) => new URL(`../../audio/${sub}/`, import.meta.url);

const CYMBAL = new Set(["hat", "ohat", "foot", "ride", "brush"]);

export function createSampler(ctx) {
  const loaded = new Map(); // key -> Promise | data | null
  const rooms = new WeakMap(); // destination node -> its room reverb

  /** A short, soft room made of decaying noise, different in each ear. One per destination. */
  function roomFor(dest) {
    let conv = rooms.get(dest);
    if (conv) return conv;
    const len = Math.floor(ctx.sampleRate * 0.4);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      let seed = 12345 + c * 777;
      let lp = 0;
      for (let i = 0; i < len; i++) {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        const n = seed / 2147483648 - 1;
        lp += (n - lp) * (0.5 - 0.4 * (i / len)); // darker as it decays
        d[i] = lp * Math.exp((-6.5 * i) / len) * (i < 40 ? i / 40 : 1);
      }
    }
    conv = ctx.createConvolver();
    conv.buffer = ir;
    conv.connect(dest);
    rooms.set(dest, conv);
    return conv;
  }

  async function fetchBuffer(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`missing ${url}`);
    return ctx.decodeAudioData(await res.arrayBuffer());
  }

  function load(kind, id) {
    const key = `${kind}/${id}`;
    if (loaded.has(key)) return loaded.get(key) instanceof Promise ? loaded.get(key) : Promise.resolve(loaded.get(key));
    const dir = new URL(`${id}/`, base(kind));
    const p = (async () => {
      const man = await (await fetch(new URL("manifest.json", dir))).json();
      if (kind === "inst") {
        const notes = await Promise.all(man.notes.map(async (n) => ({ midi: n.midi, buffer: await fetchBuffer(new URL(n.file, dir)) })));
        return { man, notes: notes.sort((a, b) => a.midi - b.midi) };
      }
      const voices = {};
      for (const [v, d] of Object.entries(man.voices)) {
        const hits = await Promise.all(d.hits.map(async (h) => ({ layer: h.layer, buffer: await fetchBuffer(new URL(h.file, dir)) })));
        voices[v] = { layers: d.layers, hits, next: 0 };
      }
      return { man, voices };
    })().then(
      (data) => {
        loaded.set(key, data);
        return data;
      },
      () => {
        loaded.set(key, null);
        return null;
      },
    );
    loaded.set(key, p);
    return p;
  }
  const get = (kind, id) => {
    const v = loaded.get(`${kind}/${id}`);
    return v && !(v instanceof Promise) ? v : null;
  };

  return {
    loadInstrument: (id) => load("inst", id),
    loadKit: (id) => load("kits", id),
    hasInstrument: (id) => get("inst", id) !== null,
    hasKit: (id) => get("kits", id) !== null,
    kitHas(id, voice) {
      const k = get("kits", id);
      return Boolean(k && k.voices[voice]);
    },
    /** Returns false if the instrument is not loaded, so the caller can use a synth. */
    note(id, dest, when, midi, seconds, gain, trim = 1, opts = {}) {
      const inst = get("inst", id);
      if (!inst) return false;
      const lo = inst.notes[0].midi;
      const hi = inst.notes[inst.notes.length - 1].midi;
      let m = midi;
      while (m < lo - 4) m += 12;
      while (m > hi + 4) m -= 12;
      let best = inst.notes[0];
      for (const n of inst.notes) if (Math.abs(n.midi - m) < Math.abs(best.midi - m)) best = n;
      const src = ctx.createBufferSource();
      src.buffer = best.buffer;
      const rate = Math.pow(2, (m - best.midi) / 12);
      const g = ctx.createGain();
      // Short notes release faster, so a run of them does not smear. opts.rel caps the release.
      const release = Math.min(inst.man.release ?? 0.2, opts.rel ?? 9);
      const hold = Math.max(0.08, seconds);
      if (opts.slide) {
        // Glides up into the note from below.
        src.playbackRate.setValueAtTime(rate * Math.pow(2, -opts.slide / 12), when);
        src.playbackRate.exponentialRampToValueAtTime(rate, when + 0.07);
      } else if (opts.fall) {
        // The pitch sags away over the end of the note.
        src.playbackRate.setValueAtTime(rate, when + hold * 0.55);
        src.playbackRate.exponentialRampToValueAtTime(rate * Math.pow(2, -opts.fall / 12), when + hold + release);
      } else src.playbackRate.value = rate;
      const level = Math.max(0.0002, gain * trim);
      g.gain.setValueAtTime(0.0001, when);
      g.gain.exponentialRampToValueAtTime(level, when + 0.003);
      g.gain.setValueAtTime(level, when + hold);
      g.gain.exponentialRampToValueAtTime(0.0001, when + hold + release);
      src.connect(g);
      g.connect(dest);
      src.start(when);
      src.stop(when + hold + release + 0.05);
      return true;
    },
    /**
     * One drum hit from a kit. Returns false if the kit or the voice is missing.
     * Hits blend the two nearest velocity layers, so loudness moves the tone smoothly; each hit is a hair off in
     * pitch so repeats are not identical; a short synthetic room gives the dry recordings some air and width;
     * and cymbals lose the harshest top. `level` evens out the voices of a kit against each other.
     */
    drum(id, dest, when, voice, gain, level = 1) {
      const kit = get("kits", id);
      const v = kit?.voices[voice];
      if (!v) return false;
      const pos = Math.min(0.999, Math.max(0, gain)) * v.layers - 0.5;
      const lo = Math.max(0, Math.min(v.layers - 1, Math.floor(pos)));
      const hi = Math.min(v.layers - 1, lo + 1);
      const f = lo === hi ? 0 : Math.min(1, Math.max(0, pos - lo));
      const rate = 1 + (Math.random() - 0.5) * 0.008;
      const out = ctx.createGain();
      out.gain.value = Math.min(1.2, 0.55 + gain * 0.6) * level;
      let head = out;
      if (CYMBAL.has(voice)) {
        const lp = ctx.createBiquadFilter();
        lp.type = "lowpass";
        lp.frequency.value = 11000;
        lp.Q.value = 0.5;
        lp.connect(out);
        head = lp;
      }
      for (const [layer, w] of [[lo, Math.cos((f * Math.PI) / 2)], [hi, Math.sin((f * Math.PI) / 2)]]) {
        if (w < 0.02) continue;
        const pool = v.hits.filter((h) => h.layer === layer);
        const hit = pool[v.next++ % pool.length];
        const src = ctx.createBufferSource();
        src.buffer = hit.buffer;
        src.playbackRate.value = rate;
        const g = ctx.createGain();
        g.gain.value = w;
        src.connect(g);
        g.connect(head);
        src.start(when);
      }
      out.connect(dest);
      const send = ctx.createGain();
      send.gain.value = CYMBAL.has(voice) ? 0.08 : 0.16;
      out.connect(send);
      send.connect(roomFor(dest));
      return true;
    },
  };
}
