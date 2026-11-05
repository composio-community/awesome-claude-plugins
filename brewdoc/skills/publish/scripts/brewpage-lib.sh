#!/usr/bin/env bash
# Sourced (!=executed) by scripts/brewpage-run.sh, the skill's only entry: sets HISTORY_FILE + helpers.
# Owns token-history location (BD03) and URL-safety of prompt-derived query params (BD02).

# rc 0: $1 is HOME or the active config dir's parent - its .claude is a profile, never a project root.
bp_is_profile_parent() {
  local p
  p=$(cd "$1" 2>/dev/null && pwd -P) || return 1
  [ -n "${HOME:-}" ] && [ "$p" = "$(cd "$HOME" 2>/dev/null && pwd -P)" ] && return 0
  [ -n "${CLAUDE_CONFIG_DIR:-}" ] && [ "$p/.claude" = "$(cd "$CLAUDE_CONFIG_DIR" 2>/dev/null && pwd -P)" ]
}

# Project root, canonical recipe: CLAUDE_PROJECT_DIR -> git toplevel -> upward
# walk for .git/.claude (profile parents skipped) -> PWD. The history file must not follow a nested cwd.
bp_project_root() {
  if [ -n "${CLAUDE_PROJECT_DIR:-}" ] && [ -d "$CLAUDE_PROJECT_DIR" ]; then
    printf '%s\n' "$CLAUDE_PROJECT_DIR"
    return 0
  fi
  local root
  root=$(git rev-parse --show-toplevel 2>/dev/null) || root=""
  if [ -n "$root" ]; then
    printf '%s\n' "$root"
    return 0
  fi
  local d="$PWD"
  while [ "$d" != "/" ]; do
    if [ -d "$d/.git" ] || { [ -d "$d/.claude" ] && ! bp_is_profile_parent "$d"; }; then
      printf '%s\n' "$d"
      return 0
    fi
    d=$(dirname "$d")
  done
  printf '%s\n' "$PWD"
}

BP_ROOT="$(bp_project_root)"
HISTORY_FILE="$BP_ROOT/.claude/brewpage-history.md"
# Run dirs stay outside .claude/ (protected path); only brewpage-run.sh writes into them.
BP_TMPDIR="${TMPDIR:-/tmp}"
BP_TMPDIR="${BP_TMPDIR%/}"

# Creates the history file if absent, keeps it mode 600, and makes sure git
# never picks it up — the skill used to only *ask* the user to keep it private.
bp_history_init() {
  command -v python3 >/dev/null || { echo 'FAILED: python3 required for secure history'; return 1; }
  python3 "$(dirname "${BASH_SOURCE[0]}")/history.py" init "$BP_ROOT" "${HISTORY_FILE#"$BP_ROOT/"}" <<'HEADER'
# brewpage.app — Published Pages

> Owner tokens allow delete and in-place PUT (html/json/kv/files/sites). Old publications are read-only: 409 OLD_PUBLICATION_READ_ONLY; publish anew and report only the new URL. Keep tokens in this private file; never display them in chat.
> Delete: `curl -s -X DELETE "<Owner API>" -H "X-Owner-Token: TOKEN"`; rows without one: `https://brewpage.app/api/<type>/<ns>/<id>`, type = html|json|files|kv|sites.
> Update a site (same URL; old publications answer 409, see above): `PUT /api/sites/<ns>/<id>` with `X-Owner-Token: TOKEN` + the new bundle.

| Date | URL | Owner Token | TTL | Type | Owner API | Identity |
|------|-----|-------------|-----|------|-----------|----------|
HEADER
}

