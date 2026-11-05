#!/usr/bin/env bash
# brewpage-run.sh <probe|limits|stage|publish|cleanup> [flags] - the only command brewdoc:publish runs.
# One allowed-tools rule covers every call; values arrive as single-quoted argv, never as shell source.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=SCRIPTDIR/brewpage-lib.sh
. "$HERE/brewpage-lib.sh"

die() { printf 'FAILED: %s\n' "$1"; exit 1; }
# rc 0 when the flag at $2 has a value after it ($1 = remaining argc).
need() { [ "$1" -ge 2 ] || die "$2 needs a value"; }

# curl's form grammar parses commas/semicolons even inside shell-quoted argv.
form_file() {
  local path="$2"
  path="${path//\\/\\\\}"
  path="${path//\"/\\\"}"
  printf '%s=@"%s"' "$1" "$path"
}

BP_FRESH=""
# Allocates a run dir, EXIT discards it until re-armed: also when bp_run_dir rejects it.
new_run() {
  BP_FRESH=$(bp_prepare) || die "cannot allocate a private run directory"
  trap 'bp_discard "$BP_FRESH"' EXIT
}

usage() {
  cat <<'USAGE'
brewpage-run.sh probe <path>
brewpage-run.sh limits
brewpage-run.sh stage --run <run_id|''> --text <chunk>
brewpage-run.sh publish <html|json|file|site-dir|site-zip> --ns <ns> [--ttl N] [--entry F]
  [--delivery-mode path|subdomain] --password-file <ABS|''> [--confirmed --review-sha256 SHA256] (--text T | --run ID | --path P)
brewpage-run.sh cleanup --run <run_id>
--ns and --password-file are required; --password-file '' explicitly selects no password.
Empty --ttl uses 15; empty --entry/--delivery-mode are omitted. Prints OK/CONFIRM:/FAILED:; CONFIRM exits 2.
USAGE
}

# Read-only: type + source-tree estimates for Step 3; never uploads, never writes.
cmd_probe() {
  [ "$#" -eq 1 ] || die "probe takes exactly one path"
  local p="$1" abs html_files entry
  if [ -d "$p" ]; then
    abs=$(cd "$p" && pwd -P)
    # Hidden paths (root .well-known/ aside) never ship; entry = server rule: index.html, else shallowest HTML.
    html_files=$(cd "$abs" && find . -type f \( -name '*.html' -o -name '*.htm' \) | sed 's|^\./||' | LC_ALL=C sort |
      awk -F/ '{ for (i = 1; i <= NF; i++) if ($i ~ /^\./ && !(i == 1 && $i == ".well-known")) next; print }')
    if [ -f "$abs/index.html" ]; then entry=index.html; else
      entry=$(printf '%s\n' "$html_files" | awk -F/ 'NF { print NF "\t" $0 }' | LC_ALL=C sort -s -n -k1,1 | sed -n '1p' | cut -f2-)
    fi
    printf 'TYPE: site-dir\nPATH: %s\nFILES: %s\nHTML: %s\nSIZE_KB: %s\nENTRY: %s\n' "$abs" \
      "$(find "$abs" -type f | wc -l | tr -d ' ')" "$(printf '%s' "$html_files" | grep -c . || true)" \
      "$(du -sk "$abs" | cut -f1)" "${entry:-none}"
  elif [ -f "$p" ]; then
    abs="$(cd "$(dirname "$p")" && pwd -P)/$(basename "$p")"
    local type=file
    case "$p" in *.zip) type=site-zip ;; *.md | *.markdown) type=markdown ;; esac
    printf 'TYPE: %s\nPATH: %s\nBYTES: %s\nMIME: %s\n' "$type" "$abs" "$(wc -c < "$abs" | tr -d ' ')" \
      "$(file --mime-type -b -- "$abs" 2>/dev/null || echo unknown)"
  else
    printf 'TYPE: none\n'
  fi
}

