# MD to PDF

Converts Markdown to a styled PDF with **reportlab** (pure Python, no system deps) or **weasyprint** (HTML/CSS, syntax highlighting).

## Install

Install the [Brewdoc plugin](../../README.md#install), then `/reload-plugins`. The skill offers to install its engine on first use.

## Usage

| Mode | Example | Does |
|------|---------|------|
| Convert | `/brewdoc:md-to-pdf README.md --engine weasyprint` | Writes `README.pdf` next to the source; `--engine` overrides the saved engine |
| Convert+Prompt | `/brewdoc:md-to-pdf docs/api.md "Remove the Changelog section"` | Edits a temp copy with the quoted prompt, then converts; the source is untouched |
| Styles | `/brewdoc:md-to-pdf styles` | Page size, color scheme, code theme, footer |
| Test | `/brewdoc:md-to-pdf test` | Renders a bundled file into a private temp dir (removed on exit) |
| Help | `/brewdoc:md-to-pdf` or `help` | Prints usage |

| Engine | Install | Best for |
|--------|---------|----------|
| `reportlab` (default) | `check_deps.sh install reportlab` | Fast text docs, zero system deps |
| `weasyprint` | `check_deps.sh install weasyprint` (pip + `brew` deps) | Code highlighting, CSS, full images |

The first run asks for an engine and saves it to `.claude/md-to-pdf.config.json`; `styles` saves to the same file. After conversion the skill prints source, output, pages, size, engine and preprocessing summary. The prompt must be the last argument, in double quotes.

## Documentation

[md-to-pdf docs](https://doc-claude.brewcode.app/brewdoc/skills/md-to-pdf/): engines, styles, config and dependency pins.
