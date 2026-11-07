// Chord changes for some common jazz standards and forms. Changes only: no melodies, no lyrics.
// Written from general knowledge of how these are usually played, in the usual key. Versions
// differ between sources, so check against your own chart; any bar can be edited and the
// whole form can be moved with the key buttons.
const r = (chord, n) => Array.from({ length: n }, () => [chord]);

const RHYTHM = [
      ...[0, 1].flatMap(() => [["Bbmaj7", "G7"], ["Cm7", "F7"], ["Dm7", "G7"], ["Cm7", "F7"], ["Fm7", "Bb7"], ["Ebmaj7", "Edim7"], ["Dm7", "G7"], ["Cm7", "F7"]]),
      ...r("D7", 2), ...r("G7", 2), ...r("C7", 2), ...r("F7", 2),
      ["Bbmaj7", "G7"], ["Cm7", "F7"], ["Dm7", "G7"], ["Cm7", "F7"], ["Fm7", "Bb7"], ["Ebmaj7", "Edim7"], ["Dm7", "G7"], ["Bbmaj7"],
    ];

export const STANDARDS = [
  {
    id: "blue-bossa",
    name: "Blue Bossa (16)",
    form: [["Cm7"], ["Cm7"], ["Fm7"], ["Fm7"], ["Dm7b5"], ["G7"], ["Cm7"], ["Cm7"], ["Ebm7"], ["Ab7"], ["Dbmaj7"], ["Dbmaj7"], ["Dm7b5"], ["G7"], ["Cm7"], ["Dm7b5", "G7"]],
  },
  { id: "so-what", name: "So What (32)", form: [...r("Dm7", 16), ...r("Ebm7", 8), ...r("Dm7", 8)] },
  {
    id: "ipanema",
    name: "Girl from Ipanema (32)",
    form: [
      ...[0, 1].flatMap(() => [["Fmaj7"], ["Fmaj7"], ["G7"], ["G7"], ["Gm7"], ["Gb7"], ["Fmaj7"], ["Gb7"]]),
      ["Gbmaj7"], ["Gbmaj7"], ["B7"], ["B7"], ["F#m7"], ["F#m7"], ["D7"], ["D7"], ["Gm7"], ["Gm7"], ["Eb7"], ["Eb7"], ["Am7"], ["D7alt"], ["Gm7"], ["C7alt"],
    ].slice(0, 32),
  },
  {
    id: "all-things",
    name: "All the Things You Are (36)",
    form: [
      ["Fm7"], ["Bbm7"], ["Eb7"], ["Abmaj7"], ["Dbmaj7"], ["Dm7", "G7"], ["Cmaj7"], ["Cmaj7"],
      ["Cm7"], ["Fm7"], ["Bb7"], ["Ebmaj7"], ["Abmaj7"], ["Am7", "D7"], ["Gmaj7"], ["Gmaj7"],
      ["Am7"], ["D7"], ["Gmaj7"], ["Gmaj7"], ["F#m7"], ["B7"], ["Emaj7"], ["C7alt"],
      ["Fm7"], ["Bbm7"], ["Eb7"], ["Abmaj7"], ["Dbmaj7"], ["Dbm7"], ["Cm7"], ["Bdim7"],
      ["Bbm7"], ["Eb7"], ["Abmaj7"], ["Abmaj7"],
    ],
  },
  {
    id: "fly-me",
    name: "Fly Me to the Moon (16)",
    form: [
      ["Am7"], ["Dm7"], ["G7"], ["Cmaj7"], ["Fmaj7"], ["Bm7b5"], ["E7"], ["Am7", "A7alt"],
      ["Dm7"], ["G7"], ["Cmaj7"], ["Fmaj7"], ["Bm7b5"], ["E7"], ["Am7"], ["E7alt"],
    ],
  },
  {
    id: "giant-steps",
    name: "Giant Steps (16)",
    form: [
      ["Bmaj7", "D7"], ["Gmaj7", "Bb7"], ["Ebmaj7"], ["Am7", "D7"], ["Gmaj7", "Bb7"], ["Ebmaj7", "F#7"], ["Bmaj7"], ["Fm7", "Bb7"],
      ["Ebmaj7"], ["Am7", "D7"], ["Gmaj7"], ["C#m7", "F#7"], ["Bmaj7"], ["Fm7", "Bb7"], ["Ebmaj7"], ["C#m7", "F#7"],
    ],
  },
  {
    id: "cantaloupe",
    name: "Cantaloupe Island (16)",
    form: [...r("Fm7", 4), ...r("Db7#11", 4), ...r("Dm7", 4), ...r("Fm7", 4)],
  },
  {
    id: "rhythm-full",
    name: "Rhythm changes (32)",
    form: RHYTHM,
  },
  {
    id: "blues-alice",
    name: "Bird blues, Blues for Alice style (12)",
    form: [["Fmaj7"], ["Em7b5", "A7"], ["Dm7", "G7"], ["Cm7", "F7"], ["Bb7"], ["Bbm7", "Eb7"], ["Am7", "D7"], ["Abm7", "Db7"], ["Gm7"], ["C7"], ["Fmaj7", "D7"], ["Gm7", "C7"]],
  },
  {
    id: "minor-blues",
    name: "Minor blues (12)",
    form: [...r("Cm7", 4), ...r("Fm7", 2), ...r("Cm7", 2), ["Dm7b5"], ["G7"], ["Cm7"], ["G7alt"]],
  },
];

