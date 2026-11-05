# External Mode Reference

## Hook Event Model

From local hook registrations, document:
- Events used, of the 33 current ones; handler types (`command`, `http`, `mcp_tool`, `prompt`, `agent`)
- Input schema per event
- Output schema (additionalContext, updatedInput, decision)
- permissionDecision values

## Sources for Web Research

| Source | URL | Focus |
|--------|-----|-------|
| Official docs | code.claude.com/docs | Hook schema, agent API, context injection |
| GitHub releases | github.com/anthropics/claude-code | CHANGELOG, recent features |
| GitHub issues | github.com/anthropics/claude-code/issues | Known bugs, workarounds |
| Community | reddit.com/r/ClaudeAI | User patterns, tips |

## Output Structure

```markdown
# Claude Code External Architecture — {date}

## Hook Event Model
### Events
### Input Schema
### Output Schema

## Context Injection Patterns
## Agent Spawning API
## Recent Changes (CHANGELOG)

## Sources
```

## Context-Schema Sub-mode

Focus on:
- `additionalContext` — what it does, when delivered, format
- `updatedInput` — mutation of tool input; `updatedToolOutput` — PostToolUse result replacement
- `systemMessage` — display in UI
- `permissionDecision` — PreToolUse: allow/deny/ask/defer (defer is headless-only); PreModelSwitch: allow/deny/ask.
  Other events have their own output contracts; top-level `decision: block` is a separate field.
