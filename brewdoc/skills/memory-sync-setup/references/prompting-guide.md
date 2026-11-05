<!-- brewcode-meta: version=6.12.5 content_version=6.5.0 generated_by=brewdoc:memory-sync-setup -->
# Prompting Quality Guide

Apply only to instruction files: CLAUDE.md at any depth, `.claude/rules/*.md`, the `AGENTS.md` family,
agent/skill bodies. Code/docs remain owned by their source/doc flow. Phase 2 batches read this alongside
`references/memory-guide.md`. `claude` targets Claude instructions; `openai-only` the Codex projection;
`both` either. Official sources checked 2026-10-12: Opus 5.5 / Sonnet 5.5 / Haiku 5.5 / Fable 5.1 advice is model-scoped research, not universal policy. Preserve house budgets, tests, self-check criteria, independent review and consent.

---

## Merged rule table

Detect is a grep-able or eyeballed signal; apply the rewrite ONLY where it does not change a fact (see the
lossless guard below). Source keys resolve in the legend at the end.

| # | Rule | Applies | Detect | Rewrite (bad -> good) | Source |
|---|------|---------|--------|------------------------|--------|
| 1 | Role + output contract first; separate hard constraints | both | unclear role or return shape | "Role: <one sentence>. Return: <shape/fields>." then Scope/Never; preserve required fields | PEBP, SA |
| 2 | Deduplicate within the same audience and scope | both | the same directive fires twice for the same reader | keep the canonical instance and a resolvable pointer; retain copies needed by readers who cannot see that source | CCBP, PEBP, HOOK |
| 3 | Resolve contradictions with evidence and scope | both | same subject/scope, incompatible instructions | "never schedule without consent" + "auto-assign" -> "propose the earliest slot; schedule after consent". Verify facts; unavailable checks -> defer both unchanged. Preserve preferences; ledger resolutions | O5, house policy |
| 4 | Prefer positive imperatives; preserve exclusions | both | a prohibition hides the desired action | "do Y instead" only if the exclusion survives; retain incident-backed `!=`, safety, consent and ownership boundaries without requiring an incident citation | PEBP, avoid.md |
| 5 | Remove decorative ALL-CAPS; preserve true invariants | both | repeated MUST/NEVER/CRITICAL/ALWAYS as emphasis | prefer at most one stylistic emphasis outside hard stops; keep every required field and irreversible-action guard equally binding | CCBP, house policy |
| 6 | State goals/evidence; avoid requests for hidden reasoning | both | "think step by step", "explain your reasoning", prescribed thinking scaffold | state the outcome/output contract; retain dependent execution steps and verification criteria. Thinking advice depends on model/config, not a universal ban on "think" | PEBP, O7 |
| 7 | Scope verification advice by model; preserve project checks | claude | generic re-check line ("double-check your work") | Opus/Fable/unpinned: delete. `haiku` below `effort: high` or `sonnet` at `effort: low`: replace with ONE concrete check (named command, pass/fail, what to report when it cannot run). Always preserve required tests, self-check criteria, independent checker/CI/second-reader stages and check scripts. Unsupported removal -> `uncertain` | OPUS5, SONNET55, HAIKU55, PEBP, O8 |
| 8 | Delegate bounded independent work under project policy | both | unclear delegation criterion or overlapping ownership | define scope, consumer and acceptance; parallelize independent work. Opus 5 damping does not impose low spawn counts or ban required independent verification across all models | SA, OPUS5, O14 |
| 9 | State scope explicitly | both | one example is silently generalized | name "every file/case matching X"; keep its qualifier | SONNET5 |
| 10 | Tables for data; steps for real dependencies | both | a table hides a procedure or unrelated blocks have no boundary | separate data tables, numbered procedures and headed/tagged instruction blocks | CCBP, O9 |
| 11 | Concrete examples or named references | both | "clean"/"thorough"/"professional"/"good" without evidence | name `<file>` as the pattern or supply a short before/after example | PEBP, SONNET5 |
| 12 | House artifact budgets; supporting material in references | both | SKILL.md over 500 lines / 2000 words, agent `.md` over 1500 words, hook `additionalContext` over 9000 chars (session) or 500 chars (per-prompt) | move overflow to `references/`; preserve contracts. These are house thresholds; verify runtime caps separately | SKC, HOOK, house policy |
| 13 | Response length follows the user/output contract; rule 12 governs files | both | missing length guidance or model-wide numeric-cap assumption | request concise replies where appropriate; "<=5 bullets, 1 sentence each" is an optional example, not a Codex requirement. Inherited limits remain unless explicitly changed; otherwise `uncertain` | PEBP, OPUS5, O6 |
| 14 | `[DICT: ...]` only when its size pays off | both | file under ~150 lines, or fewer than 5 abbreviations each reused fewer than 3 times | spell terms inline; keep the header only at CLAUDE.md / large-rule scale | house judgment |
| 15 | Codex discovery, combined size and nested overrides | openai-only | automatic mid-run reread assumed or combined chain nears 32 KiB | discovery is once per run; `project_doc_max_bytes` defaults to 32 KiB combined. `AGENTS.override.md` precedes `AGENTS.md` per level; nearer directories override earlier guidance. Verify configured limits | O1, O2, O3 |
| 16 | Instruction files hold commands, style and conventions | both | history, marketing or task state in CLAUDE.md/AGENTS.md | move history to README; keep actionable project conventions | O4 |
| 17 | Respect runtime instruction precedence | both | local file claims system/safety authority or root AGENTS.md outranks a nested override | remove the authority claim; root-directory files are not system messages. Codex directory precedence follows rule 15 | O13, O1 |
| 18 | State success, stopping conditions and authorization boundaries | both | "keep working until done" lacks criteria or irreversible-action boundaries | complete authorized work; ask only outside existing authority. Preserve explicit approval gates; invent no universal confirmation flow | O10 |
| 19 | Detect fossils without changing pinned facts | both | retired model id or migration-relative behaviour rule | state the current rule directly. A passage without a model id may be rewritten/deleted; one naming a model id is REPORTED, never deleted/repointed here. Preserve the lossless guard | house judgment |
| 20 | Preserve review scope and downstream filtering | claude | generic model advice changes the requested severity scope | report evidence-backed findings within scope; filter only in the authorized stage. Preserve explicit severity caps and review gates; propose policy changes separately | OPUS5, SONNET5, house policy |

