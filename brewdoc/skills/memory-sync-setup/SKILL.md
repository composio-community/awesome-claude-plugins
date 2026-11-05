---
name: memory-sync-setup
description: "Generates a project-tailored memory-sync skill: memory surface batches, checkable-fact catalogue, non-growth sync, independent verify, self-sync, agent re-audit. Triggers: memory sync init, generate memory sync, sync memory skill, установи memory-sync, синхронизируй память"
user-invocable: true
disable-model-invocation: true
argument-hint: "[prompt] [status|install|upgrade|enable|disable|uninstall|purge] [fine-tune-prompt] [--unattended]"
allowed-tools: [Read, Edit, Glob, Grep, Bash, Agent, AskUserQuestion]
model: opus
license: MIT
---
<!-- brewcode-meta: version=6.12.5 content_version=6.10.0 generated_by=brewdoc:memory-sync-setup -->

# Memory Sync Generator (brewdoc:memory-sync-setup)

**ROLE:** GENERATOR. It analyzes the TARGET project and WRITES a self-contained, project-local
`.claude/skills/memory-sync/` into it; it NEVER syncs memory itself. Project-specific batches, invariants,
verification commands, roster and language policy are what let the emitted skill tell intentional non-English
aliases from violations, stale claims from current ones, and facts gone from reality from merely deleted prose.

**OUTPUT:** `<target>/.claude/skills/memory-sync/` -- `SKILL.md` + `references/memory-guide.md` +
`references/agent-audit.md` + `references/hard-sync.md` + `references/prompting-guide.md`; nothing else (no agent,
rule or hook). `<target>` = the git toplevel, or `MEMORY_SYNC_ROOT=<abs path>`.

## Prompt contract

`$ARGUMENTS` is one free-form RU/EN prompt; mode tokens, flags (`--unattended`) and the fine-tune text may sit anywhere in it.

1. Mode: strip `--unattended` first: a flag, never a mode or fine-tune text (Mode: upgrade, **Unattended**).
   Then an explicit mode token wins outright; else the most distinct whole-word keyword hits (table in
   `## Modes` below). Tie with a destructive mode -> `AskUserQuestion`; with `status` -> `status`; of two
   mutating modes -> the keyword that comes first. No hit or empty -> `status` if installed, else `install`.
2. Scope: prose that is not a mode/id/path is still input: take the id, path or target from it -- never
   the first word of a sentence as a positional id. The remainder becomes the fine-tune prompt /
   `{FOCUS_EMPHASIS}`.
3. Ask: at most ONE `AskUserQuestion` (max 4 questions) to resolve mode and scope, before any work, only when the answer changes
   what gets written. A read-only run asks nothing.

Print once, before the first action (labels literal, values in the conversation language):

```
PLAN — brewdoc:memory-sync-setup
INPUT:  <arguments verbatim, or "(empty)">
MODE:   <resolved> — <explicit | matched keyword: X | default>
SCOPE:  target=<absolute repo root>; emphasis=<fine-tune prompt interpretation | "none">
DO:     <2-5 imperative bullets>
RESULT: <what the user ends up holding>
```

## What the emitted skill does

A long-running multi-agent coordinator that diffs instruction memory against the code for a SCOPE and repairs it --
facts FIRST, dedup second, compression third -- under a NON-GROWTH prime directive (every file ends `<=` its original
line count, total delta `<= 0`). It sweeps the WHOLE memory surface every run in disjoint batches, so parallel edits
never collide. Three orthogonal axes: `{SCOPE}` = WHICH change facts drive the sweep, `{DEPTH}` = HOW HARD the
surface is cut, `{REACH}` = HOW WIDE the editable set is.

| Axis | Emitted behaviour |
|------|-------------------|
| Scopes | `session` (DEFAULT -- facts from THIS conversation, no gather agent), `branch` (diff vs the derived default branch), `commit <sha>` / `commit <a>..<b>`, `recent[:N]` (default 10), `all` (every checkable fact re-verified) |
| Depth | `NORMAL` (DEFAULT -- fact sync + dedup + compression) or `HARD` (+ the two passes of `references/hard-sync.md`), from the token `hard` or that intent in prose ("too much context", "aggressive", "почисти жёстко") |
| Reach | `MEMORY` (DEFAULT -- the instruction surface only) or `REFS` (plus the git-TRACKED outside references that always-loaded instruction files cite and tell their reader to open); never overrides the docs/source/secrets exclusions |
| HARD pass A | rules `paths:` PRECISION audit -- a missing glob loads the rule into EVERY context at launch, a broad one on the first matching file access (nearly every session), so the glob must be the narrowest covering the rule's real subject. Verdicts `OK` / `TOO_BROAD` / `TOO_NARROW` / `DANGLING` / `MISSING` / `CORRECTLY_GLOBAL`; a genuinely repo-wide subject carries none and one is never invented |
| HARD pass B | OBVIOUS-KNOWLEDGE PURGE -- what a competent model already knows is DELETED, not compressed; kept: decisions that invert a default, domain invariants, environment quirks, explicit prohibitions |
| Focus | free text after the scope token: emphasis ordering only, never a filter or batch skip |
| Phase GATHER | parallel read-only agents: change facts + target inventory BY ENUMERATION (`{ENUMERATION_BASH}`), never a hardcoded list |
| Phase SYNC | ONE bounded agent per disjoint batch, ALL spawned in ONE message, each given its files, the change facts and house invariants |
| Phase VERIFY | independent read-only checkers, one per EDITED batch, never its writer: re-verify added/fixed facts in code, prove removed facts gone from REALITY, assert frontmatter/ids/secrets/language |
| Phase SELF-SYNC | updates ITSELF: re-enumerated counts, new batches, sections for memory layers the project gained. Scope DECISIONS (batch table, exclusions) change only on explicit user instruction |
| Phase PROPOSE | new agent / skill assessed against `{PROPOSAL_PRECEDENTS}` and PROPOSED in the report, never auto-created |
| Agents | ALWAYS re-audited against current best practice (`references/agent-audit.md`), not only fact-checked |
| Memory itself | BOTH kinds -- the memory dir and each per-agent store -- are swept as their own disjoint batches under the five rules of the emitted `references/memory-guide.md`: a duplication DELETE carries its quoted proof or the row stays, an event is promoted into a fact or dropped, a store born in a subdirectory is classified LIVE/ORPHAN/UNDECIDED and an orphan salvaged before removal, each store INDEX rewritten LAST |
| Report | chat only, no report file; a run touching only the root CLAUDE.md is INCOMPLETE |

