#!/usr/bin/env python3
"""Cuts keys instruments for the metronome out of the CC0 Versilian Community Sample Library (VCSL).

Usage: python3 tools/build-keys.py VCSL_DIR [id ...]
VCSL_DIR is a clone of github.com/sgossner/VCSL. Output goes to assets/audio/inst/<id>/ as 32 kHz 16-bit mono
WAV (the two pianos: 44.1 kHz stereo MP3) with a manifest (note pitches are measured, not read from file names).
"""
import glob, json, os, re, sys
import numpy as np
import scipy.io.wavfile as wav
from scipy.signal import resample_poly

SR = 32000
OUT = os.path.join(os.path.dirname(__file__), "..", "assets", "audio", "inst")
NAMES = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}


def read(path):
    sr, x = wav.read(path)
    full = float(np.iinfo(x.dtype).max) + 1 if np.issubdtype(x.dtype, np.integer) else 1.0
    x = x.astype(np.float64) / full
    if x.ndim > 1:
        x = x.mean(axis=1)
    return resample_poly(x, SR, sr) if sr != SR else x


def read_hq(path, sr_out=44100):
    """Full-rate stereo, for the pianos (kept stereo: the width is a large part of why a piano sounds real)."""
    sr, x = wav.read(path)
    full = float(np.iinfo(x.dtype).max) + 1 if np.issubdtype(x.dtype, np.integer) else 1.0
    x = x.astype(np.float64) / full
    if x.ndim == 1:
        x = np.stack([x, x], axis=1)
    return resample_poly(x, sr_out, sr, axis=0) if sr != sr_out else x


def f0_midi(x, guess):
    """Pitch by autocorrelation near the guess (the name tells us the pitch class, the audio the octave and cents)."""
    seg = x[int(0.15 * SR) : int(0.15 * SR) + 16384]
    if len(seg) < 4096:
        seg = x[: 16384]
    seg = seg * np.hanning(len(seg))
    n = len(seg)
    ac = np.fft.irfft(np.abs(np.fft.rfft(seg, 2 * n)) ** 2)[:n]
    lo, hi = int(SR / 2300), int(SR / 25)
    ac[:lo] = 0
    # Look near the guessed period, allowing octave doubts.
    best = None
    for oct_ in (0,):
        p = SR / (440 * 2 ** ((guess + oct_ - 69) / 12))
        a, b = int(p * 0.94), int(p * 1.06)
        if a < lo or b >= min(hi, n - 2):
            continue
        k = a + int(np.argmax(ac[a:b]))
        if k <= 1:
            continue
        y0, y1, y2 = ac[k - 1], ac[k], ac[k + 1]
        d = 0.5 * (y0 - y2) / (y0 - 2 * y1 + y2 + 1e-12)
        score = ac[k] / (ac[0] + 1e-12)
        if best is None or score > best[0]:
            best = (score, 69 + 12 * np.log2(SR / (k + d) / 440))
    return best[1] if best and np.isfinite(best[1]) else float(guess)


def parse_midi(name, zero=12):
    m = re.search(r"([A-G])(#?)(-?\d)", name)
    if not m:
        return None
    return NAMES[m.group(1)] + (1 if m.group(2) else 0) + 12 * (int(m.group(3)) + 1) + (zero - 12)


def build(inst_id, name, credit, files, seconds, release, thin=1, fade=0.5, peak=-3, shift=0, hq=False):
    """files: [(path, nominal midi)]. Thin: keep every `thin`th note by pitch."""
    files = sorted(files, key=lambda f: f[1])
    # file names use different octave numbering in different VCSL instruments; `shift` fixes it
    seen, uniq = [], []
    for path, g in files:
        if all(abs(g - o) > 0.5 for o in seen):
            seen.append(g)
            uniq.append((path, g + shift))
    files = uniq[::thin]
    d = os.path.join(OUT, inst_id)
    os.makedirs(d, exist_ok=True)
    for f in glob.glob(os.path.join(d, "*")):
        os.remove(f)
    items = []
    for path, guess in files:
        x = read(path)
        midi = f0_midi(x, guess)
        if hq:
            xm = x
            x = read_hq(path)
            pk = np.abs(x).max()
            on = int(np.argmax(np.abs(x).max(axis=1) > pk * 0.02))
            x = x[max(0, on - int(0.002 * 44100)) :][: int(seconds * 44100)].copy()
            f = min(len(x), int(fade * 44100))
            x[-f:] *= (np.linspace(1, 0, f) ** 2)[:, None]
            items.append((midi, guess, x))
            continue
        pk = np.abs(x).max()
        on = int(np.argmax(np.abs(x) > pk * 0.02))
        x = x[max(0, on - int(0.002 * SR)) :][: int(seconds * SR)].copy()
        f = min(len(x), int(fade * SR))
        x[-f:] *= np.linspace(1, 0, f) ** 2
        items.append((midi, guess, x))
    top = max(np.abs(x).max() for _, _, x in items)
    ext = "mp3" if hq else "wav"
    rate = 44100 if hq else SR
    scale = 10 ** (peak / 20) / top
    notes = []
    for midi, guess, x in items:
        fn = f"n{round(midi)}.{ext}"
        if abs(midi - guess) >= 1.5:
            midi = float(guess)  # the measurement drifted (a thin or noisy note): trust the name
        pcm = (np.clip(x * scale, -1, 1) * 32767).astype(np.int16)
        if hq:
            tmp = os.path.join(d, "_t.wav")
            wav.write(tmp, rate, pcm)
            os.system(f'ffmpeg -loglevel error -y -i "{tmp}" -codec:a libmp3lame -b:a 112k "{os.path.join(d, fn)}"')
            os.remove(tmp)
        else:
            wav.write(os.path.join(d, fn), rate, pcm)
        notes.append({"midi": round(float(midi), 3), "file": fn})
        flag = "" if abs(midi - guess) < 1.5 else f"  (name said {guess})"
        print(f"  {fn} {midi:.2f}{flag}")
    json.dump({"id": inst_id, "name": name, "kind": "keys", "sampleRate": rate, "release": release, "license": "CC0 1.0", "credit": credit, "notes": notes}, open(os.path.join(d, "manifest.json"), "w"), indent=1)
    size = sum(os.path.getsize(f) for f in glob.glob(os.path.join(d, "*")))
    print(f"{inst_id}: {len(notes)} notes, {size / 1e6:.2f} MB")


