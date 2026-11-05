---
name: my-claude
description: Documents a Claude Code installation - local setup, plugins and mods, hook/context architecture, web research; refresh regenerates guides older than the installed brewdoc. Triggers - my claude, installation docs.
user-invocable: true
disable-model-invocation: true
argument-hint: "[prompt] [ext [context]] | [r <query>] | [refresh] — no args = internal installation docs"
allowed-tools: [Read, Glob, Grep, Bash, Agent, WebFetch, WebSearch, AskUserQuestion]
model: opus
license: MIT
---

# My Claude

Generates documentation about your Claude Code installation and environment, and refreshes it after plugin updates.

## Prompt contract

`$ARGUMENTS` is one free-form RU/EN prompt; the mode prefixes below are optional and still work standalone.

1. Mode: an explicit prefix (`ext`, `external`, `r `, `research `, `refresh`) anywhere wins outright, the first
   one when several (literal-syntax table below); else the most distinct whole-word keyword hits (table below);
   a tie with `refresh` -> `refresh`, any other tie -> `AskUserQuestion`. No hit or empty -> `internal` (documented default).
2. Scope: prose that is not a mode/query is still input: take the topic/query from it. In `refresh` it names
   the research slugs to include (whole words).
3. Ask: at most ONE `AskUserQuestion` call, before any work, only when the answer changes what gets written:
   a mode tie (rule 1) and the INDEX question (INDEX Tracking), together in that one call. No INDEX row for the
   guide -> no question. `refresh` asks nothing: it always takes the "Yes, update" answer.

Print once, before the first action (labels literal, authored work-artifact values English, INPUT verbatim);
`refresh` prints it right after its read-only scan:

```
PLAN — brewdoc:my-claude
INPUT:  <arguments verbatim, or "(empty)">
MODE:   <resolved> — <explicit prefix | matched keyword: X | default>
SCOPE:  <sources to analyze | research query | refresh: the STALE guide keys>
DO:     <2-5 imperative bullets>
RESULT: <doc path(s) written under ${CLAUDE_PROJECT_DIR}/.claude/brewdoc/my-claude/, or "nothing (all current)">
```

## Mode Detection

| Mode | EN keywords | RU keywords | Mutates? |
|------|-------------|-------------|----------|
| `internal` (DEFAULT) | *(empty)*, internal, my setup, my installation, document my claude | внутренний, мой setup, документируй мой claude | yes |
| `external` | ext, external, architecture, hook/context schema | внешний, архитектура, схема контекста | yes |
| `research` | r, research, look up, find out about | research, исследуй, найди информацию | yes |
| `refresh` | refresh, update, regenerate | обнови, освежи | yes |

Literal prefix syntax:

| Argument value | Mode | Sub-mode |
|---|---|---|
| empty | INTERNAL | — |
| `ext` or `external` (alone) | EXTERNAL | default |
| `ext context` or `external context` | EXTERNAL | context-schema |
| starts with `r ` or `research ` | RESEARCH | query = rest of args |
| `refresh` | REFRESH | the other words name research slugs to include |

Then read the mode's reference (`references/internal-mode.md`, `references/external-mode.md`,
`references/research-mode.md`; REFRESH reads the one of each guide it regenerates). References are raw: their
`CLAUDE_PROJECT_DIR` token = the project root resolved here, `<config>` = the printed `CONFIG_DIR`.

## Delegation

One subagent per source group (~<=5 files, ~<=10 steps), all spawned in ONE message: a long agent drifts
beyond correction.

Every spawn brief carries six labeled fields, since a subagent starts with an empty context: GOAL (task + why), ROLE (owns, must not touch), SCOPE (paths/commands in and out), CONTEXT (done, by whom, in parallel), CONSUMER (who uses the result + its shape), DONE (acceptance + return: verdict first, evidence, bounded; long output to a file, path returned).
A bare one-line task is never enough. Applies to every `Explore` / `general-purpose` spawn in all four modes.

Each mode ends with an independent re-check of the written doc (INTERNAL: `Explore`, read-only, paths exist and
counts match; else `general-purpose`, re-opening sources via WebFetch/WebSearch), its fixes re-saved with action
`update`, the INDEX entry.

## Output Directory

