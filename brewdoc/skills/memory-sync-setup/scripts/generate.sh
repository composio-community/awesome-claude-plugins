#!/bin/bash
# brewdoc:memory-sync-setup generator: emits project-local .claude/skills/memory-sync/ into the repo ROOT; modes -> usage at bottom.

set -euo pipefail

MODE="${1:-emit}"

# Self-location: scripts/generate.sh -> skills/memory-sync-setup/scripts -> skills/memory-sync-setup
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SKILL_DIR="$(dirname "$SCRIPT_DIR")"
REFS="$SKILL_DIR/references"
PLUGIN_JSON="$SKILL_DIR/../../.claude-plugin/plugin.json"

# The artifact stamp carries the PLUGIN version - there is no private template version any more.
# Resolved by self-location, never hardcoded; jq when present, grep+sed otherwise.
resolve_plugin_version() {
  [ -f "$PLUGIN_JSON" ] || { echo "unknown"; return 0; }
  _v=""
  command -v jq >/dev/null 2>&1 && _v=$(jq -r '.version // empty' "$PLUGIN_JSON" 2>/dev/null || true)
  [ -n "$_v" ] || _v=$(grep -o '"version"[[:space:]]*:[[:space:]]*"[^"]*"' "$PLUGIN_JSON" 2>/dev/null | head -1 | sed -e 's/.*:[[:space:]]*"//' -e 's/"$//' || true)
  [ -n "$_v" ] || _v="unknown"
  printf '%s\n' "$_v"
}
VERSION=$(resolve_plugin_version)

# content_version (no plugin.json field) = this generator's last-changed release, read from the brewcode-meta
# marker bump-version.sh stamps into SKILL.md (STAMPED_FILES, kind marker; as docsync-setup INSTALL.md).
resolve_content_version() {
  [ -f "$SKILL_DIR/SKILL.md" ] || { echo "unknown"; return 0; }
  _cv=$(grep -m1 'brewcode-meta:' "$SKILL_DIR/SKILL.md" 2>/dev/null | sed -n 's/.*content_version=\([0-9][0-9]*\.[0-9][0-9]*\.[0-9][0-9]*\).*/\1/p')
  [ -n "$_cv" ] || _cv="unknown"
  printf '%s\n' "$_cv"
}
CONTENT_VERSION=$(resolve_content_version)

# Target paths are relative to the resolved ROOT (see resolve_root - every mode cd's there first).
TARGET=".claude/skills/memory-sync"
TARGET_REFS="$TARGET/references"
EMITTED_REFS="memory-guide.md agent-audit.md hard-sync.md prompting-guide.md"
EMITTED_N=4
# The parked name of SKILL.md (see enable/disable). Declared here, next to the rest of the owned set,
# because `emit`'s guard has to see it - a disabled install is still an install.
DISABLED_MARK="$TARGET/SKILL.md.disabled"

# Installed artifacts on disk, one rel path per line (empty = not installed): the ONE pre-write check of `emit`.
# Keyed on SKILL.md alone, a PARKED install looked absent and emit destroyed its body + SELF-SYNC hand-edits.
_live_artifacts() {
  for _rel in SKILL.md SKILL.md.disabled; do
    [ -f "$TARGET/$_rel" ] && printf '%s\n' "$_rel"
  done
  for _r in $EMITTED_REFS; do
    [ -f "$TARGET_REFS/$_r" ] && printf '%s\n' "references/$_r"
  done
  return 0
}

# The same set as one space-separated line, for messages and `[ -n ]` tests.
_live_artifact_list() { _live_artifacts | tr '\n' ' ' | sed 's/[[:space:]]*$//'; }

# Provenance lives in the emitted SKILL.md's YAML FRONTMATTER (the artifact-metadata standard):
# doc_type / version / content_version / generated_by / last_updated, then the skill-specific surface_files.
META_DOC_TYPE="llm"
META_GENERATED_BY="brewdoc:memory-sync-setup"
META_KEYS="doc_type version content_version generated_by last_updated surface_files"
# Pre-5.0 installs stamped a tail comment instead. Kept ONLY to recognise them and report stale-legacy.
LEGACY_STAMP_PREFIX="<!-- memory-sync template v"
# Runtime tokens the emitted skill resolves per RUN - allow-listed by validate, MUST survive emit.
RUNTIME_ALLOW="SCOPE FOCUS DEPTH REACH BATCH FILE_LIST FACTS BROKEN_REFS DATE N M K"
# Every temp dir goes through $_bd; the trap makes leaks (and partial installs) impossible on any exit path.
_bd=""
trap '[ -n "$_bd" ] && rm -rf "$_bd" || true' EXIT
# Shared find pruning - deps/build output, run-artifact snapshots (.claude/reports) and worktree checkouts are never memory.
FIND_EXCL='-not -path "*/node_modules/*" -not -path "*/.git/*" -not -path "*/dist/*" -not -path "*/build/*" -not -path "*/.next/*" -not -path "*/vendor/*" -not -path "*/.claude/reports/*" -not -path "*/.claude/worktrees/*"'

# `find | sort` exits 0 when empty, so a bare `find ... || echo "(none)"` never prints the fallback.
# `|| true`: a missing dir makes find exit 1, and a failing substitution in an assignment aborts under `set -e`.
_list() { _out=$(eval "$1" 2>/dev/null || true); if [ -n "$_out" ]; then printf '%s\n' "$_out"; else echo "${2:-(none)}"; fi; }

# Count lines of an eval'd listing, 0 when empty. Same `|| true` contract.
_count() { _o=$(eval "$1" 2>/dev/null || true); if [ -z "$_o" ]; then echo 0; else printf '%s\n' "$_o" | wc -l | tr -d ' '; fi; }

# Count *.md under a dir - no eval, the path is a real ARGUMENT (a dir name may contain quotes/`$()`).
_count_md() { { find "$1" -maxdepth "${2:-1}" -type f -name '*.md' 2>/dev/null || true; } | wc -l | tr -d ' '; }

validate_templates() {
  for t in "$REFS/SKILL.md.template" "$REFS/memory-guide.md" "$REFS/agent-audit.md" "$REFS/hard-sync.md" "$REFS/prompting-guide.md"; do
    [ -f "$t" ] || { echo "❌ FAILED: emit template not found: $t - reinstall brewdoc"; exit 1; }
  done
  # A stamp is only worth writing if it names a real plugin version.
  [ "$VERSION" != "unknown" ] || { echo "❌ FAILED: cannot read .version from $PLUGIN_JSON - reinstall brewdoc"; exit 1; }
  [ "$CONTENT_VERSION" != "unknown" ] || { echo "❌ FAILED: cannot read content_version from $SKILL_DIR/SKILL.md - reinstall brewdoc"; exit 1; }
}

# rc 0: $1 is HOME or the active config dir's parent - its .claude is a profile, never a repo root.
is_profile_parent() {
  _pp=$(cd "$1" 2>/dev/null && pwd -P) || return 1
  [ -n "${HOME:-}" ] && [ "$_pp" = "$(cd "$HOME" 2>/dev/null && pwd -P)" ] && return 0
  [ -n "${CLAUDE_CONFIG_DIR:-}" ] && [ "$_pp/.claude" = "$(cd "$CLAUDE_CONFIG_DIR" 2>/dev/null && pwd -P)" ]
}