---

## Modes (deterministic -- resolve BEFORE any work)

Canonical verbs, in order: `status | install | upgrade | enable | disable | uninstall | purge`.

Mode tokens match case-insensitively; resolution and ties follow the Prompt contract. "Installed" = `<target>/.claude/skills/memory-sync/` exists.

| Mode | EN keywords | RU keywords | Mutates? |
|------|-------------|-------------|----------|
| `status` | *(empty when installed)*, status, check, show | статус, проверь, покажи | no |
| `install` | install, setup, generate | установи, настрой, сгенерируй | yes |
| `upgrade` | upgrade, refresh, update | обнови, апгрейд | yes |
| `enable` | enable, turn on | включи, верни | yes |
| `disable` | disable, pause, turn off | выключи, отключи, пауза | yes |
| `uninstall` | uninstall, remove | удали, убери | yes |
| `purge` | purge, wipe | вычисти, снеси | yes, destructive |

Removed aliases `init`, `on`, `off`, `setup`, `remove`, `reset`, `create`, `update`, `cleanup`: map them
(`init`/`create` -> `install`, `on` -> `enable`, `off` -> `disable`, `remove`/`reset`/`cleanup` -> `uninstall` or
`purge` -- ASK which), say so in the PLAN block, and never print one as a command.

| Mode | Reads | Writes | Does |
|------|-------|--------|------|
| `status` (**DEFAULT when installed**) | target + emitted skill | NOTHING | Whether the skill exists, its provenance frontmatter (`doc_type` / `version` / `content_version` / `generated_by` / `last_updated` / `surface_files`), and how STALE its tables are: baked `surface_files` count vs now, batches with vanished paths, memory layers gained. Verdict `IN SYNC` / `STALE (n drifts)` / `STALE-LEGACY (n drifts)` (pre-5.0 tail stamp) / `NOT INSTALLED`, prefixed `PARKED - ` when disabled (`INSTALLED=parked`) -- parked and absent are never collapsed |
| `install` (**DEFAULT when not installed**) | target | emits the 5 files | Full Phase 0-5 analysis + emit. Refuses an existing installation |
| `upgrade` | target + emitted skill | Edits the emitted skill | Re-scan and REFRESH (see Mode: upgrade), ALWAYS ending with `generate.sh restamp`. PRESERVE hand-edits -- the emitted skill is EXPECTED to have self-modified (SELF-SYNC). Never blind-overwrite |
| `enable` | target | one rename | `generate.sh enable`: `SKILL.md.disabled` -> `SKILL.md`, so `/memory-sync` is offered again. No stamp or hand-edit changes |
| `disable` | target | one rename | `generate.sh disable`: `SKILL.md` -> `SKILL.md.disabled`. Claude Code discovers a project skill ONLY through `SKILL.md`, so `/memory-sync` leaves the roster while the 4 references and every SELF-SYNC hand-edit stay byte-identical. Deletes nothing |
| `uninstall` | target | deletes the emit manifest | `generate.sh uninstall`: removes exactly what `emit` wrote -- `SKILL.md` (or its parked form) plus the 4 references; user-added files are KEPT and listed, so a removal never destroys a user's own note. Confirmation first |
| `purge` | target | deletes the whole dir | `generate.sh purge`: removes `<target>/.claude/skills/memory-sync/` outright, user-added files included, plus any `.memory-sync-emit.*` staging a crashed emit left under `.claude/skills/`. Confirmation first |

The generator registers no hooks and writes no settings or config: that dir (plus crashed-emit staging) is its whole
footprint.

> `upgrade` NEVER runs `emit` over a live installation: `emit` refuses to overwrite, and its override
> `MEMORY_SYNC_FORCE=1` DESTROYS hand-edits, so it is never the answer to a stale stamp. Upgrade works through
> targeted `Edit` calls plus the metadata-only `generate.sh restamp`.

FIRST step of `status`, and of `upgrade` before it decides what to refresh -- **EXECUTE** using Bash tool:
```bash
bash "${CLAUDE_SKILL_DIR}/scripts/generate.sh" status
```

Its KEY=value block and closing verdict ARE the staleness answer: never re-derive them by hand. `status` reports
that output enriched with your own reads and STOPS. `upgrade` takes the drift list as its refresh worklist.

### Mode: upgrade

> **Scope (normative):** `upgrade` edits only this setup's owned paths: `.claude/skills/memory-sync/`. Any other change (application source, tests, docs, CI, mirrors, `CLAUDE.md`, rules, agents, other setups' files) is a defect to report, never to apply: the drift it finds there is the emitted `/memory-sync`'s job, run later by the user.

