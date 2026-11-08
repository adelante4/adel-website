#!/usr/bin/env python3
"""Cuts string, horn and trumpet instruments for the metronome out of VS Chamber Orchestra: Community Edition (CC0).

Usage: python3 tools/build-orchestra.py VSCO_DIR [id ...]
VSCO_DIR is a clone of github.com/sgossner/VSCO-2-CE with the Strings and Brass folders checked out.
The string section is one instrument built from three recordings: cellos in the low register, violas in the middle,
violins on top. File names in this library are not reliable about octaves, so every pitch is measured.
Output goes to assets/audio/inst/<id>/ as 44.1 kHz stereo MP3 with a manifest (see build-keys.py, which does the work).
"""
import glob, importlib.util, os, re, sys
import numpy as np
import soundfile as sf
from scipy.signal import resample_poly

spec = importlib.util.spec_from_file_location("bk", os.path.join(os.path.dirname(__file__), "build-keys.py"))
bk = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bk)
NAMES = bk.NAMES


def name_pitch(path):
    m = re.search(r"_([A-G])(#?)(-?\d)_", os.path.basename(path))
    return NAMES[m.group(1)] + (1 if m.group(2) else 0) + 12 * (int(m.group(3)) + 1)


def measured(path):
    x, sr = sf.read(path, dtype="float64")
    if x.ndim > 1:
        x = x.mean(axis=1)
    x = resample_poly(x, 16000, sr) if sr != 16000 else x
    s = x[8000 : 8000 + 16384] * np.hanning(16384)
    ac = np.fft.irfft(np.abs(np.fft.rfft(s, 2 * len(s))) ** 2)[: len(s)]
    lo, hi = int(16000 / 1500), int(16000 / 30)
    k = lo + int(np.argmax(ac[lo:hi]))
    return 69 + 12 * np.log2(16000 / k / 440)


def fixed(path):
    """The file's pitch class from its name, in the octave the audio is really in."""
    g = name_pitch(path)
    return g + 12 * round((measured(path) - g) / 12)


def vel(path):
    m = re.search(r"_v(\d)", os.path.basename(path))
    return int(m.group(1)) if m else 2


def gather(pattern, lo=0, hi=200, prefer=2):
    """Every note in range, one file per pitch: the velocity closest to `prefer` (the mid dynamic) wins."""
    best = {}
    for p in glob.glob(pattern):
        m = fixed(p)
        if lo <= m <= hi and (m not in best or abs(vel(p) - prefer) < abs(vel(best[m]) - prefer)):
            best[m] = p
    return sorted(((p, float(m)) for m, p in best.items()), key=lambda t: t[1])


def main():
    src = sys.argv[1]
    want = set(sys.argv[2:])
    S, B = os.path.join(src, "Strings"), os.path.join(src, "Brass")
    jobs = {
        "strings": lambda: bk.build(
            "strings", "Strings", "VS Chamber Orchestra CE (CC0): cello, viola and violin sections, sustained with vibrato",
            gather(os.path.join(S, "Cello Section", "susvib", "*.wav"), hi=64, prefer=3)
            + gather(os.path.join(S, "Viola Section", "susvib", "*.wav"), 52, 76)
            + gather(os.path.join(S, "Violin Section", "susVib", "*.wav"), 60),
            6.0, 0.7, thin=1, fade=2.2, hq=True),
        "horn": lambda: bk.build(
            "horn", "French horn", "VS Chamber Orchestra CE (CC0): F horn, sustained",
            gather(os.path.join(B, "F Horn", "sus", "*.wav")), 5.0, 0.5, thin=1, fade=1.8, hq=True),
        "trumpet": lambda: bk.build(
            "trumpet", "Trumpet", "VS Chamber Orchestra CE (CC0): trumpet, sustained with vibrato",
            gather(os.path.join(B, "Trumpet", "susvib", "*.wav")), 4.5, 0.4, thin=1, fade=1.6, hq=True),
    }
    for k, fn in jobs.items():
        if not want or k in want:
            print(k)
            fn()


if __name__ == "__main__":
    main()
