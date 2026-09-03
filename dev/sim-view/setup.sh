#!/usr/bin/env bash
# Fetches the input tooling sim-view needs. Run once; `vendor/` is gitignored.
#
# The prebuilt companion is used rather than `brew install idb-companion`
# because Homebrew refuses to proceed until the Command Line Tools are updated,
# which needs the user's password. This path needs no sudo and touches nothing
# outside this directory.
set -euo pipefail

VER=1.5.2
BASE="https://github.com/facebook/idb/releases/download/v${VER}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$HERE"
mkdir -p vendor && cd vendor

if [ ! -x idb_companion ]; then
  echo "downloading idb-companion ${VER}"
  curl -sL -o c.tgz "${BASE}/idb-companion.macos-arm64.tar.gz"
  curl -sL -o c.sha "${BASE}/idb-companion.macos-arm64.tar.gz.sha256"
  # Verify before unpacking, not after.
  if [ "$(awk '{print $1}' c.sha)" != "$(shasum -a 256 c.tgz | awk '{print $1}')" ]; then
    echo "checksum mismatch - refusing to unpack" >&2
    exit 1
  fi
  tar xzf c.tgz && rm -f c.tgz
  xattr -d com.apple.quarantine idb_companion 2>/dev/null || true
  chmod +x idb_companion
fi

if [ ! -x idbenv/bin/idb ]; then
  echo "creating venv for the idb client"
  python3 -m venv idbenv
  ./idbenv/bin/pip install --quiet --upgrade pip
  ./idbenv/bin/pip install --quiet fb-idb
fi

echo "ready. now: npm run sim:boot && npm run sim:view"
