#!/usr/bin/env bash
# Rebuild the Carta demonstration SAR 7, its checking template, and the form-check
# fixtures. macOS only: the OCR step is Apple Vision, the same engine family the
# iOS app runs (CLAUDE.md §11), via the metrics harness's own producer.
#
#   bash tools/forms/build-demo-sar7.sh
#
# Outputs:
#   tools/forms/demo/sar7-demo-blank.pdf        print this, fill it in by hand
#   content/forms/carta-demo-sar7.json          what the app checks against
#   tests/fixtures/formcheck/*.jpg + *.ocr.json the form-check test inputs
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BUILD="$ROOT/tools/metrics/ocr/.build"
BIN="$BUILD/vision-ocr"
mkdir -p "$BUILD"
if [ ! -x "$BIN" ] || [ "$ROOT/tools/metrics/ocr/vision-ocr.swift" -nt "$BIN" ]; then
  echo "compiling vision-ocr"
  swiftc -O "$ROOT/tools/metrics/ocr/vision-ocr.swift" -o "$BIN"
fi

python3 "$ROOT/tools/forms/make-demo-sar7.py" draw

# The blank form, read exactly as a photo of it would be.
"$BIN" 1700 en-US "$ROOT/tools/forms/demo/sar7-demo-blank.png" > "$ROOT/tools/forms/demo/sar7-demo-blank.ocr.json"
python3 "$ROOT/tools/forms/make-demo-sar7.py" template "$ROOT/tools/forms/demo/sar7-demo-blank.ocr.json"

for image in "$ROOT"/tests/fixtures/formcheck/*.jpg; do
  "$BIN" 1700 en-US "$image" > "${image%.jpg}.ocr.json"
done

# A photograph of a DIFFERENT SAR 7 layout: the corpus notice. It shares the
# header, the household and the submit-by box with the demonstration form, so a
# careless check would "align" it and read boxes that are not there.
cp "$ROOT/tools/corpus/photos/sar7-clean-01.jpg" "$ROOT/tests/fixtures/formcheck/other-layout.jpg"
"$BIN" 1700 en-US "$ROOT/tests/fixtures/formcheck/other-layout.jpg" > "$ROOT/tests/fixtures/formcheck/other-layout.ocr.json"

echo "done"
