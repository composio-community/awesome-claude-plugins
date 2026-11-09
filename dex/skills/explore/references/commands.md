# Explore commands: fields, caps, and flags

Lookup detail for each subcommand the explore skill drives. What you must and
must not do is in `SKILL.md`; this file says what a field means and what a flag
changes.

## `config get|validate|set|unset`

These read and change `.dex/config.yml` itself. They run before the engine is
built, so they open no connection, need no connector extra, and still work when
the file is broken enough that every other command refuses to start. The file is
found the way every command finds it, by walking up to the git root.

- `config validate` lists every problem by setting and line: syntax, a value the
  schema refuses, a key dex does not read (with `suggestion`, the key it was
  probably meant to be), a key written twice, a key that reads as a credential.
  `fatal: true` marks the ones that stop every other command; the rest load and
  show up in every envelope's `warnings`. Any problem makes it an error, so it
  works as a CI check.
- `config get [key]` returns `data.settings`, one row per value: `value`,
  `source` (`file`, `default`, `derived` when a validator computed it from other
  keys, or `environment` when `DBT_SL_HOST` or `DBT_SL_ENV_ID` overrides the
  file), the `line` it is written on, and `as_written` when the file's spelling
  was normalized. A key naming a block (`budget`) returns its settings. A value
  under a credential-like name is `withheld`.
- `config set <key> <value> [<key> <value>...]` edits the file in place, so its
  comments, key order and blank lines survive. Without `--confirm` it returns
  `needs_confirmation` with the diff and writes nothing; show the user the diff,
  and re-run with `--confirm` only when they agree. `<value>` is YAML read the way
  the field reads it: `5` is a number, `[raw, staging]` a list, `null` a null,
  and `no` stays a string for a string field. A list is set whole. Several pairs
  are one change, for settings only valid together
  (`semantic.vendor ossie semantic.ossie.files '[semantics/x.ossie.yaml]'`).
- `set` refuses a change that would add a problem stopping commands, and a
  credential-like name in the key or anywhere inside the value. A problem already
  in the file is a warning, not a refusal, so a broken file can be repaired one
  key at a time. Per-run flags (`--connector`, `--budget`, `--scope`, ...) are
  refused, because they would change nothing in the file.
- `config unset <key> [<key>...]` removes settings with the same edit and the
  same `--confirm` handshake. It takes a key dex does not read, which is what a
  warning naming an unknown key asks you to remove, and a whole block (`bigqeury`
  left from a copy-paste). A block left with no keys goes too, with one of the
  blank lines that separated it. A key the file does not write is `ok` with
  `changed: false` and a note naming the nearest key it does write, which is
  usually the key you meant. A key inside one list item
  (`pii_overrides[0].reasn`) is refused, because a list changes as a whole: read
  it with `config get pii_overrides`, which leaves out keys dex does not read, and
  write it back with `config set`.
- Both report `data.changes`, one row per value: `key`, `before` (absent for a
  new key), `after` (absent for a removed one), or only `withheld` for a value
  under a credential-like name. The diff shows such a value as `<withheld>`, on a
  context line as on a changed one.

## `explore profile <objects>`

Objects are space- or comma-separated. Each profile carries column profiles, PII
flags recorded as (column, category, confidence) and never example values, ranked
candidate keys, the likely grain, `key_evidence`, and data-quality warnings (for
example an id unique on all but 110 rows, which will fan out on joins).

- `candidate_keys` is ordered, tightest proven key first.
- `key_evidence` holds one entry per combination considered, with its `status`
  (`reported` or `suppressed`) and the reason. A combination unique only because
  one member is unique on almost every row, or because a money column completes
  it, is suppressed rather than reported.
- Where a near-unique column is the real story, the warning gives the ratio, the
  counts, and how many rows would have to be removed for it to be unique.
- A generic `*_name` flag's confidence is refined by value-shape evidence from
  the same scan, in both directions: person-shaped values corroborate it, and a
  closed reference vocabulary or long labels de-rate it below the firewall's
  blocking threshold. Missing evidence changes nothing, and the flag itself is
  never removed.
- Distinct counts are approximate for scale, but a column that looks unique
  within approximation noise is escalated to an exact `COUNT(DISTINCT)`
  (`distinct_count_exact: true`), so uniqueness and grain verdicts rest on proof.
  A `~` prefix marks a number that is still approximate, on a count and on a
  percentage alike; a figure without one is exact arithmetic over an exact
  distinct count on a column with no nulls.
