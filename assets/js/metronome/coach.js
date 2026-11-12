// The pocket coach: reads a take's numbers the way a teacher would, and names one thing to practise next.
// Pure code. Every statement says what was measured, why it matters, and where that view comes from.
//
// What "good" means here is taken from two places, and they are kept apart on purpose:
//   Measurements of recorded jazz solos (SOURCES.research). These say what players on records do.
//   What teachers ask for (SOURCES.teaching). These say what to practise.
// A measurement is never turned into a mark out of ten. Placing downbeats late is a choice, not an error;
// the coach says where you sit, how steady that is, and what the records and teachers say about it.

export const SOURCES = {
  friberg: {
    kind: "research",
    cite: "Friberg & Sundström (2002), Swing ratios and ensemble timing in jazz performance. Music Perception 19(3)",
    url: "https://doi.org/10.1525/mp.2002.19.3.333",
  },
  nelias: {
    kind: "research",
    cite: "Nelias, Sturm, Albrecht, Hagmayer & Geisel (2022), Downbeat delays are a key component of swing in jazz. Communications Physics 5",
    url: "https://www.nature.com/articles/s42005-022-00995-z",
  },
  benadon: {
    kind: "research",
    cite: "Benadon (2006), Slicing the beat: jazz eighth-notes as expressive microrhythm. Ethnomusicology 50(1)",
    url: "https://www.jstor.org/stable/20174424",
  },
  butterfield: {
    kind: "research",
    cite: "Butterfield (2011), Why do jazz musicians swing their eighth notes? Music Theory Spectrum 33(1)",
    url: "https://www.jstor.org/stable/10.1525/mts.2011.33.1.3",
  },
  galper: {
    kind: "teaching",
    cite: "Hal Galper, Forward Motion (2003), chapter on playing in half-time",
    url: "https://www.halgalper.com/?p=2273",
  },
  backbeat: {
    kind: "teaching",
    cite: "Jazzadvice, The secret to great time (the click on 2 and 4, starting phrases anywhere in the bar)",
    url: "https://www.jazzadvice.com/lessons/the-secret-to-great-time/",
  },
  space: {
    kind: "teaching",
    cite: "Jazzadvice, Exploring space (play two bars, rest two)",
    url: "https://www.jazzadvice.com/lessons/exploring-space/",
  },
  dropout: {
    kind: "teaching",
    cite: "A saxophonist's guide to rhythm and time (click that drops out; accenting offbeats for forward motion)",
    url: "https://www.bestsaxophonewebsiteever.com/?p=3667",
  },
};

const r0 = (x) => String(Math.round(x));
const side = (ms) => (ms > 0 ? "behind" : "ahead of");
const late = (ms) => (ms > 0 ? "late" : "early");
const ratioText = (x) => `${x.toFixed(1)}:1`;

/** Words for the spread. A rule of thumb for this page, not a published scale. */
export const spreadWord = (sd) => (sd < 10 ? "very tight" : sd < 16 ? "tight" : sd < 24 ? "steady" : sd < 34 ? "loose" : "scattered");

/**
 * @param {object} t  analyzeTiming's result
 * @param {object} p  analyzePacing's result
 * @param {{bpm:number, beats:number, calibrated:boolean, groove:boolean}} ctx
 * @returns {{headline:object[], findings:object[], drill:object|null, enough:boolean}}
 *   A finding: {id, weight, title, text, sources:[keys], drill?}. A drill: {id, title, how, patch} where patch
 *   is a partial page state ({pattern:{...}, practice:{...}}) that sets the page up for it.
 */
