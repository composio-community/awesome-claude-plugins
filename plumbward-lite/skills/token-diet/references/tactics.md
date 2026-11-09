# Token Tactics — Full List

Grouped by where the waste happens. Each entry states the waste, the fix, and roughly how much it matters.

## Contents

1. Reading and searching
2. Session shape
3. Tools and connectors
4. Output shape
5. Batch work
6. What not to do

---

## 1. Reading and searching

**Opening files to find something** — High impact.
Searching returns matching lines; opening returns everything. For "where is X mentioned," search. Only open the files that matched, and only the region around the match.

**Re-reading unchanged files** — High impact.
A file read once in a session is still in context. Reading it again doubles the cost for zero new information. Track what has been read.

**Reading whole files when a range would do** — Medium-high.
For a large file where the target location is known, read a bounded range. Read the whole thing only when the structure genuinely matters.

**Reading generated and vendored content** — High, and easy to miss.
Lock files, build output, dependency directories, minified bundles, and large data files can consume enormous context and almost never contain the answer. Exclude them from searches by default.

**Sequential exploration** — Medium.
Opening files one at a time to build a picture costs more than a single well-formed search that answers the question directly. Form the question first.

**Verifying an edit by re-reading the file** — Medium.
An edit that succeeds, succeeded. Reading the file back to confirm is a full-cost operation for no information. Exception: destructive or must-be-correct operations — verify those from the operation's actual result even when it costs a read (see Section 6).

## 2. Session shape

**Long-running sessions** — Highest cumulative impact.
Every turn re-pays for the conversation so far. A session that has run for fifty turns is expensive on turn fifty-one regardless of what is asked. Checkpoint and restart at natural boundaries.

**Correction stacking** — High.
Each "no, not like that" turn preserves the failed attempt in context permanently. Revising the original request and regenerating discards the failure entirely. This is the largest single behavioral saving available to most users.

**Mixing unrelated tasks in one session** — Medium-high.
Task B pays for all of task A's context. Separate sessions for separate work.

**Resuming a stale session** — Medium.
Returning to a session after a long gap can lose cached context and re-pay for it. For a genuinely new task, start fresh.

**Thinking out loud across many turns** — Medium.
Exploratory back-and-forth accumulates. When exploring, do it in one turn with a clear question rather than ten turns of narrowing.

## 3. Tools and connectors

**Idle connectors** — High, and invisible.
Every connected tool contributes its definitions to every turn. A handful of unused connectors can consume a substantial share of context before the user types anything. Disconnect what is not in active use.

**Unused plugins** — High.
Same mechanism. Each enabled plugin adds standing context. Where the interface shows a context cost estimate, look at it.

**On-demand tool loading** — High saving when available.
Loading tool definitions only when needed, rather than all upfront, is one of the largest single reductions available. Enable it where the environment supports it.

**Connectors that return bulk data** — Medium-high.
Some connectors return large result sets by default. Constrain the query — narrow date ranges, specific fields, explicit row limits — rather than filtering after the fact.

**Reaching for a tool when a direct answer works** — Medium.
A tool round-trip costs the call, the result, and the reasoning about the result. For something already known, answer directly.

## 4. Output shape

**Preamble** — Medium, and constant.
Restating the question, announcing intent before acting, and "Here's what I found" framing. Cut all of it.

**Terminal summaries** — Medium.
Recapping what was just said, at the end of every response. The user read it.

**Over-structuring** — Medium.
Headers and tables on short answers. A three-sentence answer does not need a table of contents.

**Duplicating file contents in chat** — High when it happens.
When content goes into a file, the chat message should describe it in one line, not reproduce it.

**Over-hedging** — Low but cumulative.
Stacked caveats and qualifications add length without adding information.

## 5. Batch work

**No plan before a large job** — High.
Scoping first — how many items, what will be touched, what can be skipped — routinely halves the work.

**Processing items that could be filtered out first** — High.
Filter, then process. Never process, then discover most items were irrelevant.

**Full re-processing on retry** — Medium-high.
When a batch fails partway, resume from the failure point. Track progress in a file so a restart does not redo completed work.

**Doing mechanical work in the model** — High for large volumes.
Repetitive deterministic transformations across many files are cheaper as a script than as model turns. Write the script once, run it, review the result.

## 6. What not to do

These reduce tokens but cost more than they save.

- **Truncating context the task needs.** Producing a wrong answer cheaply, then paying to redo it, is more expensive than being right the first time.
- **Refusing to read a file that matters.** Guessing at contents produces errors that cost more to fix.
- **Compressing output past legibility.** Terse is good; cryptic means the user has to ask again.
- **Skipping verification on work that must be correct.** A silent error is the most expensive outcome available.
- **Repeating cost advice.** Say it once per session, then stop.