# Read-only: the server's current user-facing upload limits (GET /api/limits), one KEY: value per line.
cmd_limits() {
  [ "$#" -eq 0 ] || die "limits takes no arguments"
  command -v jq >/dev/null || die "jq required"
  local body
  body=$(curl -s -A "ClaudeCode/1.0" https://brewpage.app/api/limits) || die "limits request failed"
  printf '%s' "$body" | jq -er '(.sites // empty) as $s | def mb: . / 1048576 * 10 | round / 10;
    "REQUEST_MAX_MB: \(.requestMaxBytes | mb)", "SITE_MAX_FILES: \($s.maxFiles)", "SITE_MAX_FILE_MB: \($s.maxFileBytes | mb)",
    "SITE_MAX_TOTAL_MB: \($s.maxTotalBytes | mb)", "SITE_MAX_ARCHIVE_EXPANSION_MB: \($s.maxArchiveExpansionBytes | mb)",
    "PATH_MAX_CHARS: \($s.maxPathChars)", "PATH_MAX_BYTES: \($s.maxPathBytes)", "NAME_MAX_BYTES: \($s.maxNameBytes)"' 2>/dev/null ||
    die "limits unavailable (unexpected response)"
}

# Allocates a run (empty --run) or appends to it; chunks rejoin with one newline between them.
cmd_stage() {
  local run="" text="" have_text=0 file
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --run) need "$#" "$1"; run="$2"; shift 2 ;;
      --text) need "$#" "$1"; text="$2"; have_text=1; shift 2 ;;
      *) die "unknown stage argument: $1" ;;
    esac
  done
  [ "$have_text" = 1 ] || die "stage needs --text"
  if [ -z "$run" ]; then
    new_run
    run="${BP_FRESH##*/}"
  fi
  bp_run_dir "$run" || exit 1
  file="$BP_RUN_DIR/brewpage-content.md"
  (
    umask 077
    if [ -s "$file" ]; then printf '\n' >> "$file"; fi
    printf '%s' "$text" >> "$file"
  )
  printf 'RUN: %s\nBYTES: %s\n' "$run" "$(wc -c < "$file" | tr -d ' ')"
  # Staged: the run outlives this call for the next chunk and the publish.
  trap - EXIT
}

cmd_cleanup() {
  [ "$#" -eq 2 ] && [ "$1" = --run ] || die "cleanup takes --run <run_id>"
  bp_run_dir "$2" || exit 1
  bp_cleanup
  printf 'CLEANED: %s\n' "$2"
}

