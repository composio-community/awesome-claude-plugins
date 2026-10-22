---
name: maintain
description: 'Use this to find out whether an existing dbt project or semantic layer (dbt, Ossie or SLayer) is correct against its warehouse, and if not, why. `maintain verify` checks the project as it stands; against a .dex/ snapshot, `maintain check` finds schema, volume, grain, and semantic drift and `maintain reconcile` proposes the fix. Reach for it whenever an existing project is suspected wrong, whether or not anything is known to have changed: "this model is wrong, work out why", "the numbers look too high", "some rows are missing", "this column is empty", "duplicates in my fact table", "the project is broken", "diagnose why this test fails", "a test fails and nobody changed the model", "the dashboard moved but the code did not", "did anything drift", "the row count dropped", "the metric definition changed". Read-only; fixes come back as reviewable diffs and never overwrite hand-written work. Writing the fix, or repairing a model you just edited, is transform''s; a data question with no project is explore''s.'
compatibility: 'Needs a local shell and uv. On first use, uv downloads the exmergo-dex-core engine from PyPI at the version scripts/run.py pins. Runs in Claude Code or another agent that loads Agent Skills and has a shell, not in claude.ai chat.'
---

# Maintain

Keep the repository correct as the world underneath it moves, on both of its
axes: the dbt project and the semantic layer. Drift is measured against a
**baseline**, the `.dex/snapshot.json` fingerprint of the warehouse map and of
each project layer. Detection is read-only; only `reconcile` proposes edits, and
`transform apply` is the one door that writes them.

<!-- dex:procedure:begin -->
## Procedure

dex works in one loop: explore, transform, maintain. Every step runs one engine
command, reads the single JSON envelope it prints, and decides the next step
from that envelope.

1. **Explore before you write.** Before writing or fixing SQL against a table
   whose columns, types, grain, or join keys you have not verified in this
   session, run `explore map` (or `explore profile <tables>` for a few named
   ones) and read its grain, keys, PII flags, and data-quality findings. Answer
   ad-hoc questions with `explore query`, never with a raw database client.
2. **Plan the change.** Author the file content and hand it to `transform plan`
   (or `semantic define|update|plan` for the semantic layer). Nothing is written
   yet. Read the diffs, the `warnings`, and, on a model that already exists,
   `data.row_attribution`; re-plan until they describe the change you meant.
3. **Apply it.** `transform apply <plan-id>` writes the plan as a reviewable git
   diff. A human edit made since planning comes back as `needs_confirmation`:
   re-plan against the current files.
4. **Build and verify on dev.** Run `transform build --target dev --verify`. Read
   `data.verification.ran` first, then relay the findings and anything under
   `suppressed`. A green build says dbt ran, not that the rows are right.
5. **Maintain.** `maintain check` compares the warehouse and the project with the
   `.dex/snapshot.json` baseline, and `maintain verify` checks the project as it
   is now with no baseline. `maintain reconcile` proposes the fix as a plan,
   applied with `transform apply`. Take `maintain snapshot` after a known-good
   build.

At every step: a `needs_confirmation` envelope waits on the user's decision (a
spend, or a `dex config` diff), never on yours; only a human clears a PII
flag; and you never edit the dbt project, `.dex/config.yml`, `.dex/cache.json`,
or `.dex/plans/` by hand in place of the command that guards them.
<!-- dex:procedure:end -->

## Running the engine

Run commands from the user's project directory, so dex finds that project's
configuration and writes its cache there. The wrapper path is absolute:

- In Claude Code, `${CLAUDE_SKILL_DIR}` is supplied by the host.
- In Codex or another Agent Skills host, resolve the directory containing this
  installed `SKILL.md` from the path the host provides. Substitute that absolute
  directory for `${CLAUDE_SKILL_DIR}` in every command and reference below,
  including paths in the bundled reference files. Do not assume that environment
  variable exists, and do not change into the installed skill directory.

```bash
uv run --no-project --script "${CLAUDE_SKILL_DIR}/scripts/run.py" <subcommand> [flags]
```

Installed as a plugin or skill, `run.py` runs the `exmergo-dex-core` engine from
PyPI at the exact version its `DEX_CORE_VERSION` line pins, built from
https://github.com/exmergo/dex/tree/main/packages/dex-core.

