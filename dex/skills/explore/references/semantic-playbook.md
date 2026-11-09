# Semantic playbook: reading a metric before you trust its number

`explore semantic` reaches a semantic layer: metrics, and the semantic models,
measures, dimensions and entities they are built out of. A metric query is not a
probe. There is no SQL to inspect, the layer decides what the number means, and
the same metric grouped two ways can return two numbers that are both correct and
not comparable. So the work is almost all in `list` and `values`, and `query` is
the short last step.

Three habits, in order of how much they save:

- **Scope the catalog rather than reading the layer.** A whole layer's catalog is
  one payload and most of it is about something else. `list --metric <m>` if you
  know the metric, `list --for-dimension <d>` if you know the slice, or
  `list --search <word>` if you know neither. All three are free, none costs a round
  trip beyond the first, and each names its scope in the payload. Use `--search`
  when looking for metrics: it returns metrics matched by their own words or by
  the elements they reach, together with what those metrics reach. To find an
  unused measure, dimension or semantic model while authoring a metric, list
  without `--search`.
- **Read the metric's caveats before its dimensions.** `time_axis`, `filter` and
  `input_measures` change what the number is. The dimension list only changes how
  it is cut.
- **Get the value domain before writing a filter.** `values <dimension>` is the
  only way to know what a `--where` may filter to, and on a hosted layer it is the
  only dex command that can reach it at all.

## Discovery order

1. **`list`, scoped.** Start narrow. `--search` is metric-oriented: it takes a
   word and matches it against a metric's name, label or description, the names,
   labels and descriptions of the elements it reaches, and its groupable tokens.
   It returns those metrics with what they reach. A term matching only an element
   no metric uses returns an empty catalog; list without `--search` to discover
   that unused element while authoring a metric. `--for-dimension pricing_tier`
   answers "what can I slice by this", and is also
   the cheapest way to find the metrics that can go on one chart against one axis,
   because it returns the metrics groupable by **all** the tokens named.
2. **Read the caveats on the metric you picked** (next section). Stop here if they
   say the number is not the one you want; going back is cheaper than a wrong
   answer presented confidently.
3. **`values <dimension>`** for every dimension you plan to filter on.
4. **`query`**, once, with the group-by and filter you have now justified.

Before concluding anything about the layer, read four payload fields:

- `dimension_scope`. `queryable_paths` means every row is a token you can paste
  into `--group-by`. `declarations` means the list is the single-hop declared view
  and a query can group by more than it names, which is what `--local` reports
  without the `[semantic]` extra. Two backends reporting different dimension
  counts for one layer is this field, not a bug. A native Ossie layer always
  reports `declarations`, because the format states no join graph to resolve
  through.
- `unavailable`. Fields the answering backend structurally cannot supply. An
  absent `label` here means "this path cannot carry one", not "the project
  declared none", and the difference decides whether looking elsewhere is worth
  it. `--api` has no `relation` on a semantic model at all, so use `--local` when
  you need the physical side.
- `scoped_to`, `for_dimensions`, `searched_for`. Which narrowing produced this
  catalog. Present means you are holding a subset.
- `elided`. What the payload cap cut, per element kind. All zeros and no cap notes
  means this is the whole layer. Non-zero means narrow the question rather than
  concluding the layer does not have something.

## Reading a metric

**`time_axis` first.** A layer's time token (`metric_time`) is one name over many
physical columns: it resolves to each measure's own aggregation time dimension.
One entry is the ordinary case. **More than one entry means the metric's measures
aggregate over different timestamps**, so grouping by `metric_time` buckets part
of the number by one column and the rest by another, invisibly, in a result that
looks like any other. Worse, one of those columns is often null on rows the other
one has, and those rows are then dropped. If you see two entries, either group by
a named time dimension instead, or say in your answer which parts of the number
are bucketed how.

**`filter` next.** A metric with a filter measures a subset. That is invisible in
the result and it is usually the explanation for a number lower than expected.