export function coach(t, p, ctx) {
  const findings = [];
  const add = (f) => findings.push(f);
  const enough = t.timed >= 24;
  if (!enough) {
    return {
      enough,
      headline: [],
      findings: [{ id: "few", weight: 0, title: "Not enough notes yet", text: `${t.timed} notes could be timed. Play at least a chorus, about 24 notes on or between the beats, for numbers worth reading.`, sources: [] }],
      drill: null,
    };
  }
  const beatMs = t.msPerBeat;
  const absolute = ctx.calibrated;
  const D = t.down;
  const U = t.up;

  // 1. Spread: the one number that is about control and nothing else.
  const sd = D.n >= 8 ? D.sd : t.all.sd;
  add({
    id: "spread",
    weight: sd > 24 ? 70 + sd : 10,
    title: `Spread ±${r0(sd)} ms: ${spreadWord(sd)}`,
    text: `Two notes in three land within ${r0(sd)} ms of your own average. This is consistency. It does not depend on whether you sit ahead or behind.`,
    sources: [],
    drill: sd > 24 ? drills.slow(ctx) : null,
  });

  // 2. Where you sit: downbeats and offbeats, read as the research reads them.
  if (absolute && D.n >= 8) {
    const pct = Math.abs(D.percent).toFixed(0);
    const upKnown = U.n >= 8;
    const upLocked = upKnown && Math.abs(U.mean) < Math.max(8, Math.abs(D.mean) * 0.5);
    if (D.sure && D.mean >= 8 && upLocked) {
      add({
        id: "laidback-locked",
        weight: 40,
        title: `Downbeats ${r0(D.mean)} ms behind, offbeats with the band`,
        text: `Your downbeats sit ${r0(D.mean)} ms (${pct}% of a beat) behind the band and your offbeats within ${r0(Math.abs(U.mean))} ms of it. That is the pattern measured on records: soloists delay downbeats by about 9% of a beat at medium tempos, less at fast ones, and keep offbeats with the ride cymbal. In listening tests, jazz musicians rated exactly this as swinging more.`,
        sources: ["nelias", "friberg"],
      });
    } else if (D.sure && D.mean >= 12 && upKnown && U.mean >= 12) {
      add({
        id: "all-late",
        weight: 60 + D.mean,
        title: `Everything ${r0((D.mean + U.mean) / 2)} ms behind`,
        text: `Downbeats are ${r0(D.mean)} ms and offbeats ${r0(U.mean)} ms behind the band. Delaying both alike did not raise swing ratings in listening tests. What did was late downbeats with the offbeats in place. If you want the laid-back feel, keep the offbeat as your anchor.`,
        sources: ["nelias"],
        drill: drills.offbeatClick(ctx),
      });
    } else if (D.sure && D.mean <= -8) {
      add({
        id: "ahead",
        weight: 65 - D.mean,
        title: `Downbeats ${r0(-D.mean)} ms ahead of the band`,
        text: `Your downbeats arrive ${r0(-D.mean)} ms (${pct}% of a beat) early${upKnown ? `, offbeats ${r0(Math.abs(U.mean))} ms ${late(U.mean)}` : ""}. Recorded soloists do the opposite: downbeats a little behind, offbeats in place. Playing ahead can be a choice, but when it is a habit it usually means the beat is being counted too small. Feel the bar in two, not in four.`,
        sources: ["nelias", "galper"],
        drill: drills.halfTime(ctx),
      });
    } else {
      add({
        id: "on",
        weight: 15,
        title: D.sure ? `Downbeats ${r0(Math.abs(D.mean))} ms ${side(D.mean)} the band` : "Downbeats on the band",
        text: `Downbeats average ${r0(Math.abs(D.mean))} ms ${side(D.mean)} the band (the true value is between ${r0(D.low)} and ${r0(D.high)} ms)${upKnown ? `, offbeats ${r0(Math.abs(U.mean))} ms ${late(U.mean)}` : ""}. For comparison, recorded soloists place downbeats about 9% of a beat late at medium tempos, which here would be ${r0(beatMs * 0.09)} ms.`,
        sources: ["nelias"],
      });
    }
  } else if (!absolute) {
    add({
      id: "uncalibrated",
      weight: 30,
      title: "Ahead or behind: not shown yet",
      text: "The delay of your speakers or headphones has not been measured, so the page cannot say whether you are ahead of or behind the band. Everything else in this report does not depend on it. Measure the delay once in Listen to see it.",
      sources: [],
    });
  }

  // 3. Swing ratio.
  const S = t.swing;
  if (S.enough && t.swung) {
    let text = `Your eighths run ${ratioText(S.ratio)} (between ${ratioText(S.low)} and ${ratioText(S.high)}), from ${S.n} pairs. The band plays ${ratioText(S.band)}. `;
    let weight = 20;
    let drill = null;
    if (S.ratio > 2.3 && ctx.bpm >= 120) {
      text += "That is more uneven than almost any recorded soloist: most are below 1.5:1, and the swing gets flatter as the tempo rises, down to even eighths at fast tempos. Evener eighths are what gives a line forward motion.";
      weight = 55;
      drill = drills.evenEighths(ctx);
    } else if (S.ratio < 1.15) {
      text += "These are nearly even eighths. On records that is common for soloists, especially at faster tempos, while the drummer swings harder underneath.";
    } else if (S.ratio <= 1.6) {
      text += "That is where most recorded soloists sit: below 1.5:1, flatter than the drummer.";
    } else {
      text += "That is close to the band's triplet feel. Recorded soloists are usually flatter than the drummer, below 1.5:1.";
    }
    add({ id: "swing", weight, title: `Swing ratio ${ratioText(S.ratio)}`, text, sources: ["nelias", "friberg", "butterfield", "benadon"], drill });
  }

  // 4. A beat of the bar that is early or late for you.
  const worst = [...t.byBeat].filter((b) => b.sure).sort((a, b) => Math.abs(b.mean) - Math.abs(a.mean))[0];
  if (worst) {
    add({
      id: "beat",
      weight: 45 + Math.abs(worst.mean),
      title: `Beat ${worst.beat} is ${r0(Math.abs(worst.mean))} ms ${late(worst.mean)}`,
      text: `Against your own average, beat ${worst.beat} comes ${r0(Math.abs(worst.mean))} ms ${late(worst.mean)} (${worst.n} notes). On records the downbeat delay does not depend on the beat of the bar, so this is a habit, not a style.`,
      sources: ["nelias"],
      drill: drills.backbeat(ctx),
    });
  }

  // 5. Drift.
  if (t.drift.sure && Math.abs(t.drift.msPerMinute) >= 8) {
    const m = t.drift.msPerMinute;
    add({
      id: "drift",
      weight: 40 + Math.abs(m),
      title: `You move ${r0(Math.abs(m))} ms ${m > 0 ? "later" : "earlier"} every minute`,
      text: `Over the take your placement slides ${m > 0 ? "back" : "forward"} by ${r0(Math.abs(m))} ms a minute. ${m < 0 ? "Sliding forward is rushing in slow motion." : "Sliding back often comes with tiring or with longer lines."}`,
      sources: [],
      drill: drills.dropout(ctx),
    });
  }

  // 6. Silent bars.
  if (t.silence && t.silence.n >= 8 && t.silence.sure && Math.abs(t.silence.msPerBar) >= 6) {
    const m = t.silence.msPerBar;
    add({
      id: "silence",
      weight: 60 + Math.abs(m),
      title: `Without the band you ${m < 0 ? "speed up" : "slow down"}: ${r0(Math.abs(m))} ms per bar`,
      text: `In the silent bars your notes come ${r0(Math.abs(m))} ms ${m < 0 ? "earlier" : "later"} with every bar. This is your own clock, with nothing to lean on. Teachers use a click that drops out for exactly this.`,
      sources: ["dropout"],
      drill: drills.dropout(ctx),
    });
  }

  // 7. Offbeat accents.
  const A = t.accent;
  if (A.n >= 12) {
    if (A.sure && A.mean <= -1) {
      add({
        id: "accent",
        weight: 35 - A.mean * 4,
        title: `Offbeats ${Math.abs(A.mean).toFixed(1)} dB softer than downbeats`,
        text: `In your eighth-note lines the downbeats are the loud notes. Horn players are taught the opposite: lean on the offbeats and the line moves forward, lean on the downbeats and it sits heavy.`,
        sources: ["dropout", "galper"],
        drill: drills.offbeatClick(ctx),
      });
    } else if (A.sure && A.mean >= 1) {
      add({ id: "accent", weight: 12, title: `Offbeats ${A.mean.toFixed(1)} dB louder than downbeats`, text: "You lean on the offbeats, which is what teachers ask for: it gives the line forward motion.", sources: ["dropout"] });
    }
  }

  // 8. Pacing.
  if (p && p.count >= 1) {
    const rest = Math.round(p.restShare * 100);
    if (p.restShare < 0.15) {
      add({
        id: "pacing",
        weight: 50,
        title: `You rest ${rest}% of the time`,
        text: `The take is almost unbroken: ${p.count} phrase${p.count === 1 ? "" : "s"}, the longest ${r0(p.longest / ctx.beats)} bars. Teachers train pacing with fixed turns, such as play two bars and rest two, until leaving space is a choice and not an accident.`,
        sources: ["space"],
        drill: drills.playRest(ctx),
      });
    } else if (p.count >= 6 && p.startOnOne >= 0.6) {
      add({
        id: "starts",
        weight: 38,
        title: `${Math.round(p.startOnOne * 100)}% of your phrases start on beat 1`,
        text: `${p.count} phrases, and most begin on the first beat of a bar. A standard exercise is to start the same idea on each eighth of the bar in turn.`,
        sources: ["backbeat"],
        drill: drills.playRest(ctx),
      });
    } else {
      add({ id: "pacing", weight: 8, title: `${p.count} phrases, resting ${rest}% of the time`, text: `Phrases are about ${r0(p.medianLength)} beats long. ${Math.round(p.endOnOffbeat * 100)}% end on an offbeat.`, sources: [] });
    }
  }

  // 9. The tempo where control goes.
  const rungs = t.byTempo.filter((x) => x.n >= 12);
  if (rungs.length >= 3) {
    const base = Math.min(...rungs.slice(0, 2).map((x) => x.sd));
    const broke = rungs.find((x) => x.sd > Math.max(1.6 * base, base + 8));
    if (broke) {
      add({
        id: "ceiling",
        weight: 48,
        title: `Control loosens at ${broke.bpm} BPM`,
        text: `Up to ${rungs[Math.max(0, rungs.indexOf(broke) - 1)].bpm} BPM your spread stays near ±${r0(base)} ms. At ${broke.bpm} it is ±${r0(broke.sd)} ms. "The faster you play, the slower you count": feel fast tempos in half-time.`,
        sources: ["galper"],
        drill: drills.halfTime({ ...ctx, bpm: broke.bpm }),
      });
    }
  }

  findings.sort((a, b) => b.weight - a.weight);
  const top = findings.find((f) => f.drill);
  const headline = [
    { label: "Spread", value: `±${r0(sd)} ms`, note: spreadWord(sd) },
    absolute && D.n >= 8 ? { label: "Downbeats", value: `${D.mean >= 0 ? "+" : "−"}${r0(Math.abs(D.mean))} ms`, note: Math.abs(D.mean) < 5 ? "on the band" : `${side(D.mean)} the band` } : { label: "Downbeats", value: "?", note: "delay not measured" },
    absolute && U.n >= 8 ? { label: "Offbeats", value: `${U.mean >= 0 ? "+" : "−"}${r0(Math.abs(U.mean))} ms`, note: Math.abs(U.mean) < 8 ? "with the band" : `${side(U.mean)} the band` } : null,
    S.enough && t.swung ? { label: "Swing", value: ratioText(S.ratio), note: `band ${ratioText(S.band)}` } : null,
  ].filter(Boolean);
  return { enough, headline, findings, drill: top ? top.drill : null };
}

