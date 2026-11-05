---
name: docsync-setup
description: "Installs project-local doc-staleness tracking (hooks) and reports/forces doc sync. Triggers: docsync, track doc staleness, doc sync status, stale docs, doc frontmatter."
user-invocable: true
disable-model-invocation: true
argument-hint: "[prompt] [status|install|upgrade|enable|disable|uninstall|purge] [sync [--all]|reread|frontmatter] [--unattended]"
allowed-tools: [Read, Write, Edit, Bash, Glob, Grep, AskUserQuestion]
model: sonnet
license: MIT
---
<!-- brewcode-meta: version=6.12.5 content_version=6.10.0 generated_by=brewdoc:docsync-setup -->

# docsync-setup

> Project-scoped doc-staleness tracker. Installs three project-local hooks that log which
> `.md` docs a session edits and, at end of turn, raise those whose `last_updated` is
> missing, unusable or behind the file. Source of truth = each doc's own frontmatter.

<instructions>

## Prompt contract

`$ARGUMENTS` is one free-form RU/EN prompt; mode tokens and flags may sit anywhere in it.

1. Mode: an explicit mode token wins outright; else the most distinct whole-word keyword hits
   (table below). Tie with a destructive mode -> `AskUserQuestion`; with `status` -> `status`; of two
   mutating modes -> the keyword that comes first. No hit or empty -> `status` if installed, else
   `install`. Strip `--unattended` before routing: a flag, never a mode, keyword or id; only `upgrade`
   honours it (Mode: upgrade), and it never asks.
2. Scope: prose that is not a mode/id/path is still input: take the id, path or target from it.
3. Ask: at most ONE `AskUserQuestion` (max 4 questions) to resolve mode and scope, before any work, only when the answer
   changes what gets written. A read-only run asks nothing.

Print once, before the first action (labels literal, values in the conversation language):

```
PLAN — brewdoc:docsync-setup
INPUT:  <arguments verbatim, or "(empty)">
MODE:   <resolved> — <explicit | matched keyword: X | default>
SCOPE:  <resolved paths / target / level / flags>
DO:     <2-5 imperative bullets>
RESULT: <what the user ends up holding>
```

## Standard flow (every run)

Resolve the mode, print the PLAN block, execute, print the summary (Output Format), then run
that mode's checks (Verification). Verification is mandatory: report pass/fail per check, never
unverified success. Run in the main conversation (uses `AskUserQuestion`); no `context: fork`.

> **Project root.** Each **EXECUTE** block resolves it: `CLAUDE_PROJECT_DIR` ->
> `git rev-parse --show-toplevel` -> upward walk for `.git`/`.claude` (a profile `.claude` at HOME is skipped). Keep the token
> bare-braced (`${VAR:-fallback}` is never substituted). The hooks skip the `git rev-parse`
> rung and are the authority for config/state placement under a nested `.claude`.

## Mode Resolution — prompt-driven

Canonical verbs, in order: `status | install | upgrade | enable | disable | uninstall | purge`.
Skill-specific extras come after them: `sync [--all]`, `reread`, `frontmatter`.

| Mode | EN keywords | RU keywords | Mutates? |
|------|-------------|-------------|----------|
| `status` | *(empty)*, status, check, show, what is stale | что устарело, показать, статус | no |
| `install` | install | установи, настрой | yes |
| `upgrade` | upgrade, refresh hooks | обнови хуки, переустанови | yes |
| `enable` | enable, turn back on | включи, включи отслеживание, возобнови | yes |
| `disable` | disable, pause, mute | выключи, приостанови, отключи отслеживание | yes |
| `uninstall` | uninstall | удали docsync, снеси хуки | yes |
| `purge` | purge | вычисти, снеси всё вместе с конфигом | yes, destructive |
| `sync` | sync, sync all, `--all` | синхронизируй, обнови устаревшие | yes |
| `reread` | reread, refresh context | перечитай, освежи | no |
| `frontmatter` | frontmatter, add frontmatter | проставь frontmatter, ретро-разметка | yes |

> Removed aliases `init`, `on`, `off`, `setup`, `remove`, `reset`, `create`, `update`,
> `cleanup`: map each to its canonical verb (`on` -> `enable`, `off` -> `disable`), say so
> in the output, and never print one back to the user as a command. Never treat the first
> word of a prose prompt as a positional id.

### First-run detection

