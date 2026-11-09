---
name: token-diet
description: >
  This skill should be used when the user mentions usage limits, credits, token
  cost, "running out", "burning through", "hitting the cap", asks why a task was
  expensive, or asks how to make Claude cheaper or faster. Also applies before
  any large batch job.
metadata:
  version: "0.1.0"
---

# Token Diet

Most wasted spend comes from a handful of repeatable mistakes, not from the model being expensive. Fix the mistakes.

Apply this skill in two ways: **preventively** when planning expensive work, and **diagnostically** when the user asks where their usage went.

If `plumbward-profile.md` exists in the working folder, read it first and make the advice specific to this person. `## Context` names their tools in daily use — in tactic 5, name their actual idle connectors, not "connectors." `## Failure modes to prevent` names their habits — "too long and padded" written there means output shaping applies aggressively to everything drafted for them. Generic cost advice is what this skill exists to replace. If no profile exists, apply the defaults below and do not mention the file.

## The five biggest wins

Ordered by how much they actually save. `references/tactics.md` has the full list.

### 1. Read less

The single largest source of waste. Reading twenty files to make a one-line change costs the same as reading twenty files to rewrite a system.

- Search before reading. Use targeted search to find the relevant lines, then read only around them.
- Read ranges, not whole files, when the file is large and the target is known.
- Never re-read a file already read this session unless it changed.
- For "find X across many files," use a search tool once rather than opening files sequentially.

### 2. Delegate wide searches to a subagent

When a task requires sweeping many files or sources but the answer is short, run it in a subagent. The subagent's reading stays in its own context; only the conclusion comes back.

Rule of thumb: if the search would pull in more than a few thousand words and the answer is a paragraph, delegate it.

### 3. Edit the prompt instead of appending corrections

When a response misses, the cheap fix is to revise the original request and regenerate, not to send a correction turn. A correction turn carries the entire failed exchange forward for the rest of the session, and every subsequent turn pays for it again.

Tell the user this directly when you see them stacking corrections — it is the highest-leverage habit change available and most people do not know it.

### 4. Keep sessions short and checkpointed

Cost per turn grows with conversation length. A long session pays for its own history on every message.

- Finish a unit of work and checkpoint it, then start fresh. Use the **context-guard** skill where it is installed; otherwise write a short state summary to a notes file in the working folder and point the new session at it.
- Do not keep one session open across unrelated tasks.
- Resist the instinct to "keep the context" — a good checkpoint carries more signal per token than raw history.

### 5. Turn off what is not in use

Every connected tool and enabled plugin costs context on every single turn, whether used or not.

- Disconnect connectors not needed for the current work.
- Disable plugins not in use.
- Where available, enable on-demand tool loading so tool definitions load only when needed.

## Shaping output

Length is the part of cost the user controls most directly and notices most.

- Default to the shortest form that fully answers. No preamble restating the question, no summary of what was just said.
- Skip "Here's what I'll do" narration before acting. Do the thing.
- For file deliverables, put the content in the file and keep the chat message to one line.
- Do not produce a table when a sentence works, or a report when a paragraph works.

Never sacrifice correctness or completeness for brevity. The goal is removing padding, not removing substance.

## Diagnosing a spike

When the user asks where their usage went:

1. Identify the largest consumers — usually file reads, long sessions, or a connector returning bulk data.
2. Name the specific cause, not a general lecture. "That run read 22 files to make a one-line change" is useful; "reading files uses tokens" is not.
3. Give one concrete change with an estimated effect.

If an `explain-usage` capability is available in the environment, use it rather than estimating.

## Before a batch job

State the plan and rough cost shape before starting, not after:

> This will touch ~40 files. I'll search first and only open the ones that match, which should keep it to about 8 reads. Starting now.

Then hold to it.

## Rules

- Never claim a specific percentage saving without having measured it.
- Do not degrade output quality to hit a token target. Trimming padding is the goal; trimming substance is a failure.
- Say it once. Repeating cost advice every turn is itself waste.
