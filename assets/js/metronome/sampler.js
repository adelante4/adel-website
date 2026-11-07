// Plays recorded instruments and drum kits.
//
// An instrument is a handful of recorded notes with their exact pitch in a manifest. To play a
// note, the nearest recording is used and its speed is changed to reach the pitch. Notes far
// outside the recorded range move by whole octaves first, so nothing is stretched far.
//
// Loading is lazy and forgiving: a failed load leaves the caller to use the synthesized voice.

const base = (sub) => new URL(`../../audio/${sub}/`, import.meta.url);

export function createSampler(ctx) {
  const loaded = new Map(); // key -> Promise | data | null

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
    note(id, dest, when, midi, seconds, gain, trim = 1) {
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
      src.playbackRate.value = Math.pow(2, (m - best.midi) / 12);
      const g = ctx.createGain();
      const release = inst.man.release ?? 0.2;
      const hold = Math.max(0.08, seconds);
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
    /** One drum hit from a kit. Returns false if the kit or the voice is missing. */
    drum(id, dest, when, voice, gain) {
      const kit = get("kits", id);
      const v = kit?.voices[voice];
      if (!v) return false;
      const layer = Math.min(v.layers - 1, Math.floor(Math.min(0.999, gain) * v.layers));
      const pool = v.hits.filter((h) => h.layer === layer);
      const hit = pool[v.next++ % pool.length];
      const src = ctx.createBufferSource();
      src.buffer = hit.buffer;
      const g = ctx.createGain();
      g.gain.value = Math.min(1.2, 0.55 + gain * 0.6);
      src.connect(g);
      g.connect(dest);
      src.start(when);
      return true;
    },
  };
}
