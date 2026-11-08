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
  { id: "strings", name: "Strings", trim: 1.505, note: "A real string section: cellos, violas and violins, sustained with vibrato. Lush under ballads. Use with Sustain." },
  { id: "horn", name: "French horn", trim: 1.659, note: "A solo French horn, warm and round. Best with Sustain on slow tunes." },
  { id: "trumpet", name: "Trumpet", trim: 0.96, note: "A trumpet with a little vibrato. Bright. Best with Push or On 1." },
  { id: "pipeorgan", name: "Pipe organ", trim: 1.568, note: "A church pipe organ, quiet stops. Big and still. Use with Sustain." },
  { id: "juno", name: "Analog poly", trim: 0.555, synth: true, note: "A warm 80s polysynth: saw, pulse and sub oscillators that drift a little, a 24 dB filter that opens on each note, and a stereo chorus. Pairs with Sustain or Push." },
  { id: "supersaw", name: "Supersaw", trim: 1.353, synth: true, note: "Seven detuned saws spread across both ears. Bright and huge. For stabs in house, trance and IDM." },
  { id: "drone", name: "Dark drone", trim: 0.328, synth: true, note: "A deep, slow pad whose filter breathes by itself, with a slow chorus. Ambient and Hecker-like. Use with Sustain." },
  { id: "glass", name: "Glass bells", trim: 1.925, synth: true, note: "FM bells that ring and fade, spread across the stereo field by pitch. Cold and bright, an octave up. Good with Arp." },
  { id: "pad", name: "Pad", trim: 0.778, synth: true, note: "A slow, warm synth pad. Pairs with Sustain." },
];

export const BASSES = [
  { id: "doublebass", name: "Double bass", trim: 0.269, note: "A 1958 Otto Rubner upright bass, plucked. Woody, with a short decay." },
  { id: "fashionbass", name: "Round bass", trim: 0.623, note: "A roundwound bass, direct. Clear and punchy." },
  { id: "swagbass", name: "Fabric bass", trim: 0.599, note: "A bass in a fabric finish. Soft and thumpy, good for lofi." },
  { id: "moog", name: "Synth bass", trim: 0.458, synth: true, note: "Sawtooth through a closing filter." },
  { id: "sub", name: "Sub 808", trim: 0.18, synth: true, note: "A long, driven sine with an octave layer. Use with Halftime or Sub." },
  { id: "reese", name: "Reese", trim: 0.287, synth: true, note: "Detuned saws that beat against each other over a sub. Deep and moving, for dnb, garage and techno." },
  { id: "acid", name: "Acid", trim: 0.394, synth: true, note: "A saw into a squelching, resonant filter. Short notes. Use with Roots or Funk." },
  { id: "fmbass", name: "FM bass", trim: 0.298, synth: true, note: "A DX-style bass: a hard FM attack falling into a round sine." },
  { id: "dub", name: "Dub sub", trim: 0.173, synth: true, note: "A heavy, round, driven low end for dub and deep techno. Slow attack, long notes." },
  { id: "round", name: "Warm synth", trim: 0.155, synth: true, note: "A triangle bass with its octave and fifth, lightly driven. Easy to hear on a phone." },
];

export const KITS = [
  { id: "synth", name: "Synth kit", synth: true, note: "Made in code. Follows any tempo." },
  { id: "rusty", name: "Rusty jazz kit", note: "A big old kit with real brushes, ride and hats." },
  { id: "gogodze", name: "70s lofi kit", note: "A dry, dull kit modelled on a 1970s record. Has no ride or brushes, so those stay synthesized." },
  { id: "gogoroom", name: "70s room kit", note: "The same 70s drums, recorded through the window and overhead mics. Big, airy, a little far away. Has no ride or brushes." },
  { id: "gogoretro", name: "Dusty tape kit", note: "The 70s drums through the retro mic: crushed, warm and grainy. Made for lofi. Has no ride or brushes." },
  { id: "swirly", name: "Studio kit", note: "A full acoustic kit with a big kick, a lively snare, a real ride and brush sweeps. Works with any style." },
  { id: "bebop", name: "Jazz sticks kit", note: "A small jazz kit played with sticks: a dry flat ride, a soft kick with the snares off, crisp hats and a muted snare for comping. Made for swing and waltz. Has no brushes, so those stay synthesized." },
  { id: "tr808", name: "808 machine", note: "The classic drum machine: a long booming kick, a tuned snare, clap, snappy hats and a cowbell on the ride. Made in code. Made for trap, halftime, lofi and funk." },
  { id: "tr909", name: "909 machine", note: "The club drum machine: a hard punchy kick, a snappy snare, a four-burst clap and bright hats. Made in code. Made for house and anything driving." },
  { id: "hands", name: "Cajon and hands", note: "Cajon, bongos, djembe, darbouka and a cowbell for the ride. Quiet and warm. Best with bossa, funk and lofi." },
];