# shellcheck disable=SC2016 # backticks = literal markdown code spans
bp_history_append() {
  if [ "$#" -ge 5 ]; then
    printf '| %s | [%s](%s) | `%s` | %sd | %s | %s | `%s` |\n' \
      "$(date '+%Y-%m-%d %H:%M')" "$1" "$1" "$2" "$3" "$4" "$5" "${6:-}" | python3 "$(dirname "${BASH_SOURCE[0]}")/history.py" append "$BP_ROOT" "${HISTORY_FILE#"$BP_ROOT/"}"
  else
    printf '| %s | [%s](%s) | `%s` | %sd | %s |\n' \
      "$(date '+%Y-%m-%d %H:%M')" "$1" "$1" "$2" "$3" "$4" | python3 "$(dirname "${BASH_SOURCE[0]}")/history.py" append "$BP_ROOT" "${HISTORY_FILE#"$BP_ROOT/"}"
  fi
}

# BD02: ns/ttl/entry arrive as single-quoted literals; re-checked here as data before the URL.
# Explicit char lists, never a-z ranges: bash 3.2 en_US.UTF-8 collation lets [a-z] match A-Z and accents.
bp_validate() {
  local ns="$1" days="$2" entry="$3"
  case "$ns" in
    *[!abcdefghijklmnopqrstuvwxyz0123456789-]* | '') echo "FAILED: namespace must be 1-32 chars of a-z0-9-"; return 1 ;;
  esac
  [ "${#ns}" -ge 1 ] && [ "${#ns}" -le 32 ] || { echo "FAILED: namespace must be 1-32 chars"; return 1; }
  case "$days" in
    '' | *[!0123456789]*) echo "FAILED: ttl must be a positive integer"; return 1 ;;
  esac
  [ "$days" -ge 1 ] || { echo "FAILED: ttl must be >= 1"; return 1; }
  if [ -n "$entry" ]; then
    case "$entry" in
      *[!ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789._/-]* | */../* | ../* | */..) echo "FAILED: entry must be a plain relative file name"; return 1 ;;
    esac
  fi
  return 0
}

# Allocate before writing inputs; only the generated ASCII basename is substituted into blocks.
bp_prepare() {
  mkdir -p "$BP_TMPDIR" || return 1
  (umask 077; mktemp -d "$BP_TMPDIR/brewpage.XXXXXX")
}

bp_run_dir() {
  local id="${1:-}"
  case "$id" in
    brewpage.??????) : ;;
    *) echo "FAILED: invalid publish run id"; return 1 ;;
  esac
  case "$id" in *[!ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789.]*) echo "FAILED: invalid publish run id"; return 1 ;; esac
  BP_RUN_DIR="$BP_TMPDIR/$id"
  [ -d "$BP_RUN_DIR" ] && [ ! -L "$BP_RUN_DIR" ] && [ -O "$BP_RUN_DIR" ] &&
    [ -n "$(find "$BP_RUN_DIR" -maxdepth 0 -type d -perm 0700 -print)" ] || {
      echo "FAILED: publish run directory must be owned, private and non-symlink"; return 1;
    }
}

bp_cleanup() {
  [ -n "${BP_RUN_DIR:-}" ] || return 0
  bp_run_dir "${BP_RUN_DIR##*/}" || return 1
  rm -rf -- "$BP_RUN_DIR"
}

# Removes a dir this call just made via bp_prepare, even one bp_run_dir rejects (bp_cleanup refuses it).
bp_discard() {
  case "${1:-}" in "$BP_TMPDIR"/brewpage.??????) rm -rf -- "$1" ;; esac
}

# jq: X-Password header line from $password; error() on <4 chars or a control char (header injection).
# shellcheck disable=SC2016 # $password/$p are jq variables
BP_PW_FILTER='($password | rtrimstr("\n")) as $p |
  if ($p | length) >= 4 and ($p | explode | all(. >= 32 and . != 127))
  then "X-Password: " + $p else error("invalid password") end'

