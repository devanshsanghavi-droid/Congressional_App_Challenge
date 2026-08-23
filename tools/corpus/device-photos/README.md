# Device photos — real iPhone camera, stock Camera app

Shot 2026-08-21 with the stock Camera app, unedited, AirDropped. Copied byte-for-byte;
never re-encoded, so EXIF is exactly as the camera wrote it.

**Corrected 2026-08-21: only two of the four carry Orientation = 1.** The other two
were written landscape by the camera with a rotation tag, read out of
`CGImageSourceCopyPropertiesAtIndex`. Note `sips` reports `orientation=<nil>` for HEIC and
does not surface the tag at all, which is how this was originally missed.

| file | stored | EXIF | what it actually is |
|---|---|---|---|
| `device-upright.heic` | 3023x4030 portrait | **1** | Upright. Heavy magenta LED colour cast. |
| `device-inverted.heic` | 3023x4031 portrait | **1** | **The clean inverted test.** Paper rotated 180, phone level, flat. No tag to correct. |
| `device-inverted-angled.heic` | **5712x4284 landscape** | **8** | Inverted *and* skewed, and the camera tagged it rotate-90-CCW. |
| `device-dim-angled-upright.heic` | **5712x4284 landscape** | **6** | Upright, angled, dim, tagged rotate-90-CW. |

This makes the fixture *more* useful, not less. `device-inverted.heic` is still the clean
test of the detector — orientation 1, nothing to correct. And the two tagged files are the
first confirmation that **camera-written** EXIF rotation is applied end to end, where the
earlier evidence used tags written synthetically by Pillow.

## Labels were corrected before running

The file shot as "angled" is **upside down as well as skewed** — it is a second inverted
case, not an upright-skew case. The file shot as "dim" is the upright-and-angled one.
Renamed accordingly. Running them under the original names would have put an inverted
page in the upright bucket, which is how a detector gets falsely blamed or falsely cleared.

## What this gives the orientation detector

- **inverted, n=2** — `device-inverted` (flat) and `device-inverted-angled` (skewed).
  Doubles the evidence for the 0.5 threshold, and the skewed one is the harder case.
- **upright, n=2** — `device-upright` and `device-dim-angled-upright`, both real camera
  captures under bad lighting, which is where a false positive would come from.

## Not a corpus addition

Fixture only. The scored corpus stays frozen. Do not merge these into corpus metrics.
