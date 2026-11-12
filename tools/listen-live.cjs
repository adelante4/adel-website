// A live test of the Listen section in a real browser, with a simulated player.
//
// The page runs as normal. Its microphone is replaced by a made-up room: the page's own output comes back
// delayed and quieter (speakers), mixed with a synthetic plucked guitar that plays eighth notes with planted
// habits against the page's beat. The report the page produces is then compared with what was planted.
//
//   python3 -m http.server 8765 &   NODE_PATH=/opt/npm-tools/node_modules node tools/listen-live.cjs
const { chromium } = require("playwright");

const PLANT = { bpm: 132, bars: 22, downLate: 22, upLate: 2, spread: 7, beat4: -16, roomDelay: 0.041, bleed: Number(process.env.BLEED ?? 0.5), direct: process.env.DIRECT === "1", tune: process.env.NOTES === "1" };
// NOTES=1: the player plays a written chorus over a ii-V-I, six times, to check the harmony map and the licks.
const CHORUS = [[0, 62], [0.5, 64], [1, 65], [1.5, 69], [2, 72], [2.5, 69], [3, 65], [3.5, 72], [4, 71], [4.5, 74], [5, 77], [5.5, 76], [6, 74], [6.5, 72], [7, 71], [7.5, 69], [8, 67], [8.5, 64], [9, 60], [9.5, 64]];
if (PLANT.tune) Object.assign(PLANT, { bars: 26, bleed: 0, direct: true });

