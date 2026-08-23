#!/usr/bin/env python3
"""
Carta corpus — synthetic degradation.

WHY THIS EXISTS
---------------
iPhone computational photography (Deep Fusion / Smart HDR) detects text and
sharpens it after capture. It is effectively impossible to photograph a
genuinely motion-blurred document with the stock camera app -- the pipeline
repairs it. Attempts to shoot blur produce near-sharp text.

So blur and sensor noise are generated in software from the CLEAN captures,
with fixed, documented parameters. Everything else in the corpus -- angle,
crease, shadow, low light -- is a real physical capture, because those the
phone does not undo.

METHODOLOGY NOTE
----------------
Synthetic images are named `*-synth-*` and MUST be scored as a separate
bucket from real captures. Never mix them into a single headline accuracy
number. The honest claim is:
  "N real captures across 5 physical conditions, plus M synthetically
   degraded variants for blur and noise, scored separately."

Deterministic WITHIN A PILLOW BUILD: fixed seed, fixed kernels. Re-running on the
same Pillow reproduces byte-identical output.

ACROSS Pillow versions it does NOT. Resampling and JPEG encoding differ between
builds, and the blur variants shift materially (one case moved 11 -> 8 recognised
lines). Aggregate impact was measured at +/-3pp per condition, below bucket
resolution, so the committed set was left alone rather than churned.

The committed synthetic images were generated with Pillow 12.3.0.
If you regenerate on a different build, re-run metrics and say so.

Usage:  python3 degrade.py
"""

import os
import numpy as np
from PIL import Image, ImageFilter

SRC = "corpus/photos"
OUT = "corpus/photos/synthetic"
SEED = 20261026
os.makedirs(OUT, exist_ok=True)

# Only degrade clean, well-lit captures -- degrading an already-hard image
# confounds two variables at once.
SOURCES = [
    "sar7-clean-01",
    "na960x-clean-06",
    "cf3776-clean-10",
    "mc210-clean-12",
    "na960y-clean-14",
    "sar7es-clean-16",
    "bilingual-clean-18",
    "ssa-clean-19",
]

MANIFEST = []


def motion_blur(im, length=15, angle=0):
    """Directional blur — simulates the phone moving during exposure.

    Implemented as the mean of `length` copies shifted along the motion
    vector. PIL's ImageFilter.Kernel only supports 3x3 and 5x5, and a
    realistic motion kernel is much longer than that.
    """
    a = np.asarray(im, dtype=np.float32)
    h, w = a.shape[:2]
    rad = np.deg2rad(angle)
    dx, dy = np.cos(rad), np.sin(rad)

    acc = np.zeros_like(a)
    offsets = np.arange(length) - (length - 1) / 2.0
    for t in offsets:
        sx, sy = int(round(dx * t)), int(round(dy * t))
        shifted = np.roll(a, (sy, sx), axis=(0, 1))
        # blank the wrapped edges so roll doesn't smear across the frame
        if sy > 0:
            shifted[:sy] = a[:sy]
        elif sy < 0:
            shifted[sy:] = a[sy:]
        if sx > 0:
            shifted[:, :sx] = a[:, :sx]
        elif sx < 0:
            shifted[:, sx:] = a[:, sx:]
        acc += shifted

    return Image.fromarray(np.clip(acc / len(offsets), 0, 255).astype(np.uint8))


def defocus(im, radius=2.2):
    """Out-of-focus blur — the autofocus missed."""
    return im.filter(ImageFilter.GaussianBlur(radius=radius))


def sensor_noise(im, sigma=9.0, rng=None):
    """Luminance noise — what a real dim-light sensor produces."""
    a = np.asarray(im, dtype=np.float32)
    n = rng.normal(0.0, sigma, a.shape[:2])[:, :, None]
    return Image.fromarray(np.clip(a + n, 0, 255).astype(np.uint8))


def underexpose(im, gamma=1.75, rng=None):
    """Darken, then add the noise a real sensor adds when underexposed."""
    a = np.asarray(im, dtype=np.float32) / 255.0
    a = np.power(a, gamma)
    im2 = Image.fromarray((a * 255).astype(np.uint8))
    return sensor_noise(im2, sigma=7.0, rng=rng)


def jpeg_artifacts(im, quality=22):
    """Heavy recompression — what a document looks like after being
    forwarded through a few apps. Round-trips in memory, no temp file."""
    import io
    buf = io.BytesIO()
    im.save(buf, "JPEG", quality=quality)
    buf.seek(0)
    return Image.open(buf).convert("RGB").copy()


VARIANTS = [
    ("synth-motionblur", "motion blur, 15px kernel at 0 deg",
     lambda im, rng: motion_blur(im, 15, 0)),
    ("synth-motionblur-diag", "motion blur, 21px kernel at 35 deg",
     lambda im, rng: motion_blur(im, 21, 35)),
    ("synth-defocus", "gaussian defocus, radius 2.2px",
     lambda im, rng: defocus(im, 2.2)),
    ("synth-defocus-heavy", "gaussian defocus, radius 4.0px",
     lambda im, rng: defocus(im, 4.0)),
    ("synth-noise", "gaussian luminance noise, sigma 9",
     lambda im, rng: sensor_noise(im, 9.0, rng)),
    ("synth-underexposed", "gamma 1.75 + sigma 7 noise",
     lambda im, rng: underexpose(im, 1.75, rng)),
    ("synth-jpeg", "JPEG quality 22 recompression",
     lambda im, rng: jpeg_artifacts(im, 22)),
]


def main():
    # Work at a sane resolution -- full 12MP is wasted compute and the
    # blur kernels are calibrated for roughly this scale.
    TARGET_W = 1700

    for src in SOURCES:
        path = os.path.join(SRC, f"{src}.jpg")
        if not os.path.exists(path):
            print(f"  skip (missing): {src}")
            continue

        im = Image.open(path).convert("RGB")
        if im.width > TARGET_W:
            h = int(im.height * TARGET_W / im.width)
            im = im.resize((TARGET_W, h), Image.LANCZOS)

        base = src.replace("-clean", "").rsplit("-", 1)[0]

        for tag, desc, fn in VARIANTS:
            rng = np.random.default_rng(SEED)     # reset per variant
            out_name = f"{base}-{tag}.jpg"
            fn(im, rng).save(os.path.join(OUT, out_name), "JPEG", quality=94)
            MANIFEST.append({
                "file": out_name,
                "derived_from": f"{src}.jpg",
                "condition": desc,
                "synthetic": True,
            })
            print(f"  {out_name:44s} <- {src}  ({desc})")

    import json
    with open(os.path.join(OUT, "synthetic_manifest.json"), "w") as f:
        json.dump({
            "seed": SEED,
            "note": "Synthetic degradation. Score separately from real "
                    "captures. Generated because iPhone computational "
                    "photography sharpens text post-capture, making genuine "
                    "motion blur uncapturable with the stock camera.",
            "variants": MANIFEST,
        }, f, indent=2)

    print(f"\n{len(MANIFEST)} synthetic images -> {OUT}")


if __name__ == "__main__":
    main()
