#!/usr/bin/env bash
# snapshot|check <root> <name> [owned-prefix...]: a setup run changes only owned paths; snapshot in the git dir.
set -euo pipefail

usage() { echo "usage: scope-guard.sh snapshot <root> <name> | check <root> <name> <owned-prefix>..." >&2; exit 2; }
[ "$#" -ge 3 ] || usage
MODE=$1; ROOT=$2; NAME=$3; shift 3
# Explicit ASCII list: under bash 3.2 and a UTF-8 locale an a-z range also matches accented letters.
case "$NAME" in *[!ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-]*|'') usage ;; esac
case "$MODE" in snapshot) ;; check) [ "$#" -ge 1 ] || usage ;; *) usage ;; esac

if ! git -C "$ROOT" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "SCOPE n/a (no git at $ROOT): check the changed files by hand"; exit 0
fi
TOP=$(git -C "$ROOT" rev-parse --show-toplevel)
SNAP=$(cd "$TOP" && git rev-parse --path-format=absolute --git-path "brewcode-scope-$NAME.snap")
# Root's config dir, top-relative like the owned prefixes the callers pass.
PRE=$(git -C "$ROOT" rev-parse --show-prefix)

# Runtime files hooks, Claude Code and concurrent sessions write under any .claude/ dir, never setup output.
# Single home of that list (upgrade-runner.md section 3 points here); untracked only, a tracked edit stays visible.
SKIP=()
for r in 'agent-return-state/**' 'docsync/state*' 'logs/**' 'plans/**' 'reports/**' 'scheduled_tasks.*' \
  'semble/telemetry.jsonl' 'settings.local.json' 'tasks/cfg/brewcode.state.json*' 'tmp/**' 'worktrees/**'; do
  SKIP+=(":(exclude,glob)**/.claude/$r")
done

# Tracked edits, staged paths, untracked files, plus every untracked file in the config dirs:
# that walk applies no exclude rules, so a global or local gitignore cannot hide a write there.
paths() {
  git -C "$TOP" ls-files -z --modified &&
    git -C "$TOP" diff -z --cached --name-only &&
    git -C "$TOP" ls-files -z --others --exclude-standard -- "${SKIP[@]}" &&
    git -C "$TOP" ls-files -z --others -- "$PRE.claude/" .claude/ "${SKIP[@]}" ':(exclude,glob)**/node_modules/**'
}

# One `<hash>\t<path>` line per path, DELETED for a missing file; one hash-object call for all files.
# rc 1 when git fails or hashes fewer files (vanished, unreadable): never a half-hashed state.
state() {
  local list files hashes
  list=$(paths | tr '\0' '\n' | LC_ALL=C sort -u) || return 1
  [ -n "$list" ] || return 0
  files=$(printf '%s\n' "$list" | while IFS= read -r p; do
    if [ -n "$p" ] && [ -f "$TOP/$p" ]; then printf '%s\n' "$p"; fi; done)
  if [ -n "$files" ]; then
    # `./` keeps --stdin-paths from C-unquoting a name that starts with a double quote.
    hashes=$(printf '%s\n' "$files" | sed 's|^|./|' | git -C "$TOP" hash-object --stdin-paths) || return 1
    [ "$(printf '%s\n' "$hashes" | wc -l)" -eq "$(printf '%s\n' "$files" | wc -l)" ] || return 1
    paste <(printf '%s\n' "$hashes") <(printf '%s\n' "$files")
  fi
  printf '%s\n' "$list" | while IFS= read -r p; do
    if [ -n "$p" ] && [ ! -f "$TOP/$p" ]; then printf 'DELETED\t%s\n' "$p"; fi; done
}

FAILED="❌ SCOPE cannot hash the tree (git error above): nothing judged, run it again"
case "$MODE" in
  snapshot)
    state > "$SNAP" || { rm -f "$SNAP"; echo "$FAILED"; exit 1; }
    echo "SCOPE snapshot $(wc -l < "$SNAP" | tr -d ' ') dirty path(s) -> $SNAP" ;;
  check)
    [ -f "$SNAP" ] || { echo "❌ SCOPE no snapshot for '$NAME': run snapshot before the setup writes"; exit 1; }
    now=$(state) || { echo "$FAILED"; exit 1; }
    out=0
    # Changed = in one state only, or another hash: one join, never an awk pass per path.
    changed=$(printf '%s\n' "$now" | SCOPE_SNAP="$SNAP" awk '
      BEGIN { while ((getline l < ENVIRON["SCOPE_SNAP"]) > 0) { i = index(l, "\t"); was[substr(l, i + 1)] = substr(l, 1, i - 1) } }
      $0 != "" { i = index($0, "\t"); p = substr($0, i + 1); seen[p] = 1; if (!(p in was) || was[p] != substr($0, 1, i - 1)) print p }
      END { for (p in was) if (!(p in seen)) print p }' | LC_ALL=C sort -u)
    while IFS= read -r p; do
      [ -n "$p" ] || continue
      owned=no
      for pre in "$@"; do case "$p" in "$pre"*) owned=yes ;; esac; done
      [ "$owned" = yes ] && continue
      echo "OUTSIDE $p"; out=$((out + 1))
    done <<< "$changed"
    if [ "$out" -eq 0 ]; then echo "SCOPE ok: only owned paths changed ($*)"; rm -f "$SNAP"
    else echo "❌ SCOPE $out path(s) outside the owned set changed: a defect to report, never to keep"; exit 1; fi ;;
esac