**Unattended (`--unattended` anywhere in the prompt; set by `/brewcode:setup-status upgrade`).**
1. A flag, never a mode or name: strip it first. Any resolved mode other than `upgrade` -> no write, `RESULT skipped <id> cv=?->? pending=0 note="not-upgrade"`.
2. No `AskUserQuestion` at all. Every gate in this section takes its decline branch; a declined gate is pending, never applied.
3. A precondition this section would ask about (not installed, parked, custom/wrapped registration, orphan config,
   user-modified managed file, missing tokenizer) -> no write, `RESULT skipped <id> cv=?->? pending=0 note="<reason>"`.
4. Write only what this section already writes. No git commit, push, stash or reset; scratch only in a private `mktemp -d`.
5. Last line, exactly once: `RESULT <ok|partial|skipped|failed> <id> cv=<before>-><after> pending=<n> note="<one line>"`,
   `<id>` = `<plugin>:<skill>` [` scope=<project|global>`|` team=<name>`], `?` = unknown version.

Here `<id>` = `brewdoc:memory-sync-setup`, `cv` = the emitted `SKILL.md`'s `content_version`:
- Step 1 `NOT INSTALLED` or `INSTALLED=parked` -> `skipped` (note `not installed` / `parked`) before the snapshot.
- Step 2: every hand-edited-section replacement is declined (no edit, one pending each); Phase 1.5 is never asked:
  an ambiguous param keeps its installed value, a change that needs the answer is pending. No provenance
  frontmatter (Error Handling) -> additive Edits only, every replacement pending.
- Steps 3 and 4 run whatever is pending: `restamp`, `validate`, the scope gate. `REF DIFFERS:` is never ported:
  healthy on `hard-sync.md`, one pending on any other reference.
- `ok` = pending 0 and all three ✅; `partial` = pending > 0 and all three ✅; `failed` = any of the three ❌.

Refresh against the current repo AND plugin version. Every hand-edit survives: no `emit`, no re-copy of a file
that carries content, the stamp touched only through the metadata-only `restamp`.

1. Run the `status` bash block above. `NOT INSTALLED` -> STOP (see Error Handling). `INSTALLED=parked` -> the
   install is DISABLED, not broken: say so, offer `enable` and STOP. Then snapshot the dirty-file state
   (git repos; elsewhere `SCOPE n/a` and the rule is checked by hand) -- **EXECUTE** using Bash tool:
   ```bash
   ROOT="$(git rev-parse --show-toplevel 2>/dev/null || echo "$PWD")"
   bash "${CLAUDE_SKILL_DIR}/scripts/scope-guard.sh" snapshot "$ROOT" memory-sync-upgrade && echo "OK" || echo "FAILED"
   ```
2. With the drift list as worklist, run Phase 1 (re-scan) -> Phase 3 (targeted `Edit`s): re-enumerate the surface,
   refresh the batch / fact / invariant tables, ADD sections for memory layers the project gained. PRESERVE
   hand-edited sections: before REPLACING one that diverges from the template, show the diff and
   `AskUserQuestion`; declined = no edit, continue.
3. **Restamp -- ALWAYS, whatever `STAMP_FORMAT` said:** it is the only route to a fresh stamp, and Phase 4
   `validate` hard-fails on a stale one.

   **EXECUTE** using Bash tool:
   ```bash
   bash "${CLAUDE_SKILL_DIR}/scripts/generate.sh" restamp && echo "✅ restamp" || echo "❌ restamp FAILED"
   ```

   > **STOP if ❌** -- it never half-writes: the file stays untouched unless the ONLY change is the metadata block.

   It rewrites `version` / `content_version` / `last_updated` / `surface_files` (adds `doc_type` / `generated_by`
   when missing), drops a pre-5.0 tail stamp and a legacy `disable-model-invocation`, and re-copies a
   `references/*.md` ONLY when its sole difference from the plugin source is the release stamp line. Report its
   `RESTAMPED:` / `REMOVED:` / `REF …` lines verbatim. `REF DIFFERS:` is a decision, not a failure -- `hard-sync.md`
   always differs (Phase 3 filled its two BLOCKs): diff against `${CLAUDE_SKILL_DIR}/references/<name>` and port
   real prose changes by hand, never by re-copying over filled tables.
4. Phase 4 `validate`, then the scope gate, then the Phase 5 report. **EXECUTE** using Bash tool:
   ```bash
   ROOT="$(git rev-parse --show-toplevel 2>/dev/null || echo "$PWD")"
   bash "${CLAUDE_SKILL_DIR}/scripts/scope-guard.sh" check "$ROOT" memory-sync-upgrade .claude/skills/memory-sync/ && echo "✅ scope" || echo "❌ FAILED scope"
   ```
   > **STOP if ❌**: every `OUTSIDE <path>` line is a defect of this run, reported by path, never kept or committed.

### Mode: enable / disable

A rename that parks or restores `/memory-sync` without losing a hand-edit; `uninstall` is for removal.

1. Run the `status` bash block above. `NOT INSTALLED` -> report "nothing to {enable|disable}" and STOP.
2. **EXECUTE** using Bash tool (substitute the resolved verb):
   ```bash
   bash "${CLAUDE_SKILL_DIR}/scripts/generate.sh" MODE_HERE && echo "✅ MODE_HERE" || echo "❌ MODE_HERE FAILED"
   ```
3. Report the script's `MOVED:` / `KEPT:` lines verbatim; `✅ already {enabled|disabled}` is a clean no-op.
4. Say the change applies in the current session (Claude Code watches `.claude/skills/`; in bare mode, a new session).

