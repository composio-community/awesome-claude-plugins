#!/bin/bash
# agent-inbox — Claude Code hook (shipped with the agent-inbox plugin).
# Writes the sessions that wait on the user to ~/.claude/inbox.jsonl and drops a
# session's record when it is answered or ends. One open record per session;
# writes are serialised with a mkdir lock. Always exits 0 so it never blocks the
# agent, and never prints anything: it returns no decision to any hook event.
# Usage:
#   hook JSON on stdin (as a settings or plugin hook)
#   inbox-hook.sh --remove <session_id>   (the pane's Dismiss button)
# Files it touches, all under the inbox file's folder: the inbox file, a
# transient <inbox>.tmp.XXXXXX and <inbox>.lock/ directory, and, only while
# ~/.claude/inbox.debug exists, ~/.claude/inbox-debug.log (event metadata only).

umask 077
INBOX="${CLAUDE_INBOX_FILE:-$HOME/.claude/inbox.jsonl}"
LOCK="$INBOX.lock"
DEBUG_FLAG="$HOME/.claude/inbox.debug"
DEBUG_LOG="$HOME/.claude/inbox-debug.log"

command -v jq >/dev/null 2>&1 || exit 0

owned=0
tmp=""
cleanup() {
  [ -n "$tmp" ] && rm -f "$tmp" 2>/dev/null
  [ "$owned" = 1 ] && rm -rf "$LOCK" 2>/dev/null
  exit 0
}
trap cleanup EXIT INT TERM

# Take the lock: a directory holding the owner's pid. A lock is stale when it
# is at least 3 s old and its owner is gone (or never wrote its pid); a live
# owner is waited for up to ~2 s. Past that this run gives up: a new record
# is then appended without the lock (one small O_APPEND write; the pane keeps
# the last line per session and the next locked write tidies up) and a removal
# is left to the next event.
lock_age() {
  local mt now
  mt=$(stat -f %m "$LOCK" 2>/dev/null || stat -c %Y "$LOCK" 2>/dev/null || echo 0)
  now=$(date +%s)
  echo $((now - mt))
}
lock() {
  local i holder
  for i in $(seq 1 60); do
    if mkdir "$LOCK" 2>/dev/null; then
      owned=1
      printf '%s' "$$" > "$LOCK/pid" 2>/dev/null
      return 0
    fi
    if [ $((i % 10)) = 0 ] && [ "$(lock_age)" -ge 3 ]; then
      holder=$(cat "$LOCK/pid" 2>/dev/null)
      case "$holder" in
        '' | *[!0-9]*) rm -rf "$LOCK" 2>/dev/null ;;
        *) kill -0 "$holder" 2>/dev/null || rm -rf "$LOCK" 2>/dev/null ;;
      esac
    fi
    sleep 0.025
  done
  return 1
}

action="none"; kind=""; tool=""; summary=""; sid=""; input=""

if [ "${1:-}" = "--remove" ]; then
  sid="${2:-}"; action="clear"
else
  input=$(cat 2>/dev/null)
  [ -z "$input" ] && exit 0
  sid=$(printf '%s' "$input" | jq -r '.session_id // empty' 2>/dev/null)
fi
# A session id is a plain token; anything else is not ours to record.
case "$sid" in
  "" | *[!A-Za-z0-9_.-]*) exit 0 ;;
esac