# ── target root ─────────────────────────────────────────────────────────────────
# Relative TARGET: subdir would scan/emit/report WRONG tree -> cd to root (MEMORY_SYNC_ROOT=<abs path> wins); root-like ancestor = error.
resolve_root() {
  ROOT="${MEMORY_SYNC_ROOT:-}"
  [ -n "$ROOT" ] || ROOT=$(git rev-parse --show-toplevel 2>/dev/null || true)
  if [ -z "$ROOT" ]; then
    ROOT="$(pwd)"; _up="$ROOT"
    while [ "$_up" != "/" ]; do
      _up=$(dirname "$_up")
      [ -d "$_up/.claude" ] || [ -f "$_up/CLAUDE.md" ] || continue
      ! is_profile_parent "$_up" || continue
      echo "❌ FAILED: $(pwd) is not a repo root (no git, but $_up looks like one)."
      echo "   Run from the project root, or set MEMORY_SYNC_ROOT=<abs path>."
      exit 1
    done
  fi
  [ -d "$ROOT" ] || { echo "❌ FAILED: target root does not exist: $ROOT"; exit 1; }
  cd "$ROOT"
  ROOT="$(pwd)"
}

# ── derivations shared by scan / emit / status ──────────────────────────────────
# NEVER silently return `main`: SKILL.md Error Handling makes the AI ASK, which needs a visible failure.
derive_branch() {
  _b=$(git symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null || true)
  for _r in $( { [ -n "$_b" ] || git remote 2>/dev/null || true; } ); do
    _b=$(git symbolic-ref --short "refs/remotes/$_r/HEAD" 2>/dev/null || true)
    [ -n "$_b" ] && break
  done
  [ -z "$_b" ] || { printf '%s\n' "${_b#*/}"; return 0; }
  # No remote HEAD: a repo with exactly one local branch derives unambiguously (e.g. `develop`).
  _heads=$( { git for-each-ref --format='%(refname:short)' refs/heads 2>/dev/null || true; } )
  if [ -n "$_heads" ] && [ "$(printf '%s\n' "$_heads" | wc -l | tr -d ' ')" -eq 1 ]
  then printf '%s\n' "$_heads"
  else echo "UNDERIVABLE"
  fi
}

# Non-git dir / commit-less repo != `git-ignored` (false house fact, breaks `branch` scope). Tracked rows vs disk:
# one tracked row must not label a mixed surface `git-tracked` (drops "VERIFY must re-read files directly").
derive_git_visibility() {
  git rev-parse --git-dir >/dev/null 2>&1 || { echo "not-a-git-repo"; return 0; }
  _rows=$( { git ls-files -- .claude '*CLAUDE.md' '*AGENTS.md' 2>/dev/null || true; } | wc -l | tr -d ' ')
  if [ "$_rows" -eq 0 ]; then
    git rev-parse --verify HEAD >/dev/null 2>&1 || { echo "no-commits"; return 0; }
    echo "git-ignored"; return 0
  fi
  # Pathspec surface; SET DIFFERENCE, never a count delta (git != FIND_EXCL-pruned find: totals cancel -> mislabel).
  # `-not -path '*/memory-sync/*'` as in count_skills, else fresh emit -> `mixed (N tracked, 5 untracked)` != {GIT_VISIBILITY}.
  _disk=$(eval "find . \\( -type f -o -type l \\) \\( -path './.claude/*' -o -name '*CLAUDE.md' -o -name '*AGENTS.md' \\) -not -path '*/memory-sync/*' $FIND_EXCL" 2>/dev/null || true)
  # `grep -c .` exits 1 on zero matches - a legitimate outcome that `pipefail` would turn into an abort.
  _untracked=$(printf '%s\n' "$_disk" | sed -e 's|^\./||' -e '/^$/d' | sort \
    | comm -23 - <( { git ls-files -- .claude '*CLAUDE.md' '*AGENTS.md' 2>/dev/null || true; } | sort) \
    | grep -c . || true)
  if [ "$_untracked" -gt 0 ]; then echo "mixed ($_rows tracked, $_untracked untracked)"; return 0; fi
  echo "git-tracked"
}

# Claude Code encodes a project dir as its absolute path with `/` (and `.`) replaced by `-`.
# Only THAT dir may be reported - the old unfiltered glob returned a foreign project's memory.
derive_memory_dir() {
  for _s in .claude/settings.json .claude/settings.local.json; do
    [ -f "$_s" ] || continue
    # jq first: grep+sed truncates an escaped quote and misses a pretty-printed file.
    _m=""
    command -v jq >/dev/null 2>&1 && _m=$(jq -r '.autoMemoryDirectory // empty' "$_s" 2>/dev/null || true)
    [ -n "$_m" ] || _m=$(grep -o '"autoMemoryDirectory"[[:space:]]*:[[:space:]]*"[^"]*"' "$_s" 2>/dev/null | head -1 | sed -e 's/.*:[[:space:]]*"//' -e 's/"$//' || true)
    [ -z "$_m" ] || { printf '%s\n' "$_m"; return 0; }
  done
  _enc=$(printf '%s' "$ROOT" | tr '/' '-')
  _cfg="${CLAUDE_CONFIG_DIR:-$HOME/.claude}" # active profile owns auto memory
  for _d in "$_cfg/projects/$_enc/memory" "$_cfg/projects/$(printf '%s' "$_enc" | tr '.' '-')/memory"; do
    [ -d "$_d" ] || continue; printf '%s\n' "$_d"; return 0
  done
  echo "none"
}

derive_tracker_note() {
  if [ -d .claude/features ]; then echo ".claude/features/** is operational task state - owned by the task board, excluded"
  elif [ -d .github ];        then echo ".github/ issue tracker owns operational task state - excluded"
  else echo "none"; fi
}

# Per-batch counts; the emitted skill dir is excluded EVERYWHERE (scan, emit stamp, status), else a fresh install
# looks drifted (absent at analysis time). The emitted skill's Phase 4 subtracts its own files likewise.
count_root_md()   { _count "find . -maxdepth 1 -type f \\( -name 'CLAUDE.md' -o -name 'CLAUDE.local.md' -o -name 'CONVENTIONS.md' -o -name 'CONTRIBUTING.md' \\)"; }
count_nested_md() { _count "find . -mindepth 2 -type f -name 'CLAUDE.md' $FIND_EXCL"; }
count_agents_md() { _count "find . \\( -type f -o -type l \\) -name 'AGENTS.md' $FIND_EXCL"; }
count_skills()    { { find .claude/skills -type f -name '*.md' -not -path '*/memory-sync/*' 2>/dev/null || true; } | wc -l | tr -d ' '; }
_rules_md()       { { eval "find .claude/rules -type f -name '*.md' $FIND_EXCL" 2>/dev/null || true; } | sort; }

derive_surface_counts() {
  _r=$(count_root_md); _n=$(count_nested_md); _a=$(count_agents_md); _u=$(_rules_md | wc -l | tr -d ' ')
  _c=$(_count_md .claude/convention); _g=$(_count_md .claude/agents 99); _s=$(count_skills)
  _tot=$((_r + _n + _a + _u + _c + _g + _s))
  echo "$_tot files: $_r root, $_n nested CLAUDE.md, $_a AGENTS.md, $_u rules, $_c conventions, $_g agents, $_s skill files"
}

surface_total() { derive_surface_counts | cut -d' ' -f1; }