# {password_file} slot: absolute path to a readable non-symlink regular file with a valid password.
bp_password_check() {
  case "${1:-}" in /*) : ;; *) echo "FAILED: password file must be an absolute path"; return 1 ;; esac
  [ -f "$1" ] && [ ! -L "$1" ] || { echo "FAILED: password source must be a non-symlink regular file"; return 1; }
  [ -r "$1" ] || { echo "FAILED: password file is not readable"; return 1; }
  command -v jq >/dev/null || { echo "FAILED: jq required"; return 1; }
  jq -ner --rawfile password "$1" "$BP_PW_FILTER" >/dev/null 2>&1 ||
    { echo "FAILED: password must have at least 4 characters and no control characters"; return 1; }
}

# Prelude: explicit run id/password policy, no implicit shared credential discovery.
bp_begin() {
  NS="$1"; DAYS="$2"; ENTRY="$3"
  bp_run_dir "${4:-}" || return 1
  trap bp_cleanup EXIT
  trap 'exit 1' HUP INT TERM
  bp_validate "$NS" "$DAYS" "$ENTRY" || return 1
  BP_DELIVERY_MODE="${6:-}"
  case "$BP_DELIVERY_MODE" in ''|path|subdomain) : ;; *) echo "FAILED: delivery mode must be path or subdomain"; return 1 ;; esac
  case "${5:-}" in none|file) BP_PASSWORD_MODE="$5" ;; *) echo "FAILED: explicit password mode required"; return 1 ;; esac
  bp_history_init || { echo "FAILED: cannot initialize history file"; return 1; }
  command -v jq >/dev/null || { echo "FAILED: jq required"; return 1; }
  BP_HEADER_FILE=""
  if [ "$BP_PASSWORD_MODE" = file ]; then
    local source_file="$BP_RUN_DIR/brewpage-password-source.txt" password_source=""
    [ -f "$source_file" ] && [ ! -L "$source_file" ] || { echo "FAILED: password source path file missing or unsafe"; return 1; }
    IFS= read -r password_source < "$source_file" || true
    bp_password_check "$password_source" || return 1
    local password_file="$BP_RUN_DIR/brewpage-password.txt"
    [ ! -e "$password_file" ] && [ ! -L "$password_file" ] || { echo "FAILED: password transport file already exists"; return 1; }
    (umask 077; cat -- "$password_source" > "$password_file") || return 1
    BP_HEADER_FILE="$BP_RUN_DIR/password-header.txt"
    # Re-checks the copied bytes: the source may change after bp_password_check.
    (umask 077; jq -ner --rawfile password "$password_file" "$BP_PW_FILTER" > "$BP_HEADER_FILE") 2>/dev/null ||
      { echo "FAILED: password must have at least 4 characters and no control characters"; return 1; }
  fi
}

# curl reads the header file; neither shell argv nor output contains the password.
# A function has its own positional parameters, so no `set --` juggling is needed.
bp_post() {
  local url="$1"
  shift
  if [ -n "${BP_DELIVERY_MODE:-}" ]; then
    set -- -H "X-Delivery-Mode: $BP_DELIVERY_MODE" "$@"
  fi
  if [ -n "$BP_HEADER_FILE" ]; then
    curl -s -X POST "$url" -H "@$BP_HEADER_FILE" "$@"
  else
    curl -s -X POST "$url" "$@"
  fi
}

# Error JSON ({status, message}, never a token) -> "HTTP <status>: <message>", one line; else empty.
bp_error_reason() {
  printf '%s' "$1" | jq -r 'select(type == "object" and (.status | type) == "number")
    | "HTTP \(.status): \((.message // .error // "") | tostring | explode | map(if . < 32 then 32 else . end) | implode | .[0:400])"' 2>/dev/null || true
}

# The tail every block shares: URL out, owner token to history, one OK/FAILED line, then any server NOTICE lines.
# `site` is the only type whose response carries .fileCount.
bp_finish() {
  local response="$1" days="$2" type="$3" url token fcount owner_api identity reason nonowned_merge=0
  url=$(printf '%s' "$response" | jq -r '.link // empty')
  if [ -z "$url" ]; then
    reason=$(bp_error_reason "$response")
    echo "FAILED: publish rejected (${reason:-no .link in response})"
    return 1
  fi
  if printf '%s' "$response" | jq -e '.result.action == "merged" and .result.extras.isOwner == false' >/dev/null 2>&1; then
    token=""; nonowned_merge=1
  else
    token=$(printf '%s' "$response" | jq -r '.ownerToken // empty')
  fi
  owner_api=$(printf '%s' "$response" | jq -r '.ownerLink // empty')
  identity=$(printf '%s' "$response" | jq -c '{id, namespace, type, routingCohort, deliveryMode, modeLocked, hostingVersion, managementLink, createdAt, expiresAt}')
  if [ "$type" = site ]; then
    fcount=$(printf '%s' "$response" | jq -r '.fileCount // "?"')
    if [ -n "$token" ]; then bp_history_append "$url" "$token" "$days" "site ($fcount files)" "$owner_api" "$identity" || { echo 'FAILED: published but owner token could not be saved securely'; return 1; }; fi
    echo "OK $url | Files: $fcount"
  else
    if [ -n "$token" ]; then bp_history_append "$url" "$token" "$days" "$type" "$owner_api" "$identity" || { echo 'FAILED: published but owner token could not be saved securely'; return 1; }; fi
    echo "OK $url"
  fi
  if [ "$nonowned_merge" -eq 1 ]; then echo 'NOTICE: existing publication returned without ownership; no owner capability saved'; fi
  printf '%s' "$response" | jq -r '.notices[]?.message // empty | "NOTICE: " + (tostring | explode | map(if . < 32 then 32 else . end) | implode)' 2>/dev/null || true
}

# Snapshot before inspection: source replacement cannot change the eventual upload.
bp_archive_snapshot() {
  python3 - "$1" "$2" <<'PY'
import os, stat, sys
source = os.open(os.path.realpath(sys.argv[1]), os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
try:
    info = os.fstat(source)
    if not stat.S_ISREG(info.st_mode) or info.st_size > 25 * 1024 * 1024:
        raise ValueError('archive must be a regular file within the inspection limit')
    with os.fdopen(source, 'rb', closefd=False) as incoming:
        fd = os.open(sys.argv[2], os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        with os.fdopen(fd, 'wb') as outgoing:
            data = incoming.read(25 * 1024 * 1024 + 1)
            if len(data) > 25 * 1024 * 1024:
                raise ValueError('archive grew beyond the inspection limit')
            outgoing.write(data)
finally:
    os.close(source)
PY
}

# Confirmation approves one archive digest; every run still discards its temporary payload.
bp_archive_gate() {
  local rc="$1" manifest="$2" zip="$3"
  if [ "$rc" -ne 0 ] && [ "$rc" -ne 2 ]; then
    [ -n "$zip" ] && rm -f "$zip"
    echo "FAILED: archive not verified (publish.mjs exit $rc) — nothing was uploaded"
    return 1
  fi
  if [ "$rc" -eq 2 ] || [ "${BREWPAGE_CONFIRMED:-0}" = 1 ] || [ -n "${BREWPAGE_REVIEW_SHA256:-}" ]; then
    local digest
    digest=$(python3 - "$zip" <<'PY'
import hashlib, os, stat, sys
fd = os.open(sys.argv[1], os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
with os.fdopen(fd, 'rb') as archive:
    info = os.fstat(archive.fileno())
    if not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid() or info.st_nlink != 1:
        raise ValueError('unsafe archive snapshot')
    digest = hashlib.sha256()
    for block in iter(lambda: archive.read(65536), b''):
        digest.update(block)
    print(digest.hexdigest())
PY
    ) || { echo 'FAILED: cannot hash reviewed archive'; return 1; }
    if [ "${BREWPAGE_CONFIRMED:-0}" != 1 ] || [ "${BREWPAGE_REVIEW_SHA256:-}" != "$digest" ]; then
      echo "REVIEW_SHA256: $digest"
      echo "CONFIRM: review this manifest, then re-run with --confirmed --review-sha256 $digest"
      return 2
    fi
  fi
  ENTRY=$(printf '%s\n' "$manifest" | sed -n 's/^ENTRY: //p')
}
