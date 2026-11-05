#!/usr/bin/env bash
# run.sh [suite ...] - run every brewdoc:docsync-setup tests/suite-*.mjs (bare or file names), sorted; rc 1 on any failure.
# No network, no real upload: mkdtemp fixtures, removed after. Example suite: `hooks`.
set -euo pipefail
# Suites never see the live profile: always an empty temp CLAUDE_CONFIG_DIR, set or unset.
CLAUDE_CONFIG_DIR="$(mktemp -d)"; export CLAUDE_CONFIG_DIR
# EXIT: delete only the temp profile made above (non-empty, under TMPDIR); runner rc kept.
CFG_TMP_DIR="$CLAUDE_CONFIG_DIR"; CFG_TMP_ROOT="${TMPDIR:-/tmp}"; CFG_TMP_ROOT="${CFG_TMP_ROOT%/}"
readonly CFG_TMP_DIR CFG_TMP_ROOT
trap '[ -z "$CFG_TMP_ROOT" ] || case "$CFG_TMP_DIR" in "$CFG_TMP_ROOT"/?*) rm -rf -- "$CFG_TMP_DIR" || true ;; esac' EXIT
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ "${1:-}" = "-h" ] || [ "${1:-}" = "--help" ]; then
  sed -n '2,3p' "$0" | sed 's/^# \{0,1\}//'
  exit 0
fi

command -v node >/dev/null 2>&1 || { printf '❌ node is required to run the docsync-setup suites\n' >&2; exit 1; }

SUITES=""
if [ "$#" -gt 0 ]; then
  for want in "$@"; do
    base="${want%.mjs}"
    base="${base#suite-}"
    f="$SCRIPT_DIR/suite-$base.mjs"
    if [ -f "$f" ]; then
      SUITES="${SUITES}${SUITES:+ }$f"
    else
      printf '❌ no such suite: %s\n' "$f" >&2
      exit 1
    fi
  done
else
  for f in "$SCRIPT_DIR"/suite-*.mjs; do
    [ -f "$f" ] || continue
    SUITES="${SUITES}${SUITES:+ }$f"
  done
fi

if [ -z "$SUITES" ]; then
  printf '⏭️ no suite-*.mjs found in %s - nothing to run\n' "$SCRIPT_DIR"
  exit 0
fi

TOTAL=0
FAILED=0
FAILED_NAMES=""

for suite in $SUITES; do
  name="$(basename "$suite")"
  printf '\n=== %s ===\n' "$name"
  TOTAL=$((TOTAL + 1))
  set +e
  node "$suite"
  rc=$?
  set -e
  if [ "$rc" -ne 0 ]; then
    FAILED=$((FAILED + 1))
    FAILED_NAMES="${FAILED_NAMES}${FAILED_NAMES:+ }$name(exit $rc)"
  fi
done

printf '\n=== docsync-setup suites ===\n'
printf '| Suite set | Value |\n'
printf '|-----------|-------|\n'
printf '| suites run | %s |\n' "$TOTAL"
printf '| failed | %s |\n' "$FAILED"

if [ "$FAILED" -ne 0 ]; then
  printf '❌ failing: %s\n' "$FAILED_NAMES"
  exit 1
fi
printf '✅ all suites passed\n'