# ── provenance frontmatter (emit writes it, validate + status read it) ──────────
# Keys right before closing `---`, QUOTED (`: ` in surface_files, bare date -> Date) except enum `doc_type` (`^doc_type: llm$`).
_stamp_frontmatter() {
  _sfile="$1"
  # status re-counts with derive_surface_counts: stamp that metric, never a hand-exported SURFACE_COUNTS.
  _sfv=$(printf "%s" "$(derive_surface_counts)" | tr -d '"' | tr '\n\r' '  ')
  awk -v dt="$META_DOC_TYPE" -v ver="$VERSION" -v cv="$CONTENT_VERSION" -v gb="$META_GENERATED_BY" \
      -v lu="$(date +%F)" -v sf="$_sfv" '
    BEGIN { n = 0; done = 0 }
    NR == 1 && $0 != "---" { exit 3 }
    /^---[[:space:]]*$/ {
      n++
      if (n == 2 && !done) {
        printf "doc_type: %s\nversion: \"%s\"\ncontent_version: \"%s\"\ngenerated_by: \"%s\"\nlast_updated: \"%s\"\nsurface_files: \"%s\"\n", dt, ver, cv, gb, lu, sf
        done = 1
      }
    }
    { print }
    END { if (!done) exit 3 }
  ' "$_sfile" > "$_sfile.stamped" && mv "$_sfile.stamped" "$_sfile"
}

# One frontmatter value, quotes stripped. Prints nothing when the key or the block is absent.
_fm_meta() {
  awk -v k="$2" '
    NR == 1 && $0 != "---" { exit }
    /^---[[:space:]]*$/ { n++; if (n == 2) exit; next }
    index($0, k ":") == 1 { sub(/^[^:]*:[[:space:]]*/, ""); gsub(/^"|"$/, ""); print; exit }
  ' "$1" 2>/dev/null || true
}

# Pre-5.0 tail stamp, if any. `|| true` covers grep's rc=1 under pipefail.
_legacy_stamp() { grep -F "$LEGACY_STAMP_PREFIX" "$1" 2>/dev/null | tail -1 || true; }

# ── unresolved-token scan (ONE implementation - validate and status MUST agree) ──
# \{[A-Z_]+\} minus `$`-prefixed (${CLAUDE_SKILL_DIR}) and RUNTIME_ALLOW; PARKED -> scan SKILL.md.disabled (validate exits earlier).
_emitted_files() {
  if [ ! -f "$TARGET/SKILL.md" ] && [ -f "$TARGET/SKILL.md.disabled" ]
  then echo "$TARGET/SKILL.md.disabled"
  else echo "$TARGET/SKILL.md"
  fi
  for r in $EMITTED_REFS; do echo "$TARGET_REFS/$r"; done
}

_open_tokens() {
  _emitted_files | while IFS= read -r f; do
    [ -f "$f" ] || continue
    awk -v allow="$RUNTIME_ALLOW" '
      BEGIN { n = split(allow, a, " "); for (i = 1; i <= n; i++) ok[a[i]] = 1 }
      {
        line = $0; pos = 1
        while (match(substr(line, pos), /\{[A-Z_]+\}/)) {
          s = pos + RSTART - 1; tok = substr(line, s, RLENGTH)
          prev = (s > 1) ? substr(line, s - 1, 1) : ""; name = substr(tok, 2, length(tok) - 2)
          if (prev != "$" && !(name in ok)) print FILENAME ":" FNR ": " tok
          pos = s + RLENGTH
        }
      }
    ' "$f" || true
  done
}

# ── scan ────────────────────────────────────────────────────────────────────────
# path :: name: :: description: for a set of frontmatter-carrying md files (agents and skills alike).
_fm_field() { grep -m1 "^$2:" "$1" 2>/dev/null | sed "s/^$2:[[:space:]]*//" | cut -c1-200 || true; }
_hdr() { printf '\n--- %s ---\n' "$1"; }

