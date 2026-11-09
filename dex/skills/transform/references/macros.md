# Shipped macros

`transform macro` lists the macros dex ships. `transform macro <name>` proposes
scaffolding one into the project's macro directory as a plan, applied with
`transform apply` like any other. The user's copy is theirs to edit; re-running
the command diffs it against the shipped version (a warning says whether it is
customized or stale), and applying that plan overwrites deliberately.

## `generate_schema_name`

The override `transform init --layered-schemas` scaffolds, so each layer folder
builds into its own `<layer>_<target name>` schema.

## `unpivot_json_object`

Turns a JSON object column with dynamic keys (the NoSQL-sourced shape: a
Firestore, Mongo, or DynamoDB document keyed by a related entity's id) into one
row per top-level key. It renders a complete SELECT:

```sql
select id, key as related_id, value as attrs
from (
  {{ unpivot_json_object(relation=ref('stg_entities'),
                         json_column='attributes', passthrough=['id']) }}
)
```

The contract on every connector: one row per top-level key, `key` a plain string,
`value` the warehouse's native semi-structured type, a NULL object yields no rows,
and a nested object's own field names never surface as top-level keys.

| Connector | `value` type | String-typed source column |
|---|---|---|
| BigQuery | JSON | pass `parse_json(payload)` as `json_column` |
| Snowflake | VARIANT | pass `parse_json(payload)` |
| Databricks | VARIANT (needs DBR 15.3+ or a current SQL warehouse) | pass `parse_json(payload)` |
| Redshift | SUPER | pass `json_parse(payload)` |
| Postgres | jsonb | accepted directly |
| DuckDB | JSON | accepted directly |
| ClickHouse | raw JSON text in a String | accepted directly |
| Trino | json | pass `json_parse(payload)` |

Two BigQuery quirks are absorbed by the macro: a JSON path argument must be a
compile-time literal (the macro reads values with the subscript operator, which
accepts a computed key), and `JSON_KEYS` recurses into nested objects unless
depth-limited (the macro pins depth 1). When a planned model calls the macro and
the project lacks it, the plan warns and names the scaffold command.
