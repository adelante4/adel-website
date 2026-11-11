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
