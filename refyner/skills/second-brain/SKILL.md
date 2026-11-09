---
name: second-brain
description: Use when the user researches a topic that could draw on their own saved knowledge, or wants to recall or save something in their Refyner second brain — "research X using my second brain", "what have I saved about Y", "save this to my second brain", "add this to Refyner", "check my vault". Requires the bundled Refyner MCP (connect once via /mcp).
---

# Refyner Second Brain

Ground research in the user's own saved knowledge, and capture new insights with
their confirmation — using the Refyner MCP tools bundled with this plugin.

## Prerequisites

This skill needs the `refyner` MCP server (bundled with this plugin) connected
and authenticated. If the `search_vault` tool is not available:

1. Tell the user to run `/mcp`, select **refyner**, and choose **Authenticate**
   (a one-time browser OAuth login).
2. A free Refyner account is required — https://refyner.me.

Do not fabricate vault contents. If the tools are unavailable, say so and stop.

## Workflow

### Researching a topic → check the second brain first

1. Call `search_vault(query)` with the user's topic BEFORE answering. This
   returns snippets of what they've already saved (articles, transcripts, notes).
2. For the most relevant hits, call `get_vault_entry(id)` to read the full text.
3. Combine that with your own web search, then answer — clearly distinguishing
   **what came from the user's second brain** vs. what came from the web.

### Saving something → always propose, never auto-save

1. When something is worth keeping, call `propose_to_vault(...)`. This does NOT
   write — it returns a normalized preview plus duplicate signals
   (`duplicate_status`, `exact_match`, `similar_existing`).
2. Show the user the proposal, including any duplicates. Let them decide.
3. Only after the user confirms, call `confirm_vault_capture(...)` with the
   `normalized` fields from the proposal. Never call `confirm_vault_capture`
   without an explicit confirmation.

### Reference

The `refyner://vault-guide` MCP resource documents this same flow — consult it
if unsure.

## Examples

- "Research context engineering — check my second brain too." → `search_vault` →
  `get_vault_entry` on top hits → web search → synthesized answer with sources.
- "Save this thread to my second brain." → `propose_to_vault` → show preview →
  `confirm_vault_capture` after the user says yes.
- "What have I saved about pricing?" → `search_vault("pricing")` → summarize hits.
