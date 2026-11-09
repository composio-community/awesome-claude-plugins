---
name: transform
description: 'Use this to author and change a dbt project or a semantic layer: bootstrap a project (`transform init`), write or refactor models from staging to marts, add tests and docs, and define semantic models, entities, dimensions, and metrics in MetricFlow, Apache Ossie or SLayer YAML. Reach for it instead of editing model files by hand whenever a change spans more than one file or must stay consistent with the project: it validates the edit against the real schema, returns a reviewable diff with a plan id, and catches what otherwise fails at `dbt run`, such as wrong columns or broken refs. Bug-fix tickets count: "this model returns wrong numbers, fix it" is a transform task. Also for "build a staging model for this table", "define a revenue metric", "add a dimension to this entity". Warehouse builds are dev-target only, gated, and cost-surfaced first. If you have not verified the source tables'' columns or grain, use explore first. For a project that drifted from the warehouse, use maintain.'
compatibility: 'Needs a local shell and uv. On first use, uv downloads the exmergo-dex-core engine from PyPI at the version scripts/run.py pins. Runs in Claude Code or another agent that loads Agent Skills and has a shell, not in claude.ai chat.'
---

# Transform

Author and refactor the dbt project, both the SQL (staging to marts, tests,
docs) and the semantic layer on top. You write the file content; the engine
validates it, computes the diffs, and stores a plan. Nothing reaches the project
until `transform apply`, and any build runs against a dev target only.

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
  yourself. Never fall back to editing the dbt project by
  hand instead: the validation, the diffs, and the dev-target gating live in the
  engine, so any other path is unguarded.
- The first command in a fresh environment installs the engine and can take tens
  of seconds. Offer `run.py --warm` once at setup to pay that up front; do not run
  it before ordinary commands.

## Transforming, step by step

1. **No dbt project yet?** Offer `transform init "<name>" --connector <c>` before
   anything else. Ask the user for the name and **confirm the connector with
   them**: init never defaults one. Do not hand-write the skeleton. Read
   `${CLAUDE_SKILL_DIR}/references/init-and-dev-target.md` for per-connector
   setup, `--layered-schemas`, and the namespace warning.
2. **Find every use first** when a change has to land in more than one place:
   `transform references <name> [more...]`, free on every connector. Read
   `data.completeness`; when it is `incomplete`, open each site under
   `data.indeterminate` and decide yourself rather than treating the resolved
   list as exhaustive.
3. **Author and plan.** Write the content into an edits file and run
   `transform plan "<intent>" --edits-file <path|->`
   (`--scaffold <table>` drafts a staging model from the `.dex/` cache). The
   payload shape and each `kind`'s rules are in
   `${CLAUDE_SKILL_DIR}/references/edit-kinds.md`. For a rename or a removal,
   use `transform rename` / `transform remove` instead of assembling edits. For a
   derived column several models need, ask `transform place` where it belongs.
   For the semantic layer, use the command for the vendor `semantic.vendor`
   names (`dex config get semantic` reads it): `semantic define|update|plan`
   (dbt), `semantic ossie define|update|plan` (native Ossie), or
   `semantic slayer define|update|plan` (SLayer model files). Read
   `${CLAUDE_SKILL_DIR}/references/semantic-layer.md` first.
4. **Read the plan** (rules below), then `transform apply <plan-id>`.
5. **Build and verify:** `transform build --target dev --verify`.
6. **Measure the tests** right after you author or scaffold them, and before
   telling the user a model is covered: `transform test --mutate <model>`.

Per-command fields and flags are in `${CLAUDE_SKILL_DIR}/references/commands.md`.
Shipped macros are in `${CLAUDE_SKILL_DIR}/references/macros.md`. Read them when
a field, flag, or macro you need is not described here.

## Rules that change what you do

### Bootstrapping

- Credentials are discovered, never asked for. When init or a build reports
  missing credentials, relay the fix it names (for example
  `gcloud auth application-default login` or `databricks auth login`); never ask
  for a key, token, or password.