(async () => {
  const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto("http://localhost:8765/metronome.html?bench");
  await page.evaluate(() => localStorage.clear());
  await page.goto("http://localhost:8765/metronome.html?bench");
  await page.waitForFunction(() => window.__bench);

  // The made-up room, in the page's own audio context.
  await page.evaluate(async (P) => {
    const { audio } = window.__bench;
    const ctx = await audio.resume();
    const room = ctx.createDelay(1);
    room.delayTime.value = P.roomDelay;
    const out = ctx.createMediaStreamDestination();
    const bleed = ctx.createGain();
    bleed.gain.value = P.bleed;
    audio.output.connect(bleed);
    bleed.connect(room);
    room.connect(out);
    const hiss = ctx.createBufferSource();
    const nb = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const nd = nb.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = (Math.random() * 2 - 1) * 0.002;
    hiss.buffer = nb;
    hiss.loop = true;
    hiss.connect(out);
    hiss.start();
    window.__room = { room, ctx, bleed };
    // DIRECT=1 wires the room straight into the listener. Otherwise it goes the long way, as a media stream.
    if (P.direct) {
      const sum = ctx.createGain();
      room.connect(sum);
      hiss.connect(sum);
      window.__benchMic = sum;
    } else navigator.mediaDevices.getUserMedia = async () => out.stream;
  }, PLANT);

  await page.evaluate((P) => window.__bench.applyPatch({ pattern: { bpm: P.bpm }, practice: { countIn: 2 }, ...(P.tune ? { harmony: { on: true, form: [["Dm7"], ["G7"], ["Cmaj7"], ["Cmaj7"]] } } : {}) }), PLANT);
  await page.click("#listen-mic");
  await page.waitForFunction(() => window.__bench.listen.on);
  if (process.env.MODE === "headphones") {
    // Measure the delay once with the sweep (an earcup held to the microphone), then cut the band out of the room.
    await page.click("#listen-measure");
    await page.waitForTimeout(4300);
    console.log("measured:", await page.textContent("#listen-delay"));
    await page.evaluate(() => (window.__room.bleed.gain.value = 0));
  }
  await page.click("#start");
  await page.waitForFunction(() => window.__bench.transport.running);

  // The player: plucked eighths from bar 4 on, placed against the beat the page plays.
  const truth = await page.evaluate(async (P) => {
    const { pluck, midiHz } = await import("/test/helpers/synth.mjs");
    const { mulberry32 } = await import("/assets/js/metronome/prng.js");
    const { transport } = window.__bench;
    const { ctx, room } = window.__room;
    const r = mulberry32(5);
    const gauss = () => Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r());
    const spb = 60 / P.bpm;
    const now = ctx.currentTime;
    const t0 = now - transport.beatAt(now) * spb;
    let n = 0;
    const play = (beat, midi, ms) => {
      const data = pluck(midiHz(midi), Math.min(0.5, spb * 0.5 + 0.01), ctx.sampleRate, { seed: n + 1, amp: 0.35 + 0.2 * r() });
      const buf = ctx.createBuffer(1, data.length, ctx.sampleRate);
      buf.copyToChannel(data, 0);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(room);
      src.start(t0 + beat * spb + ms / 1000);
      n++;
    };
    if (P.tune) {
      // The count-in is two bars, so the form starts at bar 2. Every chorus is the same written line.
      for (let c = 0; c < 6; c++) for (const [b, midi] of P.chorus) play(8 + c * 16 + b, midi, gauss() * 6);
      return { notes: n, seconds: P.bars * 4 * spb - (now - t0) };
    }
    for (let bar = 4; bar < P.bars; bar++) {
      if (bar % 4 === 3) continue; // a bar of rest every four
      for (let b = 0; b < 4; b++) {
        for (const up of [0, 1]) {
          const ms = (up ? P.upLate : P.downLate + (b === 3 ? P.beat4 : 0)) + gauss() * P.spread;
          const when = t0 + (bar * 4 + b + up * 0.5) * spb + ms / 1000;
          const data = pluck(midiHz(52 + ((n * 5) % 20)), Math.min(0.5, spb * 0.5 + 0.01), ctx.sampleRate, { seed: n + 1, amp: 0.35 + 0.2 * r() });
          const buf = ctx.createBuffer(1, data.length, ctx.sampleRate);
          buf.copyToChannel(data, 0);
          const src = ctx.createBufferSource();
          src.buffer = buf;
          src.connect(room);
          src.start(when);
          n++;
        }
      }
    }
    return { notes: n, seconds: P.bars * 4 * spb - (now - t0) };
  }, { ...PLANT, chorus: CHORUS });

  await page.waitForTimeout(truth.seconds * 1000 + 600);
  const room = await page.evaluate(() => {
    const s = window.__bench.listen.room;
    return { mode: s.mode, roundTrip: s.roundTrip, confidence: s.confidence, onsets: s.onsets, dropped: s.dropped, leak: s.leak, leakLevel: s.leakLevel, leftover: s.leftovers[Math.floor(s.leftovers.length / 2)] };
  });
  await page.click("#start");
  await page.waitForFunction(() => window.__bench.listen.last);
  const got = await page.evaluate(() => {
    const { t, p, c, rt } = window.__bench.listen.last;
    return { timed: t.timed, other: t.other, unplaced: t.unplaced, down: t.down.mean, downSd: t.down.sd, up: t.up.mean, swing: t.swing.ratio, beat4: t.byBeat[3], rest: p.restShare, phrases: p.count, source: rt.source, rtMs: rt.seconds * 1000, headline: c.headline, findings: c.findings.map((f) => f.title), drill: c.drill && c.drill.title, restBarNotes: window.__bench.listen.last.notes.filter((n) => Math.floor(n.beat / 4) % 4 === 3).map((n) => [+n.beat.toFixed(2), Math.round(n.level), n.precise]) };
  });
  if (PLANT.tune) {
    got.notes = await page.evaluate(() => {
      const { h, L, n } = window.__bench.listen.last;
      const share = (t) => Math.round(((t.guide + t.chord) / Math.max(1, t.n)) * 100);
      return {
        read: h.notes,
        unpitched: h.unpitched,
        chordTones: share(h.all),
        onBeat: share(h.onBeat),
        offBeat: share(h.offBeat),
        landing: Object.fromEntries(Object.entries(h.landingBy).map(([k, v]) => [k, v.degrees])),
        crossings: h.crossings,
        bars: h.bySlot.map((c) => `${c.slot.chord} ${c.n} notes ${share(c)}%`),
        licks: L.licks.slice(0, 3).map((l) => ({ shape: l.shape, notes: l.length, count: l.count, start: l.startBeat, over: l.over, from: l.from })),
        coverage: L.coverage,
        findings: n.findings.map((f) => f.title),
        drill: n.drill && n.drill.title,
      };
    });
  }
  await page.screenshot({ path: "/tmp/work/listen-report.png", fullPage: true });
  await page.locator("#listen-report").screenshot({ path: "/tmp/work/listen-report-only.png" });
  await browser.close();
  console.log(JSON.stringify({ planted: PLANT, played: truth.notes, room, got, errors }, null, 1));
})();
