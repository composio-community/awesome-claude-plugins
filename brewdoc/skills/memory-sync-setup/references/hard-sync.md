<!-- brewcode-meta: version=6.12.5 content_version=6.5.0 generated_by=brewdoc:memory-sync-setup -->
# Hard Sync

Two DELETION passes of `/memory-sync`, cited by Phase 2 at `{DEPTH}` = `HARD`, Phase 3 checkers, References and Phase 4.
They only shrink, except PASS A frontmatter `paths:` repair on MISSING/TOO_NARROW. The common rule-5 salvage
gate remains separate: proved orphan, SAME agent, SAME owned batch, both stores authorized, no explicit exclusion;
recipient growth <= removed-store lines and total delta <= 0. Neither pass widens the user's write set.

## Prompting-quality depth split

`references/prompting-guide.md` runs before edits at every scope/depth, not as a third PASS. At `NORMAL`, rewrite
only violations on lines already touched by fact/dedup edits; report the rest. At `HARD`, rewrite every remaining
violation. Both return `file :: rule# :: line :: before -> after` verdict rows; only the applied count differs.

## The problem

Two kinds of waste dominate the AUTO-LOADED surface and neither shows up in a diff: a rule loaded into contexts it
does not govern (broad, missing or dangling `paths:` glob), and a line stating what any competent model already knows.
PASS A removes the first, PASS B the second. Both are MECHANICAL - decision procedure, then verdict, never taste.
Run A before B: narrowing a glob changes which files a later reader even loads.

---

## PASS A - `paths:` PRECISION AUDIT (rule files only)

A rule with no `paths:` loads into EVERY context at launch; a broad glob on the first matching file access, so
nearly every session. Both cost tokens regardless of relevance: precision is a TOKEN-BUDGET property.

**The rule: a glob must be the NARROWEST pattern that still covers the rule's real subject.**

| Rule subject | Correct glob shape |
|--------------|--------------------|
| Testing | only the test dirs / filename suffixes it actually governs - never the whole repo |
| One module or service | only that module's path prefix |
| One language | that language's source extensions, scoped to the source dirs (not config, not vendored trees) |
| One tool's config | the config files that tool reads |
| Genuinely repo-wide (git conventions, agent protocol, delegation) | NO `paths:` - do NOT invent one; an explicit `**/*` already declared is CORRECT, leave it |

### Procedure - per rule file

| # | Step |
|---|------|
| 1 | READ the rule and name its real subject in ONE phrase. The subject is what the rule's rows constrain, not what its title says |
| 2 | DERIVE the narrowest glob that covers that subject |
| 3 | COMPARE with the declared `paths:` - equal, wider, narrower, absent |
| 4 | RESOLVE the derived glob against the repo: it MUST match something real today. A glob pointing at a deleted or renamed directory is a silent no-op - the rule stopped loading and nobody noticed |
| 5 | CHECK UNDER-COVERAGE: enumerate the subject's real files and confirm the glob matches all of them. A testing rule that never gained the new test suffix silently stopped governing it |

Both failure directions are DEFECTS: over-broad burns tokens, under-narrow silently stops applying. Neither is
the safe side.

### Verdict vocabulary

`paths:` is a LIST. Audit EVERY entry separately and emit ONE verdict per ENTRY - a single dead entry never condemns the whole rule.

| Verdict | Meaning | Action |
|---------|---------|--------|
| `OK` | declared entry == narrowest covering glob, resolves, no under-coverage | none |
| `TOO_BROAD` | loads in contexts the subject does not reach | narrow that entry to the derived glob |
| `TOO_NARROW` | subject files exist that no entry matches | add the missing entries, covering exactly those files and no further |
| `DANGLING` | entry matches NOTHING in the repo today | repoint at the moved subject; subject gone -> drop that ENTRY and REPORT it. NEVER delete the rule file - a batch agent may only EDIT files in its SCOPE |
| `MISSING` | no `paths:` but the subject is scoped | add the derived glob |
| `CORRECTLY_GLOBAL` | no `paths:`, or an explicit repo-wide glob (`**/*`), and the subject IS repo-wide | none - never invent a glob to look tidy, and REMOVING an existing `paths:` key is never a PASS A action |

### Resolution checks (read-only shell)

```bash
git ls-files -- ':(glob)src/**/*.kt' | wc -l    # :(glob) makes ** stop at '/' like a paths: glob; plain git '*' crosses '/', so a broken glob still "matches"
find . -path ./.git -prune -o -path './src/*.kt' -print | head -5   # MANDATORY second probe - git ls-files is blind to git-ignored trees
comm -13 <(git ls-files -- ':(glob)GLOB' | sort) \
         <(git ls-files -- ':(glob)SUBJECT_SCOPE' | sort) | head   # non-empty -> TOO_NARROW
```

`DANGLING` only when BOTH probes come back empty: `git ls-files` alone returns 0 for a git-ignored tree (a
`.claude/` listed in `.gitignore` or `.git/info/exclude`) that is in fact full of files.

<!-- BLOCK: one row per rule file in the target - | Rule file | Current paths: | Verdict | Narrowest correct glob | -->
{PATHS_PRECISION_TABLE}

**Other loading gates.** Any OTHER frontmatter key this project already uses to gate loading (activation/trigger, scope or type marker, tracker include list) runs the SAME procedure - never invent a key to justify a verdict.

---

## PASS B - OBVIOUS-KNOWLEDGE PURGE

**Anything a competent model already knows is pure waste in the context. DELETE it. Do not soften it, do not
"compress" it, do not move it - DELETE.** Compression of an obvious line just makes the waste cheaper per token.