### Mode: uninstall / purge

1. Run the `status` bash block above. `NOT INSTALLED` -> report "nothing to {uninstall|purge}" and STOP.
2. List what is there -- **EXECUTE** using Bash tool:
   ```bash
   ROOT="$(git rev-parse --show-toplevel 2>/dev/null || echo "$PWD")"
   find "$ROOT/.claude/skills/memory-sync" -type f | sort
   ```
3. **ASK** via `AskUserQuestion`, ONCE, naming the real count:
   - `uninstall`: "Delete the 5 emitted files under `<target>/.claude/skills/memory-sync/` (N files present)?
     Hand-edits to them are lost; anything you added yourself is kept."
     Options: **Yes, uninstall** / **Purge instead (deletes the whole dir)** / **Cancel**.
   - `purge`: "Delete `<target>/.claude/skills/memory-sync/` entirely (N files)? Nothing is recoverable."
     Options: **Yes, purge** / **Uninstall instead (keeps files I added)** / **Cancel**.

   Anything but the affirmative -> switch to the other verb or **STOP**; a decline deletes nothing.
4. On confirmation -- **EXECUTE** using Bash tool (substitute the confirmed verb):
   ```bash
   bash "${CLAUDE_SKILL_DIR}/scripts/generate.sh" MODE_HERE && echo "✅ MODE_HERE" || echo "❌ MODE_HERE FAILED"
   ```
5. Report the script's `REMOVED:` / `KEPT:` lines verbatim; a `KEPT:` list after `uninstall` is correct (files
   `emit` never wrote) and the reason to offer `purge`. `/memory-sync` leaves the roster in the current session.

---

## Execution

### Delegation (every Agent this generator spawns AND the fan-out it emits)

One subagent owns one bounded batch (one deliverable, ~<=5 files, ~<=10 steps); larger work splits into N disjoint
tasks spawned in one message, so progress stays observable and correctable.

Every spawn brief carries six labeled fields, since a subagent starts with an empty context: GOAL (task + why), ROLE (owns, must not touch), SCOPE (paths/commands in and out), CONTEXT (done, by whom, in parallel), CONSUMER (who uses the result + its shape), DONE (acceptance + return: verdict first, evidence, bounded; long output to a file, path returned).
A bare one-line task is never enough. When filling `{BATCH_TABLE}` in Phase 3, keep every batch one bounded unit --
split an oversized batch (a 26-agent roster, a 20-file rules dir) into two rows rather than one agent owning half the
surface.

### Phase 0 -- Pre-analysis (read THIS skill's emit material)

Read the emit material under `${CLAUDE_SKILL_DIR}`:

- `references/SKILL.md.template` -- the emitted SKILL.md, with `{PLACEHOLDER}` slots
- `references/memory-guide.md` -- where-does-it-belong decision tree, compression patterns, obvious-vs-domain facts
- `references/agent-audit.md` -- the agent/skill re-audit procedure the emitted skill runs every sweep
- `references/hard-sync.md` -- the two `HARD`-depth deletion passes and their reporting contract; holds TWO of the
  thirteen BLOCK placeholders
- `references/prompting-guide.md` -- the source-verified Claude + OpenAI/Codex prompting-quality rule table applied at
  Phase 2/3; no BLOCK placeholders
- `scripts/generate.sh` -- `scan` / `emit` / `validate` / `restamp` / `status` / `enable` / `disable` / `uninstall` / `purge`

Confirm the working directory is inside the TARGET repo; emitted paths are relative to its root.

> Missing template -> ERROR "missing emit material: `<path>` -- reinstall brewdoc" and STOP. Never improvise a
> template body.

### Phase 1 -- Analyze the TARGET project

**EXECUTE** using Bash tool (project scan):
```bash
bash "${CLAUDE_SKILL_DIR}/scripts/generate.sh" scan && echo "✅ scan" || echo "❌ scan FAILED"
```

Search with Bash `rg`/`find` (native `Grep`/`Glob` are absent in many sessions, e.g. on macOS). From the scan and
your reads, determine:

