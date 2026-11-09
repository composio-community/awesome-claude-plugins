# Transform commands: fields and flags

Lookup detail for the transform subcommands. What you must and must not do is in
`SKILL.md`; this file says what a field means and what a flag changes.

## `transform plan "<intent>" --edits-file <path|->`

Validates the edits and returns them as diffs with a plan id; nothing is applied.
`--scaffold <table>` (repeatable) generates a staging skeleton (`stg_<table>.sql`
plus per-model YAML with key tests and PII meta) from the `.dex/` cache, instead
of or on top of hand-authored edits.

- `data.row_attribution`: on a model that already exists, every predicate, join,
  source, and grain change is named and measured on its own against the prior
  model, alongside the whole-model net. Column expressions, aliases, and ordering
  report nothing. On DuckDB the deltas are measured automatically; on a billed
  connector the changes are named for free and measuring needs `--attribute-rows`
  plus `--confirm --budget`. `attributed: false` carries the reason (macro SQL, a
  jinja conditional, a renamed CTE, an unprofiled parent). Advisory: nothing here
  refuses a plan.
- Shape warnings: the authored SELECT list against the columns `schema.yml`
  declares, in both directions, silent where the model declares none.
- The resolved-key convention: a model exposing a raw foreign key where at least
  three siblings sharing its folder and layer prefix all resolve theirs, none
  passes one through, and the project holds a parent to resolve against. It names
  its precedent and its parent, judges only models the plan authors, and is the
  one check a project can decline (`conventions.resolved_keys: false`).

## `transform apply [plan-id]` and `transform plans`

`apply` writes a plan into the dbt project: the latest unapplied plan of any kind
when no id is given. If a human edited a file after planning, nothing is written
and the divergence comes back as diffs with `needs_confirmation`. `plans` lists
stored plans, pending and applied, newest first.

## `transform references <name> [more...] [--kind <k>] [--full]`

Where each name is used across model SQL, `schema.yml`, `dbt_project.yml`,
macros, semantic YAML, seed headers, and installed packages. Repo-only and free.

- `--kind` narrows to `model`, `source`, `seed`, `snapshot`, `macro`, `var`,
  `column`, `metric`, `entity`, `dimension`, or `measure`. Leave it off when
  unsure what the project calls the thing; the answer will say.
- `data.completeness` is `complete` only when every reason to doubt the answer is
  ruled out; `data.limits` names each remaining one, and `data.indeterminate`
  lists the call sites dex could not resolve (for example
  `{{ ref(var('x')) }}`), each with a file and a line.
- A bare column name is matched project-wide (`scope: name_matched`); a qualified
  `model.column` is resolved through the `ref()` graph, and same-named columns
  outside that lineage are marked `same_name_elsewhere`.
- Capped at 200 occurrences across 50 files; `--full` lifts both.

## `transform rename <kind> <old> <new> [--edits-file <f>]`

Generates every edit a rename needs (the definition, every model that selects
it, every `schema.yml` that documents or tests it, every semantic reference, and
a seed header) and stores them as one plan. Kinds: `column`, `var`, `model`,
`seed`, `snapshot`, `macro`, `source`. Repo-only and free.

- A bare column name is refused, and the refusal lists the models defining a
  column of that name. A report may be imprecise; a rewrite may not.
- It refuses on a reference it could not resolve statically, a name an installed
  package also defines, a column handed to a macro as a literal string, and a
  SELECT list it cannot read.
- A bare `select *` is not a refusal: it carries the column through under the new
  name, and `notes` says so.
- SQL is rewritten by splicing only the identifiers, so comments and formatting
  survive.
- `data.sites` counts occurrences per reference form, in the same vocabulary as
  `transform references`.

## `transform remove <kind> <name> [--edits-file <f>]`

Removes the definition and refuses while any read survives, naming each with a
file and a line. Same kinds and refusals as `rename`. Hand-authored read edits
passed with `--edits-file` are validated and stored in the same plan, so the
removal stays atomic.

## `transform place <column> --targets <a,b> --expr "<sql>" [--explain]`

Finds the lowest model in the `ref()` graph that every target descends from and
that already projects the inputs `--expr` reads, defines the column there, and
threads it down every chain, with a `schema.yml` entry at the ancestor and at each
target. The inputs are parsed from `--expr`. `data.reasoning` names the ancestor,
why it is the lowest, which targets descend from it, and the chain. `--explain`
returns the reasoning and stores no plan.

