#!/usr/bin/env python3
"""Builds stereo drum kits from multi-mic CC0 libraries (Karoryfer Big Rusty Drums, Versilian Virtuosity Drums).

Usage: python3 tools/build-kits-stereo.py SRC_DIR [kit ...]
Unlike build-kits.py (mono), this keeps the overhead and room mics in stereo, mixes close mics in the middle, and
cuts four velocity layers with up to three round robins each. Output: 16-bit stereo 44.1 kHz WAV plus manifest.
"""
import glob, json, os, re, subprocess, sys
import numpy as np
import scipy.io.wavfile as wav
import soundfile as sf
from scipy.signal import resample_poly

SR = 44100
OUT = os.path.join(os.path.dirname(__file__), "..", "assets", "audio", "kits")


def read(path):
    x, sr = sf.read(path, dtype="float64", always_2d=True)
    if sr != SR:
        x = resample_poly(x, SR, sr, axis=0)
    return np.repeat(x, 2, axis=1) if x.shape[1] == 1 else x[:, :2]


def mix(parts):
    """parts: [(path, weight)] -> stereo array. A part that fights the first in polarity is flipped."""
    base = None
    for path, wgt in parts:
        x = read(path)
        if base is None:
            base = x * wgt
            continue
        n = min(len(base), len(x), 4000)
        sign = -1.0 if np.sum(base[:n] * x[:n]) < 0 else 1.0
        if len(x) < len(base):
            x = np.pad(x, ((0, len(base) - len(x)), (0, 0)))
        elif len(x) > len(base):
            base = np.pad(base, ((0, len(x) - len(base)), (0, 0)))
        base = base + sign * wgt * x[: len(base)]
    return base


def cut(x, seconds, fade):
    pk = np.abs(x).max()
    on = int(np.argmax(np.abs(x).max(axis=1) > pk * 0.02))
    x = x[max(0, on - int(0.002 * SR)) :][: int(seconds * SR)].copy()
    f = min(len(x), int(fade * SR))
    x[-f:] *= (np.linspace(1, 0, f) ** 2)[:, None]
    return x


def vls(files):
    return sorted({int(re.search(r"[vd]l(\d+)", f).group(1)) for f in files})


def pitched(x, semitones):
    """Repitch by resampling (slower and lower for negative semitones)."""
    r = 2 ** (semitones / 12)
    return resample_poly(x, 1000, int(round(1000 * r)), axis=0) if r != 1 else x


def build(kit_id, name, credit, voices, layers=4, rrs=3):
    d = os.path.join(OUT, kit_id)
    os.makedirs(d, exist_ok=True)
    for f in glob.glob(os.path.join(d, "*")):
        os.remove(f)
    man = {"id": kit_id, "name": name, "license": "CC0 1.0", "credit": credit, "sampleRate": SR, "stereo": True, "voices": {}}
    for voice, sp in voices.items():
        L = sp.get("layers", layers)
        have = sp["vls"]
        # centre of each velocity bucket
        pick = [have[min(len(have) - 1, int((i + 0.5) * len(have) / L))] for i in range(L)]
        cuts = []
        for vl in pick:
            row = []
            for rr in sp.get("rr", list(range(1, rrs + 1)))[: sp.get("per", rrs)]:
                parts = [(p(vl, rr), w) for p, w in sp["mics"]]
                if not all(os.path.exists(q) for q, _ in parts):
                    continue
                row.append(cut(pitched(mix(parts), sp.get("pitch", 0)), sp["len"], sp.get("fade", 0.1)))
            cuts.append(row or cuts[-1])
        top = max(np.abs(c).max() for row in cuts for c in row)
        scale = 10 ** (sp.get("peak", -3) / 20) / top
        floor = 10 ** ((sp.get("peak", -3) - 26) / 20)
        hits = []
        for li, row in enumerate(cuts):
            for ri, c in enumerate(row):
                y = c * scale
                y *= max(1.0, floor / max(np.abs(y).max(), 1e-9))
                fn = f"{voice}-{li}-{ri + 1}.wav"
                tmp = os.path.join(d, fn)
                wav.write(tmp, SR, (np.clip(y, -1, 1) * 32767).astype(np.int16))
                # MP3 keeps a stereo kit small; ffmpeg writes the gapless header so the attack is not delayed.
                fn = fn.replace(".wav", ".mp3")
                subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", tmp, "-codec:a", "libmp3lame", "-b:a", "192k", os.path.join(d, fn)], check=True)
                os.remove(tmp)
                hits.append({"layer": li, "file": fn})
        man["voices"][voice] = {"layers": L, "hits": hits}
    json.dump(man, open(os.path.join(d, "manifest.json"), "w"), indent=1)
    size = sum(os.path.getsize(f) for f in glob.glob(os.path.join(d, "*")))
    print(f"{kit_id}: {len(man['voices'])} voices, {size / 1e6:.2f} MB")


