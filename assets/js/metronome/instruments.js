// The sound catalog: which instruments and kits exist, and what to call them.
// No Web Audio in here, so the page, the share codec and the tests can all read it.
//
// `synth: true` voices are made in code. The others are recordings under assets/audio/,
// loaded the first time they are chosen. All recordings are CC0 (see the LICENSE files).

export const KEYS = [
  { id: "rhodes", name: "Rhodes", trim: 0.952, synth: true, note: "Electric piano made in code. Warm and round." },
  { id: "grand", name: "Grand piano", trim: 1.676, note: "A Steinway B grand, recorded close. Full and natural: the normal piano." },
  { id: "kawai", name: "Studio grand", trim: 1.786, note: "A Kawai grand. Softer and rounder than the Steinway, good for ballads." },
  { id: "fmpiano", name: "FM piano", trim: 1.194, note: "A Yamaha TX81Z patch, recorded from the hardware. Glassy 80s electric piano." },
  { id: "upright", name: "Upright", trim: 1.163, note: "A Yamaha upright. Close and a little dusty." },
  { id: "vibes", name: "Vibraphone", trim: 1.007, note: "Soft mallets. Sits high, so voicings are lifted an octave." },
  { id: "clavisynth", name: "Clav", trim: 1.207, note: "A TX81Z pluck with a clavinet bite. Best with Push or On 1." },
  { id: "organ", name: "Organ", trim: 1.079, synth: true, note: "Drawbar organ made in code." },
  { id: "harpsichord", name: "Harpsichord", trim: 1.574, note: "An English harpsichord. Plucked and bright, no sustain pedal." },
  { id: "harp", name: "Concert harp", trim: 1.197, note: "A concert harp. Rolled chords sound natural here." },
  { id: "marimba", name: "Marimba", trim: 1.062, note: "Wooden bars. Warm and dry, best with Push or Two-feel." },
  { id: "kalimba", name: "Kalimba", trim: 3.958, note: "A Kenyan thumb piano. Small, bell-like and lofi." },
  { id: "pad", name: "Pad", trim: 0.778, synth: true, note: "A slow, warm synth pad. Pairs with Sustain." },
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
  { id: "gogoroom", name: "70s room kit", note: "The same 70s drums, recorded through the window and overhead mics. Big, airy, a little far away. Has no ride or brushes." },
  { id: "gogoretro", name: "Dusty tape kit", note: "The 70s drums through the retro mic: crushed, warm and grainy. Made for lofi. Has no ride or brushes." },
  { id: "swirly", name: "Studio kit", note: "A full acoustic kit with a big kick, a lively snare, a real ride and brush sweeps. Works with any style." },
  { id: "hands", name: "Cajon and hands", note: "Cajon, bongos, djembe, darbouka and a cowbell for the ride. Quiet and warm. Best with bossa, funk and lofi." },
];

export const ids = (list) => list.map((x) => x.id);

// Loudness trims, measured by rendering each sound through the real engine and matching them to one
// reference level (K-weighted, about -22 LUFS at full bus level). Keys and bass multiply by `trim`;
// drums by the kit and style. Re-measure after changing a voice.
export const DRUM_TRIM = {"synth": {"lofi": 0.764, "dilla": 0.846, "halftime": 0.753, "boombap": 0.695, "jazz": 1.562, "brushes": 1.873, "bossa": 0.852, "shuffle": 0.833, "funk": 0.789, "waltz": 1.705}, "rusty": {"lofi": 0.843, "dilla": 0.806, "halftime": 0.947, "boombap": 0.758, "jazz": 0.762, "brushes": 0.779, "bossa": 0.637, "shuffle": 0.891, "funk": 0.748, "waltz": 0.791}, "gogodze": {"lofi": 0.481, "dilla": 0.456, "halftime": 0.525, "boombap": 0.441, "jazz": 0.768, "brushes": 0.859, "bossa": 0.391, "shuffle": 0.518, "funk": 0.42, "waltz": 1.053}, "gogoroom": {"lofi": 0.872, "dilla": 0.796, "halftime": 0.8, "boombap": 0.79, "jazz": 1.45, "brushes": 1.687, "bossa": 0.826, "shuffle": 0.825, "funk": 0.777, "waltz": 1.69}, "gogoretro": {"lofi": 0.473, "dilla": 0.432, "halftime": 0.515, "boombap": 0.435, "jazz": 1.12, "brushes": 0.923, "bossa": 0.425, "shuffle": 0.493, "funk": 0.418, "waltz": 1.505}, "swirly": {"lofi": 0.603, "dilla": 0.553, "halftime": 0.57, "boombap": 0.535, "jazz": 1.558, "brushes": 0.799, "bossa": 0.509, "shuffle": 0.551, "funk": 0.528, "waltz": 2.0}, "hands": {"lofi": 1.117, "dilla": 1.036, "halftime": 1.134, "boombap": 0.996, "jazz": 1.665, "brushes": 1.961, "bossa": 1.112, "shuffle": 1.036, "funk": 0.966, "waltz": 1.797}};
export const trimOf = (list, id) => list.find((x) => x.id === id)?.trim ?? 1;
export const drumTrim = (kit, style) => DRUM_TRIM[kit]?.[style] ?? 1;