- Init warns when a namespace it would build into already holds objects. Relay
  it and ask whether the content is the user's (a previous dev build) or
  unrelated. If unrelated, discard the freshly scaffolded project (nothing was
  built), point the config at a different dev namespace, and re-run init.

### Reading a plan

- `data.row_attribution` names every predicate, join, source, and grain change on
  an existing model, each measured against the prior model. A change you were not
  asked to make that carries a non-zero `delta` is the signal to look at: the
  model still compiles, and now returns different rows. `attributed: false` is
  unknown, not zero. On a billed connector, measuring needs `--attribute-rows`
  plus the cost handshake, so ask the user before spending.
- A SELECT list that diverges from the model's `schema.yml` is warned in both
  directions. Fix whichever side is stale, and tell the user which one you
  decided it was.
- A warning that a model **exposes a raw foreign key with no resolved
  counterpart** names sibling precedent and a parent. Prefer resolving it the way
  the siblings do. If the raw key is deliberate, say so plainly. Never switch the
  check off yourself: `conventions.resolved_keys: false` is a house-style
  decision to recommend to the user.
- An entirely `unchanged` semantic plan changes nothing: check whether you meant
  to edit something.
- Read every note on an Ossie plan: each names something that was not checked.

### Applying and refactoring

- If `transform apply` returns `needs_confirmation` because a human edited a
  file, re-plan against the current state. Re-run with `--confirm` only when the
  user says so.
- List plans with `transform plans`; never browse `.dex/plans/` by hand.
- A delete is refused while a surviving file still `ref()`s it. Carry the edits
  that remove those references in the same plan.
- `transform rename` needs a column named as `model.column`. It refuses rather
  than half-applying, and there is no override: fix what the refusal names and
  re-run. Compare `data.sites` with the `transform references` output; the two
  agreeing is your evidence nothing was dropped.
- `transform remove` never rewrites a read. Author those edits yourself (only you
  know whether `{% if var('x') %}` is dropped or unguarded) and pass them with
  `--edits-file` in the same call.
- `transform place`: read `data.reasoning` before applying (`--explain` asks for
  free). When `data.strategy` is `per_target`, relay the reason rather than
  applying duplicated copies on the user's behalf; often the fix it names is what
  they want.
- Use a shipped macro (`transform macro <name>`) rather than hand-rolling or
  inlining a copy of it, and do not hand-write `generate_schema_name`. When a
  plan warns that a called macro is missing, scaffold it. Do not "fix" the
  BigQuery quirks `unpivot_json_object` absorbs back in.

### The semantic layer

- Prefer `--definitions-file` over `--edits-file` for dbt semantic models: send
  only the definitions that change, so every other byte of the shared file
  survives. Use `--edits-file` to create, move between, or empty files.
- `semantic define` refuses a name that exists and `update` one that does not;
  use `semantic plan` for a change that mixes both. A removal is
  `"op": "delete"` on `update` or `plan`. If a surviving metric still reads what
  you remove, add that reader's own delete or update to the same payload.
- A project with no MetricFlow time spine cannot parse semantic models. Author
  one (a day-grain date model plus a `time_spine:` config) in the same or a
  separate plan.
- For native Ossie, edit only documents whose paths are listed in
  `semantic.ossie.files`, as whole documents. `maintain reconcile` never authors
  into Ossie; this command does.
- For SLayer, edit only the model files listed in `semantic.slayer.models`, as
  whole files in the pinned format `version`. dex owns those files: never
  generate them with `slayer import-dbt`, and never run SLayer tooling that
  rewrites them (`slayer serve`, `slayer ingest`,
  `validate-models --persist-cardinality`). The wrapper installs the `[slayer]`
  extra for `semantic slayer`; a `reason: prerequisite` refusal names the
  install to relay.
