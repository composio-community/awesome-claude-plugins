#!/bin/bash
# screenshot-janitor — shared helpers. Abstracts macOS/Linux differences.
# No external dependencies (no jq, no python).

# Where per-session state lives (writable, persistent across the session).
SJ_STATE_DIR="${SJ_STATE_DIR:-$HOME/.claude/screenshot-janitor}"

sj_os() {
  case "$(uname -s)" in
    Darwin) echo "macos" ;;
    Linux)  echo "linux" ;;
    *)      echo "other" ;;
  esac
}

# File modification time as a Unix epoch.
sj_mtime() { # <file>
  if [ "$(uname -s)" = "Darwin" ]; then stat -f '%m' "$1" 2>/dev/null
  else stat -c '%Y' "$1" 2>/dev/null; fi
}

# File size in bytes.
sj_size() { # <file>
  if [ "$(uname -s)" = "Darwin" ]; then stat -f '%z' "$1" 2>/dev/null
  else stat -c '%s' "$1" 2>/dev/null; fi
}

# Extract a JSON string field value (best-effort, dependency-free).
sj_json_str() { # <json> <key>
  printf '%s' "$1" | grep -o "\"$2\"[[:space:]]*:[[:space:]]*\"[^\"]*\"" | head -1 | sed -E 's/.*"([^"]*)"$/\1/'
}

# Extract a JSON number field value.
sj_json_num() { # <json> <key>
  printf '%s' "$1" | grep -o "\"$2\"[[:space:]]*:[[:space:]]*[0-9]*" | grep -o '[0-9]*' | head -1
}

# Move files to the Trash (NEVER permanent rm). Returns 0 on success.
# Tries, in order: `trash` CLI -> macOS Finder/AppleScript -> `gio trash` -> `trash-put`.
sj_trash() { # <file...>
  [ "$#" -gt 0 ] || return 0
  if command -v trash >/dev/null 2>&1; then
    trash "$@"; return $?
  fi
  if [ "$(uname -s)" = "Darwin" ]; then
    local f rc=0
    for f in "$@"; do
      osascript -e "tell application \"Finder\" to delete (POSIX file \"$f\")" >/dev/null 2>&1 || rc=1
    done
    return $rc
  fi
  if command -v gio >/dev/null 2>&1; then
    gio trash "$@"; return $?
  fi
  if command -v trash-put >/dev/null 2>&1; then
    trash-put "$@"; return $?
  fi
  echo "ERROR: no Trash command found. Install one: macOS 'brew install trash', Linux 'gio' or 'trash-cli'." >&2
  return 2
}
