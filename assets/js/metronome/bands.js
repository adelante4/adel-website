// Band styles: one choice that sets every layer, like the style list in iReal Pro.
// A style changes the groove, the bass, the keys and the tempo. Each layer can still be changed
// afterwards. Styles hold no chord changes; those come from the progression.

export const BAND_STYLES = [
  { id: "lofi", name: "Lofi", bpm: 76, meter: [4, 4], groove: { style: "lofi", kit: "gogoretro", dust: true }, bass: { style: "lofi", sound: "swagbass" }, keys: { sound: "rhodes", comp: "charleston" } },
  { id: "neosoul", name: "Neo-soul", bpm: 86, meter: [4, 4], groove: { style: "dilla", kit: "gogoroom", dust: false }, bass: { style: "lofi", sound: "fashionbass" }, keys: { sound: "fmpiano", comp: "push" } },
  { id: "boombap", name: "Boom-bap", bpm: 90, meter: [4, 4], groove: { style: "boombap", kit: "gogodze", dust: true }, bass: { style: "sub", sound: "sub" }, keys: { sound: "upright", comp: "on1" } },
  { id: "halftime", name: "Halftime", bpm: 70, meter: [4, 4], groove: { style: "halftime", kit: "synth", dust: false }, bass: { style: "sub", sound: "sub" }, keys: { sound: "pad", comp: "sustain" } },
  { id: "swing", name: "Medium swing", bpm: 132, meter: [4, 4], groove: { style: "jazz", kit: "bebop", dust: false }, bass: { style: "walking", sound: "doublebass" }, keys: { sound: "upright", comp: "charleston" } },
  { id: "ballad", name: "Ballad", bpm: 60, meter: [4, 4], groove: { style: "brushes", kit: "rusty", dust: false }, bass: { style: "twofeel", sound: "doublebass" }, keys: { sound: "vibes", comp: "arp" } },
  { id: "bossa", name: "Bossa nova", bpm: 118, meter: [4, 4], groove: { style: "bossa", kit: "hands", dust: false }, bass: { style: "bossa", sound: "fashionbass" }, keys: { sound: "rhodes", comp: "push" } },
  { id: "shuffle", name: "Blues shuffle", bpm: 104, meter: [4, 4], groove: { style: "shuffle", kit: "rusty", dust: false }, bass: { style: "walking", sound: "doublebass" }, keys: { sound: "organ", comp: "on1" } },
  { id: "funk", name: "Funk", bpm: 100, meter: [4, 4], groove: { style: "funk", kit: "swirly", dust: false }, bass: { style: "funk", sound: "fashionbass" }, keys: { sound: "clavisynth", comp: "push" } },
  { id: "trap", name: "Trap", bpm: 140, meter: [4, 4], groove: { style: "trap", kit: "tr808", dust: false }, bass: { style: "sub", sound: "sub" }, keys: { sound: "pad", comp: "sustain" } },
  { id: "house", name: "House", bpm: 124, meter: [4, 4], groove: { style: "house", kit: "tr909", dust: false }, bass: { style: "funk", sound: "fashionbass" }, keys: { sound: "clavisynth", comp: "push" } },
  { id: "waltz", name: "Jazz waltz", bpm: 138, meter: [3, 4], groove: { style: "waltz", kit: "bebop", dust: false }, bass: { style: "twofeel", sound: "doublebass" }, keys: { sound: "upright", comp: "charleston" } },
];