# Frontmatter `paths:` only: inline value verbatim, a block list (`- "a"` lines) as `["a", "b"]`; none -> empty.
_rule_paths() {
  awk '
    NR == 1 { if ($0 !~ /^---[[:space:]]*$/) exit; next }
    /^---[[:space:]]*$/ { exit }
    inlist && /^[[:space:]]*(#.*)?$/ { next }
    inlist && /^[[:space:]]*-([[:space:]]|$)/ {
      v = $0; sub(/^[[:space:]]*-[[:space:]]*/, "", v); sub(/[[:space:]]+$/, "", v)
      items = items (n++ ? ", " : "") v; next
    }
    inlist { exit }
    /^paths:/ {
      v = $0; sub(/^paths:[[:space:]]*/, "", v); sub(/[[:space:]]+$/, "", v)
      if (v != "") { print v; exit }
      inlist = 1
    }
    END { if (n) print "[" items "]" }
  ' "$1" 2>/dev/null || true
}

# Paths arrive on STDIN, one per line - a recursive `find` feed reaches nested files no single-level
# glob produces (CC discovers agents in subfolders such as `.claude/agents/review/`).
_fm_list() {
  _any=0
  while IFS= read -r f; do
    [ -f "$f" ] || continue
    _any=1
    printf '%s :: %s :: %s\n' "$f" "$(_fm_field "$f" name)" "$(_fm_field "$f" description)"
  done
  [ "$_any" -eq 0 ] && echo "(none)"
  return 0
}

scan_target() {
  echo "=== memory-sync-setup: target scan ==="
  echo "Target: $ROOT"
  _hdr "CLAUDE.md tree (root + nested, any depth)"
  _list "find . -type f \\( -name 'CLAUDE.md' -o -name 'CLAUDE.local.md' \\) $FIND_EXCL | sort"

  _hdr "AGENTS.md family (SYMLINK / vendor-marked = VERIFY-ONLY)"
  _list "find . \\( -type f -o -type l \\) -name 'AGENTS.md' $FIND_EXCL | sort" | while IFS= read -r f; do
    [ -e "$f" ] || [ -L "$f" ] || { echo "$f"; continue; }   # the "(none)" fallback row
    if [ -L "$f" ]; then echo "$f :: SYMLINK -> $(readlink "$f" 2>/dev/null || echo '?') :: VERIFY-ONLY (another tool owns it)"; continue; fi
    _first=$(grep -m1 -v '^[[:space:]]*$' "$f" 2>/dev/null || true)
    _last=$(grep -v '^[[:space:]]*$' "$f" 2>/dev/null | tail -1 || true)
    case "$_first" in
      *"<!-- BEGIN"*)
        case "$_last" in
          *"END"*"-->"*) echo "$f :: VENDOR-MARKED (whole body inside BEGIN/END markers) :: VERIFY-ONLY" ;;
          *)             echo "$f :: BEGIN marker with no closing END on the last line :: inspect before editing" ;;
        esac ;;
      *) echo "$f :: plain file :: editable" ;;
    esac
  done

  _hdr "Rules (.claude/rules/) :: lines :: paths:"
  _anyrule=0
  while IFS= read -r f; do
    [ -f "$f" ] || continue
    _anyrule=1
    # awk counts a final line with no trailing newline; `|| echo ?` keeps an unreadable file from aborting scan.
    _ln=$(awk 'END { print NR }' "$f" 2>/dev/null || echo "?")
    _paths=$(_rule_paths "$f")
    [ -n "$_paths" ] || _paths="(no paths:)"
    printf '%s :: %s lines :: %s\n' "$f" "$_ln" "$_paths"
  done < <(_rules_md)
  [ "$_anyrule" -eq 0 ] && echo "(none)"

  _hdr "Conventions"
  _list "find .claude/convention -maxdepth 1 -type f -name '*.md' | sort"
  _list "find . -maxdepth 1 -type f \\( -name 'CONVENTIONS.md' -o -name 'CONTRIBUTING.md' \\) | sort" "(no root CONVENTIONS.md / CONTRIBUTING.md)"

  _hdr "Agents (.claude/agents/) :: name :: description"
  { find .claude/agents -type f -name '*.md' 2>/dev/null || true; } | sort | _fm_list
  _na=$(_count_md .claude/agents 99)
  echo "agents=$_na"
  [ "$_na" -eq 0 ] && echo "⚠️ NO .claude/agents/ - the agent batch is dropped from {BATCH_TABLE} and the re-audit reduces to skills"

  _hdr "Skills (.claude/skills/) :: name :: description"
  printf '%s\n' .claude/skills/*/SKILL.md | _fm_list
  echo "skill_md_files=$(count_skills)"

  _hdr "Hooks reacting to memory edits (informational - NEVER edited)"
  _list "find .claude/hooks -maxdepth 1 -type f | sort" "(no .claude/hooks/)"
  _list "grep -n '\"\\(PreToolUse\\|PostToolUse\\|UserPromptSubmit\\|SessionStart\\|Stop\\|SubagentStop\\)\"' .claude/settings.json" "(no hook registrations in .claude/settings.json)"

  _hdr "Tracker"
  test -d .claude/features && echo "✅ .claude/features/ present" || echo "- no .claude/features/"
  test -d .github && echo "✅ .github/ present" || echo "- no .github/"

  _hdr "Derived values (pass these back as env vars to emit)"
  echo "DEFAULT_BRANCH=$(derive_branch)"
  echo "GIT_VISIBILITY=$(derive_git_visibility)"
  echo "MEMORY_DIR=$(derive_memory_dir)"
  echo "TRACKER_NOTE=$(derive_tracker_note)"
  echo "SURFACE_COUNTS=$(derive_surface_counts)"
  echo "PROJECT_NAME=$(basename "$ROOT")"
}

# ── scalar resolution ───────────────────────────────────────────────────────────
# emit substitutes these 8 scalars; the 13 BLOCK placeholders -> AI via Edit (SKILL.md Phase 3), validate FAILS while open.
SCALAR_KEYS="PROJECT_NAME DEFAULT_BRANCH MEMORY_DIR GIT_VISIBILITY LANGUAGE_POLICY FOCUS_EMPHASIS SURFACE_COUNTS TRACKER_NOTE"

# SCALAR env overrides (each has a fallback here, none is ever left empty, newlines flattened):
#   PROJECT_NAME DEFAULT_BRANCH MEMORY_DIR GIT_VISIBILITY LANGUAGE_POLICY FOCUS_EMPHASIS SURFACE_COUNTS TRACKER_NOTE
_scalar_default() {
  case "$1" in
    PROJECT_NAME)    basename "$ROOT" ;;
    DEFAULT_BRANCH)  derive_branch ;;
    MEMORY_DIR)      echo "none" ;;
    GIT_VISIBILITY)  derive_git_visibility ;;
    LANGUAGE_POLICY) echo "English everywhere; non-English trigger aliases are legal ONLY inside agent/skill \`description:\` fields" ;;
    FOCUS_EMPHASIS)  echo "default ordering: facts > dedup > compression" ;;
    SURFACE_COUNTS)  derive_surface_counts ;;
    TRACKER_NOTE)    echo "none" ;;
  esac
}

# Never let an empty env var blank a placeholder: every fallback that fires is logged. A newline inside
# a scalar would split the provenance stamp (and the emitted line it lands on), so it is flattened here.
resolve_scalars() {
  _fellback=""
  for k in $SCALAR_KEYS; do
    eval "_v=\${$k:-}"
    [ -n "$_v" ] || { _v=$(_scalar_default "$k"); _fellback="$_fellback  - $k -> $_v
"; }
    _flat=$(printf '%s' "$_v" | tr '\n\r' '  ')
    [ "$_flat" = "$_v" ] || { _v="$_flat"; echo "⚠️ $k contained a newline - flattened to a single line"; }
    eval "$k=\$_v"
    eval "export $k"
  done
}

# Literal substitution: awk reads values from ENVIRON, so `/`, `&`, `\` land verbatim.
# SINGLE PASS: output buffer is never re-scanned, so a value holding `{OTHER_KEY}` is not re-expanded.
_subst() {
  awk -v keys="$SCALAR_KEYS" '
    BEGIN { nk = split(keys, k, " "); for (i = 1; i <= nk; i++) have[k[i]] = 1 }
    {
      line = $0; out = ""
      while (match(line, /\{[A-Z_]+\}/)) {
        tok = substr(line, RSTART, RLENGTH)
        name = substr(tok, 2, RLENGTH - 2)
        out = out substr(line, 1, RSTART - 1) ((name in have) ? ENVIRON[name] : tok)
        line = substr(line, RSTART + RLENGTH)
      }
      print out line
    }
  ' "$1" > "$2"
}

# ── emit ────────────────────────────────────────────────────────────────────────
# Every emit-path write failure routes here: a bare `mktemp`/`cp`/redirect failure under `set -e` hides this message.
_emit_abort() {
  echo "❌ FAILED: cannot install into $TARGET (permissions?) - NOTHING was written, no partial install to force past"
  exit 1
}

# Sweeps refs an OLDER version emitted under another name: owned = line 1 (ALWAYS) is `<!-- brewcode-meta:` .. `generated_by=$META_GENERATED_BY `
# (space: not `-setup-x`); a user file MENTIONING the marker stays. $TARGET_REFS only; `head` into a var, no pipe (pipefail/SIGPIPE).
_sweep_stale_refs() {
  [ -d "$TARGET_REFS" ] || return 0
  for _sf in "$TARGET_REFS"/*; do
    [ -f "$_sf" ] || continue
    _sb=$(basename "$_sf")
    case " $EMITTED_REFS " in *" $_sb "*) continue ;; esac
    _shead=$(head -1 "$_sf" 2>/dev/null) || continue
    case "$_shead" in
      "<!-- brewcode-meta:"*"generated_by=$META_GENERATED_BY "*)
        rm -f "$_sf" || _emit_abort
        echo "🔄 removed stale artifact from an older version: $_sf"
        ;;
    esac
  done
}

emit_skill() {
  echo "=== memory-sync-setup: emit ==="
  validate_templates

  # PARKED refuses UNCONDITIONALLY: MEMORY_SYNC_FORCE=1 overwrites a LIVE install, never a body taken out of the roster.
  if [ -f "$DISABLED_MARK" ]; then
    echo "❌ FAILED: memory-sync is PARKED at $DISABLED_MARK - it is installed, just disabled"
    echo "   $DISABLED_MARK holds the body and every SELF-SYNC hand-edit."
    echo "   Run \`generate.sh enable\` to bring it back (then \`upgrade\`, or MEMORY_SYNC_FORCE=1 emit),"
    echo "   or \`generate.sh uninstall\` / \`purge\` to remove it first. Nothing was written."
    exit 1
  fi

  _installed="$(_live_artifact_list)"
  if [ -n "$_installed" ] && [ "${MEMORY_SYNC_FORCE:-0}" != "1" ]; then
    echo "❌ FAILED: memory-sync is already installed at $TARGET/ - live artifact(s): $_installed"
    echo "   Use the AI-driven \`upgrade\` mode to refresh it (hand-edits preserved), or"
    echo "   \`generate.sh status\` to see its drift. MEMORY_SYNC_FORCE=1 overwrites and DESTROYS hand-edits."
    exit 1
  fi

  resolve_scalars
  # STAGED on the same FS, then renames of the 5 OWNED paths: a mid-way failure leaves no half install to FORCE past.
  _parent=$(dirname "$TARGET")
  mkdir -p "$_parent" || _emit_abort
  _bd=$(mktemp -d "$ROOT/$_parent/.memory-sync-emit.XXXXXX" 2>/dev/null) || _emit_abort
  _stage="$_bd/memory-sync"
  mkdir -p "$_stage/references" || _emit_abort

  _subst "$REFS/SKILL.md.template" "$_stage/SKILL.md" || _emit_abort
  # Provenance stamp - YAML frontmatter of the emitted SKILL.md; `status`, `validate` and `upgrade` read it.
  _stamp_frontmatter "$_stage/SKILL.md" || _emit_abort
  for r in $EMITTED_REFS; do cp "$REFS/$r" "$_stage/references/$r" || _emit_abort; done

  # Selective placement: only the 5 paths this generator owns are removed and re-created. Anything else
  # in $TARGET (user notes, a foreign reference, an unrelated subdir) is never touched.
  mkdir -p "$TARGET_REFS" || _emit_abort
  rm -f "$TARGET/SKILL.md" || _emit_abort
  for r in $EMITTED_REFS; do rm -f "$TARGET_REFS/$r" || _emit_abort; done
  mv "$_stage/SKILL.md" "$TARGET/SKILL.md" || _emit_abort
  for r in $EMITTED_REFS; do mv "$_stage/references/$r" "$TARGET_REFS/$r" || _emit_abort; done
  _sweep_stale_refs
  rm -rf "$_bd"; _bd=""

  echo "✅ $TARGET/SKILL.md ($(awk 'END { print NR }' "$TARGET/SKILL.md") lines, stamped v$VERSION)"
  for r in $EMITTED_REFS; do
    echo "✅ $TARGET_REFS/$r ($(awk 'END { print NR }' "$TARGET_REFS/$r") lines, verbatim)"
  done

  echo ""
  echo "Scalars applied:"
  for k in $SCALAR_KEYS; do
    eval "_v=\${$k}"
    printf '  %s = %s\n' "$k" "$_v"
  done
  if [ -n "$_fellback" ]
  then echo "Fallbacks that fired (env var unset or empty):"; printf '%s' "$_fellback"
  else echo "Fallbacks that fired: none (all 8 scalars came from the environment)"
  fi

  echo ""
  echo "Next: AI fills the BLOCK placeholders via Edit (SKILL.md Phase 3) - validate FAILS until then."
}

# ── restamp ─────────────────────────────────────────────────────────────────────
# Last, unconditional step of `upgrade`: refreshes provenance keys only, drops a pre-5.0 tail stamp; body proven byte-identical.
_meta_body() {
  awk -v legacy="$LEGACY_STAMP_PREFIX" '
    BEGIN { n = 0 }
    n < 2 && /^---[[:space:]]*$/ { n++; next }
    n < 2 { next }
    index($0, legacy) > 0 { next }
    { print }
  ' "$1"
}

# Without restamp an older-version install fails `validate`; only escape = FORCE=1 emit, destroying hand-edits.
restamp_skill() {
  echo "=== memory-sync-setup: restamp ==="
  echo "TARGET=$ROOT"
  _f="$TARGET/SKILL.md"
  if [ ! -f "$_f" ]; then
    if [ -f "$DISABLED_MARK" ]; then
      echo "❌ FAILED: memory-sync is PARKED at $DISABLED_MARK - run 'generate.sh enable' first, then restamp"
    else
      echo "❌ FAILED: not installed - $ROOT/$_f does not exist. Run 'generate.sh emit' first."
    fi
    exit 1
  fi

  _was=$(_fm_meta "$_f" version); [ -n "$_was" ] || _was="(unstamped)"
  _wascv=$(_fm_meta "$_f" content_version); [ -n "$_wascv" ] || _wascv="(unstamped)"
  _wasl=$(_legacy_stamp "$_f")
  # Legacy installs (emitted while the template still baked it) are user-only; the emitted skill must be
  # model-invocable, so the key is dropped here - the only mode that can reach an installed SKILL.md.
  _wasdmi=$(_fm_meta "$_f" disable-model-invocation)
  _dt=$(_fm_meta "$_f" doc_type)
  case "$_dt" in llm|user|skip) ;; *) _dt="$META_DOC_TYPE" ;; esac
  _sfv=$(printf "%s" "$(derive_surface_counts)" | tr -d '"' | tr '\n\r' '  ')
  _lu=$(date +%F)

  _bd=$(mktemp -d "${TMPDIR:-/tmp}/memory-sync-restamp.XXXXXX") || { echo "❌ FAILED: cannot create a temp dir"; exit 1; }
  cp "$_f" "$_bd/orig" || { echo "❌ FAILED: cannot read $_f"; exit 1; }
  _meta_body "$_bd/orig" > "$_bd/pre"

  if ! awk -v dt="$_dt" -v ver="$VERSION" -v cv="$CONTENT_VERSION" -v gb="$META_GENERATED_BY" -v lu="$_lu" -v sf="$_sfv" \
           -v legacy="$LEGACY_STAMP_PREFIX" '
    BEGIN { n = 0; done = 0 }
    NR == 1 && $0 != "---" { exit 3 }
    /^---[[:space:]]*$/ {
      n++
      if (n == 2 && !done) {
        printf "doc_type: %s\nversion: \"%s\"\ncontent_version: \"%s\"\ngenerated_by: \"%s\"\nlast_updated: \"%s\"\nsurface_files: \"%s\"\n", dt, ver, cv, gb, lu, sf
        done = 1
      }
      print; next
    }
    n == 1 && /^(doc_type|version|content_version|generated_by|last_updated|surface_files):/ { next }
    n == 1 && /^disable-model-invocation:/ { next }
    n >= 2 && index($0, legacy) > 0 { next }
    { print }
    END { if (!done) exit 3 }
  ' "$_bd/orig" > "$_bd/new"; then
    echo "❌ FAILED: $_f has no YAML frontmatter block to stamp - nothing was written."
    echo "   Add the skill's own frontmatter first, or re-install into a clean target."
    exit 1
  fi

  _meta_body "$_bd/new" > "$_bd/post"
  # (the temp dir stays alive for refresh_refs below - it is cleared at the end of this function)
  if ! cmp -s "$_bd/pre" "$_bd/post"; then
    echo "❌ FAILED: restamp would have changed more than the provenance keys - aborted, $_f untouched."
    exit 1
  fi
  cp "$_bd/new" "$_f" || { echo "❌ FAILED: cannot write $_f"; exit 1; }

  echo "RESTAMPED: $_f"
  echo "  version:         $_was -> $VERSION"
  echo "  content_version: $_wascv -> $CONTENT_VERSION"
  echo "  last_updated:  -> $_lu"
  echo "  generated_by:  -> $META_GENERATED_BY"
  echo "  doc_type:      -> $_dt"
  echo "  surface_files: -> $_sfv"
  [ -z "$_wasl" ] || echo "REMOVED:   pre-5.0 tail stamp -> $_wasl"
  [ -z "$_wasdmi" ] || echo "REMOVED:   disable-model-invocation: $_wasdmi -> /memory-sync is model-invocable again"
  refresh_refs
  rm -rf "$_bd"; _bd=""
  echo "✅ restamp (metadata keys only - body and every hand-edit verified byte-identical)"
}

# The 4 references are mechanism-`a` byte copies with a release-BAKED stamp: only a re-copy clears `setup-status` `cmp` DIFFERS.
# Re-copy only when the stamp line is the sole diff; else (hand-edit, hard-sync.md filled BLOCKs, moved prose) report, untouched.
refresh_refs() {
  for r in $EMITTED_REFS; do
    _src="$REFS/$r"; _dst="$TARGET_REFS/$r"
    # An ABSENT reference has nothing to preserve, and `emit` cannot restore it (it refuses while
    # SKILL.md exists), so copying it here is the only non-destructive route back to a complete install.
    if [ ! -f "$_dst" ]; then
      mkdir -p "$TARGET_REFS" && cp "$_src" "$_dst" && echo "REF RESTORED: $_dst (was missing - copied from the plugin)"
      continue
    fi
    if cmp -s "$_src" "$_dst"; then echo "REF OK:       $_dst (byte-identical to the plugin source)"; continue; fi
    awk '!/brewcode-meta:/' "$_src" > "$_bd/rs"
    awk '!/brewcode-meta:/' "$_dst" > "$_bd/rd"
    if cmp -s "$_bd/rs" "$_bd/rd"; then
      cp "$_src" "$_dst" && echo "REF RECOPIED: $_dst (differed ONLY in the release stamp - nothing to lose)"
    else
      echo "REF DIFFERS:  $_dst - content differs from $_src. NOT touched (hand-edit, filled BLOCKs, or"
      echo "              prose that moved in a newer release). Diff the two and port changes by hand."
    fi
  done
}

# ── validate ────────────────────────────────────────────────────────────────────
# `line<TAB>references/x.md` per OWN cite (bare, memory-sync/ or ${CLAUDE_SKILL_DIR}/ prefix); other dirs' refs, .mdx skipped.
_own_ref_cites() {
  awk '
    {
      s = $0; pos = 1
      while ((i = index(substr(s, pos), "references/")) > 0) {
        at = pos + i - 1; pos = at + 11; pre = substr(s, 1, at - 1)
        if (!match(substr(s, pos), /^[A-Za-z0-9._-]+/)) continue
        tok = substr(s, pos, RLENGTH); nxt = substr(s, pos + RLENGTH, 1)
        sub(/\.+$/, "", tok)
        if (tok !~ /\.md$/ || nxt == "/") continue
        if (pre ~ /[A-Za-z0-9._\/-]$/ && pre !~ /(^|[^A-Za-z0-9._-])\.claude\/skills\/memory-sync\/$/ \
            && pre !~ /\$[{]CLAUDE_SKILL_DIR[}]\/$/) continue
        print FNR "\treferences/" tok
      }
    }
  ' "$1" 2>/dev/null || true
}

validate_emit() {
  echo "=== memory-sync-setup: validate ==="
  _errors=0

  # (1) every emitted file present
  _missing=0
  [ -f "$TARGET/SKILL.md" ] || { echo "❌ FAILED: missing emitted file: $TARGET/SKILL.md - run 'generate.sh emit' first"; _missing=1; _errors=$((_errors+1)); }
  for r in $EMITTED_REFS; do
    # `emit` refuses while SKILL.md exists, so it can never be the remedy here - `restamp` re-copies a
    # missing reference from the plugin, which is lossless because there is no local content to keep.
    if [ ! -f "$TARGET_REFS/$r" ]; then echo "❌ FAILED: missing emitted file: $TARGET_REFS/$r - run 'generate.sh restamp' to restore it from the plugin"; _missing=1; _errors=$((_errors+1)); fi
  done
  [ "$_missing" -eq 0 ] && echo "✅ all emitted files present (SKILL.md + $EMITTED_N references)"

  [ -f "$TARGET/SKILL.md" ] || { echo "❌ FAILED: $TARGET/SKILL.md absent - remaining checks skipped"; exit "$_errors"; }

  # (2) unresolved {PLACEHOLDER} across SKILL.md + every emitted reference
  _unresolved=$(_open_tokens)
  if [ -n "$_unresolved" ]; then
    echo "❌ FAILED: unresolved setup-time placeholders (AI must fill the BLOCKs via Edit - SKILL.md Phase 3):"
    printf '%s\n' "$_unresolved" | sed 's/^/   /'; _errors=$((_errors+1))
  else
    echo "✅ no unresolved placeholders (runtime allow-list: $RUNTIME_ALLOW)"
  fi

  # (3) references, BOTH directions: every cited references/*.md exists, every emitted one is cited.
  _refbad=0
  _cites=$(_own_ref_cites "$TARGET/SKILL.md")
  _citeset=" $(printf '%s\n' "$_cites" | cut -f2 | sort -u | tr '\n' ' ')"
  for c in $_citeset; do
    [ -f "$TARGET/$c" ] && continue
    # Here-string: awk's early `exit` SIGPIPEs a printf producer under pipefail -> errexit abort.
    _ln=$(awk -F'\t' -v c="$c" '$2 == c { print $1; exit }' <<<"$_cites")
    echo "❌ FAILED: $TARGET/SKILL.md:${_ln:-?}: cites $c which does not exist"
    _refbad=1; _errors=$((_errors+1))
  done
  for r in $EMITTED_REFS; do
    [ -f "$TARGET_REFS/$r" ] || continue
    case "$_citeset" in *" references/$r "*) continue ;; esac
    echo "❌ FAILED: $TARGET_REFS/$r is emitted but never cited by $TARGET/SKILL.md"
    _refbad=1; _errors=$((_errors+1))
  done
  [ "$_refbad" -eq 0 ] && echo "✅ references consistent both ways (every citation resolves, every emitted reference is cited)"

  # (4) provenance frontmatter - the five standard keys plus surface_files
  _mv=$(_fm_meta "$TARGET/SKILL.md" version)
  _mc=$(_fm_meta "$TARGET/SKILL.md" content_version)
  _mg=$(_fm_meta "$TARGET/SKILL.md" generated_by)
  _ml=$(_fm_meta "$TARGET/SKILL.md" last_updated)
  _md=$(_fm_meta "$TARGET/SKILL.md" doc_type)
  _ms=$(_fm_meta "$TARGET/SKILL.md" surface_files)
  _legacy=$(_legacy_stamp "$TARGET/SKILL.md")
  if [ -z "$_mv" ] || [ -z "$_mc" ] || [ -z "$_mg" ] || [ -z "$_ml" ] || [ -z "$_md" ] || [ -z "$_ms" ]; then
    if [ -n "$_legacy" ]; then
      echo "❌ FAILED: $TARGET/SKILL.md carries the pre-5.0 TAIL stamp, not provenance frontmatter:"
      echo "   $_legacy"
      echo "   -> run \`generate.sh restamp\`: it writes doc_type/version/content_version/generated_by/last_updated/surface_files"
      echo "      and deletes the tail line, touching nothing else (this is also the last step of \`upgrade\`)"
    else
      _lack=""
      for _k in $META_KEYS; do
        [ -n "$(_fm_meta "$TARGET/SKILL.md" "$_k")" ] || _lack="$_lack${_lack:+, }$_k"
      done
      echo "❌ FAILED: $TARGET/SKILL.md: provenance frontmatter incomplete (missing: $_lack)"
      echo "   -> run \`generate.sh restamp\` to write all six keys in place (hand-edits untouched)"
    fi
    _errors=$((_errors+1))
  elif [ "$_mv" != "$VERSION" ] || [ "$_mc" != "$CONTENT_VERSION" ]; then
    # Never name `upgrade` here: `upgrade` is the mode whose tail runs this check, so pointing back at it
    # was a closed loop with MEMORY_SYNC_FORCE=1 (hand-edit destroying) as the only documented escape.
    echo "❌ FAILED: $TARGET/SKILL.md: stamped version $_mv/$_mc != plugin version $VERSION/$CONTENT_VERSION"
    echo "   -> run \`generate.sh restamp\`: it refreshes version/content_version/last_updated/surface_files in place,"
    echo "      body and hand-edits untouched, and is the mandatory last step of \`upgrade\`"
    _errors=$((_errors+1))
  else
    echo "✅ provenance frontmatter present: doc_type=$_md version=$_mv content_version=$_mc generated_by=$_mg last_updated=$_ml surface_files=\"$_ms\""
    [ -z "$_legacy" ] || echo "⚠️ a pre-5.0 tail stamp also survives in this file - delete that line, the frontmatter supersedes it"
  fi

  # (5) the emitted skill stays model-invocable - plain prose must reach it, not only `/memory-sync`
  _dmi=$(_fm_meta "$TARGET/SKILL.md" disable-model-invocation)
  if [ -n "$_dmi" ]; then
    echo "❌ FAILED: $TARGET/SKILL.md: frontmatter sets disable-model-invocation: $_dmi - the emitted skill must stay model-invocable"
    echo "   -> run \`generate.sh restamp\`: it deletes the key in place, body and hand-edits untouched"
    _errors=$((_errors+1))
  else
    echo "✅ model-invocable (no disable-model-invocation key - prose invocation works alongside /memory-sync)"
  fi

  if [ "$_errors" -eq 0 ]; then echo "✅ validate PASSED"; else echo "❌ FAILED: $_errors check(s) failed"; fi
  exit "$_errors"
}

# ── status ──────────────────────────────────────────────────────────────────────
# Read-only, always exit 0. PURE KEY=value (no banner, every key unique) so a naive parser keeps every row.
status_report() {
  echo "TARGET=$ROOT"
  echo "SKILL_PATH=$ROOT/$TARGET"

  echo "PLUGIN_VERSION=$VERSION"

  # PARKED (SKILL.md.disabled) is a THIRD state, never absent: body, refs, hand-edits on disk; stamp read from it.
  _skf="$TARGET/SKILL.md"; _parked=no
  if [ ! -f "$_skf" ] && [ -f "$DISABLED_MARK" ]; then _skf="$DISABLED_MARK"; _parked=yes; fi

  if [ ! -f "$_skf" ]; then
    # Same KEY set as the installed branch - a parser keyed on any row must not go blind on a fresh target.
    echo "INSTALLED=no"; echo "PARKED=no"; echo "STAMP_FORMAT=none"
    echo "META_DOC_TYPE=none"; echo "META_VERSION=none"; echo "META_CONTENT_VERSION=none"; echo "META_GENERATED_BY=none"
    echo "META_LAST_UPDATED=none"; echo "META_SURFACE=none"
    echo "SURFACE_FILES_NOW=$(surface_total)"; echo "SURFACE_FILES_STAMPED=unknown"
    echo "MISSING_FILES=$(( 1 + EMITTED_N ))"
    echo "OPEN_PLACEHOLDERS=$( { _open_tokens || true; } | awk '{ print $NF }' | sort -u | wc -l | tr -d ' ')"
    echo "DEFAULT_BRANCH=$(derive_branch)"; echo "GIT_VISIBILITY=$(derive_git_visibility)"
    echo "DRIFTS=0"; echo "VERDICT=NOT INSTALLED"
    return 0
  fi

  if [ "$_parked" = yes ]; then
    echo "INSTALLED=parked"; echo "PARKED=yes"
    echo "NOTE_PARKED=disabled, not missing - $DISABLED_MARK holds the body and every SELF-SYNC hand-edit; run \`enable\` to bring /memory-sync back"
  else
    echo "INSTALLED=yes"; echo "PARKED=no"
  fi
  _drifts=0

  # Provenance: frontmatter (5.0+) | legacy tail stamp (pre-5.0) | none. Read from the live SKILL.md,
  # or from the parked SKILL.md.disabled - both carry the same stamp.
  _sv=$(_fm_meta "$_skf" version)
  _sc=$(_fm_meta "$_skf" content_version)
  _sg=$(_fm_meta "$_skf" generated_by)
  _sd=$(_fm_meta "$_skf" last_updated)
  _st=$(_fm_meta "$_skf" doc_type)
  _ss=$(_fm_meta "$_skf" surface_files)
  _legacy=$(_legacy_stamp "$_skf")
  _fmt=frontmatter
  if [ -z "$_sv" ] && [ -n "$_legacy" ]; then
    # Pre-5.0 install: parse what the old tail stamp holds, never crash on it, count it as drift.
    _fmt=legacy
    _sv=$(printf '%s\n' "$_legacy" | sed -e "s|^.*${LEGACY_STAMP_PREFIX}||" -e 's/ .*//')
    _sd=$(printf '%s\n' "$_legacy" | sed -e 's/.* emitted //' -e 's/ .*//')
    _ss=$(printf '%s\n' "$_legacy" | sed -e 's/.*| surface: //' -e 's/ -->$//')
    _sg="brewdoc:memory-sync-setup"; _st=unknown; _sc=unknown
    echo "NOTE_LEGACY=pre-5.0 tail stamp (template v$_sv) - no provenance frontmatter; \`generate.sh restamp\` migrates it (it is also the last step of \`upgrade\`)"
    _drifts=$((_drifts+1))
  elif [ -z "$_sv" ]; then
    _fmt=none
    _sv=UNSTAMPED; _sd=UNSTAMPED; _ss=UNSTAMPED; _sg=UNSTAMPED; _st=UNSTAMPED; _sc=UNSTAMPED
  fi
  [ -n "$_sd" ] || _sd=unknown
  [ -n "$_st" ] || _st=unknown
  [ -n "$_sc" ] || _sc=unknown
  if [ "$_ss" = UNSTAMPED ] || [ -z "$_ss" ]; then
    _stamped_n=unknown
  else
    _stamped_n=$(printf '%s\n' "$_ss" | grep -oE '^[0-9]+' || true)
    [ -n "$_stamped_n" ] || _stamped_n=unknown
  fi
  if [ "$_fmt" = frontmatter ] && [ "$_sv" != "$VERSION" ]; then
    echo "NOTE_VERSION=plugin version moved $_sv -> $VERSION"; _drifts=$((_drifts+1))
  fi
  if [ "$_fmt" = frontmatter ] && [ "$_sc" != "$CONTENT_VERSION" ]; then
    echo "NOTE_CONTENT_VERSION=content_version moved $_sc -> $CONTENT_VERSION"; _drifts=$((_drifts+1))
  fi
  echo "STAMP_FORMAT=$_fmt"
  echo "META_DOC_TYPE=$_st"; echo "META_VERSION=$_sv"; echo "META_CONTENT_VERSION=$_sc"; echo "META_GENERATED_BY=$_sg"
  echo "META_LAST_UPDATED=$_sd"; echo "META_SURFACE=$_ss"

  _now=$(surface_total)
  echo "SURFACE_FILES_NOW=$_now"
  echo "SURFACE_FILES_STAMPED=$_stamped_n"
  if [ "$_stamped_n" != "unknown" ] && [ "$_stamped_n" -ne "$_now" ]; then
    echo "NOTE_SURFACE=surface moved $_stamped_n -> $_now files"; _drifts=$((_drifts+1))
  fi

  _miss=0; _misslist=""
  for r in $EMITTED_REFS; do
    [ -f "$TARGET_REFS/$r" ] || { _misslist="$_misslist${_misslist:+, }$TARGET_REFS/$r"; _miss=$((_miss+1)); }
  done
  [ "$_miss" -eq 0 ] || echo "NOTE_MISSING=$_misslist"
  echo "MISSING_FILES=$_miss"
  _drifts=$((_drifts + _miss))

  # Same file list as validate - counting SKILL.md alone let 2 open blocks in hard-sync.md report IN SYNC.
  _open=$( { _open_tokens || true; } | awk '{ print $NF }' | sort -u | wc -l | tr -d ' ')
  echo "OPEN_PLACEHOLDERS=$_open"
  [ "$_open" -gt 0 ] && _drifts=$((_drifts + _open))

  echo "DEFAULT_BRANCH=$(derive_branch)"; echo "GIT_VISIBILITY=$(derive_git_visibility)"; echo "DRIFTS=$_drifts"
  if [ "$_fmt" = legacy ]; then _verdict="STALE-LEGACY ($_drifts drifts)"
  elif [ "$_drifts" -eq 0 ]; then _verdict="IN SYNC"
  else _verdict="STALE ($_drifts drifts)"
  fi
  # PARKED carries its staleness with it - the two answers are orthogonal and both are reported.
  [ "$_parked" = no ] || _verdict="PARKED - $_verdict"
  echo "VERDICT=$_verdict"
  return 0
}

