# Authoring the semantic layer

What you must and must not do is in `SKILL.md`; this file is the detail of each
command and payload.

## dbt semantic models: `semantic define|update|plan`

`define` and `update` author and evolve semantic models (entities, dimensions,
measures, metrics) as plans. `define` refuses names that already exist; `update`
refuses names that do not. `plan` accepts a mix and reports the split as
`defined`, `updated`, `unchanged`, and `removed`. A semantic plan is applied like
any other, with `transform apply [plan-id]`.

### `--definitions-file`

A real project keeps its metrics in one shared file, so a whole-file
`--edits-file` payload means restating every definition you are not touching:
the diff and the `updated` list then describe the whole file, and every restated
line is a chance to corrupt a definition. Send only what changes:

```json
{"definitions": [{"kind": "metric", "content": "name: ...\n..."}]}
```

`kind` is `semantic_model` or `metric`, and `content` is that definition's YAML
body with no leading `- `. The name comes from the content, and `path` can be
omitted for anything the project already declares (the engine rewrites it where
it lives). Everything else in the file, comments included, is preserved byte for
byte. Use `--edits-file` to create a file, move a definition between files, or
empty one, and when the engine refuses a layout it will not splice into.

### Removing a definition

```json
{"definitions": [{"kind": "metric", "name": "doubled", "op": "delete"}]}
```

The name is declared (there is no content to read it from) and there is no
`content`. Nothing is removed for going unmentioned, so a removal and an edit can
share one payload. Use `update` or `plan`, not `define`. The envelope reports it
under `removed`.

If a metric still reads what you remove (its input is that metric, or a measure
of the semantic model you remove), the plan is refused naming the reader; add the
reader's own delete or update to the same payload, in any order. A removal that
would leave a file with no semantic model or metric is refused too: deleting or
emptying a file is a whole-file edit, done with `transform plan --edits-file` and
`"op": "delete"`.

### Validation

Layered so a plan that validates will build:

1. MetricFlow's schemas check the shape.
2. The engine resolves every metric input. Ratio and derived metrics reference
   **metrics**, not measures; a measure becomes a metric only through
   `create_metric: true`, and the error names that fix.
3. The emitted YAML is parsed by **dbt's own parser** against a throwaway copy of
   the project. A plan that fails parse is refused, not stored. Without dbt the
   parse degrades to a warning; `--no-parse` skips it explicitly.

dbt cannot parse semantic models without a MetricFlow **time spine**. The engine
warns when one is missing and defers the parse gate until one exists.

## Native Apache Ossie: `semantic ossie define|update|plan`

Pass `--edits-file <path|->` with whole documents whose paths are listed in
`semantic.ossie.files`. The command implies the `semantic_document` kind,
validates the complete prospective layer (your edits overlaid on the other
configured documents), and writes the accepted bytes exactly when the plan is
applied. This is a semantic-layer write surface; it does not make Ossie the
transformation project.

- Namespace guards match the dbt ones: `define` refuses a semantic-model name the
  layer already has, `update` one it does not, and `plan` accepts both. Neither
  removes a model. A configured file may be absent before `define`, so a new
  document is planned once its path is committed to config.
- There is no external parser to gate on. dex checks the document's structure
  against the Ossie schema it pins (needs `[ossie]`), its internal consistency,
  and each SQL expression's syntax through the dialect engine (needs `[sql]`,
  which every connector extra carries). Without `[sql]` the third layer degrades
  to a named skipped-validation note, never a silent pass.
- References are checked against the exploration cache, opening no connection. A
  source relation the cached inventory positively lacks, or a column absent from
  a relation the cache profiled, refuses and stores no plan. Anything the cache
  cannot speak to is a named note instead: an unprofiled relation, a computed or
  non-SQL expression, a quoted identifier, a query-backed source.
- An unknown key is refused as incompatible with the pinned schema: it may be a
  typo or written for a newer Ossie draft. The diagnostic names the pinned spec
  version.
- On apply, dex does not re-serialize the document, so comments, key order,
  quoting, and whitespace survive, and a configured document the payload did not
  mention is untouched. A target file that changed after planning refuses the
  whole apply unless the overwrite is confirmed deliberately.

A worked end-to-end example on a local warehouse, for a human reader:
<https://github.com/exmergo/dex/blob/main/references/ossie-walkthrough.md>.

## SLayer models: `semantic slayer define|update|plan`

Under `semantic.vendor: slayer`, the configured SLayer model files are the
semantic layer and dex authors them directly. Do not generate them with
`slayer import-dbt`: it is one-way and drops custom schemas and aliases. SLayer
sits beside a dbt project the way Ossie does: `transform plan` still authors the
models, and SLayer is the repository's one semantic layer.

### Config and the extra

```yaml
semantic:
  vendor: slayer
  slayer:
    base_dir: semantics/slayer          # SLayer's storage root, in the repository
    models:
      - models/warehouse/orders.yaml    # models/<data_source>/<name>.yaml
      - models/warehouse/customers.yaml
```

