#!/bin/bash
# SessionStart hook — opens a per-session folder and records the start time.
# That timestamp is how "screenshots created during THIS session" are scoped.
# On resume, the existing start time is preserved.
set -u
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$DIR/lib.sh"

input="$(cat)"
sid="$(sj_json_str "$input" session_id)"
cwd="$(sj_json_str "$input" cwd)"
[ -z "$sid" ] && sid="unknown-$(date +%s)"

mkdir -p "$SJ_STATE_DIR"
# Record where the scripts live so the skill can find them regardless of how
# it is invoked (works even if CLAUDE_PLUGIN_ROOT is not set in skill context).
printf '%s\n' "$DIR" > "$SJ_STATE_DIR/scripts-path"

d="$SJ_STATE_DIR/sessions/$sid"
mkdir -p "$d"
if [ ! -f "$d/meta.json" ]; then
  printf '{"session_id":"%s","started_at":%s,"cwd":"%s"}\n' "$sid" "$(date +%s)" "$cwd" > "$d/meta.json"
fi
exit 0
