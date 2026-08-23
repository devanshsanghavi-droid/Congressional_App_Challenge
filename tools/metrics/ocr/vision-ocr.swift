// -----------------------------------------------------------------------------
// Carta metrics harness — OCR producer (macOS / Apple Vision).
//
// AUTHORSHIP: Claude. This is harness infrastructure, not extraction logic.
// Nothing in here parses a notice or decides what a field means — it turns an
// image into lines of text with boxes and hands them to the scorer.
//
// WHY THIS EXISTS, AND THE CAVEAT THAT COMES WITH IT
// --------------------------------------------------
// The app reads text with `expo-mlkit-ocr` (Google ML Kit) on the phone. That
// engine cannot run in Node on a Mac, and the metrics harness has to run in
// bare Node against the corpus (CLAUDE.md §8). So this producer uses Apple's
// Vision framework instead, and every record it writes is stamped
// `"engine": "apple-vision"`.
//
// **Numbers produced from this engine are not ML Kit numbers.** They measure
// the corpus and the extraction cascade, not the shipping OCR stage. The cache
// format is engine-agnostic on purpose: a dump of real ML Kit output from the
// device drops into the same directory under a different engine name and the
// scorer reports it the same way. Until that dump exists, the README and the
// metrics table must say which engine produced the figure.
//
// Vision is pinned to a specific request revision so a macOS update cannot
// silently change the corpus baseline underneath the numbers.
//
// The record carries no timing. Recognition time is real information, but it
// varies run to run, and this cache is committed — a timestamp in it would make
// every re-run a diff and would break the byte-for-byte reproducibility the
// metrics table rests on. The driver measures and reports timing instead.
//
// Usage:  vision-ocr <max-width> <languages> <image> [image...]
//         languages is a comma-separated BCP-47 list, e.g. "en-US,es-ES".
// Output: one JSON object per line on stdout (JSONL), one per input image.
// -----------------------------------------------------------------------------

import AppKit
import CoreGraphics
import Foundation
import Vision

// The revision the numbers were measured against. Vision ships new text
// recognisers with new OS versions; leaving this unpinned would mean a macOS
// update quietly moves the baseline.
let pinnedRevision = VNRecognizeTextRequestRevision3

func fail(_ message: String) -> Never {
    FileHandle.standardError.write(("vision-ocr: " + message + "\n").data(using: .utf8)!)
    exit(1)
}

/// Load an image and downscale it so the long-edge-normalised width is at most
/// `maxWidth`, using the same Lanczos-class resampling the corpus generator
/// used. Downscaling before OCR is deliberate: full-resolution captures are
/// wasted compute, and the real (2000px) and synthetic (1700px) buckets are
/// only comparable if both reach the recogniser at the same scale.
func loadDownscaled(_ path: String, maxWidth: Int) -> (image: CGImage, source: (Int, Int)) {
    guard let src = CGImageSourceCreateWithURL(URL(fileURLWithPath: path) as CFURL, nil) else {
        fail("cannot open \(path)")
    }
    // kCGImageSourceCreateThumbnail* with a max pixel size does the decode and
    // the downscale in one step, and applies the EXIF orientation on the way —
    // the same two operations expo-image-manipulator performs in the app.
    let opts: [CFString: Any] = [
        kCGImageSourceCreateThumbnailFromImageAlways: true,
        kCGImageSourceCreateThumbnailWithTransform: true,
        kCGImageSourceShouldCacheImmediately: true,
        kCGImageSourceThumbnailMaxPixelSize: maxWidth,
    ]
    guard let full = CGImageSourceCreateImageAtIndex(src, 0, nil) else {
        fail("cannot decode \(path)")
    }

    // Dimensions AFTER the EXIF orientation is applied, which is what everything
    // downstream actually sees. `CGImageSourceCreateImageAtIndex` returns the
    // stored buffer untransformed, so a photo the camera wrote landscape with
    // `Orientation = 6` reports as landscape here while the app — and the
    // thumbnail below, which passes `WithTransform` — treats it as portrait.
    //
    // Getting this wrong silently rescaled EXIF-rotated input to the wrong
    // target: a 5712x4284 capture tagged 6 came out 1276x1700 instead of
    // 1700x2267. Harmless on the corpus, where every JPEG is orientation 1, and
    // wrong on anything straight off a camera.
    let properties = CGImageSourceCopyPropertiesAtIndex(src, 0, nil) as? [CFString: Any]
    let orientation = properties?[kCGImagePropertyOrientation] as? Int ?? 1
    // 5-8 are the transposed orientations; those swap width and height.
    let swapped = orientation >= 5 && orientation <= 8
    let displayWidth = swapped ? full.height : full.width
    let displayHeight = swapped ? full.width : full.height
    let sourceDims = (displayWidth, displayHeight)

    // A page is taller than it is wide, so thumbnailMaxPixelSize (which caps the
    // LONG edge) would cap height, not width. Ask for the long edge that yields
    // the requested width.
    let longEdge = Int((Double(maxWidth) * Double(max(displayWidth, displayHeight))
        / Double(displayWidth)).rounded())
    var scaleOpts = opts
    scaleOpts[kCGImageSourceThumbnailMaxPixelSize] = longEdge

    guard displayWidth > maxWidth,
          let scaled = CGImageSourceCreateThumbnailAtIndex(src, 0, scaleOpts as CFDictionary)
    else {
        return (full, sourceDims)
    }
    return (scaled, sourceDims)
}