/** Exercises teachers use, each as a setup for this page. */
export const drills = {
  backbeat: (c) => ({
    id: "backbeat",
    title: "Click on 2 and 4",
    how: "The metronome plays beats 2 and 4 only, like a hi-hat. You supply 1 and 3. Play quarter notes first, then your lines.",
    patch: { pattern: { clickOn: "backbeat" }, groove: { style: "off" } },
    sources: ["backbeat"],
  }),
  halfTime: (c) => ({
    id: "halftime",
    title: "One click a bar",
    how: `The metronome plays beat 1 only, at ${c.bpm} BPM. Count the bar in two. "The faster you play, the slower you count."`,
    patch: { pattern: { clickOn: "downbeat" }, groove: { style: "off" } },
    sources: ["galper"],
  }),
  offbeatClick: (c) => ({
    id: "offbeat",
    title: "Click on the offbeats",
    how: "The metronome plays the second eighth of every beat. Make your offbeats land on it and let the downbeats fall where they fall. Accent the notes that meet the click.",
    patch: { pattern: { clickOn: "upbeats", subdivision: 2 }, groove: { style: "off" } },
    sources: ["nelias", "dropout"],
  }),
  evenEighths: (c) => ({
    id: "even",
    title: "Even eighths over a swinging band",
    how: "Keep the band swinging and play your eighths as evenly as you can, accenting the offbeats. Then listen to how little swing the line needs.",
    patch: {},
    sources: ["butterfield", "nelias"],
  }),
  dropout: (c) => ({
    id: "dropout",
    title: "Two bars with the band, two without",
    how: "The band plays two bars and is silent for two. Keep playing through the silence. The report shows how far you moved when it comes back.",
    patch: { practice: { gap: { audible: 2, silent: 2 } } },
    sources: ["dropout"],
  }),
  slow: (c) => {
    const bpm = Math.max(40, Math.round((c.bpm * 0.7) / 5) * 5);
    return {
      id: "slow",
      title: `Slow it down to ${bpm}`,
      how: `At ${bpm} BPM every placement is a decision. Play quarter notes, then eighths, with the click on 2 and 4, until the spread tightens. Then raise the tempo in small steps.`,
      patch: { pattern: { bpm, clickOn: "backbeat" } },
      sources: ["backbeat"],
    };
  },
  playRest: (c) => ({
    id: "playrest",
    title: "Play two bars, rest two",
    how: "Play for two bars, then rest for two, and start each phrase on a different eighth of the bar. The pacing numbers show whether you kept to it.",
    patch: {},
    sources: ["space", "backbeat"],
  }),
};