**EXECUTE** using Bash tool:
```bash
ROOT="${CLAUDE_PROJECT_DIR}"
[ -n "$ROOT" ] && [ -d "$ROOT" ] || ROOT=$(git rev-parse --show-toplevel 2>/dev/null || true)
is_profile_parent() { _pp=$(cd "${1}" 2>/dev/null && pwd -P) || return 1; { [ -n "${HOME:-}" ] && [ "$_pp" = "$(cd "$HOME" 2>/dev/null && pwd -P)" ]; } || { [ -n "${CLAUDE_CONFIG_DIR:-}" ] && [ "$_pp/.claude" = "$(cd "$CLAUDE_CONFIG_DIR" 2>/dev/null && pwd -P)" ]; }; }
[ -n "$ROOT" ] || { d=$PWD; until [ -d "$d/.git" ] || { [ -d "$d/.claude" ] && ! is_profile_parent "$d"; } || [ "$d" = / ]; do d=$(dirname "$d"); done; [ "$d" = / ] && ROOT=$PWD || ROOT=$d; }
if [ -f "$ROOT/.claude/hooks/docsync-gate.mjs" ] && grep -q 'docsync-gate.mjs' "$ROOT/.claude/settings.json" 2>/dev/null; then
  # `"enabled": false` means installed-but-inert, NOT missing. Absent key = enabled.
  if grep -q '"enabled"[[:space:]]*:[[:space:]]*false' "$ROOT/.claude/docsync/config.json" 2>/dev/null; then
    echo "docsync: INSTALLED (DISABLED)"
  else
    echo "docsync: INSTALLED"
  fi
else
  echo "docsync: NOT_INSTALLED"
fi
# Launcher = first word of command, unquoted, basename; not node = the project wraps the hook (a fork).
node -e '
const fs = require("fs");
const launcher = c => { const m = /^\s*(?:"([^"]*)"|\x27([^\x27]*)\x27|(\S+))/.exec(c); return m ? String(m[1] ?? m[2] ?? m[3]).split(/[\\/]/).pop() : ""; };
const seen = new Set();
for (const f of process.argv.slice(1)) {
  let j; try { j = JSON.parse(fs.readFileSync(f, "utf8")); } catch { continue; }
  for (const gs of Object.values((j && j.hooks) || {})) for (const g of Array.isArray(gs) ? gs : []) for (const h of Array.isArray(g.hooks) ? g.hooks : [])
    if (typeof h.command === "string" && /docsync-(track|watch|gate)\.mjs/.test([h.command, ...(Array.isArray(h.args) ? h.args : [])].join(" ")) && !/^node(\.exe)?$/i.test(launcher(h.command))) seen.add(launcher(h.command));
}
if (seen.size) console.log("docsync: WRAPPED " + [...seen].join(","));
' "$ROOT/.claude/settings.json" "$ROOT/.claude/settings.local.json"
```

- No explicit mode: `NOT_INSTALLED` -> **install**; `INSTALLED` (either state) -> **status**.
- `docsync: WRAPPED <launcher>`: a project launcher runs docsync hooks (a user fork). `upgrade`
  keeps those registrations but re-copies the hook files over the fork: the user's call.
- `install` on a `DISABLED` install: refuse and point at `enable`, so a deliberate pause
  is never reinstalled over.

## Frontmatter schema (this system's docs)

```yaml
---
doc_type: llm                  # optional, UNQUOTED; absent or unrecognized => user. values: llm | user | skip
last_updated: "2026-07-19"     # sole staleness input (YYYY-MM-DD, LOCAL time)
sync_procedure: "what to check / where to look when syncing"   # optional, prose
---
```

- **Quote `last_updated` and `sync_procedure`; leave `doc_type` bare.** The hooks' `parseFm`
  reads either form, but a real YAML consumer types an unquoted `2026-07-19` as a Date, and
  other brewcode tooling matches `^doc_type: llm$` literally.
- `doc_type`: compress depth on sync, `llm` = deep, `user` = light; absent or unrecognized
  -> `user` (`docTypeOf()`, all three hooks). `doc_type: skip` = untracked by all three
  hooks, the Stop gate included, so a doc marked `skip` mid-session goes silent.
- `sync_procedure`: model-only hint. No hook reads it; the gate's block message and `sync`
  tell Claude to follow it after reading the doc.
