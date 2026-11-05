---
description: Detailed description of all brewdoc plugin commands
---

# Brewdoc Plugin Commands

> **Version:** 6.12.5 | **Author:** Maksim Kochetkov | **License:** MIT

## Quick Reference

All 5 brewdoc skills are documented below, one section each.

| # | Command | Purpose | Model | Args |
|---|---------|---------|-------|------|
| 1 | `/brewdoc:my-claude` | Generate docs about Claude Code installation and environment; `refresh` regenerates stale guides | opus | `[prompt] [ext [context]] \| [r <query>] \| [refresh]` |
| 2 | `/brewdoc:memory-sync-setup` | Generate a project-tailored `/memory-sync` skill into the target repo | opus | `[prompt] [status\|install\|upgrade\|enable\|disable\|uninstall\|purge] [fine-tune-prompt]` |
| 3 | `/brewdoc:docsync-setup` | Install project-local doc-staleness tracking hooks; report/force sync | sonnet | `[prompt] [status\|install\|upgrade\|enable\|disable\|uninstall\|purge] [sync [--all]\|reread\|frontmatter] \| free-text` |
| 4 | `/brewdoc:md-to-pdf` | Convert Markdown to PDF via reportlab or weasyprint | sonnet | `[prompt] <file.md> [--engine name] ["prompt"] \| styles \| test` |
| 5 | `/brewdoc:publish` | Publish text/markdown/file/site to brewpage.app, returns URL | haiku | `[prompt] <text\|file_path\|directory_path\|zip_path> [--ttl N] [--entry filename] [--delivery-mode path\|subdomain]` |

### Naming and modes

A `-setup` suffix marks a skill that installs a mechanism -- afterwards you use the installed hooks or the generated skill, not the setup skill. Recurring tools keep bare names.

Setup skills share one verb vocabulary, in this order: `status | install | upgrade | enable | disable | uninstall | purge`. No argument = `status` if installed, `install` if not. Skill-specific extras come after the canonical verb. Both brewdoc setup skills implement `enable`/`disable` -- `docsync-setup` flips the `enabled` key in `.claude/docsync/config.json` (and refreshes its provenance stamp on that write), `memory-sync-setup` renames `SKILL.md` <-> `SKILL.md.disabled` -- and both implement `purge`; the per-command Args column is authoritative.

Every brewdoc skill except `/brewdoc:publish` carries `disable-model-invocation: true`: Claude never fires those on its own, you type the command. `/brewdoc:publish` is `disable-model-invocation: false`, so Claude can also run it mid-task to share a link. `/brewcode:setup-status` reports what is installed, stale or missing across all plugins.

---

## 1. `/brewdoc:my-claude`

**Purpose:** Documents your Claude Code installation. Output goes to `.claude/brewdoc/my-claude/` in the current project, tracked in `.claude/brewdoc/INDEX.jsonl`. An existing entry for the same mode triggers an update offer (version bump); `refresh` takes the "update" answer itself and asks nothing.

| Parameter | Value |
|-----------|-------|
| **Arguments** | `[prompt] [ext [context]] \| [r <query>] \| [refresh]` |
| **Model** | `opus` |
| **Allowed tools** | `Read`, `Glob`, `Grep`, `Bash`, `Agent`, `WebFetch`, `WebSearch`, `AskUserQuestion` |

| Arguments | Mode | Output file |
|-----------|------|-------------|
| *(empty)* | INTERNAL: local setup inventory (active config dir `CLAUDE_CONFIG_DIR`, default `~/.claude`; project `CLAUDE.md`, rules, memory; installed plugins and mods) | `.claude/brewdoc/my-claude/YYYYMMDD_my-claude-internal.md` |
| `ext` or `external` | EXTERNAL: hook/context/agent architecture from official sources | `.claude/brewdoc/my-claude/YYYYMMDD_my-claude-external.md` |
| `ext context` | EXTERNAL context-schema (`additionalContext`, `updatedInput`) | `.claude/brewdoc/my-claude/external/YYYYMMDD_context-schema.md` |
| `r <query>` or `research <query>` | RESEARCH: query split into 2-5 source groups | `.claude/brewdoc/my-claude/YYYYMMDD_research-{slug}.md` |
| `refresh` (keywords `update`, `regenerate`; other words name research slugs to include) | REFRESH: regenerates every guide whose `version` is below the installed brewdoc; no question asked | a new dated file per stale guide, same names as above |

