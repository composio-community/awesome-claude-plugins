---
name: md-to-pdf
description: Convert Markdown to PDF via reportlab or weasyprint engines. Triggers - pdf, md to pdf, markdown to pdf, generate pdf.
user-invocable: true
disable-model-invocation: true
argument-hint: "[prompt] <file.md> [--engine name] [\"llm prompt\"] | styles | test | (no args = help)"
allowed-tools: [Read, Write, Edit, Bash, Glob, Grep, AskUserQuestion]
model: sonnet
license: MIT
---
<!-- brewcode-meta: version=6.12.5 content_version=6.5.3 generated_by=brewdoc:md-to-pdf -->

# MD to PDF

Converts Markdown to PDF with the `reportlab` or `weasyprint` engine.

## Prompt contract

`$ARGUMENTS` is one free-form RU/EN prompt; the file path, the `--engine <name>` flag, the `styles`/`test`
tokens and the quoted LLM-preprocessing prompt may sit anywhere in it.

1. Mode: a literal mode token (`styles`, `config`, `test`, `help`) wins outright; else the most distinct
   whole-word keyword hits (table below). Empty -> `help` (documented default, read-only, asks nothing).
2. Scope: the prompt may be a full sentence, not just tokens. Take `md_file` from any path-shaped token or a
   filename explicitly named in prose (e.g. "convert my notes.md to pdf" -> `md_file = notes.md`, resolved
   against cwd). Never guess a file and never silently fall through to HELP.
3. Ask: a sentence that implies CONVERT with no resolvable file -> ONE `AskUserQuestion` for the file path;
   outcome-changing ambiguity (missing engine deps, no saved engine preference) -> ONE `AskUserQuestion`.

Print once, before Step 1 (labels literal, values in the conversation language):

```
PLAN — brewdoc:md-to-pdf
INPUT:  <arguments verbatim, or "(empty)">
MODE:   <resolved> — <explicit | matched keyword: X | default | prose-resolved file: path>
SCOPE:  <md_file | engine | style question, as applicable>
DO:     <2-5 imperative bullets>
RESULT: <PDF path, or the help/styles/test output>
```

## Step 0: Parse Arguments

| Component | Required | Description |
|-----------|:--------:|-------------|
| `md_file` | per mode | Path to `.md` file — literal token or extracted from prose (Prompt contract rule 2) |
| `--engine` | No | `reportlab` or `weasyprint`, anywhere; overrides saved config; strip before parsing |
| `custom_prompt` | No | Last argument in double quotes = LLM preprocessing instructions |

| Mode | Condition | EN keywords | RU keywords | Mutates? |
|------|-----------|-------------|-------------|----------|
| HELP | Empty or `help` | *(empty)*, help | помощь | no |
| STYLES | `styles` or `config` | styles, config, configure, page size, color scheme | стили, настрой стиль, конфиг | yes |
| TEST | `test` | test, sample, demo, bundled test file | тест, пример, демо | no (private temp dir, removed on exit) |
| CONVERT+PROMPT | Path to `.md` file + quoted string at end | convert with instructions, pdf and rewrite/strip section | сконвертируй с изменениями | yes |
| CONVERT | Path to `.md` file (no quoted string) | convert, pdf, generate pdf, turn into pdf, `.md` file named in prose | конвертируй, сделай pdf, преврати в pdf | yes |

HELP and STYLES skip to Step 3.

## Step 1: Engine Selection

Config = project `.claude/md-to-pdf.config.json`, else global `~/.claude/md-to-pdf.config.json`. Engine = `--engine`,
else config `engine`, else TEST takes `reportlab` and writes nothing, and CONVERT modes ask via `AskUserQuestion`
with this table (default `reportlab`) and save with the block below, `NEW_JSON` = `{"engine": "<choice>"}`.

| Feature | reportlab | weasyprint |
|---------|-----------|------------|
| Install | pip only | pip + brew |
| Quality | Good | Excellent |
| Speed | Fast | Moderate |
| Images | Basic | Full |
| CSS Styling | No | Yes |
| Code highlight | No | Yes (Pygments) |

Config shape:

```json
{
  "engine": "reportlab",
  "pygments_theme": "github",
  "version": "{PLUGIN_VERSION}",
  "content_version": "{CONTENT_VERSION}",
  "generated_by": "brewdoc:md-to-pdf",
  "last_updated": "{LAST_UPDATED}"
}
```