- Dates: `YYYY-MM-DD`, the LOCAL calendar day everywhere (`date +%F`). The gate compares
  `last_updated` with the file's modification day; `status` and `sync` age it against today:
  `today - last_updated > threshold_days`.

## The three hooks — exact behavior

| File | Event | Matcher; `if`; timeout | Behavior |
|------|-------|------------------------|----------|
| `docsync-track.mjs` | PostToolUse | `Write\|Edit`; two handlers, `Write(**/*.md)` + `Edit(**/*.md)` (one `if` rule = one tool); 5 s each | Logs an `edit` event; nudges once per file per session when `last_updated` is absent |
| `docsync-watch.mjs` | PostToolUse | `Read`; `Read(**/*.md)`; 5 s | Logs one `read` event per `.md` read by the main session, not by subagents. Silent, informational: never feeds the gate |
| `docsync-gate.mjs` | Stop | no matcher; no `if` (on Stop it = the hook never runs); 10 s | Of the docs edited since its last ask, minus `exclude`, `doc_type: skip` and deleted files, blocks once for: no `last_updated`; unusable (not a real date, or after today); file's modification day minus `last_updated` > `threshold_days` |

- Block message: date missing or unusable, or Claude's own edit already brought the doc up
  to date -> set `last_updated` to today, no question. Otherwise the doc needs a sync:
  Claude decides and syncs; it asks first only before deleting or wholesale rewriting
  content, via `AskUserQuestion` if available, else lists those docs and finishes.
- `CLAUDE.md`, `CLAUDE.local.md`, `AGENTS.md` (any depth, auto-loaded instruction files)
  are never tracked, nudged or gated, whatever `exclude` says.
- After a block the gate stays silent until one of those docs is edited again; it never
  blocks when `stop_hook_active` is `true` or the ask cannot be recorded (either would loop). Say so if a user asks why the nag stopped.
- Never raised: a doc only read, changed by Bash or outside Claude Code, or merely aged.
- State: `.claude/docsync/state-<session_id>.jsonl` (no id: `state.jsonl`), append-only, one
  JSON line per event: `edit`, `read`, `nudge`, `ask` (+ `seen`). The gate prunes logs,
  earlier-version `state*.json` and stray `.tmp` older than 14 days.
- Config keys read: `enabled` (absent = on), `threshold_days` (default 7), `exclude` (absent
  = `[".claude/**"]`). Registration JSON: `assets/INSTALL.md`, `## settings.json hook entries`.

## Enumerate in-scope docs (status / sync --all / reread / frontmatter)

**EXECUTE** using Bash tool (project `.md` minus `.git`; then drop `exclude` matches and
`doc_type: skip` docs yourself). Native `Glob`/`Grep` also serve when the tool list has
them (else this block and `rg`); never infer that from the operating system.
```bash
ROOT="${CLAUDE_PROJECT_DIR}"
[ -n "$ROOT" ] && [ -d "$ROOT" ] || ROOT=$(git rev-parse --show-toplevel 2>/dev/null || true)
is_profile_parent() { _pp=$(cd "${1}" 2>/dev/null && pwd -P) || return 1; { [ -n "${HOME:-}" ] && [ "$_pp" = "$(cd "$HOME" 2>/dev/null && pwd -P)" ]; } || { [ -n "${CLAUDE_CONFIG_DIR:-}" ] && [ "$_pp/.claude" = "$(cd "$CLAUDE_CONFIG_DIR" 2>/dev/null && pwd -P)" ]; }; }
[ -n "$ROOT" ] || { d=$PWD; until [ -d "$d/.git" ] || { [ -d "$d/.claude" ] && ! is_profile_parent "$d"; } || [ "$d" = / ]; do d=$(dirname "$d"); done; [ "$d" = / ] && ROOT=$PWD || ROOT=$d; }
cd "$ROOT" && find . -type f -name '*.md' -not -path './.git/*' -not -name CLAUDE.md -not -name CLAUDE.local.md -not -name AGENTS.md | sed 's#^\./##' | sort
```

---

## Mode: install

Install the tracker into this project. Never adds frontmatter to docs (that is the opt-in
`frontmatter` mode).

### Step 1: Ask threshold + excludes

**ASK** via `AskUserQuestion` (two questions in one call):

1. "Staleness threshold — after how many days without update is a doc stale?"
   Options: **7 (default)** / **14** / **30** / **Other** (user types a number).