- By default each dataset's `columns` is summarized to the ones carrying a
  finding, with the rest counted in `elided_column_count`; `--columns all`
  restores every column.
- A requested object whose cached profile is still fresh (same connector, schema
  unchanged, within `profile_freshness_hours`, default 24) is served from the
  cache (`cache_hit_count`) instead of re-scanned. `--refresh` forces a re-scan
  when the source changed in a way the free metadata check cannot see.

## `explore relationships [--verify] [--use-project]`

Returns inferred and declared joins with confidences, plus notes on what the
inference examined, so an empty list is meaningful. `--verify` measures each join
with an aggregate overlap probe (orphan fraction, confidence adjusted).

A declared join has two sources: a `relationships` test, and (with
`--use-project`) an entity two semantic models share, which the layer states
outright with the key named per model. `declared_by` on an edge names that
entity, `semantic_join_count` says how many came that way, and the notes call out
the ones name-based inference did not find. That is the interesting set: a
semantic layer routinely joins columns that share no name at all.

## `explore map [--detail] [--verify] [--use-project] [--full]`

Writes or updates the `.dex/` cache and returns the map. Alongside the counts:

- `data.objects`: each top-ranked object's row count, detected grain,
  best-ranked candidate key, notable columns (each with the role that earned it a
  place: `grain`, `key`, `join`, or a PII flag), and data-quality findings. With
  `--use-project`, each also carries `semantic_models`, the semantic models that
  sit on that relation.
- `data.edges`: the join edges, in the same shape `explore relationships`
  returns.

The payload never carries a value domain; use `explore profile` for that.

Budgets: 25 objects by rank, 12 columns per object, 40 edges, 5 findings per
object. Every cap binds in every mode, and every elision is counted in `notes`
and in an `elided_*` field. `--detail` widens the selection to every column and
to objects that were inventoried but never profiled, and lifts no cap.

Past 50 objects, `map` profiles only the top 25 by rank and says so in `notes`
(with `skipped_count`); `--full` profiles everything. `data.skipped` names the
skipped objects in rank order (`objects`, highest first) and groups them by
namespace (`by_namespace`), each list capped at 25 with the rest counted in
`elided` and `elided_namespaces`. When the next step needs a skipped object, run
`explore profile` on the ones you need rather than probing each in turn. On a
re-map, objects
skipped this run keep their prior profiles (`carried_forward_count`), each
stamped with its own `profiled_at`, so staleness is visible. Fresh cached
profiles are reused the same way `profile` reuses them (`cache_hit_count`,
`--refresh`).

## `explore diagram [--full]`

Renders the cached map as a Mermaid ER diagram in `data.mermaid`, with an
`entities` legend mapping each entity name to its fully qualified identifier. It
reads the cache and never the warehouse. Declared joins are solid, inferred joins
dotted, and an unverified inference never says "exactly one". A solid line
labelled with a semantic entity is a join the semantic layer declares; look the
entity up with `explore semantic list`. The default draws profiled, joined
objects with their grain, key, join, and PII columns; `--full` widens to
everything eligible. `notes` states any object or column left out.

## `explore query`

Pass one statement per argument, or `--sql-file <path>` for a longer list (one
statement per line, or semicolon-separated). Several statements inside one
string are refused. Two or more statements return `data.results`, one entry per
statement, each with its own `status` (`ok`, `refused`, `failed`, `skipped`).
Results are capped (rows, cell width, bytes), and `query.max_payload_bytes` is
the budget for the whole call.

A table you have not profiled, including a model you just built, is profiled
first and the statement then runs. The envelope names it under
`data.profiled_on_demand`, and on a metered connector that profile is priced
into the same confirmation as the statements. `--no-auto-profile` restores the
strict prerequisite.

`--across dev_raw,qa_raw,prod_raw` asks one question of mirrored environments
(the "is this a dev fixture artefact or real in prod?" check): write the dataset
as `{ds}` in each statement, and each runs once per target in one call and one
handshake. Every entry in `data.results` carries its `target` and `template`, and
a refusal names the target that failed while the others still answer. Targets
are plain dataset names; statements times targets counts against
`query.max_statements`.

### Values-free mode

A host can pin values-free mode (`DEX_RESULT_MODE=values_free`, or a
`--values-free` flag on the command), and every envelope then carries
`data.result_mode: "values_free"`. No value read from a table reaches you in it,
so a statement runs only if every output column is an aggregate over the rows it
reads and the result is one row:

- Allowed aggregates: `COUNT` (with `DISTINCT` inside it), `COUNT_IF`/`COUNTIF`,
  the approximate distinct counts, `SUM`, `AVG`, `STDDEV`/`VARIANCE` and their
  variants, `CORR`, `COVAR_*`, `BOOL_AND`, `BOOL_OR`, `ENTROPY`, `KURTOSIS`,
  `SKEWNESS`, and `FILTER (WHERE ...)` on any of them. Around them: numbers,
  arithmetic, comparisons, `CASE`, a numeric cast, `ROUND`, `COALESCE`, `NULLIF`.
- Refused, each with its `data.code`: a bare column (`bare_column`), a column in
  `GROUP BY` (`group_by_column`), `DISTINCT` (`distinct_projection`), `LIMIT` or
  `OFFSET` (`limit_offset`), `ORDER BY` (`order_by`), a window
  (`window_function`), `MIN`, `MAX`, `ANY_VALUE`, `MODE`, a median, a quantile,
  `ARRAY_AGG` or `STRING_AGG` (`aggregate_not_allowed`), a text literal in the
  select list (`literal_projection`), a set operation (`set_operation`).
- `WHERE`, `HAVING`, joins and subqueries in `FROM` are unrestricted. To compare
  groups, ask one filtered count per group (`count(*) filter (where status =
  'paid')`), not a `GROUP BY`.
- A warehouse error arrives as `code: warehouse_refused` with its words withheld;
  rewrite the statement rather than asking for the message.

`explore profile` in the mode lists `withheld_fields` (`min_value`, `max_value`,
`value_domain`) on each dataset; everything else is unchanged. Commands not
reviewed for the mode (`cluster`, `semantic values`/`query`, every `transform`
and `maintain` command) refuse with `code: command_not_values_free`. Tell the
user rather than looking for a way around it.

## `explore cluster <object> [--features a,b,c] [-k N]`

Runs k-means over a bounded sample of the object's numeric columns and returns
per-cluster sizes and fractions, centroids (each coordinate a cluster's mean of
one feature), the silhouette score, and, when `-k` is omitted, the k it picked
with the silhouette sweep it chose from.

- Features are auto-selected from profiled numeric columns that are neither PII
  nor keys. `--features` chooses them yourself; naming a PII column or a key
  opts it in deliberately, and only its mean is reported.
- Keys are the unique columns, the columns that join out (from the joins `map`
  inferred), and the columns named like one. Without inferred joins, a foreign
  key is caught only if its name gives it away, which is why `map` beats a bare
  `profile` here.
- The notes name every excluded column. A cluster under 1% of the sample is an
  outlier pocket that pushes the silhouette up because it sits so far out.
- On connectors that cannot seed a sample, the draw changes per run;
  `sample_repeatable` says which case applies.
- Only aggregates cross the boundary; the sample rows are clustered in-process.
  On a metered connector only the feature columns are scanned, through a
  dialect-aware sample clause, under the usual cost handshake.
- Needs the `[cluster]` extra (scikit-learn), which the wrapper installs for this
  subcommand.

## `explore semantic list|values|query`

These read the semantic layer: the metrics an author defined and the semantic
models, measures, dimensions, and entities they are built from. The top-level
`semantic` group *authors* the layer; this group *queries* it.

### `list`

Returns the layer's objects:

- semantic models: the transformation model each sits on, its default time
  dimension, and the physical `relation` underneath;
- metrics: the dimensions each can be grouped by, the measures it reads, a
  ratio's two sides, any filter, the queryable grains, and `time_axis`, the
  physical time column a time grouping resolves to;
- dimensions: the token to group by, plus the bare definition, owning model,
  queryable grains, and `column` behind it;
- entities: one declaration per semantic model, each with its own join key;
- measures: the aggregation and expression the number is made of.

An element defined as an expression carries no column rather than a guessed one.
"Which table is behind this metric" is the metric's `semantic_models` followed to
their relations, then `explore profile <relation>`. `--api` exposes no relation
and says so in `unavailable`; use `--local` for the physical side.

Narrowing composes: `--metric <m>` keeps those metrics and what they reach;
`--for-dimension <d>` returns the metrics groupable by all the named tokens (also
the cheapest way to find metrics that share one chart axis); `--search <t>`
matches a word against every element's name, label, and description. Each names
its scope in the payload (`scoped_to`, `for_dimensions`, `searched_for`). An
unknown metric or dimension is refused by name; a search term that matched
nothing comes back as a note. The catalog is capped, with every cut counted in
`elided` and named in `notes`; `elided` is always present, so all zeros and no
cap notes means this is the whole layer. `--full` lifts the caps.

