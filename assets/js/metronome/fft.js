// A radix-2 FFT. Pure code, no Web Audio, so the listening code runs under Node.
//
// createFFT(n) returns transforms that work in place on separate real and imaginary arrays.
// n must be a power of two.

export function createFFT(n) {
  if (n < 2 || (n & (n - 1)) !== 0) throw new Error("FFT size must be a power of two");
  const half = n >> 1;
  const cos = new Float64Array(half);
  const sin = new Float64Array(half);
  for (let i = 0; i < half; i++) {
    cos[i] = Math.cos((2 * Math.PI * i) / n);
    sin[i] = Math.sin((2 * Math.PI * i) / n);
  }
  const rev = new Uint32Array(n);
  const bits = Math.round(Math.log2(n));
  for (let i = 0; i < n; i++) {
    let r = 0;
    for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b);
    rev[i] = r;
  }

  function run(re, im, sign) {
    for (let i = 0; i < n; i++) {
      const j = rev[i];
      if (j > i) {
        let t = re[i];
        re[i] = re[j];
        re[j] = t;
        t = im[i];
        im[i] = im[j];
        im[j] = t;
      }
    }
    for (let size = 2; size <= n; size <<= 1) {
      const h = size >> 1;
      const step = n / size;
      for (let start = 0; start < n; start += size) {
        for (let k = 0, t = 0; k < h; k++, t += step) {
          const wr = cos[t];
          const wi = sign * sin[t];
          const a = start + k;
          const b = a + h;
          const xr = re[b] * wr - im[b] * wi;
          const xi = re[b] * wi + im[b] * wr;
          re[b] = re[a] - xr;
          im[b] = im[a] - xi;
          re[a] += xr;
          im[a] += xi;
        }
      }
    }
  }

  return {
    size: n,
    /** Forward transform, in place. */
    forward(re, im) {
      run(re, im, -1);
    },
    /** Inverse transform, in place, scaled so inverse(forward(x)) is x. */
    inverse(re, im) {
      run(re, im, 1);
      for (let i = 0; i < n; i++) {
        re[i] /= n;
        im[i] /= n;
      }
    },
  };
}

/** A Hann window of n points (periodic form, which overlap-adds to a constant). */
export function hann(n) {
  const w = new Float64Array(n);
  for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n);
  return w;
}

export const nextPow2 = (x) => {
  let n = 1;
  while (n < x) n <<= 1;
  return n;
};