2. "Exclude globs — which `.md` paths to ignore?"
   Options: **Common** (`node_modules/**`, `**/CHANGELOG.md`, `dist/**`, `build/**`, `vendor/**`) / **None** / **Other** (user types comma-separated globs).
   `.claude/**` (reports, plans, agent files) is added in every case: say so, and that
   deleting the entry from `config.json` tracks docs under `.claude/`.

Record `THRESHOLD` (integer >= 1) and `EXCLUDE` (JSON array of the chosen globs, e.g.
`["node_modules/**","**/CHANGELOG.md"]`, or `[]` for none).

### Step 2: Copy hooks + write config + merge settings

`assets/INSTALL.md` is the single source of truth for `install`, `upgrade`, `uninstall`
and `purge`: its two bash blocks are the whole transactions (node only; the test suite
runs them verbatim). Run them only through this block, never retyped or re-derived.

**EXECUTE** using Bash tool, lines 2-4 set for the mode:
```bash
RUNBOOK="${CLAUDE_SKILL_DIR}/assets/INSTALL.md"
SECTION='## Install / upgrade'   # uninstall, purge: '## Uninstall / purge'
export MODE=install              # install | upgrade | uninstall | purge
export THRESHOLD=7 EXCLUDE='["node_modules/**","**/CHANGELOG.md","dist/**","build/**","vendor/**"]'   # install: Step 1 answers; other modes ignore them
export RUNBOOK CLAUDE_PROJECT_DIR="${CLAUDE_PROJECT_DIR}"
T=$(mktemp)
awk -v h="$SECTION" 'index($(0),h)==1{s=1} s&&/^```bash$/{f=1;next} f&&/^```$/{exit} f' "$RUNBOOK" > "$T"
[ -s "$T" ] || { echo "❌ no bash block under '$SECTION' in $RUNBOOK"; rm -f "$T"; exit 1; }
bash "$T"; rc=$?; rm -f "$T"
[ "$rc" -eq 0 ] && echo "✅ docsync $MODE done" || { echo "❌ docsync $MODE FAILED (rc=$rc)"; exit 1; }
```

> **STOP if ❌** — nothing is half-applied: install/upgrade validate before the first write
> and roll a failed write back (a concurrent edit is kept); uninstall/purge abort on an
> unparsable `settings.json` before removing anything. Only `purge` deletes session logs.

### Step 3: Report + tell the user

Report: 3 hooks copied to `.claude/hooks/`, `config.json` written, four handlers merged
into `settings.json`, no backup file (the transaction is its own rollback). Settings are
watched, so the hooks normally apply in this session (restart it if they do not fire);
they need `node` on `PATH`. Suggest `frontmatter` next when docs lack `last_updated`.

---

## Mode: upgrade

Refresh an existing install to the current plugin version.

**Unattended (`--unattended` anywhere in the prompt; set by `/brewcode:setup-status upgrade`).**
1. A flag, never a mode or name: strip it first. Any resolved mode other than `upgrade` -> no write, `RESULT skipped <id> cv=?->? pending=0 note="not-upgrade"`.
2. No `AskUserQuestion` at all. Every gate in this section takes its decline branch; a declined gate is pending, never applied.
3. A precondition this section would ask about (not installed, parked, custom/wrapped registration, orphan config,
   user-modified managed file, missing tokenizer) -> no write, `RESULT skipped <id> cv=?->? pending=0 note="<reason>"`.
4. Write only what this section already writes. No git commit, push, stash or reset; scratch only in a private `mktemp -d`.
5. Last line, exactly once: `RESULT <ok|partial|skipped|failed> <id> cv=<before>-><after> pending=<n> note="<one line>"`,
   `<id>` = `<plugin>:<skill>` [` scope=<project|global>`|` team=<name>`], `?` = unknown version.

Here `<id>` = `brewdoc:docsync-setup`; `cv` = `content_version` (else `version`) of `.claude/docsync/config.json`
before and after step 2. Skipped before any write: `docsync: NOT_INSTALLED` (note `not installed`, never
`install`) or a `docsync: WRAPPED <launcher>` line (note `wrapped by <launcher>`). `INSTALLED (DISABLED)`
upgrades and stays disabled. `VERIFY OK` -> `ok`, `pending=0`; any ❌ -> `failed`.

1. Require `INSTALLED` (first-run detection); `NOT_INSTALLED` -> say so, run `install` instead
   (unattended: skipped, above).