**`input_measures`, followed through to the measures.** A measure's `agg` and
`expr` are what the number actually is, and a measure is often a conditional
expression rather than a column: `sum(case when ... then 1 else 0 end)` counts
something narrower than its name suggests. This is also where additivity comes
from. A `sum` over a bare column is additive and can be totalled across any
grouping; an `average`, a `median`, a `count_distinct` and any ratio are not, so
the sum of the grouped rows is not the ungrouped total and you must not present it
as one.

**A ratio's two sides.** `composition.numerator` and `composition.denominator`
name other metrics (or measures). Read both. A ratio is never additive. Two ratios
that share a denominator can be compared and two that do not usually cannot. And
if the two sides live in different semantic models, a group-by valid on one may
not be valid on the other.

**`queryable_granularities`.** The grains the layer will accept for this metric,
which is per metric rather than a fixed ladder. `--grain` is validated against it,
so a refusal here names what the metric does have. An **empty list on a dimension
is an answer**: a categorical dimension has no grain, so do not ask for one.

## `values` versus a query

`values <dimension>` returns one dimension's value domain. Reach for it whenever
you are about to write a `--where`, and before telling a user what the categories
are.

Read `scoped_to` on the result, because it changes what the values mean. Empty
means these are the domain of the column behind the dimension. A metric name means
dex had to reach the dimension through that metric, because a dimension behind a
join has no other rendering: neither layer will run a distinct-values query with
no measure to join from. Those are then the values **present for that metric**,
which can be narrower than the column's own domain, and the note names the other
metrics that reach it. Pass `--metric` to choose one yourself.

It never claims an exact cardinality, which would cost a second scan. A large
domain comes back capped and `truncated`, and says so.

Use a `query` instead when you want the distribution rather than the domain: group
the metric by the dimension and read the sizes. That costs a query where `values`
often does not. On a SLayer layer it always does: SLayer has no distinct-values
shortcut, so `values` renders a dimension-only query and runs it through the same
cost handshake as a metric query.

## When a command is refused

- **A PII-flagged dimension on `values` refuses the command outright**, rather than
  being screened out of a larger answer, because the whole output is values. The
  refusal names the two durable ways to clear a dimension reviewed as not personal
  data: a `pii_overrides` entry in `.dex/config.yml`, or
  `config: {meta: {pii: false}}` on the dimension in the project that declares it. Do not work around it by querying
  the same column another way.
- **A PII-shaped `--group-by` or `--where` token refuses the query** before it
  runs. `user__email` is the standing example: the token's own shape is enough.
- **A filtered query on a backend that cannot read its own filter dialect is
  refused** rather than run with the filter half unscreened. Move the condition
  into `--group-by`, or use a backend that reads its filters.
- **An unknown metric or dimension name is refused by name.** A search term that
  matched nothing is not: it comes back as a note, because a substring matching
  nothing is an honest answer about the layer's words.
- **A backend that declares a field unavailable refuses the command that needs
  it**, rather than answering from the empty value. `--for-dimension` on a layer
  whose backend lists `dimensions` under `unavailable.metrics` is the standing
  example. Read `unavailable` before concluding anything from an empty list.

## When the layer is native Apache Ossie

`vendor: ossie` means the layer is native Ossie documents in the repository rather
than a dbt project. `list` works and reads the same shape as anywhere else, and
the payload says so on `vendor`. Three things differ, and each is a property of the
format rather than a missing feature:

- **`query` and `values` refuse.** Ossie specifies interchange metadata and not a
  portable query runtime, so there is no filter grammar and no join planning to
  render a governed statement from. Take the physical route instead: a dimension
  names its `semantic_model`, that model names its `relation`, and `explore
  profile` then `explore query` reach the values under the firewall and the cost
  guard. Do not present the refusal as dex being unable to reach the layer.
- **`--for-dimension` refuses**, because Ossie states no metric-to-dimension
  relationship at all. `metrics[].dimensions` is empty and `unavailable.metrics`
  says why. An empty groupable list here is not "this metric can be grouped by
  nothing".
- **A metric with no `semantic_models` is a metric whose lineage did not resolve**,
  not one that reads nothing. Ossie carries no metric-to-dataset reference, so dex
  reports only what a qualified reference in the expression proved, and reports
  nothing when none did.

