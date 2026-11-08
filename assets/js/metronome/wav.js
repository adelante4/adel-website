// WAV encoding: 16 or 24-bit PCM, any number of channels. No Web Audio in here, so Node can test it.

/** @param {Float32Array[]} channels equal-length sample arrays in -1..1  @param {number} rate @param {16|24} bits */
export function encodeWav(channels, rate, bits = 16) {
  const n = channels[0].length;
  const ch = channels.length;
  const bytes = bits / 8;
  const dataLen = n * ch * bytes;
  const out = new Uint8Array(44 + dataLen);
  const v = new DataView(out.buffer);
  const tag = (o, s) => [...s].forEach((c, i) => (out[o + i] = c.charCodeAt(0)));
  tag(0, "RIFF");
  v.setUint32(4, 36 + dataLen, true);
  tag(8, "WAVE");
  tag(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, ch, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * ch * bytes, true);
  v.setUint16(32, ch * bytes, true);
  v.setUint16(34, bits, true);
  tag(36, "data");
  v.setUint32(40, dataLen, true);
  let o = 44;
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < ch; c++) {
      let s = Math.max(-1, Math.min(1, channels[c][i]));
      if (bits === 16) {
        // triangular dither, one least-significant bit wide, so quiet tails stay smooth
        const d = rnd() - rnd();
        v.setInt16(o, Math.max(-32768, Math.min(32767, Math.round(s * 32767 + d))), true);
      } else {
        const x = Math.round(s * 8388607);
        out[o] = x & 255;
        out[o + 1] = (x >> 8) & 255;
        out[o + 2] = (x >> 16) & 255;
      }
      o += bytes;
    }
  }
  return out;
}

/**
 * Makes a rendered loop seamless: the tail that rang past the end is added onto the start, so when the sample
 * repeats, the last notes ring into the first bar exactly as they would in the band.
 * @param {Float32Array[]} channels  rendered length + tail   @param {number} loopLen samples
 */
export function foldTail(channels, loopLen) {
  return channels.map((c) => {
    const out = c.slice(0, loopLen);
    for (let i = loopLen; i < c.length; i++) out[(i - loopLen) % loopLen] += c[i];
    return out;
  });
}

export const peakOf = (channels) => channels.reduce((m, c) => c.reduce((a, x) => Math.max(a, Math.abs(x)), m), 0);
