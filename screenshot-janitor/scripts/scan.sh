#!/bin/bash
# Usage: scan.sh <since_epoch>
# Prints screenshot files (in configured dirs) modified at/after <since_epoch>
# as TSV:  <mtime_epoch>\t<size_bytes>\t<path>
# since_epoch=0 returns every matching screenshot.
set -u
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$DIR/lib.sh"
# shellcheck disable=SC1091
source "$DIR/config.sh"

since="${1:-0}"

for d in "${SCAN_DIRS[@]}"; do
  [ -d "$d" ] || continue
  args=()
  first=1
  for p in "${NAME_PATTERNS[@]}"; do
    if [ "$first" -eq 1 ]; then
      args+=( -iname "$p" ); first=0
    else
      args+=( -o -iname "$p" )
    fi
  done
  find "$d" -maxdepth 1 -type f \( "${args[@]}" \) -print0 2>/dev/null
done | while IFS= read -r -d '' f; do
  m="$(sj_mtime "$f")"
  [ -n "$m" ] || continue
  if [ "$m" -ge "$since" ]; then
    s="$(sj_size "$f")"
    printf '%s\t%s\t%s\n' "$m" "${s:-0}" "$f"
  fi
done
