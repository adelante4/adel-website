// The sound catalog: which instruments and kits exist, and what to call them.
// No Web Audio in here, so the page, the share codec and the tests can all read it.
//
// `synth: true` voices are made in code. The others are recordings under assets/audio/,
// loaded the first time they are chosen. All recordings are CC0 (see the LICENSE files).

export const KEYS = [
  { id: "rhodes", name: "Rhodes", synth: true, note: "Electric piano made in code. Warm and round." },
  { id: "fmpiano", name: "FM piano", note: "A Yamaha TX81Z patch, recorded from the hardware. Glassy 80s electric piano." },
  { id: "upright", name: "Upright", note: "A Yamaha upright. Close and a little dusty." },
  { id: "vibes", name: "Vibraphone", note: "Soft mallets. Sits high, so voicings are lifted an octave." },
  { id: "clavisynth", name: "Clav", note: "A TX81Z pluck with a clavinet bite. Best with Push or On 1." },
  { id: "organ", name: "Organ", synth: true, note: "Drawbar organ made in code." },
  { id: "pad", name: "Pad", synth: true, note: "A slow, warm synth pad. Pairs with Sustain." },
];

export const BASSES = [
  { id: "doublebass", name: "Double bass", note: "A 1958 Otto Rubner upright bass, plucked. Woody, with a short decay." },
  { id: "growlybass", name: "Jazz bass", note: "A Squier Jazz Bass, fingered." },
  { id: "fashionbass", name: "Round bass", note: "A roundwound bass, direct. Clear and punchy." },
  { id: "swagbass", name: "Fabric bass", note: "A bass in a fabric finish. Soft and thumpy, good for lofi." },
  { id: "moog", name: "Synth bass", synth: true, note: "Sawtooth through a closing filter." },
  { id: "sub", name: "Sub 808", synth: true, note: "A long, deep sine. Use with Halftime or Sub." },
  { id: "round", name: "Soft synth", synth: true, note: "A rounded triangle bass." },
];

export const KITS = [
  { id: "synth", name: "Synth kit", synth: true, note: "Made in code. Follows any tempo." },
  { id: "rusty", name: "Rusty jazz kit", note: "A big old kit with real brushes, ride and hats." },
  { id: "gogodze", name: "70s lofi kit", note: "A dry, dull kit modelled on a 1970s record. Has no ride or brushes, so those stay synthesized." },
];

export const ids = (list) => list.map((x) => x.id);