# ── enable / disable ────────────────────────────────────────────────────────────
# CC discovers a skill only via <dir>/SKILL.md: parking it as SKILL.md.disabled hides /memory-sync; refs, hand-edits, stamp untouched.

toggle_skill() {
  _want="$1"   # enable | disable
  if [ "$_want" = "disable" ]; then _from="$TARGET/SKILL.md"; _to="$DISABLED_MARK"
  else _from="$DISABLED_MARK"; _to="$TARGET/SKILL.md"; fi

  echo "=== memory-sync-setup: $_want ==="
  echo "TARGET=$ROOT"
  if [ ! -d "$TARGET" ]; then
    echo "❌ FAILED: not installed - $ROOT/$TARGET does not exist. Run 'generate.sh emit' first."
    exit 1
  fi
  if [ -f "$_to" ] && [ ! -f "$_from" ]; then
    echo "✅ already ${_want}d - $_to is in place, nothing to move"
    exit 0
  fi
  if [ ! -f "$_from" ]; then
    echo "❌ FAILED: broken installation - neither $TARGET/SKILL.md nor $DISABLED_MARK exists"
    exit 1
  fi
  mv "$_from" "$_to" || { echo "❌ FAILED: could not rename $_from"; exit 1; }
  echo "MOVED: $_from -> $_to"
  for r in $EMITTED_REFS; do [ -f "$TARGET_REFS/$r" ] && echo "KEPT:  $TARGET_REFS/$r"; done
  echo "✅ $_want (a running session picks it up without a restart; bare mode: new session)"
}

