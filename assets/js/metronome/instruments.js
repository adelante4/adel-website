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
  { id: "doublebass", name: "Double bass", trim: 0.307, note: "A 1958 Otto Rubner upright bass, plucked. Woody, with a short decay." },
  { id: "fashionbass", name: "Round bass", trim: 0.627, note: "A roundwound bass, direct. Clear and punchy." },
  { id: "swagbass", name: "Fabric bass", trim: 0.602, note: "A bass in a fabric finish. Soft and thumpy, good for lofi." },
  { id: "fingerbass", name: "Flatwound bass", trim: 0.421, note: "A Squier Bass VI with flatwound strings, fingered on the neck pickup. Warm and dark, the classic sound for ballads, bossa and soul." },
  { id: "growlybass", name: "Jazz bass", trim: 0.763, note: "A Squier Jazz Bass, roundwound, both pickups. Bright with a growl, good for funk." },
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
export const DRUM_TRIM = {"synth": {"lofi": 0.764, "dilla": 0.846, "halftime": 0.753, "boombap": 0.695, "jazz": 1.562, "brushes": 1.873, "bossa": 0.852, "shuffle": 0.833, "funk": 0.789, "waltz": 1.705, "trap": 0.714, "house": 0.709, "techno": 0.717, "twostep": 0.857, "idm": 0.824, "minimal": 0.731, "five4": 1.649, "five8": 0.819, "seven223": 0.807, "seven322": 0.918, "nine": 0.925, "eleven": 0.885, "teental": 1.066, "rupak": 1.77, "jhaptal": 1.543, "keharwa": 1.442, "dadra": 1.15}, "rusty": {"lofi": 0.31, "dilla": 0.289, "halftime": 0.292, "boombap": 0.289, "jazz": 0.457, "brushes": 0.538, "bossa": 0.28, "shuffle": 0.302, "funk": 0.28, "waltz": 0.542, "trap": 0.246, "house": 0.261, "techno": 0.268, "twostep": 0.317, "idm": 0.299, "minimal": 0.288, "five4": 0.537, "five8": 0.323, "seven223": 0.292, "seven322": 0.319, "nine": 0.334, "eleven": 0.352, "teental": 0.331, "rupak": 0.626, "jhaptal": 0.546, "keharwa": 0.528, "dadra": 0.385}, "gogodze": {"lofi": 0.193, "dilla": 0.17, "halftime": 0.173, "boombap": 0.17, "jazz": 0.305, "brushes": 0.216, "bossa": 0.164, "shuffle": 0.173, "funk": 0.161, "waltz": 0.697, "trap": 0.151, "house": 0.155, "techno": 0.157, "twostep": 0.179, "idm": 0.19, "minimal": 0.172, "five4": 0.555, "five8": 0.205, "seven223": 0.193, "seven322": 0.203, "nine": 0.225, "eleven": 0.213, "teental": 0.21, "rupak": 0.323, "jhaptal": 0.276, "keharwa": 0.264, "dadra": 0.241}, "gogoroom": {"lofi": 0.626, "dilla": 0.55, "halftime": 0.544, "boombap": 0.563, "jazz": 1.141, "brushes": 0.963, "bossa": 0.533, "shuffle": 0.548, "funk": 0.537, "waltz": 1.608, "trap": 0.495, "house": 0.509, "techno": 0.523, "twostep": 0.568, "idm": 0.618, "minimal": 0.539, "five4": 1.466, "five8": 0.634, "seven223": 0.586, "seven322": 0.543, "nine": 0.683, "eleven": 0.632, "teental": 0.619, "rupak": 1.165, "jhaptal": 0.963, "keharwa": 0.956, "dadra": 0.697}, "gogoretro": {"lofi": 0.424, "dilla": 0.377, "halftime": 0.376, "boombap": 0.389, "jazz": 0.77, "brushes": 0.564, "bossa": 0.356, "shuffle": 0.377, "funk": 0.37, "waltz": 1.401, "trap": 0.335, "house": 0.345, "techno": 0.352, "twostep": 0.388, "idm": 0.408, "minimal": 0.323, "five4": 1.224, "five8": 0.466, "seven223": 0.431, "seven322": 0.42, "nine": 0.494, "eleven": 0.467, "teental": 0.446, "rupak": 0.843, "jhaptal": 0.697, "keharwa": 0.643, "dadra": 0.478}, "swirly": {"lofi": 0.593, "dilla": 0.478, "halftime": 0.502, "boombap": 0.51, "jazz": 0.974, "brushes": 0.74, "bossa": 0.46, "shuffle": 0.458, "funk": 0.493, "waltz": 1.814, "trap": 0.456, "house": 0.472, "techno": 0.472, "twostep": 0.487, "idm": 0.556, "minimal": 0.443, "five4": 1.508, "five8": 0.674, "seven223": 0.597, "seven322": 0.628, "nine": 0.644, "eleven": 0.692, "teental": 0.653, "rupak": 1.398, "jhaptal": 1.081, "keharwa": 0.863, "dadra": 0.731}, "hands": {"lofi": 0.731, "dilla": 0.667, "halftime": 0.581, "boombap": 0.655, "jazz": 1.288, "brushes": 1.586, "bossa": 0.634, "shuffle": 0.662, "funk": 0.638, "waltz": 1.672, "trap": 0.554, "house": 0.621, "techno": 0.629, "twostep": 0.699, "idm": 0.737, "minimal": 0.685, "five4": 1.582, "five8": 0.685, "seven223": 0.676, "seven322": 0.717, "nine": 0.727, "eleven": 0.767, "teental": 0.875, "rupak": 1.589, "jhaptal": 1.343, "keharwa": 1.09, "dadra": 0.918}, "bebop": {"lofi": 0.748, "dilla": 0.655, "halftime": 0.636, "boombap": 0.676, "jazz": 1.203, "brushes": 1.974, "bossa": 0.689, "shuffle": 0.623, "funk": 0.672, "waltz": 1.464, "trap": 0.612, "house": 0.572, "techno": 0.581, "twostep": 0.636, "idm": 0.818, "minimal": 0.675, "five4": 1.385, "five8": 0.749, "seven223": 0.7, "seven322": 0.744, "nine": 0.74, "eleven": 0.815, "teental": 1.099, "rupak": 1.932, "jhaptal": 1.674, "keharwa": 1.184, "dadra": 1.044}, "tr808": {"lofi": 0.449, "dilla": 0.394, "halftime": 0.466, "boombap": 0.413, "jazz": 0.82, "brushes": 0.911, "bossa": 0.375, "shuffle": 0.459, "funk": 0.394, "waltz": 1.182, "trap": 0.39, "house": 0.387, "techno": 0.405, "twostep": 0.464, "idm": 0.432, "minimal": 0.547, "five4": 1.152, "five8": 0.61, "seven223": 0.591, "seven322": 0.613, "nine": 0.622, "eleven": 0.634, "teental": 0.595, "rupak": 1.011, "jhaptal": 0.891, "keharwa": 0.79, "dadra": 0.619}, "tr909": {"lofi": 0.445, "dilla": 0.404, "halftime": 0.401, "boombap": 0.37, "jazz": 0.599, "brushes": 0.639, "bossa": 0.426, "shuffle": 0.429, "funk": 0.365, "waltz": 0.755, "trap": 0.355, "house": 0.337, "techno": 0.343, "twostep": 0.409, "idm": 0.395, "minimal": 0.495, "five4": 0.755, "five8": 0.49, "seven223": 0.491, "seven322": 0.566, "nine": 0.533, "eleven": 0.513, "teental": 0.637, "rupak": 1.048, "jhaptal": 0.899, "keharwa": 0.696, "dadra": 0.626}};
export const trimOf = (list, id) => list.find((x) => x.id === id)?.trim ?? 1;
/** How much louder or quieter each voice of a recorded kit plays, so a kit is balanced like the synth kit. */
export const DRUM_LEVEL = {"rusty": {"kick": 2.945, "snare": 1.402, "ghost": 0.446, "rim": 0.703, "hat": 0.895, "ohat": 1.098, "foot": 0.408, "ride": 1.783, "brush": 1.082}, "gogodze": {"kick": 2.834, "snare": 1.57, "ghost": 0.617, "rim": 0.795, "hat": 0.738, "ohat": 1.016, "foot": 0.612}, "gogoroom": {"kick": 1.499, "snare": 0.714, "ghost": 0.831, "rim": 1.035, "hat": 1.548, "ohat": 0.957, "foot": 0.732}, "gogoretro": {"kick": 1.115, "snare": 0.695, "ghost": 0.987, "rim": 1.258, "hat": 0.718, "ohat": 1.366, "foot": 1.06}, "swirly": {"kick": 0.976, "snare": 0.87, "ghost": 1.179, "rim": 0.488, "hat": 0.506, "ohat": 1.479, "foot": 0.95, "ride": 1.496, "brush": 1.922}, "hands": {"kick": 1.568, "snare": 0.944, "ghost": 0.767, "rim": 1.707, "hat": 0.862, "ohat": 1.153, "foot": 0.376, "ride": 1.379}, "bebop": {"kick": 0.921, "snare": 0.73, "ghost": 0.961, "rim": 1.17, "hat": 0.576, "ohat": 1.016, "foot": 0.67, "ride": 3.375}, "tr808": {"kick": 0.429, "snare": 0.761, "ghost": 1.209, "rim": 0.842, "hat": 1.294, "ohat": 1.474, "foot": 1.855, "ride": 0.849}, "tr909": {"kick": 0.806, "snare": 0.277, "ghost": 1.281, "rim": 0.941, "hat": 1.043, "ohat": 1.443, "foot": 1.793, "ride": 1.375}};
export const drumLevel = (kit, voice) => DRUM_LEVEL[kit]?.[voice] ?? 1;
export const drumTrim = (kit, style) => DRUM_TRIM[kit]?.[style] ?? 1;