| Aspect | How to detect | Drives placeholder |
|--------|---------------|--------------------|
| **Memory surface** | files in the user-authorized scope: root `CLAUDE.md`, EVERY nested `**/CLAUDE.md` at ANY depth, `CLAUDE.local.md`, `.claude/rules/**/*.md` (recursive; unscoped rules load at launch, `paths:` rules when Claude reads, writes or edits a matching file, incl. a single-file `cat`/`head` in Bash), conventions (`.claude/convention/**`, `CONVENTIONS.md`, `CONTRIBUTING.md`), the `AGENTS.md` family (loaded by Claude Code only per the **Project instructions** setting: default `claude-md-or-agents-md` reads it only where no `CLAUDE.md`/`CLAUDE.local.md` exists), `.claude/agents/**`, `.claude/skills/**`, and BOTH memory kinds (next two rows). Inventoried does not mean always loaded; honor explicit scope narrowing | `{BATCH_TABLE}`, `{SURFACE_COUNTS}`, `{ENUMERATION_BASH}` |
| **VERIFY-ONLY surfaces** | `AGENTS.md` that is a SYMLINK into a projection dir (`.codex/**`) or sits inside vendor markers (`<!-- BEGIN:... -->`); any file another tool owns. Refs checked for RESOLUTION, content NEVER edited | `{BATCH_TABLE}` (VERIFY-ONLY column) |
| **Memory dir** | `autoMemoryDirectory` in `.claude/settings*.json`, else `${CLAUDE_CONFIG_DIR:-~/.claude}/projects/<hash>/memory/` (active profile); in scope only on user confirmation (Phase 1.5) | `{MEMORY_DIR}` |
| **Per-agent memory stores** | one store per agent, loaded only while its agent runs. ENUMERATE them (`find` / `ls` over the memory root and any configured per-agent store dir), never a hardcoded roster; note each store's INDEX file apart from its rows. Per-agent memory resolves against the session CWD, so a store is born wherever a session ran: RECORD the plausible session roots (task workspaces, module roots, anything a session would `cd` into) against the runtime/archived trees of the EXCLUDED table -- the emitted live/orphan call depends on it (`references/memory-guide.md` rule 5). Stores can exist while `{MEMORY_DIR}` is `none` | `{BATCH_TABLE}`, `{ENUMERATION_BASH}` |
| **Exclusions** | `docs/**` (separate doc flow -- refs INTO it resolution-checked, contents never edited), ALL source code (read-only evidence), secrets dirs, task-board / operational state (`.claude/features/**`), build output, git-ignored scratch, run-artifact snapshots (`.claude/reports/**`), worktree checkouts (`.claude/worktrees/**`) | `{EXCLUDED_TABLE}` |
| **Cited outside references** | git-TRACKED paths OUTSIDE the instruction tree that an ALWAYS-LOADED instruction file (no `paths:` gate) names and tells its reader to open. REACH-GATED, never excluded: editable only at `{REACH}` = `REFS`, resolution-checked at the `MEMORY` default; the emitted skill re-enumerates them per run | `{ENUMERATION_BASH}`, `{VERIFY_EXTRA}` |
| **Default branch** | DERIVE: `git symbolic-ref --short refs/remotes/origin/HEAD`, else the branch CI checks out. NEVER hardcode `main`: repos promote from `staging`/`develop` too | `{DEFAULT_BRANCH}` |
| **Git visibility** | `git ls-files -- .claude '*CLAUDE.md' '*AGENTS.md'` vs the same surface ON DISK, plus the `.gitignore` rules behind it. `git-ignored` OR `mixed` (some rows tracked, some not) -> `git status`/`git diff` can NEVER account for every memory edit, so VERIFY re-reads files directly | `{GIT_VISIBILITY}`, `{VERIFY_EXTRA}` |
| **Language policy** | which files legitimately carry non-English trigger aliases (agent/skill `description:`, mode-routing tables, `CLAUDE.local.md`) and which are English-only; stripping an intentional alias is a regression | `{LANGUAGE_POLICY}` |
| **Frontmatter conventions** | which of `last_updated`, `doc_type`, `paths:` globs, `[DICT: ...]` headers are in use, and WHERE each belongs. In a rule Claude Code reads only `paths:`; other keys are house stamps | `{INVARIANTS_TABLE}` |
| **`paths:` precision** | `scan` prints `path :: lines :: paths:` per rule. Per rule: name its real subject in one phrase, derive the narrowest covering glob, compare with the declared one, and resolve it with BOTH probes of `references/hard-sync.md` -- `git ls-files -- ':(glob)<glob>'` (plain git `*` crosses `/`, so a broken glob still "matches") AND a filesystem `find` (`git ls-files` returns 0 rows for a git-ignored `.claude/`). `DANGLING` only when BOTH are empty. Verdict: `OK` / `TOO_BROAD` / `TOO_NARROW` / `DANGLING` / `MISSING` / `CORRECTLY_GLOBAL` | `{PATHS_PRECISION_TABLE}` |
| **Obvious vs domain** | HARVEST real pairs from the target's OWN rules and conventions: a line any competent model already knows (generic craft advice, restated tool docs, textbook pattern definitions) next to a domain fact in the same file that only makes sense because someone HERE decided it. Real quotes, never invented | `{OBVIOUS_VS_DOMAIN_TABLE}` |
| **Stable numbered ids** | rule files whose rows carry stable numbers, and who cites them POSITIONALLY (a reorder silently repoints every citation). Counted per run, never baked | `{INVARIANTS_TABLE}` |
| **Reacting hooks** | `docsync-*.mjs` (installed by `/brewdoc:docsync-setup`) or other hooks firing on memory edits (`.claude/settings.json`, `.claude/hooks/**`), their config and threshold. Edits WILL trigger them, as expected; hook files are never edited | `{INVARIANTS_TABLE}`, `{TRACKER_NOTE}` |
| **Checkable-fact catalogue** | the CONCRETE claims memory makes and the EXACT shell command verifying each: layer paths, build-tool aliases, lint rule names, scripts, version pins, env-var NAMES (never values), routes/endpoints, migrations/tables, test tiers + gates, CI gates | `{FACT_CATALOGUE}` |
| **Agent roster** | `.claude/agents/**/*.md` at ANY depth (Claude Code scans subfolders such as `agents/review/`) -- name, description, tools, owned path group; read-only recon agents flagged as non-builders | `{EXPERT_ROSTER_TABLE}`, `{AGENT_CHECKS_TABLE}` |
| **Runtime workflow seats** | agents a PROGRAM spawns rather than a human routing by keyword. Search the callers (`.claude/workflows/*.js`, orchestrator scripts, skills) for `subagent_type`, `agent(` or an agent's own name. Record seat -> agent file -> call sites as `file:line` -> constant blocks the caller interpolates into the prompt | `{RUNTIME_SEAT_ROSTER}` |
| **Skill roster** | `.claude/skills/**/*.md` -- SKILL.md + every `references/*.md`; which modes each body implements | `{SKILL_CHECKS_TABLE}` |
| **Task tracker** | `.claude/features/**` board, an issue tracker, a task rule -- so the emitted skill EXCLUDES operational state and names its owner | `{TRACKER_NOTE}` |
| **Proposal precedents** | the agents and skills this repo already created and WHY -- the bar a new one must clear | `{PROPOSAL_PRECEDENTS}` |

