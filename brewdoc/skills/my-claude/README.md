# My Claude

Documents your Claude Code installation: local setup with the installed plugins and mods, external hook/context architecture, or any Claude Code topic researched across the web. `refresh` regenerates the guides that are older than the installed brewdoc.

## Install

```sh
claude plugin marketplace add https://github.com/kochetkov-ma/claude-brewcode
claude plugin install brewdoc@claude-brewcode
```

Then run `/reload-plugins`.

## Usage

```
/brewdoc:my-claude              # your local setup
/brewdoc:my-claude ext          # hook/context/agent architecture
/brewdoc:my-claude ext context  # context injection schema
/brewdoc:my-claude r <query>    # research a topic
/brewdoc:my-claude refresh      # regenerate stale guides
```

The argument is one free-form prompt (RU or EN). A mode prefix from the table wins (the first one when several); otherwise the most distinct keyword picks the mode, a tie asks once (a tie with `refresh` goes to `refresh`), no match falls back to Internal.

| Mode | Trigger | What it does |
|------|---------|--------------|
| Internal | no arguments | Scans the config dir (`CLAUDE_CONFIG_DIR`, default `~/.claude/`), the project, and the installed plugins and mods; secret values never copied |
| External | `ext` or `external` | Local hooks plus official docs, releases, forums |
| External (context-schema) | `ext context` | `additionalContext`, `updatedInput`, `decision` |
| Research | `r <query>` or `research <query>` | Docs, GitHub, Reddit, forums, marketplaces, with citations |
| Refresh | `refresh` (keywords: `update`, `regenerate`) | Regenerates every guide older than the installed brewdoc; asks nothing |

## Output

Files go to `.claude/brewdoc/my-claude/` in the project (`YYYYMMDD_my-claude-internal.md`, `..._external.md`, `external/..._context-schema.md`, `..._research-{slug}.md`). Each save adds a row to `.claude/brewdoc/INDEX.jsonl`, or updates that guide's row in place (its version is bumped) when you answer `Yes, update` to the one INDEX question; `refresh` always updates. The row's title is the first heading of the saved document. An independent agent re-checks paths, counts, and sources.

`.claude/` is a protected path: a Write/Edit call or shell redirect there is prompted in `default` and `acceptEdits` and denied headless. The skill writes there only through one node save fence under its Bash grant, never with Write/Edit.

The Internal guide has two sections for the update flow:

| Section | Content |
|---------|---------|
| Plugins and mods | One row per installation from `claude plugin list --json`: plugin id, version, scope, enabled, kind (`mod` or `plugin`). Mods come first, `brewmod-placeholders` first among them. Rows cover user and managed scope plus this project's project and local scope. The Summary table gets a matching row. Setup states live in `/brewcode:setup-status` and are not repeated. When the CLI fails, the section is one line naming the reason |
| Keeping this current | The four update commands in order: `/brewtools:plugin-update`, `/reload-plugins`, `/brewcode:setup-status upgrade` (run it in each project), `/brewdoc:my-claude refresh` |

## Refresh

`refresh` reads `.claude/brewdoc/INDEX.jsonl` and compares each guide's `version` (provenance frontmatter) with the installed brewdoc version. A regenerated guide lands in a new dated file; the older file stays on disk. A guide that fails is reported and the next one still runs. Nothing stale writes nothing. A row from the global INDEX whose `path` ends `_context-schema.md` (for example under `~/.claude/brewdoc/external/`) counts as the context-schema guide, not the external one.

| Scan result | When | Action | In the report |
|-------------|------|--------|---------------|
| STALE | `version` below the installed brewdoc, absent, or still holding a `{...}` placeholder | Regenerated | Counted as N in `## 🟢 my-claude guides: N refreshed, K current (brewdoc <version>)`; when any guide failed the heading is `## 🔴 my-claude guides: N refreshed, M failed (brewdoc <version>)` and the failed guide shows its first error line |
| CURRENT | `version` equals the installed brewdoc | Left alone | Counted as K in the 🟢 heading; with no stale guide at all the heading is `## ⚪ my-claude guides are current (brewdoc <version>)` |
| SKIP | A research guide whose slug the prompt does not name (`/brewdoc:my-claude refresh hooks` includes `research/hooks`), or `doc_type: skip` | Left alone | Listed as skipped |
| MISSING | The guide file its INDEX row points to is gone | Reported, never regenerated; `/brewdoc:my-claude ext` (or the matching mode) writes a new one | Listed as missing, with the path |
| NONE | No INDEX row at all | Nothing written | One line pointing to `/brewdoc:my-claude` |

## Documentation

Full docs: [my-claude](https://doc-claude.brewcode.app/brewdoc/skills/my-claude/)
