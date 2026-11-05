# brewdoc:docsync-setup

Project-scoped doc-staleness tracker. It installs three project-local hooks (track, watch, gate) that log which `.md` docs a session edits. At the end of a turn the gate raises the ones whose `last_updated` is missing, unusable or behind the file. Each doc's own frontmatter is the source of truth; there is no ledger.

## Install

```sh
claude plugin marketplace add https://github.com/kochetkov-ma/claude-brewcode
claude plugin install brewdoc@claude-brewcode
```

Then run `/reload-plugins`.

## Usage

```
/brewdoc:docsync-setup [status|install|upgrade|enable|disable|uninstall|purge] [sync [--all]|reread|frontmatter] | free-text
```

| Mode | Does |
|------|------|
| `status` | Lists in-scope docs with age and stale/fresh/no-date state. Default when installed |
| `install` | Asks threshold (default 7d) and excludes, copies the 3 hooks, writes `.claude/docsync/config.json`. Default when not installed |
| `upgrade` | Refreshes hooks and registrations, keeps config and logs |
| `enable` | Sets `enabled: true` in `config.json` |
| `disable` | Sets `enabled: false`; hooks stay wired and no-op at once |
| `uninstall` | Removes hook entries and files, keeps `.claude/docsync/` |
| `purge` | `uninstall` plus deletes `.claude/docsync/` |
| `sync [--all]` | Syncs stale docs per their `sync_procedure`, bumps `last_updated` |
| `reread` | Re-reads tracked docs into context |
| `frontmatter` | Opt-in retro-add of frontmatter to in-scope docs |

Canonical order: `status | install | upgrade | enable | disable | uninstall | purge`. A missing `enabled` key counts as enabled.

## Frontmatter

```yaml
doc_type: llm                  # optional, bare: llm | user | skip (absent = user)
last_updated: "2026-07-19"     # sole staleness input, local YYYY-MM-DD
sync_procedure: "what to check when syncing"   # optional, a hint for Claude
```

The gate compares `last_updated` with the file's modification day. `CLAUDE.md`, `CLAUDE.local.md`, `AGENTS.md` and `doc_type: skip` files are never tracked. Only docs edited through `Write`/`Edit` are raised. State lives in `.claude/docsync/` (`config.json`, one `state-<session_id>.jsonl` per session).

## Docs

Full docs, frontmatter schema and hook table: [docsync-setup](https://doc-claude.brewcode.app/brewdoc/skills/docsync-setup/)