Read it with `dex config get semantic`, and change it with `dex config set`
(the user confirms the diff). The `[slayer]` extra pins one exact SLayer
release. The wrapper installs it for `semantic slayer` always, and, where the
vendor is `slayer`, for `transform apply` and every command that reads the
layer. A command that needs it and runs without it refuses with
`reason: prerequisite` and names the install: relay that line.

### The payload and the write surface

Pass `--edits-file <path|->` with whole model files; `kind` may be omitted
because the command implies `semantic_document`. Each `path` is written exactly
as `semantic.slayer.models` lists it, relative to `semantic.slayer.base_dir`:

```json
{"edits": [{"path": "models/warehouse/orders.yaml", "content": "<the whole model file>"}]}
```

- **The write surface is the configured list.** A datasource file (it carries
  connection credentials), `priority.yaml`, SLayer's search index or memories,
  an unconfigured model, a path outside the storage root, and a configured model
  symlinked anywhere but the storage root's `models/` are refused. To add a
  model, propose its path with `dex config set semantic.slayer.models ...` (the
  whole list), then `define` it: a configured file may be absent until then.
- `define` refuses an existing model, `update` a new one, `plan` takes both and
  reports them under `defined` and `updated`. Nothing here removes a model or a
  file, and rename/remove propagation and warehouse grounding are dbt-only.
- `transform apply` writes your bytes exactly, all files or none.

### What validation catches

The whole prospective set (your edits over the other configured models) is
validated with the pinned release's own `SlayerModel`, with no warehouse
connection and no SLayer storage opened. Every refusal names the file and the
element (`columns['order id'].name`, `joins[0].target_model`): fix exactly that
and re-plan.

- **The format version.** Write the pinned release's current `version` (the
  refusal names it). A lower one is refused, because SLayer would rewrite the
  file on its next save; a newer one is refused rather than read best-effort; a
  file with no `version` reads as version 1 and is stale.
- **The path.** The file sits at `models/<data_source>/<name>.yaml`, and its
  `name` and `data_source` agree with that path.
- **The set.** Names are unique; every join's `target_model` is a model in the
  set, and every join pair names a column both sides declare.
- **An edited model's own references.** `default_time_dimension` names one of
  its columns, and each saved measure's formula parses with SLayer's parser
  (another saved measure may be named bare). Without the `[sql]` extra the
  formula check is skipped with a named note.
- **An edited model's keys.** Every key, at every level (model, column and its
  `format`, saved measure, aggregation and its `params`, join), is a field the
  pinned release declares there. SLayer itself ignores any other key, so it
  would be written byte for byte and do nothing; dex refuses it as
  `[unknown_key]`, naming the file, the element (`measures['revenue'].agg`) and
  the pinned release. Where the key is a MetricFlow habit (`entities`, `agg`,
  `agg_time_dimension`, `expr`, `create_metric`, ...), the refusal says what
  SLayer uses instead. Remove the key; there is no spelling of it that SLayer
  reads. A model the plan does not edit is only warned about, the way the
  reader warns. Every declared field is accepted, `meta` and the values SLayer
  caches on a column (`sampled`, `sampled_values`, `distinct_count`) included.

The refusal is a backstop, not a guide: the gaps below are what to write
instead.

### What SLayer does not declare

dex's catalog is shaped by MetricFlow; SLayer is not. Do not carry MetricFlow
habits into a SLayer file:

- **No entities.** Keys are columns flagged `primary_key: true` (several make one
  composite key) or `unique: true`; joins are `joins:` entries with
  `target_model`, `join_pairs` and, ideally, `cardinality` (`many_to_one`,
  `one_to_one`, `one_to_many`, `many_to_many`). A join with no `cardinality` is
  one `maintain grain` cannot check, so declare it when you know it.
- **No measures in MetricFlow's sense, and no aggregation on a saved measure.**
  A saved measure is `name` plus a `formula` that carries its own aggregation
  (`amount:sum`, `*:count`). There is no `agg`, `expr` or `create_metric`.
- **No per-measure time dimension.** Only the model's `default_time_dimension`,
  which every saved measure on that model is bucketed by.
- **No `model_ref`, label, or primary entity on a model.** A model sits on the
  warehouse relation `sql_table` names; write it fully qualified for the
  connector, or dex can resolve no relation for it. A model backed by `sql` or
  `source_queries` has none either, and the schema axis skips it.

`explore semantic list` declares the same gaps in `unavailable`. Read it rather
than inferring an element kind from an empty list.

### When SLayer tooling wrote the file

**dex owns the configured model files; SLayer tooling must not write them.**
`slayer serve`, `slayer ingest`, `slayer validate-models --persist-cardinality`
and a storage migration on open all rewrite model files. If one did after you
planned, apply refuses with a conflict that says so. Tell the user what
happened, then remake the plan against the current files with
`semantic slayer plan`. Use `--confirm` only if the user wants SLayer's change
overwritten.

A model file left in an older format (by hand, or by an older SLayer) is
refused by every reader, and `maintain` reports its definitions as removed. The
repair is `semantic slayer update` with the whole file rewritten in the current
`version`.
