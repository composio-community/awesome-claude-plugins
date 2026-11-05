# Brewdoc

> Documentation toolkit plugin for Claude Code -- sync, generation, memory-sync generation, PDF conversion, publishing.

| Field | Value |
|-------|-------|
| Version | 6.12.5 |
| Skills | 5 |
| Agents | 0 |
| Hooks | 0 |

## Install

Paste this into a Claude Code session:

```
Execute these commands in this session, one by one, show full output for each, do not skip any:

1. claude plugin marketplace add https://github.com/kochetkov-ma/claude-brewcode
2. claude plugin install brewdoc@claude-brewcode

After install, run `/reload-plugins` (or `exit` + `claude`).
```

<details>
<summary>Or install the whole suite (plugins and mods)</summary>

❗ **Update Claude Code first:** mods need Claude Code 2.1.301 or newer. Check with `claude --version`; below that, run `claude update`, then restart Claude Code (type `exit`, then run `claude`).

```
First run `claude --version`. The mods need Claude Code 2.1.301 or newer. If it is lower, stop and tell me to run `claude update`, restart Claude Code (type `exit`, then run `claude`) and paste this prompt again.

Execute these commands in this Claude Code session, one by one, show full output for each, do not skip any, do not summarize:

1. claude plugin marketplace add https://github.com/kochetkov-ma/claude-brewcode
2. claude plugin install brewmod-placeholders@claude-brewcode
3. claude plugin install brewmod-plan-effort@claude-brewcode
4. claude plugin install brewmod-reminders@claude-brewcode
5. claude plugin install brewcode@claude-brewcode
6. claude plugin install brewdoc@claude-brewcode
7. claude plugin install brewtools@claude-brewcode
8. claude plugin install brewui@claude-brewcode

After all commands succeed, run `/reload-plugins`. If `/reload-plugins` is unavailable, tell me to type `exit` and run `claude` again. Run the commands now.
```
</details>

Update anytime with `/brewtools:plugin-update`, or by hand:

```bash
claude plugin marketplace update claude-brewcode
claude plugin update brewdoc@claude-brewcode
```

After an update, run `/reload-plugins`, then `/brewcode:setup-status upgrade` in each project to bring stale setups current, and `/brewdoc:my-claude refresh` when your installation guide is older than brewdoc. The `/brewtools:plugin-update` report lists the same next steps.

## Overview

Brewdoc tracks stale docs and syncs them with the codebase, and documents your Claude Code installation. It also generates a project-tailored `/memory-sync` skill, converts Markdown to PDF and publishes text, files and sites to brewpage.app. Each skill is self-contained.

Dev mode (no install): `claude --plugin-dir ./brewdoc`.

## Quick Start

```bash
/brewdoc:docsync-setup                # No verb -> status if installed, install if not
/brewdoc:docsync-setup sync           # Sync stale docs (with confirmation)
/brewdoc:my-claude                    # Document your local Claude setup
/brewdoc:my-claude r "how do hooks work"  # Research any Claude topic
/brewdoc:my-claude refresh            # Regenerate guides older than the installed brewdoc, no questions
/brewdoc:memory-sync-setup install    # Emit a project-tailored /memory-sync skill into this repo
/brewdoc:md-to-pdf README.md          # Convert markdown to PDF
/brewdoc:publish "Hello world"        # Publish to brewpage.app -- returns URL
```

## Skills

