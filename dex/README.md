# Dex

Analytics engineering skills for Claude Code, from [Exmergo Dex](https://github.com/exmergo/dex).

| Skill | What it does |
| --- | --- |
| `explore` | Inventory and profile a warehouse or DuckDB file, flag PII and data-quality problems, infer and verify joins, and keep a schema map. Read-only. |
| `transform` | Author and refactor dbt models, tests, docs, and semantic models (MetricFlow, Apache Ossie, SLayer) as reviewable diffs. Builds run against a dev target only. |
| `maintain` | Check an existing dbt project or semantic layer against its warehouse: schema, volume, grain, and definition drift, with proposed fixes as diffs. |

## Requirements

- A local shell and [uv](https://docs.astral.sh/uv/). On first use, each skill's
  `scripts/run.py` downloads the pinned engine (`exmergo-dex-core==1.15.1`) from PyPI.
- No hooks and no MCP servers.
- Warehouse access is read-only. Commands that would bill a metered warehouse
  return an estimate first and run only after you confirm a budget.
  `transform` writes to your repository, and only through plans you apply.

## Try it

With no warehouse, ask Claude: "Generate the dex demo database and tell me what
is wrong with it." `explore` creates a seeded local DuckDB file (7 tables,
29,512 rows) and reports its planted problems: a duplicated key, a key mixing
two id schemes, an empty table, and a join whose columns share a name but no
values.

More prompts:

- "Profile the orders table in my Snowflake warehouse and tell me its grain."
- "Write a staging model and a revenue metric for the tables we just explored."
- "Did anything drift in this dbt project since the last snapshot?"

## Source and updates

This folder copies the plugin from Dex release v1.15.1 (commit
`17ea941716a3b33ec1ab360a3b8579c0818c2c81`) unchanged, except that the
author email was left out of `plugin.json`. To update it, copy `skills/` and
`.claude-plugin/plugin.json` from a newer Dex tag. You can also install the
maintained version directly:

```
/plugin marketplace add exmergo/exmergo-agent-plugins
/plugin install dex@exmergo
```

Apache-2.0. See `LICENSE` and `NOTICE`.