// ---- the notes: harmony and licks ----

Object.assign(SOURCES, {
  baker: {
    kind: "teaching",
    cite: "David Baker's bebop scales: an added passing tone keeps the chord tones on the beats (summary with references)",
    url: "https://en.wikipedia.org/wiki/Bebop_scale",
  },
  ligon: {
    kind: "teaching",
    cite: "Bert Ligon, Connecting Chords with Linear Harmony (1996): 7ths resolve to 3rds across the chord change",
    url: "https://learn.jazzguitarlessons.net/blog/connecting-chords-with-linear-harmony",
  },
  norgaard: {
    kind: "research",
    cite: "Norgaard (2014), How jazz musicians improvise: the central role of auditory and motor patterns. Music Perception 31(3)",
    url: "https://scholarworks.gsu.edu/music_facpub/78",
  },
  frieler: {
    kind: "research",
    cite: "Frieler (2014), Pattern usage in monophonic jazz solos (Weimar Jazz Database, 204 solos)",
    url: "https://jazzomat.hfm-weimar.de/_downloads/a97886b2bf0e109dea103bcda6ad5bbe/frieler_jazzomat_workshop_2014_pattern_pres.pdf",
  },
  anatomy: {
    kind: "research",
    cite: "Frieler, Höger & Pfleiderer (2019), Anatomy of a lick: structure and variants, history and transmission (Dig That Lick)",
    url: "https://dh-abstracts.library.virginia.edu/works/9830",
  },
  metric: {
    kind: "research",
    cite: "Interval patterns are dependent on metrical position in jazz solos (2023), Weimar Jazz Database, 435 solos",
    url: "https://scholarworks.iu.edu/dspace/items/04aea93a-b02d-4ac2-a507-b2b2413bbdc7",
  },
});