A `-setup` suffix marks a skill that *installs a mechanism*; both setup skills share `status | install | upgrade | enable | disable | uninstall | purge`. No argument = `status` if installed, `install` if not. Every skill except `/brewdoc:publish` is user-invoked only; `publish` is model-invocable. [`/brewcode:setup-status`](https://github.com/kochetkov-ma/claude-brewcode/blob/61dfaa8bdbcb59aa8a7b45570dd71885ccae52f8/brewcode/skills/setup-status/README.md) shows what is installed, stale or missing across plugins.

| Skill | Purpose | Model | Arguments |
|-------|---------|-------|-----------|
| [`/brewdoc:docsync-setup`](skills/docsync-setup/README.md) | Project-local doc-staleness tracking hooks; report/force doc sync | sonnet | `[status\|install\|upgrade\|enable\|disable\|uninstall\|purge] [sync [--all]\|reread\|frontmatter] \| free-text` |
| [`/brewdoc:my-claude`](skills/my-claude/README.md) | Document your Claude Code installation: setup, plugins and mods, architecture, web research; `refresh` regenerates guides older than the installed brewdoc | opus | `[ext [context]] \| [r <query>] \| [refresh]` -- no args = internal installation docs |
| [`/brewdoc:memory-sync-setup`](skills/memory-sync-setup/README.md) | Generator: emits a project-tailored `.claude/skills/memory-sync/` | opus | `[status\|install\|upgrade\|enable\|disable\|uninstall\|purge] [fine-tune-prompt]` |
| [`/brewdoc:md-to-pdf`](skills/md-to-pdf/README.md) | Markdown to PDF via reportlab or weasyprint | sonnet | `<file.md> [--engine name] ["prompt"] \| styles \| test` |
| [`/brewdoc:publish`](skills/publish/README.md) | Publish text/file/site to brewpage.app, returns the URL | haiku | `<text\|file_path\|directory_path\|zip_path> [--ttl N] [--entry filename] [--delivery-mode path\|subdomain]` |

What each skill needs and writes locally:

| Skill | Needs | Writes |
|-------|-------|--------|
| `publish` | POSIX (macOS/Linux/WSL), `bash`, `curl`, `jq`, Python 3 with `fcntl`; Git inside Git checkouts; sites also `node`, `unzip`; directories also `zip` ([requirements](skills/publish/SKILL.md#notes)) | owner-token history `.claude/brewpage-history.md` (mode 600, git-ignored); unsafe history writes stop publication; tokens never enter chat |
| `md-to-pdf` | `reportlab` or `weasyprint` | the PDF next to the source; the engine choice in `.claude/md-to-pdf.config.json` |
| `my-claude` | nothing extra | only under `.claude/brewdoc/`: guides in `my-claude/`, plus `INDEX.jsonl` |
| `my-claude refresh` | nothing extra | a new dated guide; the older file stays (a same-day run overwrites) |

Portable, plugin-free publish: [`brewpage-publish`](https://github.com/kochetkov-ma/claude-brewcode/blob/61dfaa8bdbcb59aa8a7b45570dd71885ccae52f8/skills/brewpage-publish/) (Claude Code), [`openclaw/brewpage-publish`](https://github.com/kochetkov-ma/claude-brewcode/blob/61dfaa8bdbcb59aa8a7b45570dd71885ccae52f8/openclaw/brewpage-publish/) (OpenClaw).

## Architecture

```
brewdoc/
+-- .claude-plugin/plugin.json    # manifest
+-- hooks/hooks.json              # {"hooks":{}} -- no hooks
+-- skills/                       # docsync-setup, my-claude, memory-sync-setup, md-to-pdf, publish
```

Artifact metadata fields (`doc_type`, `version`, `content_version`, `generated_by`, `last_updated`): [overview](https://doc-claude.brewcode.app/brewcode/overview/#artifact-metadata).

## Documentation

Full docs: [doc-claude.brewcode.app/brewdoc/overview](https://doc-claude.brewcode.app/brewdoc/overview/)

| Resource | Link |
|----------|------|
| Skills | [docsync-setup](https://doc-claude.brewcode.app/brewdoc/skills/docsync-setup/), [my-claude](https://doc-claude.brewcode.app/brewdoc/skills/my-claude/), [memory-sync-setup](https://doc-claude.brewcode.app/brewdoc/skills/memory-sync-setup/), [md-to-pdf](https://doc-claude.brewcode.app/brewdoc/skills/md-to-pdf/), [publish](https://doc-claude.brewcode.app/brewdoc/skills/publish/) |
| Setup Status (brewcode) | [setup-status](https://doc-claude.brewcode.app/brewcode/skills/setup-status/) |
| Release Notes | [RELEASE-NOTES.md](../RELEASE-NOTES.md) |

## Claude Code mods

Brewcode mods from the same marketplace: [overview](https://doc-claude.brewcode.app/mods/overview/), [placeholders](https://doc-claude.brewcode.app/mods/placeholders/), [plan-effort](https://doc-claude.brewcode.app/mods/plan-effort/), [reminders](https://doc-claude.brewcode.app/mods/reminders/) (durable reminders that survive sessions, `/remind`).

❗ **Update Claude Code first:** mods need Claude Code 2.1.301 or newer. Check with `claude --version`; below that, run `claude update`, then restart Claude Code (type `exit`, then run `claude`).

```bash
claude plugin install brewmod-placeholders@claude-brewcode
claude plugin install brewmod-plan-effort@claude-brewcode
claude plugin install brewmod-reminders@claude-brewcode
```

`claude plugin install` takes one name per call. Run `/reload-plugins` afterwards.

Author: Maksim Kochetkov | License: MIT