An element with no `column` is also normal here and the notes say which of four
reasons applies: a computed expression, a quoted identifier, a query-backed
dataset source, or a field written only in a non-SQL dialect. In every one of them
dex declined to guess a column rather than failed to find one, so do not go looking
for the column yourself and do not treat the absence as a data problem.

## When the layer is SLayer models

`vendor: slayer` means the layer is SLayer model files in the repository. `list`,
`values` and `query` read the same shape as anywhere else, with a few things to
read differently:

- **A metric is a saved SLayer measure**, named `model.measure`, of type
  `formula`. Its formula is under `composition.expr`. It declares no aggregation
  of its own, which is why `measures` is empty and listed under `unavailable`:
  read the formula for what the number counts.
- **A dimension token is `model.column`**, the reference a SLayer query uses. A
  metric's groupable tokens are its own model's columns; columns reached through
  a join are not listed (`dimension_scope: declarations`), so `--for-dimension`
  answers within one model.
- **There are no entities.** The joins and keys are real and reach `explore map`,
  `explore relationships` and `explore profile` through `--use-project`.
- **`query` and `values` run, and dex executes them.** SLayer only renders the
  SQL, as a dry run over the model files dex validated; dex runs it through the
  same PII gate, relation pre-check and cost handshake as the dbt `--local`
  backend, and `execution` is `dex`. Treat a result as cost-guarded, exactly as
  you would a local dbt one.
- **One model per query.** A SLayer query is rooted at one model, so every
  metric you pass must be a saved measure on the same model; query each model's
  metrics separately. A formula such as `sum(amount)` is refused: it is a
  definition nobody reviewed, so ask for it to be saved as a measure instead.
- **Group by the model's own columns.** `--group-by orders.status` works; a
  column on a joined model does not, even where the layer declares the join.
  Bucket time with `--grain month`, which applies to the model's
  `default_time_dimension` (its `time_axis` in `list`). Order only by a metric or
  a column you grouped by, with `-` for descending (`--order-by=-orders.revenue`).
- **`--where` is SLayer's filter syntax, not Jinja.** Write
  `--where "status = 'paid'"`, with columns read relative to the query's model;
  a dotted name (`customers.region = 'EU'`) walks a declared join. The gate
  screens every column a clause names, joined ones included, so a PII column
  refuses the query wherever it appears. A clause dex cannot read, or one with
  `{variable}` placeholders, is refused: write the value into the clause.
- **`values` before `--where`, as anywhere.** `values orders.status` reads the
  column's domain on its own model, with the model's own filters applied, so
  `scoped_to` is empty. `--metric` reads the values present for that metric
  instead and names it in `scoped_to`, and is refused for a dimension the metric
  cannot group by. A grain suffix (`orders.ordered_at__month`) works on a time
  dimension only.
- **Not every connector.** DuckDB, BigQuery, Snowflake, Postgres and Redshift
  are supported. Databricks and ClickHouse refuse with the reason, because
  SLayer's SQL for them would run and return wrong numbers or would need a live
  server, and Trino refuses until its rendered SQL has been reviewed. On those, take the physical route: a dimension's `semantic_model`,
  that model's `relation`, then `explore profile` and `explore query`.

A model file dex refuses (a stale `version`, a duplicate name, a join to a model
that is not configured) is named in `notes` with its file and element, and the
rest of the layer still answers. Report the refusal; do not edit the file to
silence it unless asked.

## Cost, and which backend answered

Every result names `execution`. `dex` means dex rendered the statement and ran it
through its own connector, so the cost handshake applied and spend was surfaced
before it happened. `vendor` means the semantic layer ran it: dex never held a
statement it could price or cap, so the result carries an explicit warning that
spend is governed there. Do not present a hosted result as cost-guarded, and do
not treat the absence of an estimate as "it was free".

`list` and the catalog side cost no warehouse query on any backend: one GraphQL
round trip hosted, one compiled-artifact read locally, one repository read for a
native layer. `values` and `query` do spend on the two dbt backends and on a
SLayer layer, and on SLayer they take the same handshake as `--local`: a billed
connector returns `needs_confirmation` with the estimate before anything runs. On
a native Ossie layer neither runs at all, so the only spend on that path is the
`explore profile` and `explore query` you reach for instead, and those carry
their own estimate and confirmation.