if [ "$action" != "clear" ]; then
  if [ -f "$DEBUG_FLAG" ]; then
    # Metadata only, never message text; the log is truncated past 1 MB.
    size=$(stat -f %z "$DEBUG_LOG" 2>/dev/null || stat -c %s "$DEBUG_LOG" 2>/dev/null || echo 0)
    [ "${size:-0}" -gt 1048576 ] && : > "$DEBUG_LOG"
    printf '%s %s\n' "$(date +%T)" "$(printf '%s' "$input" | jq -c '{hook_event_name, session_id, notification_type, tool_name, cwd}' 2>/dev/null)" >> "$DEBUG_LOG"
  fi

  decided=$(printf '%s' "$input" | jq -c '
    def clean: tostring | gsub("[\\p{Cc}\\s]+"; " ") | ltrimstr(" ") | rtrimstr(" ") | .[0:220];
    def first_text: if . == null then "" elif (type == "array") then (map(tostring) | join(" ")) else tostring end;
    def tool_summary:
      (.tool_name // "") as $t
      | ((.tool_input // {}) as $i
         | ($i.command // $i.description // $i.file_path // $i.pattern // $i.url // $i.questions[0]?.question // ""))
      | first_text | clean
      | if . == "" then $t else ($t + ": " + .) end;
    (.hook_event_name // "") as $ev
    | if $ev == "Notification" then
        (.notification_type // "") as $nt
        | if $nt == "permission_prompt" then
            {action:"set_weak", kind:"permission", tool:"", summary:((.message // "") | clean)}
          elif ($nt | IN("elicitation_dialog","elicitation_url_dialog","agent_needs_input")) then
            {action:"set", kind:"question", tool:"", summary:((.message // "") | clean)}
          else {action:"none"} end
      elif $ev == "PermissionRequest" then
        {action:"set", kind:"permission", tool:(.tool_name // ""), summary: tool_summary}
      elif $ev == "PreToolUse" then
        if (.tool_name // "") == "AskUserQuestion" then
          {action:"set", kind:"question", tool:"AskUserQuestion",
           summary:(((.tool_input.questions // [])[0].question // "") | clean)}
        elif (.tool_name // "") == "ExitPlanMode" then
          {action:"set", kind:"question", tool:"ExitPlanMode", summary:""}
        else {action:"none"} end
      elif $ev == "Stop" then
        {action:"set", kind:"idle", tool:"",
         summary:((.last_assistant_message // "") | clean)}
      elif ($ev | IN("UserPromptSubmit","SessionEnd","SessionStart")) then {action:"clear"}
      elif ($ev | IN("PostToolUse","PermissionDenied")) then {action:"answered", tool:(.tool_name // "")}
      else {action:"none"} end
  ' 2>/dev/null) || exit 0
  action=$(printf '%s' "$decided" | jq -r '.action // "none"')
  kind=$(printf '%s' "$decided" | jq -r '.kind // ""')
  tool=$(printf '%s' "$decided" | jq -r '.tool // ""')
  summary=$(printf '%s' "$decided" | jq -r '.summary // ""')
fi

[ "$action" = "none" ] && exit 0

# The session's current record, if any
cur=""
if [ -f "$INBOX" ]; then
  cur=$(jq -c -R --arg sid "$sid" 'fromjson? | select(type=="object") | select(.session_id == $sid)' "$INBOX" 2>/dev/null | tail -n 1)
fi
cur_kind=$(printf '%s' "$cur" | jq -r '.kind // ""' 2>/dev/null)
cur_tool=$(printf '%s' "$cur" | jq -r '.tool // ""' 2>/dev/null)

new=""
case "$action" in
  clear)
    [ -z "$cur" ] && exit 0
    ;;
  answered)
    # The user answered a permission or question card: drop that record.
    [ -z "$cur" ] && exit 0
    if [ "$cur_kind" = "permission" ] || [ "$cur_kind" = "question" ]; then
      if [ -n "$cur_tool" ] && [ -n "$tool" ] && [ "$cur_tool" != "$tool" ]; then new="$cur"; fi
    else
      new="$cur"
    fi
    [ "$new" = "$cur" ] && exit 0
    ;;
  set|set_weak)
    if [ "$action" = "set_weak" ] && [ "$cur_kind" = "permission" ]; then exit 0; fi
    cwd=$(printf '%s' "$input" | jq -r '.cwd // empty' 2>/dev/null); [ -z "$cwd" ] && cwd="$PWD"
    project=$(basename "$cwd")
    # The desktop app's session id is a plain token; anything else is no link.
    host="${CLAUDE_CODE_HOST_SESSION_ID:-}"
    case "$host" in
      local_[A-Za-z0-9-]*) case "$host" in *[!A-Za-z0-9_-]*) host="" ;; esac ;;
      *) host="" ;;
    esac
    pid="${CLAUDE_PID:-$PPID}"
    case "$pid" in '' | *[!0-9]*) pid=0 ;; esac
    name=""
    if [ "$pid" != 0 ] && [ -f "$HOME/.claude/sessions/$pid.json" ]; then
      name=$(jq -r '.name // empty' "$HOME/.claude/sessions/$pid.json" 2>/dev/null)
    fi
    [ -z "$name" ] && name="$project"
    new=$(jq -n -c \
      --arg sid "$sid" --arg host "$host" --arg cwd "$cwd" --arg project "$project" \
      --arg title "$name" --arg kind "$kind" --arg summary "$summary" --arg tool "$tool" \
      --arg entry "${CLAUDE_CODE_ENTRYPOINT:-cli}" --argjson pid "$pid" '
      def clean: tostring | gsub("[\\p{Cc}]+"; " ") | .[0:200];
      { session_id: $sid, host_session_id: $host, cwd: $cwd, project: ($project | clean),
        title: ($title | clean), kind: $kind, summary: $summary, tool: $tool,
        ts_ms: (now * 1000 | floor), ts: (now | todate),
        entrypoint: $entry, pid: $pid,
        link: (if $host != "" then ("claude://claude.ai/epitaxy/" + $host) else "" end) }' 2>/dev/null)
    [ -z "$new" ] && exit 0
    ;;
esac

if ! lock; then
  [ -n "$new" ] && printf '%s\n' "$new" >> "$INBOX" 2>/dev/null
  exit 0
fi
tmp=$(mktemp "$INBOX.tmp.XXXXXX" 2>/dev/null) || exit 0
if [ -f "$INBOX" ]; then
  # Drop this session's old record, and records of sessions whose process is gone.
  jq -r -R --arg sid "$sid" '
      fromjson? | select(type=="object") | select(.session_id != $sid)
      | "\(.pid // 0)\t\(tojson)"' "$INBOX" 2>/dev/null |
  while IFS=$'\t' read -r rpid line; do
    case "$rpid" in
      0) printf '%s\n' "$line" >> "$tmp" ;;
      *[!0-9]*) ;;  # not a pid: drop the line
      *) kill -0 "$rpid" 2>/dev/null && printf '%s\n' "$line" >> "$tmp" ;;
    esac
  done
fi
[ -n "$new" ] && printf '%s\n' "$new" >> "$tmp"
if mv -f "$tmp" "$INBOX" 2>/dev/null; then tmp=""; fi
exit 0