2. Run the install Step 2 block with `MODE=upgrade`. It keeps `threshold_days`, `exclude`,
   `enabled` and unknown config keys, refreshes the four provenance keys, and rewrites
   every docsync registration into today's shape. On meeting a legacy registration (a
   docsync handler without `timeout`) it also appends `.claude/**` to `exclude`, once:
   later upgrades leave the list alone, so removing the entry sticks.
3. Verify with the install block and the `upgrade` row.

---

## Mode: status

Report tracked docs and staleness. No changes.

1. Read `$ROOT/.claude/docsync/config.json` (`threshold_days`, `exclude`, `enabled`).
   Missing -> "not installed; run install". `enabled: false` -> lead with **DISABLED —
   hooks are wired but inert; `enable` resumes them**, then report staleness anyway.
2. Enumerate in-scope docs (the `find` block); drop `exclude` matches and `doc_type: skip`.
3. Per doc: `last_updated` -> age in days against today (LOCAL); `stale` when
   `age > threshold_days`, `no-date` when missing.
4. Read `$ROOT/.claude/docsync/state-<session_id>.jsonl`; report the docs this session
   edited and read.
5. Output the Status table (Output Format).

## Mode: enable / disable

Flip docsync between live and inert without unwiring anything: one key, `"enabled"`
(`true` | `false`), in `.claude/docsync/config.json`, provenance refreshed with it. Hooks
in `settings.json`, hook files, session logs and doc frontmatter stay untouched; removing
hooks is `uninstall`. The hooks read `enabled` on every invocation (`loadConfig`, absent =
`true`), so the flip is immediate. Disabled = no event logging, no nudge, no Stop block.

1. Require `INSTALLED` (either state); `NOT_INSTALLED` -> say so, offer `install`, and
   do not write a config for hooks that do not exist.
2. The step 3 block writes nothing (`already enabled` / `already disabled`) only when the
   value matches and all four provenance keys are current (`version`, `content_version`,
   `generated_by` == `brewdoc:docsync-setup`, `last_updated`); else it rewrites the config.
3. **EXECUTE** using Bash tool (`WANT` = `true` for enable, `false` for disable):
   ```bash
   ROOT="${CLAUDE_PROJECT_DIR}"
   [ -n "$ROOT" ] && [ -d "$ROOT" ] || ROOT=$(git rev-parse --show-toplevel 2>/dev/null || true)
   is_profile_parent() { _pp=$(cd "${1}" 2>/dev/null && pwd -P) || return 1; { [ -n "${HOME:-}" ] && [ "$_pp" = "$(cd "$HOME" 2>/dev/null && pwd -P)" ]; } || { [ -n "${CLAUDE_CONFIG_DIR:-}" ] && [ "$_pp/.claude" = "$(cd "$CLAUDE_CONFIG_DIR" 2>/dev/null && pwd -P)" ]; }; }
   [ -n "$ROOT" ] || { d=$PWD; until [ -d "$d/.git" ] || { [ -d "$d/.claude" ] && ! is_profile_parent "$d"; } || [ "$d" = / ]; do d=$(dirname "$d"); done; [ "$d" = / ] && ROOT=$PWD || ROOT=$d; }
   C="$ROOT/.claude/docsync/config.json"
   PJ="${CLAUDE_SKILL_DIR}/../../.claude-plugin/plugin.json"
   SKILL_MD="${CLAUDE_SKILL_DIR}/SKILL.md"
   WANT=true   # <- set to false for `disable`
   [ -f "$C" ] || { echo "❌ $C missing — docsync is not installed"; exit 1; }
   C="$C" WANT="$WANT" PJ="$PJ" SKILL_MD="$SKILL_MD" TODAY="$(date +%F)" node -e '
     const fs = require("fs");
     const c = process.env.C, want = process.env.WANT === "true";
     const v = JSON.parse(fs.readFileSync(process.env.PJ, "utf8")).version;
     if (!v) throw new Error("no version in " + process.env.PJ);
     const header = fs.readFileSync(process.env.SKILL_MD, "utf8").split("\n").find(l => l.includes("brewcode-meta:")) || "";
     const cvm = /content_version=([0-9]+\.[0-9]+\.[0-9]+)/.exec(header);
     if (!cvm) throw new Error("no content_version in " + process.env.SKILL_MD);
     const cv = cvm[1];
     const cfg = JSON.parse(fs.readFileSync(c, "utf8"));
     const was = cfg.enabled !== false;
     const stamped = cfg.version === v && cfg.content_version === cv && cfg.generated_by === "brewdoc:docsync-setup" && /^\d{4}-\d{2}-\d{2}$/.test(cfg.last_updated || "");
     if (was === want && stamped) { console.log(`already ${want ? "enabled" : "disabled"}, provenance current — nothing written`); process.exit(0); }
     cfg.enabled = want;
     const { version, content_version, generated_by, last_updated, ...rest } = cfg;
     const next = { version: v, content_version: cv, generated_by: "brewdoc:docsync-setup", last_updated: process.env.TODAY, ...rest };
     fs.writeFileSync(c, JSON.stringify(next, null, 2) + "\n");
     console.log(`enabled: ${was} -> ${want}; version=${next.version}, content_version=${next.content_version}, generated_by=${next.generated_by}, last_updated=${next.last_updated}; threshold_days=${next.threshold_days}, exclude=${JSON.stringify(next.exclude)} (preserved)`);
   ' && echo "✅ done" || { echo "❌ FAILED"; exit 1; }
   ```
   > **STOP if ❌** — fix before continuing.
