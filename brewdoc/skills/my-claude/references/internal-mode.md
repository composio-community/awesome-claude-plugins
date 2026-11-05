# Internal Mode Reference

`<config>` = `CONFIG_DIR` (`CLAUDE_CONFIG_DIR`, unset = `~/.claude`). Report symlinks as `path -> target`.

## Sources to Analyze

| Source Group | Paths | Explore Agent Focus |
|---|---|---|
| Global config | `<config>/`: `CLAUDE.md`, `rules/*.md`, `settings.json` (`permissions`, `hooks`, `env`, `model`, `enabledPlugins`), `agents/*.md`, `skills/*/SKILL.md`, `commands/*.md`, `output-styles/*.md`, `workflows/*.js`, `.claude.json` (`mcpServers`; `~/.claude.json` when unset) | Counts, key rules, hook event + type per handler |
| Project config | `${CLAUDE_PROJECT_DIR}/`: `CLAUDE.md` or `.claude/CLAUDE.md`, `CLAUDE.local.md`, `AGENTS.md` (loads only without them), `.mcp.json`, `.claude/settings{,.local}.json`, `.claude/{rules,agents,skills,commands,output-styles,workflows}/` | Project-specific instructions |
| Memory | `<config>/projects/*/memory/*.md` (`MEMORY.md` = index; setting `autoMemoryDirectory` moves it), `agent-memory/*/` in `<config>` and `.claude/` | Active memories, topic files |

Plugins and mods are no Explore group: the skill runs the INTERNAL Mode fence (`claude plugin list --json`) itself.

## Plugins and mods

| Rule | Value |
|---|---|
| Source | `unset CLAUDECODE && claude plugin list --json`, one row per installation |
| Rows | scope `user` or `managed`, plus `project`/`local` rows whose `projectPath` is this project; other projects' rows are dropped |
| Kind | `mod` when `<installPath>/hooks/hooks.json` has a top-level `"modules"` key, else `plugin` |
| Order | mods first, `brewmod-placeholders` first among them; then by id, then scope (managed, user, project, local) |
| Columns | `Plugin` (full id), `Version`, `Scope`, `Enabled` (yes/no), `Kind` |
| CLI fails | the section is one line: `Plugin inventory unavailable: ...` with the reason |
| Setup states | never listed here: one line points to `/brewcode:setup-status` |

## Document Template

```markdown
# Claude Code Internal Setup — {YYYY-MM-DD}

## Global Configuration
**Config dir:** `<config>` — {CLAUDE.md key rules; settings: permissions, env names, model, plugins}

### Hooks ({N})
| Event | Type | Handler | Source |
|-------|------|---------|--------|

### Rules ({N} files)
| Rule File | Purpose |
|-----------|---------|

### Agents ({N} files)
| Agent | Model | Purpose |
|-------|-------|---------|

### Skills ({N})
| Skill | Trigger | Purpose |
|-------|---------|---------|

## Plugins and mods
| Plugin | Version | Scope | Enabled | Kind |
|--------|---------|-------|---------|------|

Setup states (installed, stale, disabled) are tracked by `/brewcode:setup-status`.

## Project Configuration
{instructions summary; rules, settings, MCP, agents, skills}

## Memory
{MEMORY.md summary; topic files}

## Summary
| Component | Count | Location |
|-----------|-------|----------|
| Plugins and mods | {N} ({M} mods) | `claude plugin list --json` |

## Keeping this current
1. `/brewtools:plugin-update` — updates every plugin and mod
2. `/reload-plugins` — loads the new versions into this session
3. `/brewcode:setup-status upgrade` — brings this project's setups up to date; run it in each project
4. `/brewdoc:my-claude refresh` — regenerates this guide once it is older than the installed brewdoc
```

## Reviewer Checklist
- File paths referenced in document actually exist
- Agent/skill counts match filesystem counts
- No invented file names
- `## Plugins and mods` equals the fence output (mods first, `brewmod-placeholders` first), Summary row included
- `## Keeping this current` lists the 4 commands in template order
