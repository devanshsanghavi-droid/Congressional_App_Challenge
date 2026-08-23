#!/bin/bash
# FEASIBILITY PROBE helper — not shipping code.
#
# Usage: ask.sh <grammar-file|NONE> <n-predict> <prompt-file>
# Prints only the model's response.
#
# llama-cli echoes the prompt before the response and there is no flag that
# reliably suppresses it for a multi-line prompt, so the prompt file ends with a
# sentinel and everything after its LAST occurrence is the response. The model
# never reproduces the sentinel because it is not English.
set -euo pipefail
MODEL="${CARTA_MODEL:-$HOME/models/qwen2.5-1.5b-instruct-q4_k_m.gguf}"
GRAMMAR="$1"; N="$2"; PROMPT_FILE="$3"
SENTINEL='%%CARTA%%'

TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT
{ cat "$PROMPT_FILE"; printf '\n%s\n' "$SENTINEL"; } > "$TMP"

ARGS=(-m "$MODEL" -f "$TMP" -n "$N" --temp 0 -no-cnv -st --log-disable -c 4096)
[ "$GRAMMAR" != "NONE" ] && ARGS+=(--grammar-file "$GRAMMAR")

# llama-cli truncates a long echoed prompt, which swallows the sentinel, so
# fall back to the last top-level JSON object in the output. Between the two
# there is always a way to find the response.
llama-cli "${ARGS[@]}" 2>/dev/null | awk -v s="$SENTINEL" '
  { lines[NR] = $0
    if (index($0, s) > 0) last = NR
    if ($0 ~ /^[[:space:]]*\{[[:space:]]*$/ || $0 ~ /^[[:space:]]*\{".*\}[[:space:]]*$/) jstart = NR
  }
  END {
    start = (last > 0 ? last + 1 : jstart)
    if (start == 0) start = 1
    for (i = start; i <= NR; i++) { if (lines[i] ~ /^\[ Prompt:/) break; print lines[i] }
  }
'
