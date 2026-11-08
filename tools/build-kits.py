#!/usr/bin/env python3
"""Cuts drum kits for the metronome out of CC0 sample libraries (Karoryfer Samples, via sfzinstruments on GitHub).

Usage: python3 tools/build-kits.py SRC_DIR [kit ...]
SRC_DIR holds clones of karoryfer.swirly-drums and karoryfer.gogodze-phu-vol-ii. Output goes to assets/audio/kits/<id>/.
Each voice is cut to a few velocity layers with two round robins, mixed from several mics, trimmed, faded and
written as 16-bit mono 44.1 kHz WAV, with a manifest the sampler reads.
"""
import glob, json, os, re, sys
import numpy as np
import scipy.io.wavfile as wav
from scipy.signal import resample_poly

SR = 44100
OUT = os.path.join(os.path.dirname(__file__), "..", "assets", "audio", "kits")


def read(path):
    sr, x = wav.read(path)
    full = float(np.iinfo(x.dtype).max) + 1 if np.issubdtype(x.dtype, np.integer) else 1.0
    x = x.astype(np.float64) / full  # absolute level, so velocity layers keep their dynamics
    if x.ndim > 1:
        x = x.mean(axis=1)
    if sr != SR:
        x = resample_poly(x, SR, sr)
    return x


def mix(parts):
    """parts: [(path, weight)]. Later parts flip polarity when they fight the first."""
    base = None
    for path, wgt in parts:
        x = read(path)
        if base is None:
            base = x * wgt
            continue
        n = min(len(base), len(x), 4000)
        sign = -1.0 if np.dot(base[:n], x[:n]) < 0 else 1.0
        if len(x) < len(base):
            x = np.pad(x, (0, len(base) - len(x)))
        base = base[: len(x)] if len(x) < len(base) else base
        base = np.pad(base, (0, max(0, len(x) - len(base))))
        base += sign * wgt * x[: len(base)]
    return base


def cut(x, seconds, fade=0.05):
    # Start at the onset.
    pk = np.abs(x).max()
    on = int(np.argmax(np.abs(x) > pk * 0.02))
    x = x[max(0, on - int(0.002 * SR)) :]
    n = int(seconds * SR)
    x = x[:n]
    f = min(len(x), int(fade * SR))
    x[-f:] *= np.linspace(1, 0, f) ** 2
    return x


def groups(files, key):
    """Sort files by velocity, return them in order."""
    return sorted(files, key=key)


def pick(items, layers, per):
    """Split velocity-sorted `items` into `layers` buckets and take `per` from each, spread out."""
    n = len(items)
    out = []
    for L in range(layers):
        lo, hi = round(L * n / layers), round((L + 1) * n / layers)
        bucket = items[lo:hi] or [items[min(lo, n - 1)]]
        idx = np.unique(np.linspace(0, len(bucket) - 1, per).round().astype(int))
        chosen = [bucket[i] for i in idx]
        while len(chosen) < per:
            chosen.append(chosen[-1])
        out.append(chosen)
    return out


def vl_rr(path):
    m = re.search(r"vl(\d+)", path)
    r = re.search(r"rr(\d+)", path)
    return (int(m.group(1)) if m else 0, int(r.group(1)) if r else 0)