### Phase 1.5 -- Clarify genuinely ambiguous params (AskUserQuestion)

Ask only what you cannot reliably infer, in one `AskUserQuestion` (max 4 questions; pick those that change what gets
written). Never guess a non-obvious choice. Candidates:

- **Which convention files count as memory** -- `CONTRIBUTING.md` / `CONVENTIONS.md` may be human docs or LLM
  instructions.
- **Is the memory dir in scope** -- both answers are legitimate; out of scope -> `{MEMORY_DIR}` = literal `none`.
  The PER-AGENT stores are asked SEPARATELY - `none` for the dir never drops them.
- **Which surfaces are VERIFY-ONLY** -- confirm the symlinked / vendor-marked / doc-owned list.
- **Which cited outside references count** -- `REFS`-reach only; resolution-checked at the default reach.
- **The default branch**, whenever derivation is ambiguous or the repo promotes from a non-default branch.
- **Are the non-English trigger aliases intentional** -- if yes they are NEVER stripped, and `{LANGUAGE_POLICY}`
  names the carriers.
- **Batch split** when one enumerated group is too big for one bounded unit.

> Weave the fine-tune prompt into the emitted focus ordering (e.g. "always check version pins first") and record it
> in `{FOCUS_EMPHASIS}`. Facts stay ahead of dedup and compression: the order may be sharpened, never inverted.

### Phase 2 -- Emit (scalar substitution)

Export the SCALAR values (single-line), then emit:

```bash
export PROJECT_NAME="<repo name>"
export DEFAULT_BRANCH="<derived default branch, e.g. staging>"
export MEMORY_DIR="<resolved memory dir | none>"
export GIT_VISIBILITY="<e.g. 'entire surface git-ignored (.gitignore:12-15) -- diffs never show memory edits' | 'mixed (12 tracked, 4 untracked) -- re-read directly' | 'tracked'>"
export LANGUAGE_POLICY="<e.g. 'English everywhere; RU trigger aliases legal in .claude/agents/** + .claude/skills/** + CLAUDE.local.md'>"
export FOCUS_EMPHASIS="<fine-tune emphasis | 'default ordering: facts > dedup > compression'>"
export SURFACE_COUNTS="<the SURFACE_COUNTS= line scan printed, verbatim>"
export TRACKER_NOTE="<e.g. '.claude/features/** owned by task-tracker + .claude/rules/tasks.md -- excluded' | 'no tracker'>"
```

**EXECUTE** using Bash tool:
```bash
bash "${CLAUDE_SKILL_DIR}/scripts/generate.sh" emit && echo "✅ emit" || echo "❌ emit FAILED"
```

> **STOP if ❌** -- check that `references/SKILL.md.template` exists and the target `.claude/` is writable. Over an
> existing installation `emit` refuses by design: use `upgrade`.

`emit` writes the five OUTPUT files and appends six provenance keys before the closing `---` of the emitted
frontmatter: `doc_type: llm` (bare enum), then quoted `version` (brewdoc plugin version, self-located from
`brewdoc/.claude-plugin/plugin.json`, never hardcoded), `content_version` (this generator's last-changed release,
from its own stamp line), `generated_by: "brewdoc:memory-sync-setup"`, `last_updated` (emit date) and
`surface_files` (e.g. `"38 files: 3 root, 5 nested CLAUDE.md, ..."`). `status`, `validate` and `upgrade` read
them; `status` compares the leading integer of `surface_files` against a live re-count. `surface_files` is always the
script's own count (`emit` and `restamp` re-derive it; an exported `SURFACE_COUNTS` fills only the body), and every
count prunes `.claude/reports/**` and `.claude/worktrees/**`: snapshots and checkouts, never memory.

> `disable-model-invocation` MUST NOT be set on the emitted skill: plain-prose invocation ("память устарела",
> "sync memory") is a first-class path beside `/memory-sync [scope]`. `generate.sh restamp` strips it from legacy
> installs; `validate` fails on a survivor.

### Phase 3 -- Fill the BLOCK placeholders (AI Edit)

With `Edit`, replace every block placeholder in the EMITTED files with content built from Phase 1. THIRTEEN
blocks: eleven in the emitted `SKILL.md`, two in the emitted `references/hard-sync.md`; `validate` fails on each
one left, so a partial fill cannot pass.

