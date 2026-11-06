#!/bin/bash
# Finds the screenshots that belong to the active (or most recent) session.
# Usage: find.sh [session_id]
#   - If omitted, uses $CLAUDE_SESSION_ID, else the most recent session.
# Output:
#   SESSION_META:<path to meta.json>
#   STARTED_AT:<epoch>
#   followed by scan.sh TSV lines (mtime\tsize\tpath)
#   or the single line  NO_SESSION  if no session state exists.
set -u
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$DIR/lib.sh"

sid="${1:-${CLAUDE_SESSION_ID:-}}"
meta=""
if [ -n "$sid" ] && [ -f "$SJ_STATE_DIR/sessions/$sid/meta.json" ]; then
  meta="$SJ_STATE_DIR/sessions/$sid/meta.json"
else
  meta="$(ls -t "$SJ_STATE_DIR"/sessions/*/meta.json 2>/dev/null | head -1)"
fi

[ -n "$meta" ] && [ -f "$meta" ] || { echo "NO_SESSION"; exit 0; }

started="$(sj_json_num "$(cat "$meta")" started_at)"
echo "SESSION_META:$meta"
echo "STARTED_AT:${started:-0}"
bash "$DIR/scan.sh" "${started:-0}"