- SLayer declares no entities, no aggregation on a saved measure (the formula
  carries it, as in `amount:sum`), and no per-measure time dimension (only the
  model's `default_time_dimension`). Never write those into a SLayer model.
  SLayer itself ignores a key it does not know, so dex refuses any key the
  pinned release does not declare (`[unknown_key]`, naming the file, the element
  and the release, and what SLayer uses instead where there is an equivalent):
  remove it rather than looking for a spelling that passes.

### Seeds and PII

- A seed puts values into git. Never build one out of warehouse rows you have not
  looked at: detection reads names and types, never values, so it cannot see
  personal data under a neutral column name.
- A seed whose header looks like personal data is refused; the refusal names the
  `pii_overrides` entry a human can add to `.dex/config.yml`. Recommend it. If the
  user agrees, propose it with `dex config set pii_overrides '<list>'` (the whole
  list, existing entries included: read them with `dex config get pii_overrides`)
  and let them confirm the diff; never confirm it yourself.
- PII flags are stamped into model and column `config.meta` at any confidence.
  Only a human `pii_overrides` entry removes the stamp.

### Building

- `transform build` runs against a dev target only. Production-looking targets
  are refused outright, and `--confirm` cannot override that.
- Before the cost gate, a build refuses for free when `.dex/config.yml` and
  `profiles.yml` disagree, or when the dev database does not exist. Relay the fix
  it names: edit one file to match the other (the engine never rewrites
  `profiles.yml`), or give the user the `CREATE` or `GRANT` statement to run.
  dex will not create a database itself.
- On a billed connector the first call returns `needs_confirmation` with an
  estimate (`per_table_bytes` names which node drives it). Surface it, get an
  explicit budget from the user, and re-issue with
  `--confirm --budget <magnitude>` grounded in that number. Never invent a budget, and never retry
  with a raised one after an over-ceiling refusal without asking. Relay the
  calibration line, and point out that the ceiling binds on the estimate.
- A `suggested_session_ceiling` is the project's one-time ask for a daily cap.
  Surface it, get the user's answer, and add `--session-ceiling <value>` or
  `--no-session-ceiling` to the same re-issue. Never answer it for them.
- `--verify` is priced into the build's own estimate as a `(row counts)` line, so
  never add a second budget for it. An `ok` envelope with `data.offer` means the
  build is done and billed: relay the offer instead of re-running the build.
- Verification findings never fail the build. Do not treat one as a failure or
  re-run to make it go away: relay the finding, its two counts, and the join it
  names. Relay a suppression too: it separates "checked and clean" from "not
  checked".
- On ClickHouse, keep the `custom_settings` block in `profiles.yml`, and on Trino
  the `session_properties` block; each is how the confirmed budget becomes a
  server-side cap.

### Test mutation

- Relay each survivor's `defect` and `suggested_test`: the user's next action is
  to write that test. Quote `score` as context, never as a grade, and never
  compare it between models.
- Each survivor's `equivalence.status` decides which test to suggest. Relay
  `distinguishable` survivors first: an assertion over the dev data would catch
  them today. An `equivalent` one can only be caught by a unit test fixture that
  reaches the case, so say that rather than suggesting an assertion. On BigQuery
  or Snowflake the check needs `--check-equivalence` and joins the same single
  estimate, so ask the user before adding it. Relay a `not_checked` survivor's
  `reason` rather than guessing a label.
- Check `baseline.excluded` (tests already failing) and `cap.elided` (more sites
  than the 20-mutant cap) before calling a result clean, and relay any `not_run`
  rather than reading a short list as complete.

## References

- `${CLAUDE_SKILL_DIR}/references/edit-kinds.md`: the edits payload, every
  `kind`, its path family and validation, the three kinds of test, and deletes.
- `${CLAUDE_SKILL_DIR}/references/commands.md`: `references`, `rename`, `remove`,
  `place`, `build`, `build --verify`, `test --mutate`, and `deps` in detail.
- `${CLAUDE_SKILL_DIR}/references/init-and-dev-target.md`: per-connector init and
  how to prepare a dev target.
- `${CLAUDE_SKILL_DIR}/references/semantic-layer.md`: authoring dbt semantic
  models, native Ossie documents, and SLayer model files.
- `${CLAUDE_SKILL_DIR}/references/macros.md`: the shipped macros and the
  `unpivot_json_object` contract.