cmd_publish() {
  local type="${1:-}" ns="" days=15 entry="" mode="" pwfile="" text="" run="" path="" have_text=0 sources=0 have_password=0
  if [ "$#" -gt 0 ]; then shift; fi
  BREWPAGE_CONFIRMED=0
  BREWPAGE_REVIEW_SHA256=""
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --ns) need "$#" "$1"; ns="$2"; shift 2 ;;
      --ttl) need "$#" "$1"; days="${2:-15}"; shift 2 ;;
      --entry) need "$#" "$1"; entry="$2"; shift 2 ;;
      --delivery-mode) need "$#" "$1"; mode="$2"; shift 2 ;;
      --password-file) need "$#" "$1"; pwfile="$2"; have_password=1; shift 2 ;;
      --text) need "$#" "$1"; text="$2"; have_text=1; sources=$((sources + 1)); shift 2 ;;
      --run) need "$#" "$1"; run="$2"; sources=$((sources + 1)); shift 2 ;;
      --path) need "$#" "$1"; path="$2"; sources=$((sources + 1)); shift 2 ;;
      --confirmed) BREWPAGE_CONFIRMED=1; shift ;;
      --review-sha256) need "$#" "$1"; BREWPAGE_REVIEW_SHA256="$2"; shift 2 ;;
      *) die "unknown publish argument: $1" ;;
    esac
  done
  [ "$have_password" -eq 1 ] || die "explicit --password-file choice required (empty means no password)"
  command -v python3 >/dev/null || die "python3 required for secure history"
  [ "$sources" -eq 1 ] || die "publish needs exactly one of --text, --run, --path"
  if [ -n "$BREWPAGE_REVIEW_SHA256" ]; then
    [ "${#BREWPAGE_REVIEW_SHA256}" -eq 64 ] || die "review SHA256 must be 64 lowercase hex characters"
    case "$BREWPAGE_REVIEW_SHA256" in *[!0123456789abcdef]*) die "review SHA256 must be 64 lowercase hex characters" ;; esac
    [ "$BREWPAGE_CONFIRMED" = 1 ] || die "review SHA256 requires --confirmed"
  fi
  case "$type" in
    html) : ;;
    json) [ -z "$path" ] || die "json takes --text or --run" ;;
    file | site-dir | site-zip) [ -n "$path" ] || die "$type takes --path" ;;
    *) die "unknown publish type: ${type:-<none>}" ;;
  esac
  case "$type" in site-dir | site-zip) : ;; *) [ -z "$entry" ] || die "--entry applies to sites only" ;; esac
  case "$type" in site-dir | site-zip) : ;; *) [ -z "$BREWPAGE_REVIEW_SHA256" ] || die "review SHA256 applies to sites only" ;; esac
  if [ -n "$path" ]; then
    case "$type" in site-dir) [ -d "$path" ] || die "not a directory: $path" ;; *) [ -f "$path" ] || die "not a file: $path" ;; esac
  fi

  # Slot errors fail before the run is touched, so a staged run survives any bad flag or password file.
  bp_validate "$ns" "$days" "$entry" || exit 1
  case "$mode" in '' | path | subdomain) : ;; *) die "delivery mode must be path or subdomain" ;; esac
  if [ -n "$pwfile" ]; then bp_password_check "$pwfile" || exit 1; fi

  local id pwmode=none
  if [ -n "$run" ]; then
    id="$run"
  else
    new_run
    id="${BP_FRESH##*/}"
  fi
  # An EXISTING run bp_run_dir rejects is left as is; only a fresh one is discarded.
  bp_run_dir "$id" || exit 1
  trap bp_cleanup EXIT
  if [ -n "$pwfile" ]; then
    pwmode="file"
    (umask 077; printf '%s\n' "$pwfile" > "$BP_RUN_DIR/brewpage-password-source.txt")
  fi
  local content="$BP_RUN_DIR/brewpage-content.md"
  if [ "$have_text" = 1 ]; then
    (umask 077; printf '%s' "$text" > "$content")
  elif [ -n "$run" ]; then
    [ -f "$content" ] || die "run $id has no staged text"
  else
    content="$path"
  fi
  bp_begin "$ns" "$days" "$entry" "$id" "$pwmode" "$mode" || exit 1

  local response rc=0 manifest archive
  case "$type" in
    html)
      jq -n --rawfile c "$content" '{content: $c}' > "$BP_RUN_DIR/payload.json"
      response=$(bp_post "https://brewpage.app/api/html?ns=$NS&ttl=$DAYS&format=markdown" \
        -H "Content-Type: application/json" -d @"$BP_RUN_DIR/payload.json") || die "upload request failed"
      bp_finish "$response" "$DAYS" html
      ;;
    json)
      jq empty "$content" 2>/dev/null || die "payload is not valid JSON"
      response=$(bp_post "https://brewpage.app/api/json?ns=$NS&ttl=$DAYS" \
        -H "Content-Type: application/json" -d @"$content") || die "upload request failed"
      bp_finish "$response" "$DAYS" json
      ;;
    file)
      response=$(bp_post "https://brewpage.app/api/files?ns=$NS&ttl=$DAYS" -F "$(form_file file "$path")") || die "upload request failed"
      bp_finish "$response" "$DAYS" file
      ;;
    site-dir | site-zip)
      if [ "$type" = site-dir ]; then
        archive="$BP_RUN_DIR/site.zip"
        manifest=$(umask 077; node "$HERE/publish.mjs" pack --dir "$path" --out "$archive" ${ENTRY:+--entry "$ENTRY"}) || rc=$?
        printf '%s\n' "$manifest"
        bp_archive_gate "$rc" "$manifest" "$archive" || exit $?
      else
        (umask 077; mkdir "$BP_RUN_DIR/archive")
        archive="$BP_RUN_DIR/archive/${path##*/}"
        bp_archive_snapshot "$path" "$archive" || die "cannot snapshot supplied archive safely"
        manifest=$(node "$HERE/publish.mjs" inspect --zip "$archive" ${ENTRY:+--entry "$ENTRY"}) || rc=$?
        printf '%s\n' "$manifest"
        bp_archive_gate "$rc" "$manifest" "$archive" || exit $?
      fi
      response=$(bp_post "https://brewpage.app/api/sites?ns=$NS&ttl=$DAYS&entry=$(jq -nr --arg e "$ENTRY" '$e | @uri')" \
        -H "User-Agent: ClaudeCode/1.0" -F "$(form_file archive "$archive")") || die "upload request failed"
      bp_finish "$response" "$DAYS" site
      ;;
  esac
}

cmd="${1:-}"
if [ "$#" -gt 0 ]; then shift; fi
case "$cmd" in
  probe) cmd_probe "$@" ;;
  limits) cmd_limits "$@" ;;
  stage) cmd_stage "$@" ;;
  publish) cmd_publish "$@" ;;
  cleanup) cmd_cleanup "$@" ;;
  -h | --help) usage ;;
  *) usage; die "unknown subcommand: ${cmd:-<none>}" ;;
esac