// The tunes in Adel's Notion "My Standards" list (keys from there), shown as their own group.
// Notion holds only key, form and groove, so the changes are written from general knowledge
// of how each tune is usually played. Check them against your own chart.
const AL = [["Cm7"], ["F7"], ["Bbmaj7"], ["Ebmaj7"], ["Am7b5"], ["D7alt"], ["Gm7"], ["Gm7"]];
export const MY_STANDARDS = [
  {
    id: "my-all-of-me",
    name: "All of Me (C, 32)",
    form: [
      ["Cmaj7"], ["Cmaj7"], ["E7"], ["E7"], ["A7"], ["A7"], ["Dm7"], ["Dm7"],
      ["E7"], ["E7"], ["Am7"], ["Am7"], ["D7"], ["D7"], ["Dm7"], ["G7"],
      ["Cmaj7"], ["Cmaj7"], ["E7"], ["E7"], ["A7"], ["A7"], ["Dm7"], ["Dm7"],
      ["Fmaj7"], ["Fm6"], ["Cmaj7"], ["A7"], ["Dm7"], ["G7"], ["Cmaj7"], ["Dm7", "G7"],
    ],
  },
  {
    id: "my-autumn-leaves",
    name: "Autumn Leaves (Gm, 32)",
    form: [
      ...AL, ...AL,
      ["Am7b5"], ["D7alt"], ["Gm7"], ["Gm7"], ["Cm7"], ["F7"], ["Bbmaj7"], ["Ebmaj7"],
      ["Am7b5"], ["D7alt"], ["Gm6"], ["Gm6"], ["Am7b5"], ["D7alt"], ["Gm6"], ["Gm6"],
    ].slice(0, 32),
  },
  {
    id: "my-blue-monk",
    name: "Blue Monk (Bb, 12)",
    form: [["Bb7"], ["Eb7"], ["Bb7"], ["Bb7"], ["Eb7"], ["Edim7"], ["Bb7"], ["G7alt"], ["Cm7"], ["F7"], ["Bb7", "G7"], ["Cm7", "F7"]],
  },
  { id: "my-so-what", name: "So What (Dm, 32)", form: [...r("Dm7", 16), ...r("Ebm7", 8), ...r("Dm7", 8)] },
  { id: "my-igr", name: "I Got Rhythm (Bb, 32)", form: RHYTHM },
  { id: "my-oleo", name: "Oleo (Bb, rhythm changes, 32)", form: RHYTHM },
  { id: "my-anthropology", name: "Anthropology (Bb, rhythm changes, 32)", form: RHYTHM },
];