Every output and index path starts with `${CLAUDE_PROJECT_DIR}/.claude/brewdoc/`, the only target; a relative
path follows the shell cwd as `cd` moves it and builds a second tree and INDEX.

`.claude/` is a protected path: a Write/Edit tool call or a shell redirect there is prompted in
`default`/`acceptEdits` and denied headless; allow rules never pre-approve it. This skill writes there only
through the INDEX Tracking save fence (node `fs` under the skill's Bash grant), never with Write/Edit.

**EXECUTE** using Bash tool once, before the first spawn:
```bash
echo "CONFIG_DIR=${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
PJ="${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json"
PV=$(node -e "process.stdout.write(JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')).version||'')" "$PJ" 2>/dev/null || true)
[ -n "$PV" ] || { echo "❌ cannot read version from $PJ — reinstall brewdoc"; exit 1; }
echo "PLUGIN_VERSION=$PV"; echo "LAST_UPDATED=$(date +%F)"; echo "✅ setup OK"
```
> **STOP if ❌** — fix before continuing.

`CONFIG_DIR` is the active profile (settings, plugins, auto memory); with `CLAUDE_CONFIG_DIR` set, `~/.claude`
is another profile.

### Provenance frontmatter

Every `.md` written opens with this block before the `#` heading (values from the block above, never hardcoded):

```yaml
---
doc_type: user
version: "{PLUGIN_VERSION}"
generated_by: "brewdoc:my-claude"
last_updated: "{LAST_UPDATED}"
---
```

Re-generating refreshes the quoted values and keeps a hand-edited `doc_type` (`llm` / `skip`). The save fence
refuses a document whose `version` is not the installed brewdoc version.

## INDEX Tracking

`${CLAUDE_PROJECT_DIR}/.claude/brewdoc/INDEX.jsonl`, one row per save; `path` stays repo-relative, `version` counts
the saves of that row:
```jsonl
{"ts":"2026-02-28T10:00:00","mode":"internal","path":".claude/brewdoc/my-claude/20260228_my-claude-internal.md","title":"Internal Claude Setup Overview","version":"1.0"}
```

Guide key (`internal`, `external`, `external/context-schema`, `research/<slug>`) and the newest row per key: the
Stale rule table under REFRESH Mode, the one definition; the `keyOf` of both fences implements it.

A row for the same key exists -> before any work, AskUserQuestion — header: "INDEX", question: "Entry for this mode already exists (v{VERSION}). Update it?", options: "Yes, update (bump version)" -> action `update` / "No, create new entry" -> action `append`. No row -> `append`.

Save the guide and its row in one step. Fill `<key>` and `<action>` and replace the `<document …>` line with the
whole document, provenance frontmatter first. The row `title` is the document's first `# ` heading after the
frontmatter, read inside node (never a shell argument); no heading keeps the row's title on `update` and uses
the key on `append`. The file
name comes from the key and `last_updated` (the same day overwrites); `update` edits the newest row of the key in
place (`ts`, `path`, `title`, `version` +1 in its last number), and an older file stays on disk. First save
into an empty project INDEX while `~/.claude/brewdoc/INDEX.jsonl` exists -> its rows are merged in once and the
fence prints `ℹ️ Migrated {N} entries from legacy ~/.claude/brewdoc/INDEX.jsonl (read-only; legacy file untouched)`.
NEVER write back to the legacy path.

**EXECUTE** using Bash tool:
```bash
node -e '
const fs = require("fs"), path = require("path"), os = require("os");
const [root, pluginRoot, key, action] = process.argv.slice(1);
const pj = path.join(pluginRoot, ".claude-plugin", "plugin.json");
let pv = "";
try { pv = JSON.parse(fs.readFileSync(pj, "utf8")).version || ""; } catch {}
if (!pv) { console.log("❌ cannot read version from " + pj + " — reinstall brewdoc"); process.exit(1); }
const km = /^(internal|external|external\/context-schema|research\/([A-Za-z0-9][A-Za-z0-9._-]*))$/.exec(key || "");
if (!km || !["update", "append"].includes(action)) { console.log("❌ bad key or action: " + key + " " + action); process.exit(1); }
const front = text => {
  const o = {}, m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  for (const l of m ? m[1].split(/\r?\n/) : []) {
    const kv = /^([A-Za-z_]+):[ \t]*(.*)$/.exec(l);
    if (kv) { const v = kv[2].trim(); o[kv[1]] = /^(["\x27]).*\1$/.test(v) ? v.slice(1, -1) : v; }
  }
  return o;
};
const keyOf = r => {
  const p = String(r.path || "");
  if (r.mode === "internal") return "internal";
  if (r.mode === "external") return /_context-schema\.md$/.test(p) ? "external/context-schema" : "external";
  const m = r.mode === "research" && /_research-([^/]+)\.md$/.exec(p);
  return m ? "research/" + m[1] : "";
};
const doc = fs.readFileSync(0, "utf8"), fm = front(doc);
const head = /^#[ \t]+(.+)$/m.exec(doc.replace(/^---\r?\n[\s\S]*?\r?\n---/, "")), title = head ? head[1].trim() : "";
if (fm.version !== pv || fm.generated_by !== "brewdoc:my-claude" || !/^\d{4}-\d\d-\d\d$/.test(fm.last_updated || "")) {
  console.log("❌ provenance frontmatter: version=" + fm.version + " (installed " + pv + ") generated_by=" + fm.generated_by + " last_updated=" + fm.last_updated);
  process.exit(1);
}
const d = fm.last_updated.replace(/-/g, ""), dir = ".claude/brewdoc/my-claude";
const rel = key === "internal" ? dir + "/" + d + "_my-claude-internal.md"
  : key === "external" ? dir + "/" + d + "_my-claude-external.md"
  : key === "external/context-schema" ? dir + "/external/" + d + "_context-schema.md"
  : dir + "/" + d + "_research-" + km[2] + ".md";
const put = (file, text) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file + ".tmp", text); fs.renameSync(file + ".tmp", file); };
const rowsOf = f => fs.existsSync(f) ? fs.readFileSync(f, "utf8").split("\n").filter(l => l.trim()) : [];
const idx = path.join(root, ".claude", "brewdoc", "INDEX.jsonl");
let lines = rowsOf(idx);
const legacy = rowsOf(path.join(os.homedir(), ".claude", "brewdoc", "INDEX.jsonl"));
if (!lines.length && legacy.length) { lines = legacy; console.log("ℹ️ Migrated " + legacy.length + " entries from legacy ~/.claude/brewdoc/INDEX.jsonl (read-only; legacy file untouched)"); }
const parse = l => { try { return JSON.parse(l); } catch { return null; } };
let at = -1;
lines.forEach((l, i) => { const r = parse(l); if (r && keyOf(r) === key && (at < 0 || String(parse(lines[at]).ts ?? "") <= String(r.ts ?? ""))) at = i; });
const z = n => String(n).padStart(2, "0"), t = new Date();
const ts = t.getFullYear() + "-" + z(t.getMonth() + 1) + "-" + z(t.getDate()) + "T" + z(t.getHours()) + ":" + z(t.getMinutes()) + ":" + z(t.getSeconds());
const bump = v => { const b = /^(.*?)(\d+)$/.exec(String(v ?? "")); return b ? b[1] + (Number(b[2]) + 1) : "1.0"; };
put(path.join(root, rel), doc);
let row;
if (action === "update" && at >= 0) { const r = parse(lines[at]); row = { ...r, ts, path: rel, title: title || r.title, version: bump(r.version) }; lines[at] = JSON.stringify(row); }
else { row = { ts, mode: key.split("/")[0], path: rel, title: title || key, version: "1.0" }; lines.push(JSON.stringify(row)); }
put(idx, lines.join("\n") + "\n");
console.log("saved " + rel + " — INDEX row " + (at >= 0 && action === "update" ? "updated" : "appended") + " (v" + row.version + ")");
' "${CLAUDE_PROJECT_DIR}" "${CLAUDE_PLUGIN_ROOT}" '<key>' '<action>' <<'__MY_CLAUDE_DOC__' && echo "✅ save OK" || echo "❌ save FAILED"
<document — provenance frontmatter first, then the body>
__MY_CLAUDE_DOC__
```
> **STOP if ❌** — nothing was written; fix the named key, action or frontmatter value, then save again.

## INTERNAL Mode

1. Spawn 3 parallel `Explore` agents, one per source group of the reference: (1) global, (2) project,
   (3) memory. Briefs say: record env var, token and MCP header names, never values (settings `env`,
   `.claude.json`, `.mcp.json` hold credentials). E.g. group (1):
   ```
   Agent(subagent_type="Explore", prompt="
   GOAL: producing a document describing this user's whole Claude Code installation;
     you cover the global config layer only, another agent covers project + memory.
   ROLE: read-only inventory of global config. Do NOT edit any file, do NOT read project files.
   SCOPE: in — <the Global config row of the sources table, under CONFIG_DIR>.
     Out — project CLAUDE.md, .claude/**, memory files, source code, the plugin inventory (the skill's fence).
   CONTEXT: nothing has been read yet — you are the first pass for this group. Two sibling
     agents scan project `.claude` config and memory files in parallel right now; the output
     dir `${CLAUDE_PROJECT_DIR}/.claude/brewdoc/my-claude/` and the INDEX entry are already
     resolved by the skill.
   CONSUMER: the aggregation step merges the three inventories into one INTERNAL-mode
     document, then an `Explore` agent re-checks that every path you name exists — absolute
     paths only, and flag a missing file instead of dropping its row.
   DONE: per-section inventory (instructions summary, rules N + one line each, settings keys + hook
     events, agents N + purpose, skills N + purpose) with absolute paths for every item.
     Flag missing files explicitly.
   ")
   ```
2. While they run, take the `## Plugins and mods` table yourself (rules in the reference), fence below.
3. Aggregate into the reference's document template; save it (INDEX Tracking, key `internal`) ->
   `${CLAUDE_PROJECT_DIR}/.claude/brewdoc/my-claude/YYYYMMDD_my-claude-internal.md`

Step 2, **EXECUTE** using Bash tool:
```bash
unset CLAUDECODE
node -e '
const fs = require("fs"), path = require("path"), cp = require("child_process");
const real = p => { try { return fs.realpathSync(p); } catch { return path.resolve(p); } };
const root = real(process.argv[1]);
const r = cp.spawnSync("claude", ["plugin", "list", "--json"], { encoding: "utf8", maxBuffer: 1 << 26 });
let rows = null;
try { rows = r.status === 0 ? JSON.parse(r.stdout) : null; } catch {}
if (!Array.isArray(rows)) {
  const why = r.error ? "not found" : r.status !== 0 ? "exited " + (r.status ?? r.signal) : "printed invalid JSON";
  console.log("Plugin inventory unavailable: `claude plugin list --json` " + why + ".");
  console.log("SUMMARY | Plugins and mods | unavailable | `claude plugin list --json` |");
  process.exit(0);
}
const kind = p => { try { return p && Object.hasOwn(JSON.parse(fs.readFileSync(path.join(p, "hooks", "hooks.json"), "utf8")), "modules") ? "mod" : "plugin"; } catch { return "plugin"; } };
const scopes = { managed: 0, user: 1, project: 2, local: 3 };
const out = rows
  .filter(x => x && (x.scope === "user" || x.scope === "managed" || ((x.scope === "project" || x.scope === "local") && x.projectPath && real(x.projectPath) === root)))
  .map(x => ({ id: String(x.id), version: String(x.version), scope: x.scope, enabled: x.enabled ? "yes" : "no", kind: kind(String(x.installPath || "")) }));
const rank = x => (x.kind === "mod" ? 0 : 2) + (x.id.split("@")[0] === "brewmod-placeholders" ? 0 : 1);
out.sort((a, b) => rank(a) - rank(b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0) || scopes[a.scope] - scopes[b.scope]);
console.log("| Plugin | Version | Scope | Enabled | Kind |");
console.log("|--------|---------|-------|---------|------|");
for (const x of out) console.log("| " + [x.id, x.version, x.scope, x.enabled, x.kind].join(" | ") + " |");
console.log("SUMMARY | Plugins and mods | " + out.length + " (" + out.filter(x => x.kind === "mod").length + " mods) | `claude plugin list --json` |");
' "${CLAUDE_PROJECT_DIR}" && echo "✅ plugins OK" || echo "❌ plugins FAILED"
```
> **STOP if ❌** — fix before continuing.

The table (or its one `unavailable` line) goes into the section verbatim; the `SUMMARY ` line, prefix dropped,
is the Summary row.

## EXTERNAL Mode

Covers the hook/context/agent architecture from official sources + local analysis. **Sub-mode default:**
1. Analyze local hook registrations (settings `hooks`, plugin `hooks/hooks.json`) for event model patterns
2. Spawn `general-purpose` agents, one per row of the reference's sources table (recent releases + CHANGELOG)
3. Save (key `external`) -> `${CLAUDE_PROJECT_DIR}/.claude/brewdoc/my-claude/YYYYMMDD_my-claude-external.md`

**Sub-mode context-schema:** focus on the context injection schema (additionalContext, updatedInput, etc.);
save (key `external/context-schema`) -> `${CLAUDE_PROJECT_DIR}/.claude/brewdoc/my-claude/external/YYYYMMDD_context-schema.md`

## RESEARCH Mode

Query = everything after `r ` or `research `, else the topic taken from the prompt.

1. Divide the query into 2-5 source groups (official docs, GitHub, Reddit, forums, marketplaces)
2. Spawn `general-purpose` agents per source group in parallel
3. Aggregate with citation tracking (source URL per fact)
4. Save (key `research/{slug}`) -> `${CLAUDE_PROJECT_DIR}/.claude/brewdoc/my-claude/YYYYMMDD_research-{slug}.md`

## REFRESH Mode

Regenerates every guide the installed brewdoc has outgrown, so the guide follows plugin updates. It asks
nothing: each regeneration takes the INDEX "Yes, update" answer.

1. Scan the INDEX (read-only), fence below. One line per guide key:
   `STALE|CURRENT|SKIP|MISSING <key> <path> doc=<version|none|unsubstituted> installed=<PV>`, or `NONE` (no
   keyed INDEX row). Older rows of a key stay silent. `doc=`: `none` = no `version`, `unsubstituted` = it holds
   `{`/`}`. Verdicts follow the Stale rule below; MISSING is reported, never regenerated.
2. Print the PLAN block (SCOPE = the STALE keys). No STALE line -> go to the report and write nothing.
3. Each STALE key in scan order: run the Output Directory fence once, then that key's mode section
   (`internal` -> INTERNAL, `external` -> EXTERNAL default, `external/context-schema` -> EXTERNAL context-schema,
   `research/<slug>` -> RESEARCH, query = the row `title` minus a leading `Research: `), saved with action
   `update`. A key that fails is reported and the next one still runs.
4. Report, format below.

Stale rule, the one definition (scan fence = reference implementation; `PV` = installed brewdoc version):

| Step | Rule |
|---|---|
| Key | per INDEX row: mode `internal` -> `internal`; mode `external` -> `external/context-schema` when `path` ends `_context-schema.md` (any dir, legacy `~/.claude/brewdoc/external/` included), else `external`; mode `research` -> `research/<slug>` when `path` ends `_research-<slug>.md` (slug has no `/`); any other row (other mode, unmatched path, not JSON) has no key and is ignored |
| Newest | per key the row with the greatest `ts`, compared as strings (absent = empty string); equal `ts` -> the later line |
| Path | `path` starting `~/` -> the home dir joined with the rest; any other `path` -> resolved against the project root |
| Version | `version` in the leading `---` frontmatter block (file starts with `---`): value trimmed, one pair of matching surrounding quotes dropped |
| Parse | split on `.`, each part `parseInt(part, 10)`, NaN -> 0; compared part by part from the left, a missing part = 0 |
| Verdict | first match: research key whose slug the prompt does not name (whole word `<slug>` or `research-<slug>`, case-insensitive) -> SKIP; file absent -> MISSING; `doc_type: skip` -> SKIP; `version` empty or absent, holding `{` or `}`, or below `PV` -> STALE; else CURRENT |

Step 1, **EXECUTE** using Bash tool:
```bash
IFS= read -r -d '' ARGS <<'__SKILL_ARGS__' || true
$ARGUMENTS
__SKILL_ARGS__
ARGS=${ARGS%$'\n'}
node -e '
const fs = require("fs"), path = require("path"), os = require("os");
const [root, pluginRoot, prompt] = process.argv.slice(1);
const pj = path.join(pluginRoot, ".claude-plugin", "plugin.json");
let pv = "";
try { pv = JSON.parse(fs.readFileSync(pj, "utf8")).version || ""; } catch {}
if (!pv) { console.log("❌ cannot read version from " + pj + " — reinstall brewdoc"); process.exit(1); }
const keyOf = r => {
  const p = String(r.path || "");
  if (r.mode === "internal") return "internal";
  if (r.mode === "external") return /_context-schema\.md$/.test(p) ? "external/context-schema" : "external";
  const m = r.mode === "research" && /_research-([^/]+)\.md$/.exec(p);
  return m ? "research/" + m[1] : "";
};
const front = file => {
  const o = {}, m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(fs.readFileSync(file, "utf8"));
  for (const l of m ? m[1].split(/\r?\n/) : []) {
    const kv = /^([A-Za-z_]+):[ \t]*(.*)$/.exec(l);
    if (kv) { const v = kv[2].trim(); o[kv[1]] = /^(["\x27]).*\1$/.test(v) ? v.slice(1, -1) : v; }
  }
  return o;
};
const idx = path.join(root, ".claude", "brewdoc", "INDEX.jsonl");
const newest = new Map();
for (const l of fs.existsSync(idx) ? fs.readFileSync(idx, "utf8").split("\n") : []) {
  let r = null;
  try { r = JSON.parse(l); } catch {}
  const k = r && keyOf(r);
  if (k && !(newest.has(k) && String(newest.get(k).ts ?? "") > String(r.ts ?? ""))) newest.set(k, r);
}
if (!newest.size) { console.log("NONE"); process.exit(0); }
const words = String(prompt || "").toLowerCase().split(/[\s,;]+/);
const num = v => String(v).split(".").map(n => parseInt(n, 10) || 0);
const older = (a, b) => {
  const x = num(a), y = num(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) < (y[i] || 0);
  return false;
};
for (const [k, r] of newest) {
  const p = String(r.path), abs = p.startsWith("~/") ? path.join(os.homedir(), p.slice(2)) : path.resolve(root, p);
  const there = fs.existsSync(abs), fm = there ? front(abs) : {}, v = fm.version;
  const doc = !v ? "none" : /[{}]/.test(v) ? "unsubstituted" : v;
  const slug = k.startsWith("research/") ? k.slice(9).toLowerCase() : "";
  const st = slug && !words.includes(slug) && !words.includes("research-" + slug) ? "SKIP"
    : !there ? "MISSING" : fm.doc_type === "skip" ? "SKIP"
    : !v || /[{}]/.test(v) || older(v, pv) ? "STALE" : "CURRENT";
  console.log(st + " " + k + " " + p + " doc=" + doc + " installed=" + pv);
}
' "${CLAUDE_PROJECT_DIR}" "${CLAUDE_PLUGIN_ROOT}" "$ARGS" && echo "✅ scan OK" || echo "❌ scan FAILED"
```
> **STOP if ❌** — fix before continuing.

Step 4 report, markers 🟢🔵🔴⚪ only (the fences' ✅/❌ lines are tool output, never in the report). Heading,
first match wins (N = 🟢 rows, M = 🔴 rows, K = ⚪ current rows):

| Case | Heading |
|---|---|
| scan printed `NONE` | only the line `⚪ No my-claude guide in this project yet: run /brewdoc:my-claude.`, no table |
| any 🔴 row | `## 🔴 my-claude guides: N refreshed, M failed (brewdoc <PV>)` |
| no STALE line | `## ⚪ my-claude guides are current (brewdoc <PV>)` |
| else | `## 🟢 my-claude guides: N refreshed, K current (brewdoc <PV>)` |

```markdown
## 🔴 my-claude guides: 1 refreshed, 1 failed (brewdoc 6.10.0)

| Guide | Doc version | Result |
|---|---|---|
| **internal** | 6.7.1 -> **6.10.0** | 🟢 refreshed: `.claude/brewdoc/my-claude/20261016_my-claude-internal.md` |
| **external/context-schema** | 6.10.0 | ⚪ current |
| **research/hooks** | 6.7.1 | ⚪ skipped: research, name `hooks` to refresh it |
| **external** | none | 🔵 missing: `<path>`; `/brewdoc:my-claude ext` writes a new one |
| **research/agents** | 6.7.1 | 🔴 failed: `<first error line>` |
```