---

## Lossless guard - what may never change

A rewrite that touches ANY of the following has changed a fact, not just its prose - stop and leave the line as
is:

| Never rewrite away | Examples |
|---------------------|----------|
| Exact paths, flags, thresholds, numeric limits | a glob, a CLI flag, a byte/char cap, a line-count budget |
| Versions and model ids | `6.1.4`, `claude-opus-5-5`, a pinned dependency version |
| An incident-backed `!=`/NEVER row | anything `avoid.md` or the file's own text ties to a named past failure |
| Canonical mode/verb lists | `status \| install \| upgrade \| enable \| disable \| uninstall \| purge` and similar fixed enumerations |

Compression and de-duplication (rule 2, memory-guide.md's own patterns) still apply on top of this guide -
prompting-quality rewrites and fact/dedup edits share the same file and the same non-growth budget.

---

## Verdict table - what a batch agent returns

Alongside the batch's normal per-file JSON (`references/hard-sync.md` for the `hard` shape), a batch agent that
applied a prompting-quality rewrite lists each one:

```
file :: rule# :: line :: before -> after
```

One row per rewrite, `before`/`after` quoted verbatim and short. A Phase 3 checker re-reads each row against the
rule's `detect` signal and confirms no fact moved.

---

## Stop condition

Stop compressing or rewriting a passage the MOMENT a fact would change - a path, a version, a flag, a threshold, a
model id, an incident-backed prohibition, or a canonical list. Report it as `uncertain` instead of guessing.

## Legend

Vendor guidance is evidence, not authority to replace house policy. Keys resolve directly:
`PEBP`=https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices
`OPUS5`=https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-opus-5
`SONNET5`=https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-sonnet-5
`SONNET55`, `HAIKU55`=the same path ending `prompting-claude-sonnet-5-5`, `prompting-claude-haiku-5-5` (the 5.5 pages extend the 5 ones).
`CCBP`=https://code.claude.com/docs/en/best-practices `SA`=https://code.claude.com/docs/en/sub-agents
`SKC`=https://code.claude.com/docs/en/skills `HOOK`=https://code.claude.com/docs/en/hooks (runtime cap 10,000 chars); style budgets are house policy.
`O1`, `O2`, `O3`, `O4`=https://learn.chatgpt.com/docs/agent-configuration/agents-md (discovery, size, layering, conventions).
`O5`, `O6`, `O9`, `O11`, `O12`, `O13`=https://developers.openai.com/api/docs/guides/prompt-engineering (clarity, format, examples, roles).
`O7`=https://developers.openai.com/api/docs/guides/reasoning-best-practices (internal-reasoning prompts).
`O8`=https://developers.openai.com/api/docs/guides/evaluation-best-practices (evidence/evaluation).
`O10`=https://developers.openai.com/api/docs/guides/reasoning (goals, constraints, verification).
`O14`=https://code.claude.com/docs/en/sub-agents (delegation, not a universal spawn-count limit).