export const ids = (list) => list.map((x) => x.id);

// Loudness trims, measured by rendering each sound through the real engine and matching them to one
// reference level (K-weighted, about -22 LUFS at full bus level). Keys and bass multiply by `trim`;
// drums by the kit and style. Re-measure after changing a voice.
export const DRUM_TRIM = {"synth": {"lofi": 0.764, "dilla": 0.846, "halftime": 0.753, "boombap": 0.695, "jazz": 1.562, "brushes": 1.873, "bossa": 0.852, "shuffle": 0.833, "funk": 0.789, "waltz": 1.705, "trap": 0.714, "house": 0.709, "techno": 0.717, "twostep": 0.857, "idm": 0.824, "minimal": 0.731, "five4": 1.649, "five8": 0.819, "seven223": 0.807, "seven322": 0.918, "nine": 0.925, "eleven": 0.885, "teental": 1.066, "rupak": 1.77, "jhaptal": 1.543, "keharwa": 1.442, "dadra": 1.15}, "rusty": {"lofi": 0.843, "dilla": 0.806, "halftime": 0.947, "boombap": 0.758, "jazz": 0.762, "brushes": 0.779, "bossa": 0.637, "shuffle": 0.891, "funk": 0.748, "waltz": 0.791, "trap": 0.755, "house": 0.59, "techno": 0.671, "twostep": 0.878, "idm": 0.828, "minimal": 1.108, "five4": 0.841, "five8": 1.159, "seven223": 1.112, "seven322": 1.159, "nine": 1.155, "eleven": 1.27, "teental": 0.733, "rupak": 0.896, "jhaptal": 0.833, "keharwa": 0.922, "dadra": 0.763}, "gogodze": {"lofi": 0.481, "dilla": 0.456, "halftime": 0.525, "boombap": 0.441, "jazz": 0.768, "brushes": 0.859, "bossa": 0.391, "shuffle": 0.518, "funk": 0.42, "waltz": 1.053, "trap": 0.44, "house": 0.333, "techno": 0.381, "twostep": 0.502, "idm": 0.466, "minimal": 0.531, "five4": 0.934, "five8": 0.7, "seven223": 0.672, "seven322": 0.693, "nine": 0.696, "eleven": 0.754, "teental": 0.479, "rupak": 0.605, "jhaptal": 0.545, "keharwa": 0.545, "dadra": 0.519}, "gogoroom": {"lofi": 0.872, "dilla": 0.796, "halftime": 0.8, "boombap": 0.79, "jazz": 1.45, "brushes": 1.687, "bossa": 0.826, "shuffle": 0.825, "funk": 0.777, "waltz": 1.69, "trap": 0.788, "house": 0.706, "techno": 0.745, "twostep": 0.837, "idm": 0.846, "minimal": 0.906, "five4": 1.657, "five8": 0.839, "seven223": 0.825, "seven322": 0.888, "nine": 0.905, "eleven": 0.817, "teental": 1.005, "rupak": 1.61, "jhaptal": 1.373, "keharwa": 1.313, "dadra": 1.029}, "gogoretro": {"lofi": 0.473, "dilla": 0.432, "halftime": 0.515, "boombap": 0.435, "jazz": 1.12, "brushes": 0.923, "bossa": 0.425, "shuffle": 0.493, "funk": 0.418, "waltz": 1.505, "trap": 0.434, "house": 0.39, "techno": 0.4, "twostep": 0.455, "idm": 0.467, "minimal": 0.47, "five4": 1.504, "five8": 0.592, "seven223": 0.569, "seven322": 0.562, "nine": 0.549, "eleven": 0.561, "teental": 0.568, "rupak": 0.912, "jhaptal": 0.793, "keharwa": 0.7, "dadra": 0.584}, "swirly": {"lofi": 0.603, "dilla": 0.553, "halftime": 0.57, "boombap": 0.535, "jazz": 1.558, "brushes": 0.799, "bossa": 0.509, "shuffle": 0.551, "funk": 0.528, "waltz": 2.0, "trap": 0.512, "house": 0.486, "techno": 0.492, "twostep": 0.578, "idm": 0.563, "minimal": 0.509, "five4": 1.854, "five8": 0.677, "seven223": 0.63, "seven322": 0.663, "nine": 0.683, "eleven": 0.693, "teental": 0.662, "rupak": 0.931, "jhaptal": 0.836, "keharwa": 0.682, "dadra": 0.665}, "hands": {"lofi": 1.117, "dilla": 1.036, "halftime": 1.134, "boombap": 0.996, "jazz": 1.665, "brushes": 1.961, "bossa": 1.112, "shuffle": 1.036, "funk": 0.966, "waltz": 1.797, "trap": 0.983, "house": 0.922, "techno": 0.958, "twostep": 1.055, "idm": 1.056, "minimal": 1.529, "five4": 1.763, "five8": 1.01, "seven223": 1.036, "seven322": 1.114, "nine": 1.142, "eleven": 1.037, "teental": 1.416, "rupak": 2.796, "jhaptal": 2.456, "keharwa": 1.836, "dadra": 1.385}, "bebop": {"lofi": 0.689, "dilla": 0.66, "halftime": 0.621, "boombap": 0.601, "jazz": 2.798, "brushes": 2.113, "bossa": 0.661, "shuffle": 0.624, "funk": 0.608, "waltz": 3.562, "trap": 0.548, "house": 0.545, "techno": 0.567, "twostep": 0.729, "idm": 0.622, "minimal": 0.748, "five4": 3.311, "five8": 0.684, "seven223": 0.646, "seven322": 0.747, "nine": 0.704, "eleven": 0.739, "teental": 0.817, "rupak": 2.131, "jhaptal": 1.87, "keharwa": 0.948, "dadra": 0.808}, "tr808": {"lofi": 0.214, "dilla": 0.19, "halftime": 0.227, "boombap": 0.197, "jazz": 0.573, "brushes": 0.484, "bossa": 0.169, "shuffle": 0.227, "funk": 0.19, "waltz": 0.882, "trap": 0.188, "house": 0.179, "techno": 0.18, "twostep": 0.227, "idm": 0.204, "minimal": 0.243, "five4": 0.895, "five8": 0.257, "seven223": 0.256, "seven322": 0.273, "nine": 0.275, "eleven": 0.266, "teental": 0.249, "rupak": 0.491, "jhaptal": 0.447, "keharwa": 0.313, "dadra": 0.276}, "tr909": {"lofi": 0.25, "dilla": 0.232, "halftime": 0.261, "boombap": 0.231, "jazz": 0.753, "brushes": 0.745, "bossa": 0.32, "shuffle": 0.252, "funk": 0.22, "waltz": 0.978, "trap": 0.242, "house": 0.257, "techno": 0.282, "twostep": 0.238, "idm": 0.238, "minimal": 0.348, "five4": 0.964, "five8": 0.281, "seven223": 0.289, "seven322": 0.31, "nine": 0.279, "eleven": 0.264, "teental": 0.42, "rupak": 0.816, "jhaptal": 0.679, "keharwa": 0.515, "dadra": 0.439}};
export const trimOf = (list, id) => list.find((x) => x.id === id)?.trim ?? 1;
export const drumTrim = (kit, style) => DRUM_TRIM[kit]?.[style] ?? 1;