The block merges `NEW_JSON`'s top-level keys into the project file, so engine and style saves keep each other,
and resolves the four provenance keys on every write, never hardcoded.

**EXECUTE** using Bash tool (replace `NEW_JSON`; keep every other byte):
```bash
ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
NEW="$(mktemp)"
cat > "$NEW" <<'BREWDOC_CFG_EOF'
NEW_JSON
BREWDOC_CFG_EOF
mkdir -p "$ROOT/.claude"
CFG="$ROOT/.claude/md-to-pdf.config.json" NEW="$NEW" PJ="${CLAUDE_SKILL_DIR}/../../.claude-plugin/plugin.json" SKILL_MD="${CLAUDE_SKILL_DIR}/SKILL.md" TODAY="$(date +%F)" python3 - <<'PY'
import json, os, re
cfg_p = os.environ["CFG"]
pv = json.load(open(os.environ["PJ"])).get("version")
if not pv:
    raise SystemExit("no version in " + os.environ["PJ"])
cv = None
for line in open(os.environ["SKILL_MD"]):
    if "brewcode-meta:" in line:
        m = re.search(r"content_version=(\d+\.\d+\.\d+)", line)
        if m:
            cv = m.group(1)
        break
if not cv:
    raise SystemExit("no content_version in " + os.environ["SKILL_MD"])
data = json.load(open(cfg_p)) if os.path.exists(cfg_p) else {}
data.update(json.load(open(os.environ["NEW"])))
data["version"] = pv
data["content_version"] = cv
data["generated_by"] = "brewdoc:md-to-pdf"
data["last_updated"] = os.environ["TODAY"]
with open(cfg_p, "w") as fh:
    json.dump(data, fh, indent=2)
    fh.write("\n")
print("OK version=%s content_version=%s engine=%s" % (pv, cv, data.get("engine", "(unset)")))
PY
rc=$?; rm -f "$NEW"
[ "$rc" -eq 0 ] && echo "✅ config saved" || { echo "❌ config save FAILED"; exit 1; }
```

> **STOP if ❌** -- fix before continuing.

## Step 2: Dependency Check

**EXECUTE** using Bash tool (replace `ENGINE_NAME` with the Step 1 engine):
```bash
bash "${CLAUDE_SKILL_DIR}/scripts/check_deps.sh" check ENGINE_NAME 2>&1; echo "EXIT_CODE=$?"
```

Output contains `MISSING_PIP` or `MISSING_SYSTEM` -> `AskUserQuestion` with the comparison table and these options:
- "Install ENGINE_NAME dependencies"
- "Switch to OTHER_ENGINE" (if the other engine is available)
- "Cancel"

If user chooses install, **EXECUTE** using Bash tool:
```bash
bash "${CLAUDE_SKILL_DIR}/scripts/check_deps.sh" install ENGINE_NAME 2>&1 && echo "---INSTALL_OK---" || echo "---INSTALL_FAILED---"
```

> **STOP if INSTALL_FAILED** -- report error and exit. Cancel -> STOP.

## Step 3: Mode Execution

### HELP Mode

Print:

```
MD to PDF Converter

Usage:
  /brewdoc:md-to-pdf <file.md>                     Convert with saved engine/style
  /brewdoc:md-to-pdf <file.md> --engine weasyprint  Convert with specific engine
  /brewdoc:md-to-pdf <file.md> "remove section X"   Preprocess MD then convert
  /brewdoc:md-to-pdf styles                          Configure page/color/font
  /brewdoc:md-to-pdf test                            Convert bundled test file
  /brewdoc:md-to-pdf help                            Show this help

Engines:
  reportlab    -- Pure Python, fast, no system deps (check_deps.sh install reportlab)
  weasyprint   -- HTML/CSS pipeline, best quality (pip + brew deps)
```

EXIT after printing.

### CONVERT Mode

1. Read `md_file`; not found -> STOP with an error. Output: same directory and name, `.pdf` extension.

**EXECUTE** using Bash tool (substitute `INPUT_PATH`, `OUTPUT_PATH`, `ENGINE`; add `--config CONFIG_PATH` when a config from Step 1 exists; for weasyprint add `--pygments-theme THEME` when it sets `pygments_theme`):
```bash
python3 "${CLAUDE_SKILL_DIR}/scripts/md_to_pdf.py" "INPUT_PATH" "OUTPUT_PATH" --engine ENGINE 2>&1 && echo "---CONVERT_OK---" || echo "---CONVERT_FAILED---"
```

