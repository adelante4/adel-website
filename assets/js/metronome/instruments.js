// The sound catalog: which instruments and kits exist, and what to call them.
// No Web Audio in here, so the page, the share codec and the tests can all read it.
//
// `synth: true` voices are made in code. The others are recordings under assets/audio/,
// loaded the first time they are chosen. All recordings are CC0 (see the LICENSE files).

export const KEYS = [
  { id: "rhodes", name: "Rhodes", trim: 0.947, synth: true, note: "Electric piano made in code. Warm and round." },
  { id: "fmpiano", name: "FM piano", trim: 1.188, note: "A Yamaha TX81Z patch, recorded from the hardware. Glassy 80s electric piano." },
  { id: "upright", name: "Upright", trim: 1.157, note: "A Yamaha upright. Close and a little dusty." },
  { id: "vibes", name: "Vibraphone", trim: 1.003, note: "Soft mallets. Sits high, so voicings are lifted an octave." },
  { id: "clavisynth", name: "Clav", trim: 1.201, note: "A TX81Z pluck with a clavinet bite. Best with Push or On 1." },
  { id: "organ", name: "Organ", trim: 1.074, synth: true, note: "Drawbar organ made in code." },
  { id: "pad", name: "Pad", trim: 0.774, synth: true, note: "A slow, warm synth pad. Pairs with Sustain." },
];

export const BASSES = [
  { id: "doublebass", name: "Double bass", trim: 0.269, note: "A 1958 Otto Rubner upright bass, plucked. Woody, with a short decay." },
  { id: "fashionbass", name: "Round bass", trim: 0.623, note: "A roundwound bass, direct. Clear and punchy." },
  { id: "swagbass", name: "Fabric bass", trim: 0.599, note: "A bass in a fabric finish. Soft and thumpy, good for lofi." },
  { id: "moog", name: "Synth bass", trim: 0.458, synth: true, note: "Sawtooth through a closing filter." },
  { id: "sub", name: "Sub 808", trim: 0.18, synth: true, note: "A long, driven sine with an octave layer. Use with Halftime or Sub." },
  { id: "round", name: "Warm synth", trim: 0.155, synth: true, note: "A triangle bass with its octave and fifth, lightly driven. Easy to hear on a phone." },
];

export const KITS = [
  { id: "synth", name: "Synth kit", synth: true, note: "Made in code. Follows any tempo." },
  { id: "rusty", name: "Rusty jazz kit", note: "A big old kit with real brushes, ride and hats." },
  { id: "gogodze", name: "70s lofi kit", note: "A dry, dull kit modelled on a 1970s record. Has no ride or brushes, so those stay synthesized." },
];

export const ids = (list) => list.map((x) => x.id);

// Loudness trims, measured by rendering each sound through the real engine and matching them to one
// reference level (K-weighted, about -22 LUFS at full bus level). Keys and bass multiply by `trim`;
// drums by the kit and style. Re-measure after changing a voice.
export const DRUM_TRIM = {"synth": {"lofi": 0.759, "dilla": 0.842, "halftime": 0.75, "boombap": 0.692, "jazz": 1.556, "brushes": 1.861, "bossa": 0.848, "shuffle": 0.829, "funk": 0.786, "waltz": 1.696}, "rusty": {"lofi": 0.84, "dilla": 0.802, "halftime": 0.942, "boombap": 0.755, "jazz": 0.758, "brushes": 0.775, "bossa": 0.635, "shuffle": 0.886, "funk": 0.745, "waltz": 0.787}, "gogodze": {"lofi": 0.479, "dilla": 0.454, "halftime": 0.523, "boombap": 0.439, "jazz": 0.765, "brushes": 0.854, "bossa": 0.398, "shuffle": 0.516, "funk": 0.418, "waltz": 1.048}};
export const trimOf = (list, id) => list.find((x) => x.id === id)?.trim ?? 1;
export const drumTrim = (kit, style) => DRUM_TRIM[kit]?.[style] ?? 1;
