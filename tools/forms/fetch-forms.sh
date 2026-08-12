#!/usr/bin/env bash
#
# Downloads the blank public forms the synthetic corpus is generated from.
# See SOURCES.md for what each one is and why.
#
# Every file here is a blank form published by the State of California. They get
# filled with fictional data by the corpus generator. Never put a real person's
# notice in this directory.
#
# Usage:  bash tools/forms/fetch-forms.sh
#
# If a download fails, it is almost certainly not your fault: cdss.ca.gov drops
# TCP connections from datacenter/VPN addresses and dhcs.ca.gov serves an
# Incapsula bot challenge. The script says so explicitly and tells you which
# files to grab by hand. Downloading them in a browser takes about two minutes.

set -uo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CDSS="https://www.cdss.ca.gov/cdssweb/entres/forms"
UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15"

# filename|url
FORMS=(
  "sar7.pdf|${CDSS}/english/sar7.pdf"
  "sar7addendum.pdf|${CDSS}/english/sar7addendum.pdf"
  "sar7a.pdf|${CDSS}/english/sar7a.pdf"
  "na960x_sar.pdf|${CDSS}/English/NA960X_SAR.pdf"
  "na960y_sar.pdf|${CDSS}/English/NA960Y_SAR.pdf"
  "cf377.6.pdf|${CDSS}/english/cf377.6.pdf"
  "mc210.pdf|https://dhcs.ca.gov/formsandpubs/forms/Forms/MC-210-ENG.pdf"
)

# Used only if the primary SAR 7 URL 404s.
SAR7_MIRROR="https://www.cdss.ca.gov/Portals/9/Additional-Resources/Forms-and-Brochures/2020/Q-T/sar7.pdf"

ok=0
failed=()

# A PDF starts with the bytes "%PDF". Checking this catches the common failure
# where a WAF returns 200 with an HTML challenge page named like a PDF — which
# would otherwise sit in the corpus as a silently corrupt input.
is_pdf() {
  [ -s "$1" ] && [ "$(head -c 4 "$1")" = "%PDF" ]
}

download() {
  local name="$1" url="$2" dest="${DIR}/$1"
  printf '  %-20s ' "$name"

  local code
  code=$(curl -sL -m 45 -A "$UA" "$url" -o "$dest" -w '%{http_code}' 2>/dev/null)

  if [ "$code" = "000" ]; then
    rm -f "$dest"
    echo "network unreachable (connection dropped)"
    return 1
  fi

  if ! is_pdf "$dest"; then
    if grep -qi "incapsula\|captcha\|access denied" "$dest" 2>/dev/null; then
      echo "blocked by bot protection (HTTP $code)"
    else
      echo "not a PDF (HTTP $code)"
    fi
    rm -f "$dest"
    return 1
  fi

  echo "ok ($(wc -c < "$dest" | tr -d ' ') bytes)"
  return 0
}

echo "Downloading blank forms into tools/forms/"
echo

for entry in "${FORMS[@]}"; do
  name="${entry%%|*}"
  url="${entry#*|}"

  if is_pdf "${DIR}/${name}"; then
    printf '  %-20s already present, skipping\n' "$name"
    ok=$((ok + 1))
    continue
  fi

  if download "$name" "$url"; then
    ok=$((ok + 1))
  elif [ "$name" = "sar7.pdf" ]; then
    printf '  %-20s ' "sar7.pdf (mirror)"
    if curl -sL -m 45 -A "$UA" "$SAR7_MIRROR" -o "${DIR}/sar7.pdf" 2>/dev/null && is_pdf "${DIR}/sar7.pdf"; then
      echo "ok"
      ok=$((ok + 1))
    else
      rm -f "${DIR}/sar7.pdf"
      echo "also failed"
      failed+=("$name|$url")
    fi
  else
    failed+=("$name|$url")
  fi
done

echo
echo "${ok}/${#FORMS[@]} forms present."

if [ ${#failed[@]} -gt 0 ]; then
  cat <<'EOS'

Some downloads failed. This is expected on many networks — cdss.ca.gov drops
connections from datacenter and VPN addresses, and dhcs.ca.gov serves an
Incapsula challenge to non-browser clients. Nothing is wrong with your setup.

Open these in a browser and save them into tools/forms/ with these exact names:

EOS
  for entry in "${failed[@]}"; do
    printf '  %-20s %s\n' "${entry%%|*}" "${entry#*|}"
  done
  echo
  exit 1
fi

echo "Next: record each form's printed revision code (e.g. \"SAR 7 (5/25)\") in NOTES.md."