def collect(pattern, zero=12, filt=None):
    out = []
    for p in glob.glob(pattern):
        m = parse_midi(os.path.basename(p), zero)
        if m is None or (filt and not filt(p)):
            continue
        out.append((p, m))
    return out


def main():
    src = sys.argv[1]
    want = set(sys.argv[2:])
    Z = os.path.join(src, "Chordophones", "Zithers")
    jobs = {
        "grand": lambda: build("grand", "Grand piano", "VCSL, Steinway B grand (J. Hodges)",
                               collect(os.path.join(Z, "Grand Piano, Steinway B", "Sus", "JHPiano_Sus_Close_*_vl3_rr1.wav")), 5.0, 0.5, thin=1, fade=2.0, hq=True),
        "kawai": lambda: build("kawai", "Studio grand", "VCSL, Kawai grand",
                               collect(os.path.join(Z, "Grand Piano, Kawai", "Sustains", "GPiano_sus_*_v3_rr1_Player.wav")), 5.0, 0.5, thin=1, fade=2.0, shift=12, hq=True),
        "strumstick": lambda: build("strumstick", "Strumstick", "VCSL, strumstick (fingerpicked)",
                                    collect(os.path.join(src, "Chordophones", "Composite Chordophones", "Strumstick", "Finger", "Strumstick_Finger_Str*_Main_*_vl3_rr1.wav")), 3.0, 0.3, thin=1, fade=1.0, hq=True),
        "pipeorgan": lambda: build("pipeorgan", "Pipe organ", "VCSL, pipe organ (quiet registration)",
                                   collect(os.path.join(src, "Aerophones", "Edge-blown Aerophones", "Pipe Organ", "Quiet", "*_rr1.wav")), 4.5, 0.4, thin=2, fade=1.5, hq=True),
        "tubular": lambda: build("tubular", "Tubular bells", "VCSL, tubular bells",
                                 collect(os.path.join(src, "Idiophones", "Struck Idiophones", "Tubular Bells 1", "chimes_*_ff_rr*.wav")), 4.0, 0.5, thin=1, fade=1.8, hq=True),
        "glock": lambda: build("glock", "Glockenspiel", "VCSL, glockenspiel",
                               collect(os.path.join(src, "Idiophones", "Struck Idiophones", "Glockenspiel", "glock_medium_*_01.wav")), 3.0, 0.3, thin=1, fade=1.2, hq=True),
        "harpsichord": lambda: build("harpsichord", "Harpsichord", "VCSL, English harpsichord (Zuckermann)",
                                     collect(os.path.join(Z, "Harpsichord, English", "Sustains", "Normal", "*_rr1.wav")), 3.0, 0.15, thin=3, fade=0.6, shift=12),
        "harp": lambda: build("harp", "Concert harp", "VCSL, concert harp (K. Smith)",
                              collect(os.path.join(src, "Chordophones", "Composite Chordophones", "Concert Harp", "KSHarp_*_mf1.wav")), 4.0, 0.4, thin=2, fade=1.0),
        "marimba": lambda: build("marimba", "Marimba", "VCSL, marimba",
                                 collect(os.path.join(src, "Idiophones", "Struck Idiophones", "Marimba", "*_med_01.wav")), 2.5, 0.15, thin=1, fade=0.5, shift=12),
        "kalimba": lambda: build("kalimba", "Kalimba", "VCSL, Kenyan kalimba",
                                 collect(os.path.join(src, "Idiophones", "Plucked Idiophones", "Kalimba, Kenya", "*.wav")), 3.0, 0.3, thin=1, fade=0.8, shift=12),
    }
    for k, fn in jobs.items():
        if not want or k in want:
            print(k)
            fn()


if __name__ == "__main__":
    main()