def build(kit_id, name, credit, voices):
    d = os.path.join(OUT, kit_id)
    os.makedirs(d, exist_ok=True)
    for f in glob.glob(os.path.join(d, "*")):
        os.remove(f)
    man = {"id": kit_id, "name": name, "license": "CC0 1.0", "credit": credit, "sampleRate": SR, "voices": {}}
    for voice, spec in voices.items():
        picked = pick(spec["items"], spec["layers"], spec.get("per", 2))
        # Scale so the loudest layer of the voice peaks at spec["peak"] dBFS; layers keep their balance.
        cuts = [[cut(mix(spec["mix"](it)), spec["len"], spec.get("fade", 0.05)) for it in layer] for layer in picked]
        top = max(np.abs(c).max() for layer in cuts for c in layer)
        scale = 10 ** (spec.get("peak", -3) / 20) / top
        hits = []
        for li, layer in enumerate(cuts):
            for ri, c in enumerate(layer):
                fn = f"{voice}-{li}-{ri + 1}.wav"
                y = c * scale
                # The softest recordings can be nearly silent; keep every hit within 20 dB of the voice's top.
                floor = 10 ** ((spec.get("peak", -3) - 20) / 20)
                y *= max(1.0, floor / max(np.abs(y).max(), 1e-9))
                wav.write(os.path.join(d, fn), SR, (np.clip(y, -1, 1) * 32767).astype(np.int16))
                hits.append({"layer": li, "file": fn})
        man["voices"][voice] = {"layers": spec["layers"], "hits": hits}
    json.dump(man, open(os.path.join(d, "manifest.json"), "w"), indent=1)
    size = sum(os.path.getsize(f) for f in glob.glob(os.path.join(d, "*")))
    print(f"{kit_id}: {len(man['voices'])} voices, {size / 1e6:.2f} MB")