### `values <dimension>`

Returns one dimension's value domain, which is what a `--where` filter may be
filtered to, and on a hosted layer the only dex command that can reach it
(`profile` cannot see a semantic dimension). A PII-flagged dimension refuses the
command outright, because the whole output is values.

### `query`

Takes a positional metric after the explicit `query` mode (`--metric` is kept for
compatibility), `--group-by <entity__dim>`, and optional `--where`, `--order-by`,
`--grain`, and `--limit`, and returns a capped columnar result. Name flags take a
comma-separated list or a repeated flag; `--where` is never split, because a
filter clause carries its own commas. `--grain` is checked against the grains the
layer reports for the metrics queried. A PII-shaped grouped or filtered dimension
(for example `user__email`) is refused before the query runs.

### Backends

The backend comes from `.dex/config.yml` (`semantic.vendor` and
`semantic.deployment`, or the older `semantic.backend` spelling), and `--local` /
`--api` override it. Those flags name **who executes**, and every result reports
it as `execution` (`dex` or `vendor`).

- `--local` renders SQL with MetricFlow and runs it through dex's own connector
  and cost handshake. It needs a dbt project parsed at least once, and the
  `[semantic]` extra for `values` and `query` (`list` needs none). With that
  extra, `list` resolves the join graph, so its dimension lists are the tokens a
  query can use; without it the payload says `declarations` and a note names the
  extra.
- `--api` sends the query to a hosted dbt Cloud deployment. It needs a host, an
  environment id, `DBT_SL_TOKEN`, and the `[semantic-api]` extra, and no local
  project. dbt Cloud executes server-side, so no `--confirm` is asked and every
  result warns that spend is governed there. The layer's own PII metadata is
  fetched per metric, so a multi-metric query stays authoritative.
- `semantic.vendor: ossie` reads native Apache Ossie documents from the
  repository, with no dbt project and no MetricFlow (needs the `[ossie]` extra).
  It is catalog-first: `list` answers, and `values`, `query`, and
  `--for-dimension` refuse by name, because Ossie specifies interchange metadata
  and no query runtime. Each refusal names the physical route: a dimension
  carries its `semantic_model`, that model carries its `relation`, and
  `explore profile` then `explore query` reach the values. `--api` is refused
  too, since Ossie has no hosted deployment.
- `semantic.vendor: slayer` reads the SLayer model files named in
  `semantic.slayer.models` (needs the `[slayer]` extra). `list` and
  `--for-dimension` answer: a metric is a saved measure named `model.measure`,
  and a dimension token is `model.column`. `values` and `query` run locally
  with `execution: dex`: SLayer renders the SQL as a dry run, never opening a
  datasource or reading a credential, and dex runs it through the same guards
  as `--local` (PII gate, SELECT-only, relation pre-check, cost handshake,
  columnar cap). The `[semantic]` extra is not needed. What a query can say:
  - every metric in one query sits on one model, and an ad-hoc formula is
    refused;
  - `--group-by` takes that model's own columns (`orders.status`); a column
    reached through a join is not groupable;
  - `--grain` buckets the model's `default_time_dimension` at a built-in SLayer
    grain (`day`, `week`, `month`, ...), and a model with none refuses it;
  - `--where` is SLayer's filter syntax, not Jinja: `status = 'paid'`, read
    relative to the query's model, or a dotted column through a declared join.
    A clause dex cannot read, or one carrying `{variable}` syntax, is refused;
  - `--order-by` names one of the query's own metrics or grouped columns;
    write a descending one as `--order-by=-orders.revenue`, since with a space
    the leading `-` is read as a flag and refused.

  `values` is rooted at the dimension's own model (`scoped_to` empty, the
  model's own filters applied), or at the `--metric` model when one is named,
  in which case the dimension must be groupable for it. Connectors: DuckDB,
  BigQuery, Snowflake, Postgres, and Redshift; Databricks, ClickHouse and Trino
  refuse with the reason. `--api` is refused, since dex reads no hosted SLayer.

`dimension_scope` says whether a dimension row is one declaration or one
groupable path, which is why two backends can report different dimension counts
for one layer, and `unavailable` names fields a backend structurally cannot
supply.