const pct = (x) => `${Math.round(x * 100)}%`;
const insideOf = (t) => (t.n ? (t.guide + t.chord) / t.n : 0);
/** Whether two shares differ by more than chance: a two-proportion z test at about 95%. */
function differ(a, na, b, nb) {
  if (na < 8 || nb < 8) return false;
  const p = (a * na + b * nb) / (na + nb);
  const se = Math.sqrt(p * (1 - p) * (1 / na + 1 / nb));
  return se > 0 && Math.abs(a - b) / se > 1.96;
}
const CLASS_WORD = { maj: "major", dom: "dominant", min: "minor", hdim: "half-diminished", dim: "diminished" };
const ordinal = (n) => `${n}${["th", "st", "nd", "rd"][n % 100 > 10 && n % 100 < 14 ? 0 : Math.min(n % 10, 4) % 4]}`;

/**
 * Reads the harmony map and the licks of a take.
 * @param {object} h  analyzeHarmony's result
 * @param {object} L  findLicks' result
 * @returns {{enough:boolean, headline:object[], findings:object[], drill:object|null}}
 */
export function coachNotes(h, L, ctx = {}) {
  const findings = [];
  const add = (f) => findings.push(f);
  if (h.notes < 16) {
    return { enough: false, headline: [], findings: [{ id: "few", weight: 0, title: "Not enough notes with a clear pitch", text: `${h.notes} single notes could be read. Chords and double stops are left out. Play a chorus of single-note lines.`, sources: [] }], drill: null };
  }
  const all = insideOf(h.all);
  const on = insideOf(h.onBeat);
  const off = insideOf(h.offBeat);
  const outside = h.all.outside / h.all.n;

  // 1. Chord tones, and where in the beat they fall.
  if (h.onBeat.n >= 8 && h.offBeat.n >= 8) {
    const clear = differ(on, h.onBeat.n, off, h.offBeat.n);
    if (clear && on > off) {
      add({ id: "beats", weight: 14, title: `Chord tones on the beat: ${pct(on)}. Off the beat: ${pct(off)}`, text: "Your chord tones sit on the beats and the other notes pass between them. That is what makes a line spell the chords without a band, and it is what the bebop scales are built to do.", sources: ["baker"] });
    } else if (on < 0.5) {
      add({
        id: "beats",
        weight: 58,
        title: `Only ${pct(on)} of your notes on the beat are chord tones`,
        text: `On the beat ${pct(on)} of your notes are chord tones, off the beat ${pct(off)}. The ear takes the notes on the beats for the harmony, so the line does not spell the chords. Bebop players add one passing tone to a scale so that the chord tones keep landing on the beats.`,
        sources: ["baker"],
        drill: noteDrills.bebop(ctx),
      });
    } else {
      add({ id: "beats", weight: 10, title: `Chord tones on the beat: ${pct(on)}. Off the beat: ${pct(off)}`, text: "No clear difference between beats and offbeats in this take.", sources: ["baker"] });
    }
  }

  // 2. The first note on each new chord.
  const lands = h.landings;
  if (lands.length >= 6) {
    const roots = lands.filter((l) => l.degree === "root").length / lands.length;
    const guides = lands.filter((l) => l.kind === "guide").length / lands.length;
    const parts = Object.entries(h.landingBy)
      .filter(([, c]) => c.n >= 3)
      .map(([cls, c]) => {
        const top = Object.entries(c.degrees).sort((a, b) => b[1] - a[1])[0];
        return `on ${CLASS_WORD[cls]} chords the ${top[0]} (${top[1]} of ${c.n})`;
      });
    const detail = parts.length ? ` Most often: ${parts.join(", ")}.` : "";
    if (roots >= 0.45) {
      add({
        id: "landing",
        weight: 62,
        title: `You land on the root ${pct(roots)} of the time`,
        text: `Of ${lands.length} chord changes you played into, ${pct(roots)} began on the root and ${pct(guides)} on a 3rd or 7th.${detail} The bass already plays the root. In the figures mined from recorded solos, the most common starting note is the 3rd of the chord.`,
        sources: ["anatomy", "ligon"],
        drill: noteDrills.thirds(ctx),
      });
    } else {
      add({ id: "landing", weight: guides >= 0.5 ? 12 : 30, title: `First note on a new chord: a 3rd or 7th ${pct(guides)} of the time`, text: `Of ${lands.length} chord changes you played into, ${pct(guides)} began on a 3rd or 7th and ${pct(roots)} on the root.${detail}`, sources: ["anatomy"], drill: guides < 0.3 ? noteDrills.thirds(ctx) : null });
    }
  }

  // 3. Crossing the chord change.
  const X = h.crossings;
  if (X.n >= 6) {
    const smooth = X.stepIntoGuide / X.n;
    let text = `You played across ${X.n} chord changes without a rest. In ${pct(X.byStep / X.n)} the line moved by step, and in ${pct(smooth)} it stepped into the 3rd or 7th of the new chord.`;
    if (X.fromSeventh >= 3) text += ` You were on a 7th before the change ${X.fromSeventh} times and let it fall to the next 3rd ${X.seventhToThird} times.`;
    text += " A 7th falling a step to the 3rd of the next chord is the strongest way a single line can say that the chord changed.";
    add({ id: "crossing", weight: smooth < 0.25 ? 52 : 11, title: `Across the changes: by step into a guide tone ${pct(smooth)} of the time`, text, sources: ["ligon"], drill: smooth < 0.25 ? noteDrills.guideLine(ctx) : null });
  }

  // 4. The map of the form: the bar where it comes apart, and the bars never played.
  const cells = h.bySlot.filter((c) => c.n >= 6);
  const choruses = Math.max(...h.bySlot.map((c) => c.choruses), 0);
  const label = (c) => `bar ${c.slot.bar + 1}${c.slot.span < ctx.beats ? (c.slot.k ? ", second half" : ", first half") : ""} (${c.slot.chord})`;
  if (cells.length >= 3) {
    const worst = [...cells].sort((a, b) => insideOf(a) - insideOf(b))[0];
    const rest = { n: h.all.n - worst.n, in: h.all.guide + h.all.chord - worst.guide - worst.chord };
    const others = rest.n ? rest.in / rest.n : 0;
    if (differ(insideOf(worst), worst.n, others, rest.n) && others - insideOf(worst) >= 0.2) {
      const off = (worst.outside + worst.avoid) / worst.n;
      if (off >= 0.25) {
        add({
          id: "weak-bar",
          weight: 56,
          title: `The line loses the chord in ${label(worst)}`,
          text: `There ${pct(insideOf(worst))} of your notes are chord tones, against ${pct(others)} everywhere else (${worst.n} notes over ${worst.choruses} choruses), and ${pct(off)} do not fit the chord at all.`,
          sources: [],
          drill: noteDrills.oneChord(ctx, worst.slot),
        });
      } else {
        add({
          id: "weak-bar",
          weight: 24,
          title: `Fewest chord tones in ${label(worst)}`,
          text: `There ${pct(insideOf(worst))} of your notes are chord tones, against ${pct(others)} everywhere else (${worst.n} notes over ${worst.choruses} choruses). The rest are colour notes and approaches, which fit the chord. Worth knowing if it is not on purpose.`,
          sources: [],
        });
      }
    }
  }
  if (choruses >= 2) {
    const empty = h.bySlot.filter((c) => c.n === 0);
    if (empty.length && empty.length <= h.bySlot.length / 2) {
      add({ id: "empty", weight: 34, title: `You never played in ${empty.length === 1 ? label(empty[0]) : `${empty.length} bars of the form`}`, text: `Over ${choruses} choruses, ${empty.map(label).join(", ")} stayed empty. A rest in the same place every time is a habit, or a chord you step around.`, sources: [] });
    }
  }

  // 5. Outside notes.
  if (outside >= 0.2) {
    add({ id: "outside", weight: 44, title: `${pct(outside)} of your notes are outside the chord's scale`, text: `${h.all.outside} notes were outside the scale and did not resolve by a half step. ${h.all.approach} more were chromatic approaches, which is how outside notes are made to sound right: the next note is a chord tone a half step away.`, sources: ["baker"], drill: noteDrills.approach(ctx) });
  } else if (h.all.approach >= 3) {
    add({ id: "approach", weight: 9, title: `${h.all.approach} chromatic approaches`, text: `You led into a chord tone from a half step away ${h.all.approach} times. ${pct(outside)} of your notes were outside the scale without resolving.`, sources: [] });
  }

  // 6. The shape of the lines.
  const M = h.moves;
  if (M.n >= 20) {
    const steps = M.step / M.n;
    const span = h.range.high - h.range.low;
    if (steps >= 0.8) add({ id: "shape", weight: 36, title: `${pct(steps)} of your moves are steps`, text: `Your lines are almost all scale steps: ${pct(M.third / M.n)} thirds and ${pct(M.leap / M.n)} larger leaps. Lines on records mix scale runs with arpeggios and a few wide intervals.`, sources: ["frieler"], drill: noteDrills.arpeggio(ctx) });
    else add({ id: "shape", weight: 7, title: `Steps ${pct(steps)}, thirds ${pct(M.third / M.n)}, leaps ${pct(M.leap / M.n)}`, text: `${pct(M.up / M.n)} of your moves go up and ${pct(M.down / M.n)} down. Lowest note ${h.name(h.range.low)}, highest ${h.name(h.range.high)}, ${span} semitones apart.`, sources: [] });
    if (span < 12) add({ id: "range", weight: 28, title: `The whole take sits inside ${span} semitones`, text: `From ${h.name(h.range.low)} to ${h.name(h.range.high)}: less than an octave. One position of the neck.`, sources: [] });
  }

  // 7. Licks.
  const real = L.licks.filter((l) => l.shape === "lick");
  const top = real[0];
  if (top) {
    const bits = [];
    if (top.startBeat) bits.push(`it starts on ${top.startBeat.value} ${pct(top.startBeat.share)} of the time`);
    if (top.over && top.over.value) bits.push(`over the ${top.over.value} chord ${pct(top.over.share)} of the time`);
    if (top.from) bits.push(`from the ${top.from.value} ${pct(top.from.share)} of the time`);
    const fixed = top.count >= 4 && top.startBeat && top.startBeat.share >= 0.75;
    add({
      id: "lick",
      weight: fixed || top.weight >= 0.25 ? 50 : 26,
      title: `Your most used lick: ${top.length} notes, played ${top.count} times`,
      text: `${top.here} times in this take${top.takes > 1 ? `, and in ${top.takes - 1} earlier take${top.takes > 2 ? "s" : ""}` : ""}${bits.length ? `; ${bits.join(", ")}` : ""}.${top.weight >= 0.25 ? ` It makes up ${pct(top.weight)} of this take.` : ""}${fixed ? " It always comes out in the same place. On records, short figures are tied to their place in the bar too; moving one is how it becomes yours to use anywhere." : ""}`,
      sources: fixed ? ["metric", "backbeat"] : ["norgaard"],
      drill: fixed ? noteDrills.displace(ctx, top) : null,
    });
  }
  if (L.notes >= 24) {
    add({
      id: "coverage",
      weight: 8,
      title: `${pct(L.coverage)} of your notes are part of a figure you played at least twice`,
      text: `${real.length} licks and ${L.licks.length - real.length} runs or arpeggios came back. Repeating figures is how the language works: in 48 Charlie Parker solos, 82.6% of the notes begin a five-note figure that returns somewhere in those solos. One take is a far smaller sample, so your number will be lower than that.`,
      sources: ["norgaard", "frieler"],
    });
  }

  findings.sort((a, b) => b.weight - a.weight);
  const lead = findings.find((f) => f.drill);
  const guidesLanding = lands.length >= 6 ? lands.filter((l) => l.kind === "guide").length / lands.length : null;
  return {
    enough: true,
    headline: [
      { label: "Chord tones", value: pct(all), note: `${h.notes} notes` },
      h.onBeat.n >= 8 ? { label: "On the beat", value: pct(on), note: "are chord tones" } : null,
      guidesLanding !== null ? { label: "New chord", value: pct(guidesLanding), note: "start on a 3rd or 7th" } : null,
      L.notes >= 24 ? { label: "Repeated", value: pct(L.coverage), note: "of notes in a figure" } : null,
    ].filter(Boolean),
    findings,
    drill: lead ? lead.drill : null,
  };
}