4. Report the new state and its reversal verb; after `disable`, that the hooks stay
   registered and `enable` restores them.

---

## Mode: uninstall

Remove docsync from this project without touching anything foreign.

1. Run the install Step 2 block with `SECTION='## Uninstall / purge'`, `MODE=uninstall`.
   Registrations go first, hook files after, so none points at a deleted script; only
   docsync handlers go, and a `settings.json` that held nothing else is deleted. It also
   clears stray nested `.claude/docsync/` state dirs and an older docsync's
   `settings.json.bak` when that loses nothing, else prints `KEPT ...settings.json.bak`
   (maybe the user's own).
2. Report its summary line, any `KEPT` line, and that `.claude/docsync/` (config + session
   logs) stays until `purge`; doc frontmatter is untouched. Removal normally applies in
   this session (settings are watched).

## Mode: purge

`uninstall` with no survivors: the same block with `MODE=purge` also deletes
`.claude/docsync/` and an emptied `.claude/`. An unparsable `settings.json` aborts it
before anything is deleted, so config never vanishes while registrations still point at the hooks.

---

## Mode: sync `[--all]`

1. Targets: stale docs (as in status); `--all` = every in-scope doc (the `find` block).
2. **ASK** via `AskUserQuestion`: list the docs, confirm which to sync; none runs unconfirmed.
3. Per confirmed doc: read it, follow its `sync_procedure` when present, compress by
   `doc_type` (`llm` = deep, `user` or absent = light), preserve author intent.
4. Set `last_updated: "{LAST_UPDATED}"` (quoted; `date +%F`, LOCAL); a doc without one
   gains it here.
5. Output each synced doc with its new `last_updated`.

## Mode: reread

Re-read tracked docs to refresh in-context understanding. No writes.

1. Scope: docs in this session's log, else all in-scope `.md` (the `find` block).
2. Read each with the Read tool; the watch hook records these reads.
3. Output a short list of what was re-read.

## Mode: frontmatter

Opt-in retro-add of docsync frontmatter to in-scope docs; never automatic at install.

1. Enumerate in-scope `.md` (the `find` block, minus excludes); find those without
   `last_updated`.
2. Show them and the fields to add.
3. **ASK** via `AskUserQuestion`: "Add docsync frontmatter to N docs?" Options:
   **Yes, all** / **Review each** / **Cancel**.
4. Prepend or merge into each approved doc all three schema fields (`sync` follows
   `sync_procedure`):
   ```yaml
   ---
   doc_type: user                   # UNQUOTED; llm for machine-facing docs; skip to exclude
   last_updated: "{LAST_UPDATED}"
   sync_procedure: "<what to re-check for THIS doc, and where>"
   ---
   ```
   Existing keys stay, these go after them. `{LAST_UPDATED}` = `date +%F`; quoting per the
   Frontmatter schema. Write a real one-line `sync_procedure` from what the doc documents;
   none worth naming -> omit the key, no placeholder, and say for which docs.
5. Output each doc and the keys it gained.

</instructions>

## Verification (per mode)

| Mode | Checks |
|------|--------|
| install | the block below ends `VERIFY OK`: 3 hook files in `.claude/hooks` pass `node --check`; `config.json` provenance matches the plugin; `.claude/settings.json` names all 3 hooks |
| upgrade | `install` checks; `threshold_days` + `enabled` unchanged; `exclude` unchanged apart from the one-time `.claude/**` seed |
| enable | `config.json` valid JSON with `enabled: true`; hooks still in `settings.json` and on disk; `threshold_days` + `exclude` unchanged; four provenance keys current |
| disable | as `enable` with `enabled: false`; session logs still present |
| status | config exists; tracked = stale + fresh + no-date; `enabled` state stated |
| sync | each synced doc's `last_updated` == today; frontmatter still valid |
| reread | each targeted doc was read |
| frontmatter | each approved doc: valid frontmatter, bare `doc_type`, quoted `last_updated` (+ `sync_procedure` where written), pre-existing keys preserved |
| uninstall | no `docsync-*.mjs` handler in `settings.json` (deleted if it held only docsync, else still valid JSON); foreign hooks preserved; hook files gone; `.claude/docsync/` kept |
| purge | `uninstall` checks, but `.claude/docsync` gone |

**EXECUTE** (install/upgrade verification) using Bash tool:
```bash
ROOT="${CLAUDE_PROJECT_DIR}"
[ -n "$ROOT" ] && [ -d "$ROOT" ] || ROOT=$(git rev-parse --show-toplevel 2>/dev/null || true)
is_profile_parent() { _pp=$(cd "${1}" 2>/dev/null && pwd -P) || return 1; { [ -n "${HOME:-}" ] && [ "$_pp" = "$(cd "$HOME" 2>/dev/null && pwd -P)" ]; } || { [ -n "${CLAUDE_CONFIG_DIR:-}" ] && [ "$_pp/.claude" = "$(cd "$CLAUDE_CONFIG_DIR" 2>/dev/null && pwd -P)" ]; }; }
[ -n "$ROOT" ] || { d=$PWD; until [ -d "$d/.git" ] || { [ -d "$d/.claude" ] && ! is_profile_parent "$d"; } || [ "$d" = / ]; do d=$(dirname "$d"); done; [ "$d" = / ] && ROOT=$PWD || ROOT=$d; }
DST="$ROOT/.claude/hooks"; D="$ROOT/.claude/docsync"; S="$ROOT/.claude/settings.json"; ok=1
for f in docsync-track docsync-watch docsync-gate; do
  node --check "$DST/$f.mjs" && echo "✅ $f parses" || { echo "❌ $f parse FAILED"; ok=0; }
done
PJ="${CLAUDE_SKILL_DIR}/../../.claude-plugin/plugin.json"
node -e "
  const fs=require('fs');
  const cfg=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));
  const v=JSON.parse(fs.readFileSync(process.argv[2],'utf8')).version;
  if(cfg.version!==v) throw new Error('config version '+cfg.version+' != plugin '+v);
  if(cfg.generated_by!=='brewdoc:docsync-setup') throw new Error('generated_by is '+cfg.generated_by);
  if(!/^\d{4}-\d{2}-\d{2}\$/.test(cfg.last_updated||'')) throw new Error('last_updated not YYYY-MM-DD: '+cfg.last_updated);
  if(!Number.isInteger(cfg.threshold_days)) throw new Error('threshold_days not an integer');
" "$D/config.json" "$PJ" && echo "✅ config.json valid + provenance matches plugin" || { echo "❌ config.json"; ok=0; }
node -e "const s=JSON.stringify(JSON.parse(require('fs').readFileSync('$S','utf8')));['docsync-track','docsync-watch','docsync-gate'].forEach(n=>{if(!s.includes(n))throw new Error('missing '+n)});" \
  && echo "✅ settings.json wired" || { echo "❌ settings.json missing entries"; ok=0; }
[ "$ok" = 1 ] && echo "✅ VERIFY OK" || echo "❌ VERIFY FAILED"
```

## Output Format

```markdown
# docsync-setup [MODE]

## Detection
| Field | Value |
|-------|-------|
| Arguments | `<the prompt verbatim>` |
| Mode | `[mode]` (reason) |

## Plan
- [what will happen]

## Actions
- [action 1]
- [action 2]

## Status
tracking: enabled | DISABLED (hooks wired but inert — `enable` resumes)

| Doc | doc_type | last_updated | age | state |
|-----|----------|--------------|-----|-------|
| ... | ...      | ...          | ..d | stale/fresh/no-date |

## Verification
| Check | Result |
|-------|--------|
| ...   | ✅/❌   |
```