- `uv` is a prerequisite that Claude Code does not install. If the shell reports
  `uv: command not found`, stop and tell the user to install it
  (`brew install uv` or `pipx install uv`, or the installer for their platform
  from the uv docs), then re-run. Tell them the command; never run an installer
  yourself. Never diff the warehouse against the project
  by hand instead: the drift axes and the baseline comparison live in the
  engine, so any other path is guesswork.
- The first command in a fresh environment installs the engine and can take tens
  of seconds. Offer `run.py --warm` once at setup to pay that up front; do not run
  it before ordinary commands.

## Maintaining, step by step

1. **Pick the entry point.** With a baseline, start at `maintain check`: it
   sweeps every axis and ranks findings by blast radius. With no baseline, or on
   a project whose numbers were never right, start at `maintain verify`, the one
   command here that needs no snapshot: it answers "is this right" rather than
   "what moved".
2. **Read `warnings` first, always.** They carry the reasons the baseline may no
   longer describe the warehouse (a cache newer than the snapshot, a baseline
   pinned from a stale cache). That line bounds every finding above it and is
   never in `findings`.
3. **Drill into one axis** when a finding needs depth: `maintain schema`
   (structure), `maintain volume` (row counts), `maintain grain` (key uniqueness,
   declared grains, fanout), or `maintain semantic` (definitions and dangling
   references). Each takes optional `<objects>`.
4. **Reconcile.** `maintain reconcile [<class>]` stores the proposed edits as a
   plan and prints a `plan_id`. Read each proposal's `kind` (rules below), then
   apply with `transform apply <plan-id>`. A human edit made since detection
   comes back as a conflict, never an overwrite.
5. **Re-baseline** once the result is known-good: `explore map`, then
   `maintain snapshot`.

Per-axis fields and finding codes are in
`${CLAUDE_SKILL_DIR}/references/axes.md`. Read it when a finding's code or field
is not described here.

## Rules that change what you do

### The baseline

- Take `maintain snapshot` right after a known-good build, and tell the user to
  **commit `.dex/snapshot.json` like a lockfile**, so the whole team diffs
  against one reference.
- Never snapshot a state that is already drifted: `check` would then mask the
  very drift that matters. To accept a change as the new normal, re-run
  `explore map` first, then `maintain snapshot`.
- On a warehouse past the rank cutoff (more than 50 objects), run
  `explore map --full` before snapshotting, or the baseline cannot compare
  columns for the objects it never profiled. A partial snapshot is still valid;
  relay its coverage warning rather than calling the result clean.
- After a project-only refactor (moved model files, a renamed dbt project), use
  `maintain snapshot --project-only`. It opens no connection and carries the
  warehouse evidence forward unchanged, so it never launders a stale warehouse
  into a fresh one.

### Reading findings

- `key_lost_uniqueness` means the data changed: a key proven unique is not any
  more. `declared_grain_not_unique` means nothing changed: the project declares a
  grain the data never had, so the fix is to the declaration (widen it, dedup
  upstream, or drop the claim), not to the data.
- On `maintain semantic`, read `unavailable` before hunting for an element kind.
  A native Ossie layer has no measures and no entities, so their absence is the
  format, not drift.
- `semantic_format_changed` or `semantic_vendor_changed` means the definitions
  were not compared by content, because the reader changed. Re-snapshot once the
  upgrade is accepted, rather than reading the quiet definition diff as clean.
- On a SLayer layer, a model file written in another format `version` is refused
  by the reader and named in `warnings`, and every definition in it then comes
  back as `definition_removed`. Nothing was removed: the file could not be read.
  Never reconcile those as removals; the fix is the file rewritten in the
  current `version` with `semantic slayer update` (transform skill).
- `join_cardinality_exceeded` means a join's declared arity does not hold, so
  measures across it are inflated. A join declaring no cardinality is in
  `warnings` as unchecked, not passed: relay it as undetermined, and suggest
  declaring the `cardinality` the user expects so the next run measures it.
- SLayer's own schema findings (`declared_column_missing`,
  `declared_type_conflict`, `declared_relation_missing`,
  `declared_dependency_dropped`) are SLayer's `validate-models` rules run on
  dex's metadata. Do not run `slayer validate-models` to confirm them: it reads
  through SLayer's datasource credentials, and opening SLayer's storage can
  migrate and rewrite the model files dex owns.