/// Round to a fixed number of decimals so the committed cache is byte-stable
/// across runs and machines — the metrics table has to be reproducible.
func round(_ value: Double, _ places: Int) -> Double {
    let f = pow(10.0, Double(places))
    return (value * f).rounded() / f
}

let args = Array(CommandLine.arguments.dropFirst())
guard args.count >= 3, let maxWidth = Int(args[0]) else {
    fail("usage: vision-ocr <max-width> <languages> <image> [image...]")
}
// The language set is a parameter rather than a constant because it is the one
// place the harness and the app are configured differently: the app leaves
// `recognitionLanguages` unset, which means English only. Making this settable
// is what lets that difference be measured instead of argued about.
let languages = args[1].split(separator: ",").map(String.init)

for path in args.dropFirst(2) {
    let (image, sourceDims) = loadDownscaled(path, maxWidth: maxWidth)

    let request = VNRecognizeTextRequest()
    request.revision = pinnedRevision
    request.recognitionLevel = .accurate
    // Language correction on, both languages declared: the corpus is English,
    // Spanish and bilingual, and a recogniser told to expect only English
    // mangles "FECHA LIMITE" and the accented Spanish month names.
    request.usesLanguageCorrection = true
    request.recognitionLanguages = languages
    // No customWords. The bake-off that would justify tuning them was cut in
    // the v2 re-scope (SPEC §10); leaving them empty keeps this a stock,
    // off-the-shelf configuration, which is what the app ships.

    do {
        try VNImageRequestHandler(cgImage: image, options: [:]).perform([request])
    } catch {
        fail("recognition failed on \(path): \(error)")
    }
    var lines: [[String: Any]] = []
    for observation in request.results ?? [] {
        guard let candidate = observation.topCandidates(1).first else { continue }
        let b = observation.boundingBox
        // Vision's origin is bottom-left and normalised. Convert to top-left
        // normalised so the boxes read the same way as ML Kit's and the same
        // way the page does.
        lines.append([
            "text": candidate.string,
            "confidence": round(Double(candidate.confidence), 4),
            "box": [
                "x": round(Double(b.minX), 5),
                "y": round(1.0 - Double(b.minY) - Double(b.height), 5),
                "w": round(Double(b.width), 5),
                "h": round(Double(b.height), 5),
            ],
        ])
    }

    let record: [String: Any] = [
        "file": (path as NSString).lastPathComponent,
        "engine": "apple-vision",
        "revision": pinnedRevision,
        "recognitionLevel": "accurate",
        "languageCorrection": true,
        "languages": languages,
        "sourceWidth": sourceDims.0,
        "sourceHeight": sourceDims.1,
        "ocrWidth": image.width,
        "ocrHeight": image.height,
        "maxWidth": maxWidth,
        "lines": lines,
    ]

    // .sortedKeys so re-running produces byte-identical cache files.
    guard let data = try? JSONSerialization.data(
        withJSONObject: record, options: [.sortedKeys, .withoutEscapingSlashes]),
        let json = String(data: data, encoding: .utf8)
    else { fail("cannot encode result for \(path)") }
    print(json)
}
