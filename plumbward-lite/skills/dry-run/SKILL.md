---
name: dry-run
description: >
  This skill should be used before any bulk or destructive file operation —
  delete, move, rename, overwrite, "clean up", "organize", "tidy", "consolidate",
  "get rid of", "reorganize my folder" — and whenever the user asks to preview
  changes before they happen.
metadata:
  version: "0.1.0"
---

# Dry Run

Show the full list of what will change, get a yes, then act, then log what happened.

The failure this prevents is well documented: a user asks Claude to "clean up" a folder, Claude interprets that as authority to delete, and work is lost. "Clean up", "organize", and "tidy" are ambiguous instructions, not permission to remove things.

## What counts as destructive

Preview before any of these, without being asked:

- Deleting files or folders
- Moving or renaming anything the user did not name individually
- Overwriting an existing file
- Bulk edits across more than a few files
- Anything that leaves the machine — sending, posting, publishing, committing, submitting
- Anything that spends money

Also preview whenever the instruction was **categorical** rather than specific. "Delete `draft-3.docx`" is specific. "Delete the old drafts" is categorical — the user and Claude may not agree on what counts as old.

Before building the preview: if `plumbward-profile.md` exists in the working folder, read its `## Guardrails` section — including the `Sensitive` line — because it may widen what needs confirmation or take paths off the table entirely. If it does not exist, proceed with the defaults and do not mention the file.

## The preview

Enumerate the actual list. Never describe it in the abstract — "I'll remove the old files" is exactly the sentence that precedes losing 11 GB of work.

```
About to change 14 items in Clients/Acme:

DELETE (3) — 340 MB
  proposal-v1.docx          modified 4 months ago
  proposal-v2.docx          modified 4 months ago
  screen-recording.mov      modified 6 months ago   ← large

MOVE (9) → Clients/Acme/2025/
  invoice-jan.pdf … invoice-sep.pdf

OVERWRITE (2)
  summary.md                current version is 2 days newer than my draft
  contacts.csv

Nothing else will be touched. Proceed?
```

Requirements for the preview:

- **Every affected path, listed.** If the list is long, group it, but state the exact total and show enough that the user can spot a mistake. Never silently truncate.
- **Flag anything surprising** — recently modified files, large files, anything outside the folder the user named, anything that looks like an original rather than a copy.
- **State what is not being touched**, so the scope is unambiguous.
- **Ask once, clearly.** Not a rhetorical question.

## Prefer reversible

When a reversible option exists, take it and say so.

- Move to a `_to_delete/` folder in the same location instead of deleting. The user deletes that folder themselves when satisfied.
- Copy before overwriting, keeping the original alongside.
- For bulk renames, write the old-to-new mapping to a file first so it can be reversed.

Some environments cannot delete at all and can only move. That constraint is a feature — use the same pattern everywhere.

## Escalate on these

Stop and ask specifically, even if the user already approved the batch:

- A file modified in the last 24 hours
- A path outside the folder the user named
- Anything matching the profile's `Sensitive` guardrail line, when a profile exists
- Apparently the only copy — no backup, version, or duplicate visible in the folders in view
- More items than the user seemed to expect ("a few old files" resolving to 200)

## When the machine asks too

In some environments a confirmation dialog appears on destructive commands, referencing a preview marker. That is this contract, enforced mechanically. After the user approves the enumerated preview, create the empty file `.plumbward/preview-approved` so the approved batch runs without a prompt per command, and delete it as soon as the batch finishes. Never create the marker without a user-approved preview — it exists to record the yes, not to skip it.

## After acting

Write a log to `plumbward-actions.md` in the working folder. Append; never overwrite.

```markdown
## <date> — Cleaned up Clients/Acme
Deleted (moved to _to_delete/): proposal-v1.docx, proposal-v2.docx, screen-recording.mov
Moved to 2025/: 9 invoice PDFs
Overwrote: summary.md (previous version saved as summary.md.bak)
Not touched: everything in Clients/Acme/current/
```

Report what actually happened, verified from the result of the operation — not from what was planned. If something failed or was skipped, say so plainly. A log that reports intentions rather than outcomes is worse than no log.

## Rules

- Never expand scope beyond what was previewed and approved. If more work seems needed, preview again.
- "Yes" to one batch is not standing approval for the next one.
- If the user says "just do it, don't ask me" — still write the log, still use reversible operations, and still stop for the escalation cases above.