# ── uninstall / purge ───────────────────────────────────────────────────────────
# Emit manifest = removal manifest: uninstall deletes exactly it (user files kept, listed); purge = whole dir + staging.
remove_skill() {
  _purge="$1"   # 0 = uninstall, 1 = purge
  _label=$([ "$_purge" = "1" ] && echo purge || echo uninstall)
  echo "=== memory-sync-setup: $_label ==="
  echo "TARGET=$ROOT"

  if [ ! -d "$TARGET" ]; then
    echo "⚠️ nothing to $_label - memory-sync is not installed at $ROOT/$TARGET"
    exit 0
  fi

  # No hooks/settings/config elsewhere: the dir + .claude/skills/ staging leftovers are the whole footprint.
  if [ "$_purge" = "1" ]; then
    rm -rf "$TARGET"
    echo "REMOVED: $TARGET/ (whole directory, user-added files included)"
    _stale=$({ find "$(dirname "$TARGET")" -maxdepth 1 -type d -name '.memory-sync-emit.*' 2>/dev/null || true; } | sort)
    if [ -n "$_stale" ]; then
      printf '%s\n' "$_stale" | while IFS= read -r _d; do
        [ -n "$_d" ] || continue
        rm -rf "$_d"; echo "REMOVED: $_d/ (staging left by a crashed emit)"
      done
    else
      echo "SKIP:    no .memory-sync-emit.* staging leftovers"
    fi
    echo "✅ purge"
    return 0
  fi

  # uninstall: the emit manifest, and only the emit manifest.
  for f in "$TARGET/SKILL.md" "$DISABLED_MARK"; do
    [ -f "$f" ] && { rm -f "$f"; echo "REMOVED: $f"; }
  done
  for r in $EMITTED_REFS; do
    [ -f "$TARGET_REFS/$r" ] && { rm -f "$TARGET_REFS/$r"; echo "REMOVED: $TARGET_REFS/$r"; }
  done
  rmdir "$TARGET_REFS" 2>/dev/null || true
  rmdir "$TARGET" 2>/dev/null || true

  if [ -d "$TARGET" ]; then
    echo "KEPT:    $TARGET/ still holds files this generator never wrote -"
    find "$TARGET" -type f | sort | sed 's/^/         /'
    echo "         'purge' removes them too."
  else
    echo "REMOVED: $TARGET/ (empty after the manifest was removed)"
  fi
  echo "✅ uninstall"
}