| Block | In | Must contain |
|-------|----|--------------|
| `{BATCH_TABLE}` | SKILL.md | one row per DISJOINT batch: id, concrete files, which are VERIFY-ONLY and why. Overlapping batches are a defect: disjointness is the collision guarantee |
| `{EXCLUDED_TABLE}` | SKILL.md | one row per exclusion WITH its reason, else it is re-litigated every run |
| `{INVARIANTS_TABLE}` | SKILL.md | frontmatter contract, `paths:` glob validation, language policy, doc style, stable numbered ids + positional citers, reacting hooks. Every cell a FACT read from the repo, source named |
| `{FACT_CATALOGUE}` | SKILL.md | `\| claim \| how to verify \|` rows: a real one-line command, plus today's expected answer when short |
| `{ENUMERATION_BASH}` | SKILL.md | ONE fenced bash block re-deriving each batch's file list (`ls`, `find ... -name '*.md' \| sort`, `git ls-files`): counts rot, enumeration does not |
| `{AGENT_CHECKS_TABLE}` | SKILL.md | agent-batch checks: `name:` vs filename, description + triggers, `tools:` minimality, ownership globs resolve, MCP prefixes name configured servers, handoff pointers name agents that EXIST |
| `{SKILL_CHECKS_TABLE}` | SKILL.md | skill-batch checks: `name:` vs directory, one-line action-first `description:`, `allowed-tools:` matches actual use, `argument-hint:` matches implemented modes, every cited reference exists AND every existing reference is cited |
| `{EXPERT_ROSTER_TABLE}` | SKILL.md | live roster: agent -> owned path group -> specialty, recon agents read-only; drives batch ownership and the re-audit |
| `{RUNTIME_SEAT_ROSTER}` | SKILL.md | one row per seat a PROGRAM spawns: agent file, every call site as `file:line`, the constant blocks spliced into its prompt. No such caller -> the single literal row `none -- no program spawns an agent here` |
| `{PROPOSAL_PRECEDENTS}` | SKILL.md | `\| propose \| bar \| precedents \|` -- the bar a new agent/skill must clear HERE, naming this repo's precedents |
| `{VERIFY_EXTRA}` | SKILL.md | project-specific VERIFY assertions: the Phase 1 git-visibility assertion, secret-value scan, language scan with its allowed hits, id-sequence diff |
| `{PATHS_PRECISION_TABLE}` | hard-sync.md | ONE row per rule file: `\| rule file \| current paths: \| verdict \| narrowest correct glob \|` from Phase 1. Every derived glob RESOLVES today; a repo-wide subject is `CORRECTLY_GLOBAL` with an empty glob cell, never an invented one |
| `{OBVIOUS_VS_DOMAIN_TABLE}` | hard-sync.md | `\| generic knowledge (DELETE) \| domain fact worth keeping (KEEP) \|`, REAL lines from this target's own rules and conventions: the emitted purge calibrates on them, so invented ones teach nothing |

> Every emitted row points at a REAL path, command and agent (`.claude/agents/` or a built-in
> `Explore`/`Plan`/`general-purpose`). Do NOT invent agents, files or commands.

Then add the target's other frontmatter convention keys to the emitted `SKILL.md` via `Edit`: the emitted body
bumps them in every file it edits and VERIFY asserts the bump. `emit` already wrote `doc_type` and `last_updated`
-- never add them twice; add only further doc-convention keys found in Phase 1 (`{INVARIANTS_TABLE}`). None -> skip.

### Phase 4 -- Validate

**EXECUTE** using Bash tool:
```bash
bash "${CLAUDE_SKILL_DIR}/scripts/generate.sh" validate && echo "✅ validate" || echo "❌ validate FAILED"
```

> **STOP if ❌** -- `validate` fails on a surviving `{PLACEHOLDER}`, a missing emitted asset, a cited
> `references/*.md` that does not exist, or provenance frontmatter that is missing or a version behind. Fix
> placeholders / references via `Edit`, a stamp via `generate.sh restamp` (never `emit` or `MEMORY_SYNC_FORCE=1`),
> then re-run.

Then assert by hand, since `validate` cannot resolve agent names: every agent the emitted skill spawns resolves to a
real `<target>/.claude/agents/**/*.md` or a built-in (`Explore` / `Plan` / `general-purpose`); an invented
`subagent_type` breaks the emitted skill at its first run.

### Phase 5 -- Report

```
memory-sync generated -> <target>/.claude/skills/memory-sync/

Surface:    {SURFACE_COUNTS}
Batches:    {N}  ({batch -> file count}, disjoint)
VERIFY-ONLY:{list + reason, or none}
Excluded:   {list + reason}
Facts:      {N} checkable-fact rows, each with a runnable verification command
Invariants: {N} enforced per batch
Roster:     {N} agents / {N} skills re-audited every sweep
Runtime seats: {N} seats / {M} call sites  (or "none")
Branch:     {DEFAULT_BRANCH}   Git visibility: {GIT_VISIBILITY}
Memory dir: {MEMORY_DIR}   Per-agent stores: {N} stores / {M} rows (none -> "none")
Reach:      MEMORY default; REFS opt-in per run
Language:   {LANGUAGE_POLICY}
Emphasis:   {FOCUS_EMPHASIS}
HARD depth: {N} rules audited for paths: precision ({N} TOO_BROAD / {N} DANGLING / ...), {N} obvious-vs-domain
            pairs harvested from this repo

Files written:
- .claude/skills/memory-sync/SKILL.md
- .claude/skills/memory-sync/references/memory-guide.md
- .claude/skills/memory-sync/references/agent-audit.md
- .claude/skills/memory-sync/references/hard-sync.md
- .claude/skills/memory-sync/references/prompting-guide.md

Run it:  /memory-sync                       -> scope session (default), depth NORMAL, whole surface
         /memory-sync all "only rules"      -> user-narrowed scope: re-verify only rules, recursively
         /memory-sync branch                -> facts from the branch diff vs {DEFAULT_BRANCH}
         /memory-sync all hard              -> + paths: precision audit + obvious-knowledge purge

Later:   /brewdoc:memory-sync-setup status   -> is the emitted skill still true to the repo
         /brewdoc:memory-sync-setup upgrade  -> refresh its tables, keep hand-edits
```

Name the exclusions: a user expecting `docs/**` to be synced learns it is owned elsewhere. Claude Code watches
`.claude/skills/`, so `/memory-sync` is offered in this session; if that dir did not exist at session start, tell
the user to run `/reload-skills` first.