**Workflow:** load the mode reference (`references/internal-mode.md` or `external-mode.md`), gather in parallel (INTERNAL: 3 `Explore` agents for global config, project config, memory; EXTERNAL and RESEARCH: `general-purpose` agents per source group, RESEARCH keeps a source URL per fact), write the document, then an independent read-only agent re-checks it (paths exist, counts match, sources hold), its fixes are applied and the INDEX entry is added.

**Plugins and mods:** the INTERNAL guide adds a `## Plugins and mods` table from `claude plugin list --json` (mods first, `brewmod-placeholders` first) and ends with `## Keeping this current`, the four update commands. Details: [my-claude README](../skills/my-claude/README.md#output).

**Refresh:** `refresh` regenerates each guide whose provenance `version` is below the installed brewdoc into a new dated file, leaves current guides alone and asks nothing. Scan results and report format: [my-claude README](../skills/my-claude/README.md#refresh).

```
/brewdoc:my-claude
/brewdoc:my-claude ext context
/brewdoc:my-claude r "how do PreToolUse hooks modify agent prompts"
/brewdoc:my-claude refresh
/brewdoc:my-claude refresh hooks   # also refreshes research/hooks
```

---

## 2. `/brewdoc:memory-sync-setup`

**Purpose:** GENERATOR. Analyzes the target project and writes a self-contained `.claude/skills/memory-sync/` into that repo; it never syncs memory itself. The emitted skill keeps everything AUTO-LOADED into context truthful against the code; documentation is out of scope.

| Parameter | Value |
|-----------|-------|
| **Arguments** | `[prompt] [status\|install\|upgrade\|enable\|disable\|uninstall\|purge] [fine-tune-prompt]` |
| **Model** | `opus` |
| **Allowed tools** | `Read`, `Edit`, `Glob`, `Grep`, `Bash`, `Agent`, `AskUserQuestion` |
| **Model invocation** | `disable-model-invocation: true` -- user-invoked only |

| Mode | Writes | Does |
|------|--------|------|
| `status` (default when installed) | nothing | Reports provenance frontmatter and surface-table drift: `IN SYNC` / `STALE (n drifts)` / `STALE-LEGACY (n drifts)` (pre-5.0 stamp, run `upgrade`) / `NOT INSTALLED`, prefixed `PARKED - ` when disabled |
| `install` (default when not installed) | `SKILL.md` + `references/memory-guide.md`, `agent-audit.md`, `hard-sync.md`, `prompting-guide.md` | Full analysis and emit; refuses an existing installation |
| `upgrade` | targeted edits + restamp | Re-scans; hand-edits preserved |
| `enable` / `disable` | renames `SKILL.md.disabled` <-> `SKILL.md` | Parks or restores `/memory-sync`; references and hand-edits stay byte-identical |
| `uninstall` | deletes what `emit` wrote | After confirmation; user-added files kept and listed |
| `purge` | deletes `.claude/skills/memory-sync/` | Everything including user-added files; confirmation first |

**Emitted surface:** root and nested `CLAUDE.md` (any depth), `CLAUDE.local.md`, `.claude/rules/*.md`, `CONVENTIONS.md`, `CONTRIBUTING.md`, `@path` imports, `AGENTS.md` (any depth), `.claude/agents/*.md`, `.claude/skills/*/SKILL.md` + references, `$MEMORY_DIR/*.md` (`autoMemoryDirectory`, else `~/.claude/projects/<hash>/memory/`). Excluded: `docs/**`, source code (read-only evidence), secrets, task-board state, build output.

**Emitted behaviour:** scopes `session` (default) / `branch` / `commit <sha>` / `recent[:N]` / `all`, plus a `hard` depth (rules `paths:` precision audit, obvious-knowledge purge); parallel read-only GATHER, then SYNC per disjoint batch, then VERIFY by independent checkers; agents re-audited against current best practice each run; non-growth (each file `<=` its original line count, total delta `<= 0`); SELF-SYNC refreshes its own surface tables.

```
/brewdoc:memory-sync-setup install "weight stale-fact removal over compression"
/brewdoc:memory-sync-setup status
```

Then, inside that project: `/memory-sync`, `/memory-sync branch`, `/memory-sync all hard "only rules"`.

---

## 3. `/brewdoc:docsync-setup`

**Purpose:** Installs three project-local hooks that log which `.md` docs are edited and read, then block once per ask when an edited doc is stale by date. Source of truth is each doc's own `last_updated` frontmatter (date only, local time). Runs in the main conversation (`AskUserQuestion`), no `context: fork`.

| Parameter | Value |
|-----------|-------|
| **Arguments** | `[prompt] [status\|install\|upgrade\|enable\|disable\|uninstall\|purge] [sync [--all]\|reread\|frontmatter] \| free-text` |
| **Model** | `sonnet` |
| **Allowed tools** | `Read`, `Write`, `Edit`, `Bash`, `Glob`, `Grep`, `AskUserQuestion` |
| **Model invocation** | `disable-model-invocation: true` -- user-invoked only |

| Mode | Writes | Does |
|------|--------|------|
| `status` (default when installed) | nothing | Tracked docs, staleness, docs edited and read this session |
| `install` (default when not installed) | `docsync-{track,watch,gate}.mjs` in `.claude/hooks/`, `.claude/docsync/config.json` | Asks threshold (7/14/30/other days) and exclude globs; merges `settings.json` in one transaction (foreign hooks kept, rolled back on failure, `settings.json.lock` held) |
| `upgrade` | hooks, settings entries, `config.json` provenance keys | Re-copies the hooks, re-registers missing ones; `enabled`, `threshold_days`, `exclude` and session logs preserved |
| `enable` / `disable` | `config.json`: `enabled` + provenance refresh | Live, no restart; hooks stay registered but no-op when disabled (an absent `enabled` key counts as `true`) |
| `uninstall` | hooks + `settings.json` entries | Removes only the 3 docsync entries; `.claude/docsync/` kept for a later `install` |
| `purge` | `uninstall` + deletes `.claude/docsync/` | Destructive: hooks, registration, config and state |

| Extra | Does |
|-------|------|
| `sync [--all]` | Refreshes `last_updated` of stale docs (every in-scope doc with `--all`) after confirmation; follows each doc's `sync_procedure`; compression by `doc_type` (`llm` deep, `user` light) |
| `reread` | Forces a re-read of tracked docs |
| `frontmatter` | Opt-in retro-add of `doc_type`/`last_updated`/`sync_procedure`; never runs at `install` |

```yaml
---
doc_type: llm                  # optional, UNQUOTED; llm | user | skip (absent = user)
last_updated: "2026-07-19"     # sole staleness input (YYYY-MM-DD, LOCAL time)
sync_procedure: "what to check when syncing"   # optional prose, no hook reads it
---
```

`doc_type: skip` excludes a file from all three hooks. `CLAUDE.md`, `CLAUDE.local.md` and `AGENTS.md` (any depth) are never tracked, nudged or gated. Staleness in whole local days: the Stop gate compares `last_updated` with the file's modification day, `status` and `sync` with today (`> threshold_days`).

```
/brewdoc:docsync-setup install
/brewdoc:docsync-setup sync --all
```

---

## 4. `/brewdoc:md-to-pdf`

**Purpose:** Converts Markdown to PDF with reportlab or weasyprint. Detects missing dependencies and offers to install them; saves engine and style as project or global config.

| Parameter | Value |
|-----------|-------|
| **Arguments** | `[prompt] <file.md> [--engine name] ["prompt"] \| styles \| test \| (no args = help)` |
| **Model** | `sonnet` |
| **Allowed tools** | `Read`, `Write`, `Edit`, `Bash`, `Glob`, `Grep`, `AskUserQuestion` |

| Mode | Trigger | Does |
|------|---------|------|
| HELP | empty or `help` | Prints usage |
| STYLES | `styles` or `config` | Asks page size, colours, code theme, footer; saves `.claude/md-to-pdf.config.json` |
| TEST | `test` | Converts the bundled `test/test-all-elements.md` |
| CONVERT | `<file.md>` | Converts with the saved or flagged engine |
| CONVERT+PROMPT | `<file.md> "prompt"` | Applies LLM edits to a temp copy, converts, deletes the copy |

reportlab: pip only, good quality, no CSS. weasyprint: pip + brew, excellent quality, CSS and Pygments code highlight.

```
/brewdoc:md-to-pdf report.md --engine weasyprint
```

---

## 5. `/brewdoc:publish`

**Purpose:** Publishes text, Markdown, a file, a directory or a ZIP to brewpage.app and returns the shareable URL. Asks for a namespace and optional local password-file path; saves the owner token and returned owner metadata to project-root `.claude/brewpage-history.md`.

| Parameter | Value |
|-----------|-------|
| **Arguments** | `[prompt] <text\|file_path\|directory_path\|zip_path> [--ttl N] [--entry filename] [--delivery-mode path\|subdomain]` |
| **Model** | `haiku` |
| **Dependencies** | `curl`, `jq`; Node.js and `unzip` for SITE; `zip` for directory packaging |
| **Model invocation** | `disable-model-invocation: false` -- Claude may run it mid-task to share a link; pre-approve with `Skill(brewdoc:publish *)` (required headless/`dontAsk`) |
| **Allowed tools** | `Read`, `Bash(bash ${CLAUDE_SKILL_DIR}/scripts/brewpage-run.sh *)`, `AskUserQuestion`, `Glob` -- every step is one `brewpage-run.sh` command |

| Input | Type | API |
|-------|------|-----|
| Directory or `.zip` | SITE | `POST /api/sites` |
| `.md`/`.markdown` file | MARKDOWN | `POST /api/html?format=markdown` |
| Any other existing file | FILE | `POST /api/files` |
| Starts with `{` or `[` | JSON | `POST /api/json` |
| Anything else | HTML | `POST /api/html` |

| Flag | Default | Does |
|------|---------|------|
| `--ttl N` | `15` days | Time to live |
| `--entry filename` | auto-detect | SITE entry: flag > root `index.html` > shallowest `.html` (ties: name order) |
| `--delivery-mode path\|subdomain` | server default | Sent only as `X-Delivery-Mode`. NEW SITE and non-public publications lock to `subdomain`; public text, JSON or file allows `path` or `subdomain` |

OLD publications keep their links. Use the exact returned `link`, cohort and mode; never infer a mode from the address or build a hostname from an ID. Namespace `public` makes unprotected content gallery-eligible; a private namespace is unlisted, not secret, unless a password is set.

```
/brewdoc:publish ./dist --entry index.html
/brewdoc:publish "hello world" --ttl 30
```

Password access, owner operations and hosting changes: [publish README](../skills/publish/README.md), [full workflow](https://doc-claude.brewcode.app/brewdoc/skills/publish/).

---

## Error Handling

| Error | Skill | Action |
|-------|-------|--------|
| `memory-sync` already installed | memory-sync-setup | `install` refuses; use `upgrade` (`MEMORY_SYNC_FORCE=1` destroys hand-edits) |
| Surviving `{PLACEHOLDER}` after emit | memory-sync-setup | `generate.sh validate` fails; fill the slot |
| `upgrade` but nothing installed | memory-sync-setup, docsync-setup | Stop; point at `install` |
| `settings.json` invalid JSON | docsync-setup | Abort before any write; report |
| No `.html`/`.htm` in SITE bundle | publish | Fail loudly, never guess an entry |
| Dependency install or conversion fails | md-to-pdf | `INSTALL_FAILED` and stop, or one fix + retry, else report |
| INDEX row points to a file that is gone | my-claude `refresh` | Reported as missing, never regenerated; run the guide's own mode for a new one |
| `claude plugin list --json` fails | my-claude (INTERNAL) | `## Plugins and mods` becomes one `Plugin inventory unavailable` line with the reason; the rest of the guide is written |

brewdoc has no hooks; skills resolve their own files via `${CLAUDE_SKILL_DIR}`. Brewcode mods: [overview](https://doc-claude.brewcode.app/mods/overview/).