`data.strategy` is `per_target` when there is no common ancestor, the lowest one
lacks an input, or two candidates tie. dex will not go further upstream to pull
an input down, because that turns one placement into an unbounded rewrite. The
fallback duplicates the derivation in each target, and those copies will drift.

## `transform build --target dev [--verify] [--for-plan <id>] [--no-install-deps]`

Runs `dbt build` against a dev target, with a cost preflight first.

- dbt has no dry-run, so the engine compiles the project and prices each node
  itself. On BigQuery the first unconfirmed call returns `needs_confirmation`
  with `estimated_bytes` and a `per_table_bytes` breakdown; each statement is then
  capped server-side by the profile's `maximum_bytes_billed`, and billed bytes are
  reported afterward.
- A refusal over the ceiling carries a calibration line from `.dex/spend.jsonl`.
  Builds over-estimate most on a partitioned or clustered warehouse.
- dbt runs with its working directory pinned to the project dir, so relative
  paths in `profiles.yml` resolve against the project. When packages are declared
  and `dbt_packages/` is missing, the engine runs `dbt deps` first;
  `--no-install-deps` refuses instead.
- Each node in `data.nodes` carries dbt's `unique_id` beside a readable `name`.
- `data.outcome` says what the run established: `empty_selection`, `unrelated`,
  `stale`, or `validated`. `--for-plan <id>` adds `coverage`.

### `--verify`

Sweeps the nodes this build touched with the `maintain verify` checks and
reports under `data.verification`. A green build says dbt executed; it does not
say the model holds the rows it should. An inner join written where a left join
was meant loses rows, raises nothing, and passes every uniqueness and not-null
test over the smaller result.

- `ran` is always present. When it ran, `findings` is ranked as `maintain verify`
  ranks it, `scope` names the models covered, and `suppressed` names each class
  that could not run and why.
- Findings never enter `errors` and never change the status; a pointer line in
  `warnings` names the count.
- A failed build still reports which node failed and which were skipped because
  of it, usually a faster read than the dbt log.
- On a billed connector the sweep's row counts are a `(row counts)` line in the
  build's estimate. A cold dev target that cannot be priced upfront is priced
  again after the build, against the reservation it already holds.

## `transform test --scaffold <model>`

Plans a `unit_tests:` skeleton: a `given` block per `ref()`/`source()` input
carrying only the columns the model reads, typed from the cache, and an `expect:`
stub that fails until filled in.

## `transform test --mutate <model> [--max-mutants <n>] [--check-equivalence|--no-check-equivalence]`

Plants one standard analytics defect at a time in the model's compiled SQL (a
flipped boundary, a dropped or negated filter, a swapped join type, a removed
`CASE` branch, an inverted ratio, a shifted window frame, `sum` for `max`), runs
the model's own tests against each, and reports which defects nothing caught.

- Read `data.counts`, then the survivors, listed first. Each carries `defect` (what
  would now be wrong) and `suggested_test` (the test that would catch it).
- Each survivor's `equivalence.status` says which test to suggest, and
  `suggested_test` already follows it. `distinguishable` changes the model's
  output on the dev data, so an assertion over that data would catch it today;
  these are listed first. `equivalent` produces exactly the model's rows there,
  so only a unit test fixture that reaches the case can catch it. The comparison
  is four counts, never a row. It runs on its own on DuckDB; on BigQuery or
  Snowflake it needs `--check-equivalence` and joins the same single estimate;
  other connectors report `not_checked`, which carries a `reason`.
- `score` is a ratio of two small integers over one model.
- `baseline.excluded` names tests already failing against the unmutated model;
  every verdict is relative to the tests that passed.
- Capped at 20 mutants (`--max-mutants` narrows, never widens), sampled across
  defect classes; `cap.elided` reports the cut.
- Mutants build as ephemeral models in a throwaway copy, so nothing is written
  and no relation is created or replaced. Dev-target only. On a billed connector
  the batch is one estimate and one `--confirm`; a budget that runs out leaves
  the rest `not_run`.
- Refused for free when the model has no tests, is a Python model, belongs to a
  package, or has no mutable SQL.

## `transform deps`

Installs or refreshes dbt packages. No confirmation needed: it writes only inside
the project and never touches the warehouse.

## `viz preview`

Not yet implemented; it returns `not_implemented`.