> **STOP if CONVERT_FAILED** -- read error output, attempt fix, retry once. If still failing -- report error.

2. Parse the result lines `STATUS`, `OUTPUT`, `PAGES`, `SIZE`, `ENGINE`.

### CONVERT+PROMPT Mode

1. Read `md_file`; apply the `custom_prompt` transformations (delete sections, rewrite headings, restructure).
2. Write, convert and clean up in ONE Bash call.

**EXECUTE** using Bash tool (replace `ORIGINAL_DIR`, `TRANSFORMED_MARKDOWN`, `OUTPUT_PATH`, `ENGINE`; keep every other byte):
```bash
set -euo pipefail
SRC_DIR="ORIGINAL_DIR"
TMP="$(mktemp "$SRC_DIR/.tmp_XXXXXX")"
trap 'case "${TMP##*/}" in .tmp_??????) rm -f "$TMP" ;; esac' EXIT
cat > "$TMP" <<'BREWDOC_MD_EOF'
TRANSFORMED_MARKDOWN
BREWDOC_MD_EOF
python3 "${CLAUDE_SKILL_DIR}/scripts/md_to_pdf.py" "$TMP" "OUTPUT_PATH" --engine ENGINE 2>&1 && echo "---CONVERT_OK---" || echo "---CONVERT_FAILED---"
```
`OUTPUT_PATH` is the ORIGINAL name with a `.pdf` extension; `--config` / `--pygments-theme` as in CONVERT. Never
write the transformed markdown with `Write`/`Edit` or to a fixed `.tmp_<name>.md` path: a predictable name
overwrites user files and collides with a concurrent conversion of the same source.

> **STOP if CONVERT_FAILED** -- as in CONVERT.

3. Parse the result lines, then Step 4 with `preprocessing: true`.

### STYLES Mode

Ask the four questions in one `AskUserQuestion` call:

| # | Question | Options |
|---|----------|---------|
| 1 | Page size | `A4` (default), `Letter`, `Legal` |
| 2 | Color scheme | `Default blue` (primary #1a3a5c), `Dark` (primary #2d3748), `Custom` (ask for hex values) |
| 3 | Code theme (weasyprint only) | `github` (default), `monokai`, `friendly`, `solarized-dark`, `solarized-light` |
| 4 | Footer format | `Page {page} of {total}` (default), `{page}/{total}`, `Disabled` |

Save with the Step 1 block: `NEW_JSON` = `styles/default.json` structure with the changed values, plus answer 3 as
top-level `pygments_theme` (passed as `--pygments-theme`; `md_to_pdf.py` never reads `code.theme` and reads only
`page`, `colors`, `typography`, `code`, `footer`). Report the saved settings table and EXIT.

### TEST Mode

The CONVERT command on the bundled file, writing into a private 0700 `mktemp -d` dir removed on exit.

**EXECUTE** using Bash tool (replace `ENGINE`; `--config` / `--pygments-theme` as in CONVERT; keep every other byte):
```bash
umask 077
TEST_DIR="$(mktemp -d "${TMPDIR:-/tmp}/md-to-pdf-test.XXXXXX")" && chmod 700 "$TEST_DIR" || { echo "---CONVERT_FAILED---"; exit 1; }
trap 'case "${TEST_DIR##*/}" in md-to-pdf-test.??????) rm -rf -- "$TEST_DIR" ;; esac' EXIT
python3 "${CLAUDE_SKILL_DIR}/scripts/md_to_pdf.py" "${CLAUDE_SKILL_DIR}/test/test-all-elements.md" "$TEST_DIR/md-to-pdf-test-ENGINE.pdf" --engine ENGINE 2>&1 && echo "---CONVERT_OK---" || echo "---CONVERT_FAILED---"
```

> **STOP if CONVERT_FAILED** -- as in CONVERT.

Then Step 4; Output = the `OUTPUT=` path, marked `(removed on exit)`.

## Step 4: Report Results

| Parameter | Value |
|-----------|-------|
| Source | absolute path to input MD |
| Output | absolute path to output PDF |
| Pages | `PAGES=` line of the script output |
| Size | `SIZE=` line |
| Engine | `reportlab` or `weasyprint` |
| Preprocessing | custom_prompt summary (if used) or `none` |
