# The edits payload and every edit kind

You author the file content; the engine validates it, computes the diffs, and
stores the proposal as a plan. What you must and must not do is in `SKILL.md`;
this file is the payload's shape and each kind's rules.

## The payload

Hand content over with `--edits-file <path>` (or `-` to read stdin):

```json
{"edits": [
  {"path": "models/staging/stg_orders.sql", "kind": "model_sql", "content": "..."},
  {"path": "models/staging/stg_orders.yml", "kind": "schema_yml", "content": "..."},
  {"path": "snapshots/snap_orders.sql", "kind": "snapshot_sql", "content": "..."},
  {"path": "seeds/country_vat.csv", "kind": "seed_csv", "content": "..."},
  {"path": "tests/assert_totals_reconcile.sql", "kind": "test_sql", "content": "..."},
  {"path": "analyses/email_skew.sql", "kind": "analysis_sql", "content": "..."},
  {"path": "models/marts/dim_orders.sql", "kind": "model_sql", "op": "delete"}
]}
```

## Kinds and what each must be

| Kind | Where | Must be |
|---|---|---|
| `model_sql` | model paths | a single read-only SELECT once its jinja is stripped |
| `schema_yml` | beside a model, snapshot, seed, test, or analysis | YAML dbt accepts |
| `semantic_yml` | model paths | validated against MetricFlow's schemas, cross-reference-checked, and parsed by dbt; optional on `semantic define\|update\|plan`, which imply it |
| `macro_sql` | macro paths | only macro definitions and jinja comments |
| `snapshot_sql` | snapshot paths | exactly one `{% snapshot %}` block whose `config()` names a `unique_key` and a `strategy` of `timestamp` (with `updated_at`) or `check` (with `check_cols`), with a single read-only SELECT body |
| `seed_csv` | seed paths | CSV with a named, duplicate-free header and one field per column on every row, under 5,000 data rows and 1 MiB |
| `test_sql` | test paths | either `{% test %}` blocks only (a generic test definition, balanced, plus jinja comments) or a single read-only SELECT (a singular test) |
| `analysis_sql` | analysis paths | a single read-only SELECT, even though dbt only compiles it |
| `packages_yml` | project root | the guarded way to declare a dbt package |
| `project_yml` | project root `dbt_project.yml` | keeps a `name` |
| `profiles_yml` | project root `profiles.yml` | every secret as `{{ env_var('NAME') }}`; a literal credential is refused so none reaches the diff |

Config kinds, snapshots, and seeds are all parsed by dbt at plan time.

Each kind is confined to its own family of paths, and filing one in the wrong
family is refused naming both fixes. `schema_yml` is the exception, because that
is where dbt expects a snapshot's tests, a seed's column types, a singular test's
severity, and an analysis's description.

A seed past the row or size limit is data rather than a lookup: load it into the
warehouse and `source()` it. A seed whose header names a column that looks like
personal data is refused, and the refusal names the `pii_overrides` entry a human
can add.

A singular test that names no `ref()` or `source()` is warned about, not refused:
it runs against nothing and passes unconditionally.

## Three things called a test

- **Generic tests** are declared inside a `schema.yml` (`data_tests:` on a model
  or a column).
- **Unit tests** come from `transform test --scaffold <model>`, which writes a
  `unit_tests:` block, also `schema_yml`.
- **Singular tests and generic test definitions** are files under `test-paths`,
  and `test_sql` is their kind.

`transform test --mutate <model>` measures all three at once, since a defect has
to get past every one of them to reach production.

## Building what you authored

`dbt build` runs seeds, snapshots, and singular tests natively, so
`transform build` after an apply is all it takes. A snapshot writes a table and a
test runs a scanning SELECT, so both are priced in the cost handshake; a seed
scans nothing and an analysis is never built, so neither is. A singular test and
an analysis build no relation and nothing can `ref()` either, so neither enters
`maintain`'s drift baseline, and deleting one raises no dangling-reference guard.

## `op`: upsert and delete

`op` is `upsert` (the default: create or update, carrying `content`) or `delete`
(remove the file, no `content`). A delete is a reviewable diff like any other, so
a refactor is one plan rather than a plan plus a manual `rm`.

Deletes are guarded: the plan is refused if any surviving file still `ref()`s a
deleted model, naming the offenders. Carry the edits that remove those
references in the same plan, so the post-change project is validated as one
unit. A surviving reference dex cannot resolve statically is warned about rather
than refused. An unconfirmed delete against a file a human edited after planning
surfaces as `needs_confirmation`, never a silent removal.
