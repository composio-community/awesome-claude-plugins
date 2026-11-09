# Warehouse connectors: setup, credentials, cost, and scope

DuckDB needs only `--path <file.duckdb>`. A remote warehouse or database replaces
`--path` with connector config. What you must do with an estimate or a refusal
is in `SKILL.md`; this file is the per-connector detail.

## Setup

Start with `connect test --connector <name>`, or set `connector:` plus the
matching block in `.dex/config.yml`:

| Connector | Config block |
|---|---|
| BigQuery | `bigquery:` with `project` and a `datasets` allowlist |
| Snowflake | `snowflake:` with the pinned `warehouse` and a `databases` allowlist |
| Databricks | `databricks:` with the pinned SQL `warehouse` and a `catalogs` allowlist |
| Postgres | `postgres:` with a `schemas` allowlist |
| Redshift | `redshift:` with the Serverless `workgroup` and a `schemas` allowlist |
| ClickHouse | `clickhouse:` with a `databases` allowlist |
| Trino | `trino:` with a `catalogs` allowlist (`catalog` or `catalog.schema` entries) and a writable `dev_catalog` |

The allowlist is a committed cost boundary: nothing outside it is read.

## Credential fixes to relay

Credentials are discovered, never asked for. When an envelope reports missing or
expired credentials, relay the fix it names:

| Connector | Fix |
|---|---|
| BigQuery | `gcloud auth application-default login` |
| Snowflake | a `connections.toml` entry, or `SNOWFLAKE_*` environment variables |
| Databricks | `databricks auth login`, or `DATABRICKS_*` environment variables |
| Postgres | `DATABASE_URL`, `PG*` environment variables, or a `pg_service.conf` entry |
| Redshift | the AWS credential chain (`aws configure`, `AWS_*`), or `REDSHIFT_*` environment variables |
| ClickHouse | `CLICKHOUSE_URL`, or `CLICKHOUSE_*` environment variables |
| Trino | `TRINO_URL` (the read-only identity), or `TRINO_*` environment variables; a password or token needs `https`, and OAuth2, Kerberos and certificate auth are refused |

## Cost units

A `needs_confirmation` envelope gives the estimate in `cost.estimate`, with a
per-table breakdown where relevant, in the unit `--budget` takes:

| Connector | Unit | Translation shown |
|---|---|---|
| BigQuery | bytes | exact, from a free dry run |
| Snowflake | warehouse-seconds | credits |
| Databricks | warehouse-seconds | DBUs |
| Redshift | compute-seconds | RPU-hours |
| Postgres | database-seconds | none: the guarded quantity is load |
| ClickHouse | database-seconds (compute-seconds on Cloud) | none |
| Trino | cluster-seconds | none; `estimate_basis` says `floor` where a catalog had no statistics |
| DuckDB | free and local | nothing to confirm |

OK envelopes report actual spend under `data.spend`, which accumulates in
`.dex/spend.jsonl`.

### The calibration line

An over-ceiling refusal carries a line drawn from `.dex/spend.jsonl`: what this
connector's last few settled commands actually billed as a fraction of their
estimate, or a sentence saying the project has too little history. On a
partitioned or clustered warehouse a dry-run estimate is an upper bound, so this
is often the difference between a budget that admits the work and one that does
not. The ceiling is checked against the estimate, not against what settles.

### The session ceiling

`suggested_session_ceiling` appears when the project has never decided whether
the day's total spend is bounded. The suggestion is five times the current
command's estimate, a starting point rather than a recommendation.
`--session-ceiling <value>` sets a cumulative daily cap and `--no-session-ceiling`
records that the project runs unbounded. Either one is written to
`.dex/config.yml`, reported as a diff, and never asked again. Leave it off the
confirmed re-issue and that run stops once to ask.

### BigQuery reserve

A BigQuery profiling estimate holds a 10 MB floor per table for each escalation
query a profile may still issue after its aggregate scan. On a warehouse of many
small tables, most of the number can be reserve for work that never happens. The
handshake and the over-ceiling refusal both report the split (`reserved_bytes`,
`reserved_queries`, and in the prose).

## `--scope` vocabulary

`--scope` (repeatable) bounds one command to part of the configured allowlist. It
is free to resolve, it can only narrow what `.dex/config.yml` allows, and a scope
that names nothing is refused with the schemas that do exist.

| Connector | One scope is |
|---|---|
| BigQuery | a dataset |
| Snowflake | a `schema` or `database.schema` |
| Databricks | a `catalog.schema` |
| Postgres, Redshift | a schema |
| ClickHouse | a database (identifiers are two-part `database.table`) |
| Trino | a `catalog` or `catalog.schema` (relations are always written `catalog.schema.table`) |

`explore map --scope <schema>` is the first thing to reach for on a warehouse
whose full map would be expensive.
