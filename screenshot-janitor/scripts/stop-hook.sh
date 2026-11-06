#!/bin/bash
# Stop hook — runs at the end of a response turn. If this session produced new
# screenshots, it injects an instruction telling the assistant to offer cleanup.
# Reminds ONCE per session (reminded marker); stays silent after cleanup (handled).
set -u
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$DIR/lib.sh"
# shellcheck disable=SC1091
source "$DIR/config.sh"

input="$(cat)"
sid="$(sj_json_str "$input" session_id)"
[ -z "$sid" ] && exit 0

d="$SJ_STATE_DIR/sessions/$sid"
[ -f "$d/meta.json" ] || exit 0
[ -f "$d/handled" ]   && exit 0
[ -f "$d/reminded" ]  && exit 0

started="$(sj_json_num "$(cat "$d/meta.json")" started_at)"
[ -z "$started" ] && exit 0

age=$(( $(date +%s) - started ))
[ "$age" -lt "${MIN_AGE_SECONDS:-0}" ] && exit 0

count="$(bash "$DIR/scan.sh" "$started" | wc -l | tr -d ' ')"
if [ "${count:-0}" -gt 0 ]; then
  touch "$d/reminded"
  # ASCII-only (no double quotes / backslashes / newlines) so the JSON stays valid.
  reason="This Claude Code session produced $count new screenshot(s). Before the user leaves, ask them in ONE short sentence whether to move these to the Trash. If they agree, run the cleanup-screenshots skill. If they decline, do not ask again; this reminder fires only once per session. Respond in the user configured language."
  printf '{"decision":"block","reason":"%s"}\n' "$reason"
fi
exit 0