---

## Placeholders

Shared verbatim with the templates and `generate.sh`: never rename, add or drop one. A name here that the templates
never emit, or a template token missing here, is a defect.

**SCALARS** -- substituted by `generate.sh emit` from environment variables of the SAME name, single-line values.

| Placeholder | Value |
|-------------|-------|
| `{PROJECT_NAME}` | repo name (basename of the target root) |
| `{DEFAULT_BRANCH}` | derived default branch |
| `{MEMORY_DIR}` | resolved memory dir, or literal `none` |
| `{GIT_VISIBILITY}` | surface git-tracked, git-ignored or mixed, and what that implies for VERIFY |
| `{LANGUAGE_POLICY}` | English-only surface vs intentional non-English trigger aliases |
| `{FOCUS_EMPHASIS}` | the fine-tune emphasis, or the default ordering |
| `{SURFACE_COUNTS}` | total + per-batch file counts at generation (a snapshot; the emitted skill re-enumerates) |
| `{TRACKER_NOTE}` | owner of operational task state, which is excluded |

**BLOCKS** -- the thirteen in the Phase 3 table (the single list), filled by the AI via `Edit`; `generate.sh` never
touches them.

> RUNTIME tokens -- `{SCOPE}`, `{FOCUS}`, `{DEPTH}`, `{REACH}`, `{BATCH}`, `{FILE_LIST}`, `{FACTS}`,
> `{BROKEN_REFS}`, `{DATE}`, `{N}`, `{M}`, `{K}` -- are resolved per RUN by the emitted skill and MUST remain in it;
> `validate` allow-lists them (`RUNTIME_ALLOW` in `generate.sh`; the two lists match exactly).

---

## Error Handling

| Condition | Action |
|-----------|--------|
| `install` but `<target>/.claude/skills/memory-sync/` already exists | STOP. "memory-sync already installed. Use `upgrade` to refresh it, or `status` to see its drift." Never overwrite |
| `upgrade` but nothing installed | STOP. "Nothing to upgrade -- run `/brewdoc:memory-sync-setup install` to generate it first" |
| `uninstall`/`purge` but nothing installed | The script prints `⚠️ nothing to {uninstall\|purge}`, exit 0. Report it; never `rm -rf` by hand |
| `enable`/`disable` but nothing installed | The script exits 1 with `❌ FAILED: not installed`. Report and STOP; never emit a fresh install as the "fix" |
| `enable` on a live install, `disable` on a parked one | The script prints `✅ already {enabled\|disabled}`, exit 0. Report and STOP |
| `validate` or `status` on a DISABLED install | `status` reports `INSTALLED=parked` / `PARKED=yes` / `NOTE_PARKED=…`, verdict prefixed `PARKED - `, staleness still computed from the parked file. `validate` FAILS (finds only `SKILL.md.disabled`) -- the toggle working. Say "disabled, not missing", offer `enable`; never re-`emit`, which destroys the parked SELF-SYNC hand-edits |
| `restamp` on a parked install | Refuses with `❌ FAILED: memory-sync is PARKED at …`, exit 1, writes nothing. `enable` first, then restamp |
| No provenance frontmatter in the installed skill | Treat as hand-written: `status` reports `STAMP_FORMAT=none` + `META_*=UNSTAMPED`; `upgrade` is additive-only and asks before every replacement |
| Installed skill carries the pre-5.0 TAIL stamp (`<!-- memory-sync template v… -->`) | `status`: `STAMP_FORMAT=legacy`, `NOTE_LEGACY=…`, `VERDICT=STALE-LEGACY`; `validate` FAILS. `restamp` (last step of every `upgrade`) migrates it: six frontmatter keys written, tail line deleted, `STAMP_FORMAT` then `frontmatter`. Report the migration; never hand-`Edit` the stamp |
| `validate` fails with `stamped version … != plugin version …` | A plugin version behind: `generate.sh restamp`, then re-run `validate` |
| `validate` reports a missing `references/*.md` while `SKILL.md` is present | `generate.sh restamp` re-copies a MISSING reference from the plugin and reports `REF RESTORED:` (`emit` refuses over a live install) |
| Target has no `.claude/agents/` | Emit anyway: `{EXPERT_ROSTER_TABLE}` = `none -- batches owned by general-purpose`, no agent batch in `{BATCH_TABLE}`, re-audit covers the skill roster only |
| Target has no program that spawns agents | `{RUNTIME_SEAT_ROSTER}` gets the single `none` row and the emitted `Runtime workflow seats` section (~26 lines) STAYS: the repo may gain a workflow later |
| Target has no `.claude/rules/` or conventions | Emit the batches that DO exist; none points at a missing dir |
| Only a root CLAUDE.md exists | Emit a single-batch skill and say so; never invent a batch |
| Memory dir not resolvable | `MEMORY_DIR="none"`; the emitted skill skips that batch and says why |
| A per-agent store whose reachability cannot be decided | UNDECIDED is a legitimate verdict: the emitted skill SWEEPS and REPORTS it, NEVER removes it, and the orphan test is never widened to cover it -- an unswept store costs disk, a wrongly deleted one knowledge (`references/memory-guide.md` rule 5) |
| A fact has no verification command that runs in this repo today | Leave it OUT of `{FACT_CATALOGUE}`, list it as unverifiable in the Phase 5 report: a command for a missing manifest or dir reports `not run` forever |
| Target `.claude/` not writable | STOP -- ask the user to run from the repo root |
| Asked to make the generator sync memory itself | Refuse: this skill emits, the emitted skill syncs |