- On `maintain verify`, read `data.suppressed` before reading an empty
  `data.findings` as a clean bill. A project that does not compile suppresses
  every other check. Row population is conservative by design, so a quiet answer
  is weaker evidence than a finding, and `warnings` names the models that could
  not be lined up.
- For a change you just made, use `transform build --verify` (same sweep, scoped
  to that build). Use `maintain verify` for the whole project, or when somebody
  else ran the build.

### Reconcile proposals

- **On a large `check` report, read the ratio before the findings.** Run
  `maintain reconcile` and read `mechanical_count` and `advisory_count` beside
  the finding codes, before the findings list. Mechanical proposals exist only
  where dex can author the fix itself (the two cases below), so zero of them
  across hundreds of schema findings, with no `column_dropped`,
  `column_retyped` or `table_dropped` among the codes, usually means the
  baseline is behind the project rather than the warehouse having moved: every
  finding is additive, and most of them are the project's own recent work.
  Re-baseline with the discipline above (`explore map --full`, then
  `maintain snapshot`) before triaging findings one by one. A type change is
  advisory on every format, so read the codes for retypes rather than inferring
  them from the count.
- **`mechanical`** (schema drift): re-scaffolds a dex-scaffolded staging model,
  or edits the drifted columns into a declaration. Still a reviewable diff: read
  it for hand-written logic the scaffold cannot know about before applying.
- **`advisory`** (grain, volume, semantic): a decision for the user, at most
  backed by a test edit that makes the break visible in builds. dex cannot dedup
  a warehouse or decide whether a new `'refunded'` status belongs in a metric, so
  relay the decision rather than make it.
- **A type change is advisory on every format.** The proposal names both
  spellings, and the edit is the user's. On ClickHouse nullability is part of the
  type, so a column that starts accepting nulls is reported as a retype.
- With no editable dbt project, every proposal is advisory and no plan is stored.
  Authoring into a native semantic layer is `semantic ossie` or
  `semantic slayer` in the transform skill, never this command. The exception
  is a SLayer layer's own schema findings (`declared_*`): reconcile stores their
  removals as a second plan, `data.semantic_plan_id`, through the
  `semantic slayer update` route. Relay both plan ids; each applies with
  `transform apply`.

### Cost

- Schema, volume, and the definition half of `semantic` read metadata and are
  free everywhere. Grain and the dimension-cardinality half of `semantic` scan.
- Asked for directly on a metered connector, `maintain grain` returns
  `needs_confirmation` with an estimate. Surface it in human units, get an
  explicit budget from the user, and re-issue with
  `--confirm --budget <magnitude>` in the estimate's unit: bytes on BigQuery, warehouse-seconds on
  Snowflake and Databricks, compute-seconds on Redshift, database-seconds on
  Postgres and ClickHouse, cluster-seconds on Trino. On DuckDB nothing prompts.
- `check`, `semantic`, and `verify` answer first and offer second: they return
  `ok` with final findings, and the price of the rest under `data.offer`
  (`data.axes_run` says what ran, `data.offer.axes` what the estimate adds).
  Confirming is the user's choice, not a required next step: quote the estimate,
  say which axes are still dark, and let them decide. A triage that stops at the
  free axes is complete work.
- Never invent a budget. After an over-ceiling refusal, never retry with a raised
  budget without asking. Relay its calibration line, and point out that the
  ceiling binds on the estimate, so a budget set at that fraction of the estimate
  is refused again.
- A `suggested_session_ceiling` is the project's one-time ask for a daily cap.
  Surface it, get the user's answer, and add `--session-ceiling <value>` or
  `--no-session-ceiling` to the same re-issue. Never answer it for them.

### Data and authority

- Raw rows and dimension values never cross the envelope; grain and cardinality
  checks use aggregates only.
- Human edits to the project and to the semantic layer are authoritative. On a
  conflict the engine surfaces the divergence; relay it and ask, never overwrite.

## References

- `${CLAUDE_SKILL_DIR}/references/axes.md`: what each axis detects, the snapshot
  contents, `verify`'s finding classes, and what each axis costs.
