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

// The tunes in Adel's Notion "My Standards" list, with the changes from his own iReal Pro charts
// (decoded once by tools/build-my-standards.mjs). Each row is [id, name, bars]; bars are
// separated by "|" and the one or two chords in a bar by a space.
const MY_ROWS = [
  ["my-all-of-me", "All of Me (C, 32)", "Cmaj7|Cmaj7|E7|E7|A7|A7|Dm7|Dm7|E7|E7|Am7|Am7|D7|D7|Dm7|G7|Cmaj7|Cmaj7|E7|E7|A7|A7|Dm7|Dm7|Fmaj7|Fm6|Em7|A7|Dm7|G7|C6 Ebdim7|Dm7 G7"],
  ["my-never-another-you", "There Will Never Be Another You (Eb, 32)", "Ebmaj7|Ebmaj7|Dm7b5|G7alt|Cm7|Cm7|Bbm7|Eb7|Abmaj7|Db7#11|Ebmaj7|Cm7|F7|F7|Fm7|Bb7|Ebmaj7|Ebmaj7|Dm7b5|G7alt|Cm7|Cm7|Bbm7|Eb7|Abmaj7|Db7#11|Ebmaj7|Am7b5 D7|Ebmaj7 Ab7|Gm7 C7|Fm7 Bb7|Eb6 Bb7"],
  ["my-softly", "Softly, as in a Morning Sunrise (Cm, 32)", "Cm7|Dm7b5 G7alt|Cm7|Dm7b5 G7alt|Cm7|Dm7b5 G7alt|Cm7|Dm7b5 G7alt|Cm7|Dm7b5 G7alt|Cm7|Dm7b5 G7alt|Cm7|Dm7b5 G7alt|Cm7|Fm7 Bb7|Ebmaj7|Ebmaj7|C7alt|C7alt|Fm7|F#dim7|Dm7b5|G7alt|Cm7|Dm7b5 G7alt|Cm7|Dm7b5 G7alt|Cm7|Dm7b5 G7alt|Cm7|Dm7b5 G7alt"],
  ["my-blue-monk", "Blue Monk (Bb, 12)", "Bb7|Eb7|Bb7|Bb7|Eb7|Eb7|Bb7|Bb7|F7|F7|Bb7|Bb7"],
  ["my-oleo", "Oleo (Bb, 32)", "Bbmaj7 G7|Cm7 F7|Dm7 G7|Cm7 F7|Fm7 Bb7|Eb7 Ab7|Dm7 G7|Cm7 F7|Bbmaj7 G7|Cm7 F7|Dm7 G7|Cm7 F7|Fm7 Bb7|Eb7 Ab7|Cm7 F7|Bb6|D7|D7|G7|G7|C7|C7|F7|F7|Bbmaj7 G7|Cm7 F7|Dm7 G7|Cm7 F7|Fm7 Bb7|Eb7 Ab7|Cm7 F7|Bb6"],
  ["my-igr", "I Got Rhythm (Bb, 36)", "Bb6 Gm7|Cm7 F7|Dm7 Gm7|Cm7 F7|Bb7|Eb7 Edim7|Bb6 F7|Bb6 F7|Bb6 Gm7|Cm7 F7|Dm7 Gm7|Cm7 F7|Bb7|Eb7 Edim7|Bb6 F7|Bb6|D7|D7|G7|G7|C7|C7|F7|F7|Bb6 Gm7|Cm7 F7|Dm7 Gm7|Cm7 F7|Bb7|Eb7 Edim7|Bb6 F7|Bb6 F7|Bb6 Eb9|Dm7 G7|Cm7 F7|Bb6"],
  ["my-stella", "Stella by Starlight (Bb, 32)", "Em7b5|A7alt|Cm7|F7|Fm7|Bb7|Ebmaj7|Ab7|Bbmaj7|Em7b5 A7alt|Dm7|Bbm7 Eb7|Fmaj7|Em7b5|Ebmaj7|D7alt|G7alt|G7alt|Cm7|Cm7|Ab7#11|Ab7#11|Bbmaj7|Bbmaj7|Em7b5|A7alt|Dm7b5|G7alt|Cm7b5|F7alt|Bbmaj7|Bbmaj7"],
  ["my-manha", "Manhã de Carnaval (Am, 37)", "Am|Bm7b5 E7alt|Am|Bm7b5 E7alt|Am|Dm7 G7|Cmaj7|A7alt|Dm7|G7|Cmaj7|Fmaj7|Bm7b5|E7alt|Am|Bm7b5 E7alt|Am|Bm7b5 E7alt|Am|Am|Em7b5|A7alt|Dm|Dm|Dm7|Bm7b5 E7alt|Am Am7|Fmaj7|Bm7b5|E7alt|Am|Bm7b5 E7alt|Am|Dm7 Am7|Dm7 Am7|Dm7 Em7|Am"],
  ["my-anthropology", "Anthropology (Bb, 32)", "Bbmaj7 G7|Cm7 F7|Dm7 G7|Cm7 F7|Fm7 Bb7|Eb7 Ab7|Dm7 G7|Cm7 F7|Bbmaj7 G7|Cm7 F7|Dm7 G7|Cm7 F7|Fm7 Bb7|Eb7 Ab7|Cm7 F7|Bb6|D7|D7|G7|G7|C7|C7|F7|F7|Bbmaj7 G7|Cm7 F7|Dm7 G7|Cm7 F7|Fm7 Bb7|Eb7 Ab7|Cm7 F7|Bb6"],
  ["my-wave", "Wave (D, 44)", "Dmaj7|Bbdim7|Am7|D7alt|Gmaj7|Gm6|F#13 F#7alt|B9 B7alt|E9|Bb7 A7|Dm7 G7|Dm7 G7|Dmaj7|Bbdim7|Am7|D7alt|Gmaj7|Gm6|F#13 F#7alt|B9 B7alt|E9|Bb7 A7|Dm7 G7|Dm7 G7|Gm7|C7|Fmaj7|Fmaj7|Fm7|Bb7|Ebmaj7|A7alt|Dmaj7|Bbdim7|Am7|D7alt|Gmaj7|Gm6|F#13 F#7alt|B9 B7alt|E9|Bb7 A7|Dm7 G7|Dm7 G7"],
  ["my-autumn-leaves", "Autumn Leaves (Gm, 32)", "Cm7|F7|Bbmaj7|Ebmaj7|Am7b5|D7alt|Gm6|Gm6|Cm7|F7|Bbmaj7|Ebmaj7|Am7b5|D7alt|Gm6|Gm6|Am7b5|D7alt|Gm6|Gm6|Cm7|F7|Bbmaj7|Ebmaj7|Am7b5|D7alt|Gm7 F#7|Fm7 E7|Am7b5|D7alt|Gm6|Gm6"],
  ["my-so-what", "So What (Dm, 32)", "Dm7|Dm7|Dm7|Dm7|Dm7|Dm7|Dm7|Dm7|Dm7|Dm7|Dm7|Dm7|Dm7|Dm7|Dm7|Dm7|Ebm7|Ebm7|Ebm7|Ebm7|Ebm7|Ebm7|Ebm7|Ebm7|Dm7|Dm7|Dm7|Dm7|Dm7|Dm7|Dm7|Dm7"],
  ["my-tunisia", "A Night in Tunisia (Dm, 48)", "Eb7|Dm6|Eb7|Dm6|Eb7|Dm6|Em7b5 A7alt|Dm|Eb7|Dm6|Eb7|Dm6|Eb7|Dm6|Em7b5 A7alt|Dm|Am7b5|D7alt|Gm7|Gm7|Gm7b5|C7alt|Fmaj7|Em7b5 A7alt|Eb7|Dm6|Eb7|Dm6|Eb7|Dm6|Em7b5 A7alt|Dm|Em7b5|Em7b5|Eb7#11|Eb7#11|Dm7|Dm7|G7#11|G7#11|Gm7|Gm7|F#7alt|F#7alt|Fmaj7|Fmaj7|Em7b5|A7alt"],
];
export const MY_STANDARDS = MY_ROWS.map(([id, name, bars]) => ({ id, name, form: bars.split("|").map((b) => b.split(" ")) }));
