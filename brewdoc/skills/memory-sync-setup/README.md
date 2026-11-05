# brewdoc:memory-sync-setup

A generator. It scans your repo and writes a project-local `.claude/skills/memory-sync/` skill. That skill keeps everything Claude auto-loads (`CLAUDE.md` at any depth, rules, agents, skills, the memory dir) true against the code. Docs are out of scope. Every sweep is non-growth: no file ends longer than it started.

## Install

```sh
claude plugin marketplace add https://github.com/kochetkov-ma/claude-brewcode
claude plugin install brewdoc@claude-brewcode
```

Then run `/reload-plugins`.

## Usage

```
/brewdoc:memory-sync-setup [status|install|upgrade|enable|disable|uninstall|purge] [fine-tune-prompt]
```

| Mode | Does |
|------|------|
| `status` | Reports whether `memory-sync` is installed and in sync. No writes. Default when installed |
| `install` | Analyzes the repo and emits the 5 files. Default when not installed |
| `upgrade` | Re-scans and refreshes the tables, keeps your hand-edits |
| `enable` | Restores a parked install (`SKILL.md.disabled` -> `SKILL.md`) |
| `disable` | Parks it (`SKILL.md` -> `SKILL.md.disabled`), nothing deleted |
| `uninstall` | Removes the emitted files, keeps files you added |
| `purge` | Removes the whole `.claude/skills/memory-sync/` dir |

Canonical order: `status | install | upgrade | enable | disable | uninstall | purge`. Run the emitted skill with `/memory-sync [session|branch|recent:N|all] [hard]`.

## What the emitted skill does

| Axis | Values |
|------|--------|
| Scope | `session` (default), `branch`, `commit <sha>`, `recent[:N]`, `all` |
| Depth | `NORMAL` (default), `HARD` adds a `paths:` precision audit and an obvious-knowledge purge |
| Reach | `MEMORY` (default), `REFS` adds tracked outside references cited by always-loaded files |

Flow: parallel read-only gather, one bounded agent per disjoint batch, then an independent checker per edited batch (never the writer). Facts come before dedup and compression. A new agent or skill is proposed in the report, never auto-created. The emitted skill needs no plugin and stays model-invocable.

Run `upgrade` when a nested `CLAUDE.md`, rule, agent or skill is added, the stack or default branch changes, or `status` reports drift.

## Docs

Full docs, depth and scope details: [memory-sync-setup](https://doc-claude.brewcode.app/brewdoc/skills/memory-sync-setup/)