def main():
    src = sys.argv[1]
    want = set(sys.argv[2:])
    GG = os.path.join(src, "karoryfer.gogodze-phu-vol-ii", "Samples")
    SW = os.path.join(src, "karoryfer.swirly-drums", "Samples")

    def gg(prefix, mics, layers, ln, lo=0, hi=None, per=2, peak=-3, fade=0.05):
        ref = sorted(glob.glob(os.path.join(GG, "wndw_mic", f"{prefix}_vl*_rr*.wav")), key=vl_rr)
        ref = [os.path.basename(p) for p in ref][lo:hi]
        return {
            "items": ref,
            "layers": layers,
            "per": per,
            "len": ln,
            "peak": peak,
            "fade": fade,
            "mix": lambda fn: [(os.path.join(GG, f"{m}_mic", fn), w) for m, w in mics.items()],
        }

    def sw(folder, pattern, layers, ln, parts=None, lo=0, hi=None, per=2, peak=-3, fade=0.05):
        """parts: {suffix: weight} for files that come as pairs (mics), matched by replacing `{p}` in pattern."""
        files = sorted(glob.glob(os.path.join(SW, folder, pattern.replace("{p}", list(parts)[0] if parts else ""))), key=vl_rr)
        files = files[lo:hi]
        if parts:
            first = list(parts)[0]
            return {
                "items": files, "layers": layers, "per": per, "len": ln, "peak": peak, "fade": fade,
                "mix": lambda f: [(f.replace(first, p), w) for p, w in parts.items()],
            }
        return {"items": files, "layers": layers, "per": per, "len": ln, "peak": peak, "fade": fade, "mix": lambda f: [(f, 1.0)]}

    kits = {}

    room = {"kick": 0.5, "wndw": 1.0, "oh": 0.5}
    kits["gogoroom"] = (
        "70s room kit",
        "Karoryfer Samples, Gogodze Phu Vol II (window and overhead mics)",
        {
            "kick": gg("ks", {"kick": 0.5, "wndw": 1.0, "oh": 0.5}, 3, 1.0, peak=-2),
            "snare": gg("sc", {"snare": 0.5, "wndw": 1.0, "oh": 0.6}, 3, 1.0),
            "ghost": gg("sc", {"snare": 0.5, "wndw": 1.0, "oh": 0.6}, 2, 0.5, hi=4, peak=-14),
            "rim": gg("ss", {"snare": 0.5, "wndw": 1.0, "oh": 0.6}, 2, 0.5, peak=-8),
            "hat": gg("hc", {"oh": 1.0, "wndw": 0.8}, 3, 0.4, peak=-9),
            "ohat": gg("ho", {"oh": 1.0, "wndw": 0.8}, 2, 1.8, peak=-9, fade=0.4),
            "foot": gg("hf", {"oh": 1.0, "wndw": 0.8}, 2, 0.3, peak=-12),
        },
    )
    kits["gogoretro"] = (
        "Dusty tape kit",
        "Karoryfer Samples, Gogodze Phu Vol II (retro mic)",
        {
            "kick": gg("ks", {"retro": 1.0, "kick": 0.25}, 3, 0.9, peak=-2),
            "snare": gg("sc", {"retro": 1.0, "snare": 0.2}, 3, 0.8),
            "ghost": gg("sc", {"retro": 1.0}, 2, 0.4, hi=4, peak=-14),
            "rim": gg("ss", {"retro": 1.0}, 2, 0.4, peak=-8),
            "hat": gg("hc", {"retro": 1.0}, 3, 0.3, peak=-9),
            "ohat": gg("ho", {"retro": 1.0}, 2, 1.4, peak=-9, fade=0.3),
            "foot": gg("hf", {"retro": 1.0}, 2, 0.25, peak=-12),
        },
    )
    kits["swirly"] = (
        "Studio kit",
        "Karoryfer Samples, Swirly Drums",
        {
            "kick": sw("marching_kick", "marching_kick_vl*_rr*_beater.wav", 3, 0.9, {"beater": 0.7, "reso": 1.0}, lo=3, hi=18, peak=-2),
            "snare": sw("snare_main", "snare_hit_vl*_rr*_top.wav", 3, 0.7, {"top": 1.0, "btm": 0.45}, lo=10, peak=-3),
            "ghost": sw("snare_main", "snare_hit_vl*_rr*_top.wav", 2, 0.4, {"top": 1.0, "btm": 0.45}, hi=24, peak=-14),
            "rim": sw("snare_dig", "snare_dig_vl*_top.wav", 2, 0.35, {"top": 1.0, "btm": 0.4}, peak=-8),
            "hat": sw("hat_closed", "hh_closed_vl*_rr*.wav", 3, 0.35, peak=-9),
            "ohat": sw("hat_open", "hh_open_vl*_rr*.wav", 2, 1.6, peak=-9, fade=0.4),
            "foot": sw("hat_foot", "hh_foot_vl*_rr*.wav", 2, 0.25, peak=-12),
            "ride": sw("ride", "ride_vl*_rr*.wav", 3, 2.2, peak=-9, fade=0.5),
            "brush": sw("snare_stir", "stir_dl*_rr*.wav", 2, 0.6, peak=-10, fade=0.25),
        },
    )
    kits["hands"] = (
        "Cajon and hands",
        "Karoryfer Samples, Swirly Drums (cajon, djembe, bongos, darbouka, cowbell)",
        {
            "kick": sw("cajon_kick", "cajon_kick_vl*_rr*_front.wav", 3, 0.7, {"front": 0.8, "rear": 1.0}, lo=2, peak=-2),
            "snare": sw("darbouka", "darbouka_vl*.wav", 3, 0.5, peak=-3, lo=3),
            "ghost": sw("lbongo", "lbongo_vl*.wav", 2, 0.35, peak=-12, hi=7),
            "rim": sw("hbongo", "hbongo_vl*.wav", 2, 0.3, peak=-8),
            "hat": sw("hbongo", "hbongo_vl*.wav", 3, 0.18, peak=-14, hi=6),
            "ohat": sw("djembe", "djembe_vl*.wav", 2, 0.9, peak=-8, fade=0.3, hi=9),
            "foot": sw("djembe", "djembe_vl*.wav", 2, 0.5, peak=-9, hi=5, fade=0.2),
            "ride": sw("cowbell", "cowbell_vl*.wav", 3, 0.6, peak=-8, fade=0.2),
        },
    )
    for k, (name, credit, voices) in kits.items():
        if not want or k in want:
            build(k, name, credit, voices)


if __name__ == "__main__":
    main()