case "$MODE" in
  scan)      resolve_root; scan_target ;;
  emit)      resolve_root; emit_skill ;;
  validate)  resolve_root; validate_emit ;;
  restamp)   resolve_root; restamp_skill ;;
  status)    resolve_root; status_report ;;
  enable)    resolve_root; toggle_skill enable ;;
  disable)   resolve_root; toggle_skill disable ;;
  uninstall) resolve_root; remove_skill 0 ;;
  purge)     resolve_root; remove_skill 1 ;;
  *)
    echo "Usage: generate.sh <scan|emit|validate|restamp|status|enable|disable|uninstall|purge>   (default: emit)"
    echo "  scan      read-only surface report + derived DEFAULT_BRANCH= / GIT_VISIBILITY= / MEMORY_DIR= /"
    echo "            TRACKER_NOTE= / SURFACE_COUNTS= / PROJECT_NAME= for pass-back to emit"
    echo "  emit      write the 5 owned paths under $TARGET, staged (other files in that dir survive);"
    echo "            refuses over a live install (MEMORY_SYNC_FORCE=1 overrides) and over a PARKED one"
    echo "            (no override - run \`enable\`, \`uninstall\` or \`purge\` first)"
    echo "  validate  fail on unresolved {PLACEHOLDER}, missing file, broken reference, missing/stale provenance frontmatter"
    echo "  restamp   refresh ONLY the provenance keys of an installed SKILL.md (version/last_updated/"
    echo "            surface_files, + doc_type/generated_by when absent) and drop a pre-5.0 tail stamp."
    echo "            Body and every hand-edit are verified byte-identical. Mandatory last step of \`upgrade\`"
    echo "  status    machine-greppable KEY=value drift report, always exit 0. INSTALLED=yes|parked|no -"
    echo "            a parked install (SKILL.md.disabled) is reported PARKED, never NOT INSTALLED"
    echo "  enable    rename $TARGET/SKILL.md.disabled back to SKILL.md"
    echo "  disable   rename $TARGET/SKILL.md to SKILL.md.disabled - /memory-sync stops being discovered;"
    echo "            the references and every SELF-SYNC hand-edit stay on disk, reversible"
    echo "  uninstall delete exactly what emit wrote (SKILL.md + $EMITTED_N references); user-added files in"
    echo "            that dir are KEPT and listed"
    echo "  purge     delete $TARGET/ outright + any .memory-sync-emit.* staging leftovers"
    exit 1
    ;;
esac
