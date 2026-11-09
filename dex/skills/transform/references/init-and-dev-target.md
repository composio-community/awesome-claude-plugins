# Bootstrapping a project and preparing the dev target

What you must and must not do is in `SKILL.md`; this file is the per-connector
detail.

## `transform init "<name>" --connector <c>`

The engine renders the whole skeleton (`dbt_project.yml`, `models/staging/` and
`models/marts/`, a `profiles.yml` with a single `dev` target and no secrets) and
records `connector`, `dbt_project_dir`, and `dbt_target: dev` in
`.dex/config.yml`. Init never assumes a connector: it errors rather than
defaulting, and a `connector:` already committed in `.dex/config.yml` also
counts. Init refuses if any dbt project already exists.

| Connector | Dev target and auth |
|---|---|
| DuckDB | needs a warehouse path (`--path`, or `duckdb.path` in config) |
| BigQuery | needs a GCP project (usually `bigquery.project`; confirm it with the user); builds go to `bigquery.dev_dataset` (default `dbt_dev`); auth is Application Default Credentials (`gcloud auth application-default login`) |
| Snowflake | builds go to `snowflake.dev_database` / `dev_schema` on the pinned warehouse |
| Databricks | builds go to `databricks.dev_catalog` / `dev_schema` on the pinned SQL warehouse; missing credentials: `databricks auth login` |
| Postgres | builds go to `postgres.dev_schema` (default `dbt_dev`); the password reaches dbt only through `PGPASSWORD` |
| Redshift | builds go to `redshift.dev_schema` (default `dbt_dev`); with `redshift.workgroup` pinned the profile renders IAM auth (temporary credentials from the AWS chain), otherwise the password reaches dbt only through `REDSHIFT_PASSWORD` |
| ClickHouse | builds go to `clickhouse.dev_database` (default `dbt_dev`), rendered as the profile's `schema:` because dbt-clickhouse has no `database:` key; the password reaches dbt only through `CLICKHOUSE_PASSWORD`; the profile's `custom_settings` block turns the confirmed budget into a per-statement server-side cap |
| Trino | builds go to `trino.dev_catalog`.`dev_schema` (default `dbt_dev`); dbt creates the schema but never the catalog, so `dev_catalog` must exist and be writable (a `tpch`, `tpcds`, `jmx`, `system` or `faker` catalog is refused; `memory` and `blackhole` warn); the user, password or token reach dbt only through `TRINO_USER`, `TRINO_PASSWORD` or `TRINO_JWT_TOKEN`; the profile's `session_properties` block turns the confirmed budget into a per-statement server-side cap |

Every connector discovers its connection and refuses with the fix named when
none resolves.

### `--layered-schemas`

When the user wants staging, intermediate, and marts isolated in their own
datasets or schemas (common when the warehouse is shared with unrelated work),
`--layered-schemas` also scaffolds `models/intermediate/`, a
`generate_schema_name` override, and per-folder `+schema:` config, so builds land
in `staging_dev`, `intermediate_dev`, and `marts_dev`. An existing project can
adopt it later with `transform macro generate_schema_name`. dbt warns about
"unused configuration paths" until the first model lands in each layer folder;
that resolves itself.

### The namespace warning

Init checks, free and metadata-only, whether each namespace the project would
build into already holds content, and warns naming the namespace and a few
object names. A "could not check" note means no connection was reachable at init
time.

## Preparing the dev target

Before the cost gate, and for free, `transform build` refuses two things and
names the fix for each, so both surface on the unconfirmed call.

**Config that has drifted from the profile.** `transform init` renders
`.dex/config.yml` into `profiles.yml`, and dbt reads only the profile from then
on. If a later config edit never reached it (a retargeted `dev_database`, a
different warehouse), the build refuses and names both values and both files.
The engine never rewrites `profiles.yml`, which may legitimately be hand-edited.
Retarget the config side with `dex config set snowflake.dev_database <name>` (or
the connector's own key), which shows the diff before writing; the profile
still has to be changed to match.

**A dev target that does not exist.**

- Snowflake: dbt creates schemas but never databases, so a missing
  `dev_database` is refused with the `CREATE DATABASE` statement to run.
- Postgres, Redshift, ClickHouse: dbt creates the dev namespace only if the
  profile's user may, so the missing privilege is refused with the
  `CREATE SCHEMA` / `GRANT` statement to run. On ClickHouse the check can come
  back with no verdict when the server hides another user's grants; it then warns
  and the build proceeds with dbt's own error as the backstop.
- Trino: dbt creates the dev schema but never the catalog, so a missing
  `dev_catalog`, or one whose connector cannot be written, is refused before
  dbt runs. Write permission is not checked: Trino exposes no grant table, so
  dbt's own error is the backstop.
- DuckDB: the dev target is a database file, and dbt would create an empty one,
  then fail every `source()` relation with a confusing catalog error. Copy the
  shared source warehouse to the dev target path (for example
  `cp shared/f1.duckdb <project>/dev.duckdb`), or point the dev target at an
  existing file. A project without sources just gets a warning and an empty
  database, which is fine for model-only builds.