### DELETE - generic knowledge the model already has

| Class | Examples |
|-------|----------|
| Code-quality exhortation | "write quality code", "keep functions small", "handle errors", "add tests", "follow SOLID / DRY / KISS" |
| How to use a mainstream feature | "how to write parameterized tests", "use extension functions in Kotlin", "prefer const over let", "use context managers", "await your promises" |
| Restated tool / CLI / framework docs | a paraphrase of a flag table, a linter's own rule descriptions, a framework's getting-started steps |
| Textbook pattern definitions | what Repository / Factory / Observer / hexagonal architecture ARE |
| Generic security or performance platitudes | "validate input", "avoid N+1 queries", "do not hardcode secrets" - with no project-specific threshold or path |

### KEEP - domain facts the model CANNOT know

| Class | Examples |
|-------|----------|
| A DECISION that INVERTS the default | "no `object` in Kotlin - extension functions instead, see `<file>`", "skip unit tests, integration tests only" |
| Domain invariants and business rules | settlement order, tenancy boundaries, what a domain noun means HERE |
| Naming that only means something here | a layer name, a code word, an internal id shape |
| Environment quirks | a flag that behaves differently in this setup, a path that is not where it looks, a build step with a hidden dependency |
| Failure history | what broke before, why, and the one line that prevents it |
| Explicit PROHIBITIONS overriding a mainstream default | the highest-value lines in the whole surface - never trim these to save space |

### The discriminator - apply per RULE (a numbered row plus its continuation lines is ONE unit), never per line

> **"Would a competent model, with no access to this repo, already do this?" YES -> DELETE.**
> **"Does this line only make sense because someone HERE decided it?" YES -> KEEP.**

Both answers YES is impossible; both NO means the line states nothing - delete it.
A generic statement wrapped around a project-specific EXCEPTION keeps ONLY the exception; the generic framing goes.

### Borderline handling

> **This table OVERRIDES the discriminator.** Where a row below applies, its ruling wins over the YES/NO answer.

| Situation | Ruling |
|-----------|--------|
| A generic rule is present because the project keeps VIOLATING it | Still generic - DELETE. The fix is a narrow project-specific rule naming the path and the failure, not a lecture |
| A generic heading over domain rows | Delete the heading prose, keep the rows |
| A line looks generic but names a concrete path, command, version or number | KEEP - the concrete anchor is the domain fact |
| Genuinely cannot tell | KEEP and REPORT it. False deletion of a domain fact costs a real failure; one surviving obvious line costs a few tokens |

### This project's own examples

Harvested from THIS repo's rules at generation time - the left column was deleted, the right column survived.

<!-- BLOCK: two-column table of REAL examples from this target - | Generic knowledge (DELETE) | Domain fact worth keeping (KEEP) | -->
{OBVIOUS_VS_DOMAIN_TABLE}

### Worked example

Before (10 lines in a rules file):

```
## Testing
Testing is important for maintaining code quality. Always write tests for new code.
Prefer small, focused unit tests that test one thing at a time. Use descriptive test
names so failures are easy to understand. Mock external dependencies so tests stay
fast and deterministic. Use parameterized tests when the same logic must be checked
for several inputs. Do not commit failing or skipped tests.
Note: in this repo unit tests are NOT written - only integration tests against a real
database, because the ORM layer is where every past bug actually lived.
The test database is reset per test CLASS, not per method.
```

After (2 lines):

```
- No unit tests here - integration tests only, against a real DB: every past bug lived in the ORM layer.
- Test DB resets per test CLASS, not per method - parallel tests share the schema.
```

---

## HARD reporting contract

Each batch agent returns, IN ADDITION to its normal per-file JSON, a `"hard"` SUB-OBJECT under that file's existing
`"<path>"` key - nested so it never collides with the normal entry's `lines_before` / `lines_after` / `uncertain`:

```
"<path>": { "hard": {
  "paths_verdict": [ {"entry": "<glob as declared>", "verdict": "OK|TOO_BROAD|TOO_NARROW|DANGLING|MISSING|CORRECTLY_GLOBAL"} ],
  "globs_declared": [ "<EVERY glob the file now declares, narrowed or not - empty for CORRECTLY_GLOBAL>" ],
  "obvious_deleted": [ {"line_no": 0, "line": "<verbatim deleted line>", "reason": "<which DELETE class>"} ],
  "domain_kept": [ "<line kept that a shallow purge would have cut>" ],
  "discriminator_uncertain": [ "<line left in place because the discriminator was ambiguous>" ],
  "lines_before": 0,
  "lines_after": 0
} }
```

| Consumer | Uses it for |
|----------|-------------|
| Phase 3 checkers | Re-read each `obvious_deleted` line and confirm it was GENERIC, not a domain fact; re-resolve every `globs_declared` entry against the repo (both probes); confirm no `domain_kept` line was lost elsewhere in the same edit; rule each `discriminator_uncertain` line KEEP or DELETE; re-read IN FULL any file cut below half |
| Phase 6 report | Total the `lines_before` / `lines_after` delta and name the top files cut |

Rules for the report itself: quote the deleted line VERBATIM with its line number, never summarise it - the memory
surface is often git-IGNORED, so a checker cannot recover the context from a diff. `lines_after` > `lines_before`
at `HARD` depth is a defect, not a judgement call - EXCEPT the PASS A frontmatter repair that adds or widens a
`paths:` key, or separately proved rule-5 salvage satisfying the common gates and total budget. A file whose
`lines_after` is under HALF its `lines_before` needs no extra field: Phase 3 re-reads it IN FULL; Phase 6 names it.