/** Exercises for the notes. They need the chords: the patch turns them on. */
export const noteDrills = {
  bebop: () => ({ id: "bebop", title: "Chord tones on the beat", how: "Take one chord. Start on a chord tone on a beat and run down the scale in eighths. When a chord tone would fall between beats, add one chromatic passing note so the next one lands on the beat again. Then do it through the tune.", patch: { harmony: { on: true } }, sources: ["baker"] }),
  thirds: () => ({ id: "thirds", title: "Land on the 3rd", how: "Play through the tune with one rule: the first note on every new chord is its 3rd. Anything may come before it. When that is easy, land on the 7th.", patch: { harmony: { on: true } }, sources: ["ligon", "anatomy"] }),
  guideLine: () => ({ id: "guideline", title: "The guide-tone line", how: "Play only 3rds and 7ths, one long note per chord, moving to the nearest one each time. In a ii-V-I the 7th falls a step and becomes the next 3rd. Sing it, then decorate it.", patch: { harmony: { on: true } }, sources: ["ligon"] }),
  oneChord: (c, slot) => ({ id: "onechord", title: `Spell ${slot.chord}`, how: `Take bar ${slot.bar + 1} on its own, slowly. Play the arpeggio of ${slot.chord} up from each of its notes in time, then one line that lands on its 3rd. Then play into it from the bar before.`, patch: { harmony: { on: true } }, sources: [] }),
  approach: () => ({ id: "approach", title: "Resolve the outside notes", how: "Play any note outside the chord, but make the very next note a chord tone a half step away. Do it on purpose into every 3rd of the tune.", patch: { harmony: { on: true } }, sources: ["baker"] }),
  arpeggio: () => ({ id: "arpeggio", title: "Arpeggio up, scale down", how: "On each chord, go up the arpeggio from the 3rd to the 9th, then come down the scale. It puts thirds and a leap into every bar.", patch: { harmony: { on: true } }, sources: ["frieler"] }),
  displace: (c, lick) => ({ id: "displace", title: "Move your lick", how: `You start it on ${lick.startBeat.value}. Play the same notes starting an eighth later, then two eighths later, through the whole bar. Then start it from another note of the chord.`, patch: { harmony: { on: true } }, sources: ["metric", "backbeat"] }),
};

// Short names for the links under a finding.
const SHORT = {
  "friberg": "Friberg & Sundström 2002",
  "nelias": "Nelias et al. 2022",
  "benadon": "Benadon 2006",
  "butterfield": "Butterfield 2011",
  "galper": "Galper, Forward Motion",
  "backbeat": "Jazzadvice, great time",
  "space": "Jazzadvice, space",
  "dropout": "A saxophonist's guide to time",
  "baker": "Baker's bebop scales",
  "ligon": "Ligon 1996",
  "norgaard": "Norgaard 2014",
  "frieler": "Frieler 2014",
  "anatomy": "Frieler et al. 2019",
  "metric": "Metrical position study 2023"
};
for (const [k, v] of Object.entries(SHORT)) SOURCES[k].short = v;