def main():
    src = sys.argv[1]
    want = set(sys.argv[2:])
    B = os.path.join(src, "karoryfer.big-rusty-drums", "Samples")

    def rusty(sub, mics, tmpl, **kw):
        files = glob.glob(os.path.join(B, sub, mics[0][0], tmpl.format(v="*", r="*")))
        return {
            "mics": [((lambda vl, rr, m=m: os.path.join(B, sub, m, tmpl.format(v=vl, r=rr))), w) for m, w in mics],
            "vls": vls(files),
            **kw,
        }

    V = os.path.join("/home/claude/sfzinstruments/virtuosity_drums", "Samples")

    def vp(part, art, mics, **kw):
        """Virtuosity Drums: Samples/<mic>/<part>/<mic>_<part>_<art>_vl<N>_rr<N>.flac"""
        first = mics[0][0]
        files = glob.glob(os.path.join(V, first, part, f"{first}_{part}_{art}_vl*.flac"))
        has_rr = any("_rr" in f for f in files)
        rrs = sorted({int(re.search(r"rr(\d+)", f).group(1)) for f in files}) if has_rr else [1]
        suffix = (lambda rr: f"_rr{rr}") if has_rr else (lambda rr: "")
        return {
            "mics": [((lambda vl, rr, m=m: os.path.join(V, m, part, f"{m}_{part}_{art}_vl{vl}{suffix(rr)}.flac")), w) for m, w in mics],
            "vls": vls(files),
            "rr": rrs,
            **kw,
        }

    SW = os.path.join(src, "karoryfer.swirly-drums", "Samples")

    def sw(folder, tmpl, mics=(("", 1.0),), **kw):
        """Swirly Drums: Samples/<folder>/<tmpl> with {v}, {r} and {m} (a mic suffix such as top or btm)."""
        def path(vl, rr, m):
            return os.path.join(SW, folder, tmpl.format(v=vl, r=rr, m=m))
        probe = glob.glob(os.path.join(SW, folder, re.sub(r"\{[vrm]\}", "*", tmpl)))
        return {"mics": [((lambda vl, rr, m=m: path(vl, rr, m)), w) for m, w in mics], "vls": vls(probe), "rr": [1, 2, 3], **kw}

    kits = {}
    kits["swirly"] = (
        "Studio kit",
        "Karoryfer Samples, Swirly Drums (snare, hats, ride, toms, crash) with the kick from Versilian Virtuosity Drums",
        {
            "kick": vp("kick", "snon", [("mid", 1.0), ("oh", 0.5), ("room", 0.35)], len=0.8, fade=0.2, peak=-2),
            "snare": sw("snare_main", "snare_hit_vl{v}_rr{r}_{m}.wav", (("top", 1.0), ("btm", 0.45)), len=0.7, fade=0.2),
            "ghost": sw("snare_main", "snare_hit_vl{v}_rr{r}_{m}.wav", (("top", 1.0), ("btm", 0.45)), len=0.4, fade=0.1, peak=-14, layers=2),
            "rim": sw("snare_dig", "snare_dig_vl{v}_rr{r}_{m}.wav", (("top", 1.0), ("btm", 0.4)), len=0.35, fade=0.1, peak=-8, layers=3),
            "hat": sw("hat_closed", "hh_closed_vl{v}_rr{r}.wav", len=0.35, fade=0.1, peak=-9),
            "ohat": sw("hat_open", "hh_open_vl{v}_rr{r}.wav", len=1.6, fade=0.5, peak=-9, layers=3, per=2),
            "foot": sw("hat_foot", "hh_foot_vl{v}_rr{r}.wav", len=0.25, fade=0.1, peak=-12, layers=2),
            "ride": sw("ride", "ride_vl{v}_rr{r}.wav", len=2.2, fade=0.7, peak=-9, per=2),
            "brush": sw("snare_stir", "stir_dl{v}_rr{r}.wav", len=0.8, fade=0.25, peak=-10, layers=2),
            "tom1": sw("tom_mhi", "tom_mhi_vl{v}_rr{r}.wav", len=1.0, fade=0.3, peak=-6, layers=3, per=2),
            "tom2": sw("tom_mlow", "tom_mlow_vl{v}_rr{r}.wav", len=1.2, fade=0.35, peak=-6, layers=3, per=2),
            "tom3": sw("tom_floor", "tom_floor_vl{v}_rr{r}.wav", len=1.4, fade=0.4, peak=-6, layers=3, per=2),
            "crash": sw("crash", "crash_vl{v}_rr{r}.wav", len=2.8, fade=1.0, peak=-8, layers=3, per=2),
        },
    )
    kits["bebop"] = (
        "Jazz sticks kit",
        "Versilian Studios, Virtuosity Drums (sticks, stereo overhead and room mics; flat ride, snares-off kick)",
        {
            "kick": vp("kick", "snoff", [("mid", 1.0), ("oh", 0.5), ("room", 0.35)], len=0.8, fade=0.2, peak=-2),
            "snare": vp("snare", "center", [("mid", 1.0), ("oh", 0.6), ("room", 0.3)], len=0.7, fade=0.2),
            "ghost": vp("snare", "muted", [("mid", 1.0), ("oh", 0.6)], len=0.35, fade=0.1, peak=-14, layers=2),
            "rim": vp("snare", "crossstick", [("mid", 1.0), ("oh", 0.6)], len=0.4, fade=0.1, peak=-8, layers=3),
            "hat": vp("hh", "closed", [("mid", 1.0), ("oh", 0.7)], len=0.35, fade=0.1, peak=-9),
            "ohat": vp("hh", "open", [("mid", 1.0), ("oh", 0.7)], len=1.4, fade=0.5, peak=-9, layers=3, per=2),
            "foot": vp("hh", "pedal", [("mid", 1.0), ("oh", 0.7)], len=0.3, fade=0.1, peak=-12, layers=2),
            "ride": vp("flatride", "ride", [("mid", 1.0), ("oh", 0.8)], len=1.8, fade=0.6, peak=-9, per=2),
            "tom1": vp("htom", "center", [("mid", 1.0), ("oh", 0.7), ("room", 0.3)], len=1.0, fade=0.3, peak=-6, layers=3, per=2),
            "tom2": vp("ltom", "center", [("mid", 1.0), ("oh", 0.7), ("room", 0.3)], len=1.2, fade=0.35, peak=-6, layers=3, per=2),
            "tom3": vp("ltom", "center", [("mid", 1.0), ("oh", 0.7), ("room", 0.3)], len=1.4, fade=0.4, peak=-6, layers=3, per=2, pitch=-4),
            "crash": vp("crash", "crash", [("mid", 1.0), ("oh", 0.8)], len=2.8, fade=1.0, peak=-8, layers=3, per=2),
        },
    )
    kits["rusty"] = (
        "Rusty jazz kit",
        "Karoryfer Samples, Big Rusty Drums (stereo close and overhead mics)",
        {
            "kick": rusty("kick_24/kick", [("kick", 1.0), ("oh", 0.8), ("sn", 0.2)], "k_vl{v}_rr{r}.flac", len=0.8, fade=0.2, peak=-2),
            "snare": rusty("snare_14/center", [("top", 1.0), ("btm", 0.35), ("oh", 0.7)], "sn_center_vl{v}_rr{r}.flac", len=0.7, fade=0.2),
            "ghost": rusty("snare_14/center", [("top", 1.0), ("btm", 0.35), ("oh", 0.7)], "sn_center_vl{v}_rr{r}.flac", len=0.4, fade=0.1, peak=-14, layers=2),
            "rim": rusty("snare_14/sidestick", [("top", 1.0), ("btm", 0.3)], "sn_ss_vl{v}_rr{r}.flac", len=0.4, fade=0.1, peak=-8, layers=3),
            "hat": rusty("hihat_14/cl", [("cl", 1.0), ("oh", 0.7)], "ht_cl_vl{v}_rr{r}.flac", len=0.35, fade=0.1, peak=-9),
            "ohat": rusty("hihat_14/ho", [("cl", 1.0), ("oh", 0.7)], "ht_ho_vl{v}_rr{r}.flac", len=1.4, fade=0.5, peak=-9, layers=3, per=2),
            "foot": rusty("hihat_14/chik", [("cl", 1.0), ("oh", 0.7)], "ht_chik_vl{v}_rr{r}.flac", len=0.3, fade=0.1, peak=-12, layers=2),
            "ride": rusty("ride_22/rd", [("cl", 1.0), ("oh", 0.8)], "rd_vl{v}_rr{r}.flac", len=2.2, fade=0.7, peak=-9, per=2),
            "brush": rusty("ride_22/brush", [("cl", 1.0), ("oh", 0.8)], "rd_b_vl{v}_rr{r}.flac", len=1.2, fade=0.4, peak=-10, layers=3),
            "tom1": rusty("tom_14/center", [("cl", 1.0), ("oh", 0.7)], "t14_vl{v}_rr{r}.flac", len=1.0, fade=0.3, peak=-6, layers=3, per=2),
            "tom2": rusty("tom_18/center", [("cl", 1.0), ("oh", 0.7)], "t18_vl{v}_rr{r}.flac", len=1.2, fade=0.35, peak=-6, layers=3, per=2),
            "tom3": rusty("tom_22/center", [("cl", 1.0), ("oh", 0.7)], "t22_vl{v}_rr{r}.flac", len=1.4, fade=0.4, peak=-6, layers=3, per=2),
            "crash": rusty("crash_17/cr", [("cl", 1.0), ("oh", 0.8)], "cr_vl{v}_rr{r}.flac", len=2.8, fade=1.0, peak=-8, layers=3, per=2),
        },
    )
    for k, (name, credit, voices) in kits.items():
        if not want or k in want:
            build(k, name, credit, voices)


if __name__ == "__main__":
    main()
