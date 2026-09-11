<h1 align="center">Awesome Claude Code Plugins</h1>

<p align="center">
<a href="https://dashboard.composio.dev/login?utm_source=Github&utm_medium=Banner&utm_content=AwesomePlugins">
  <img width="1280" alt="Awesome Claude Plugins" src="./cover_image.png">
</a>
</p>

<p align="center">
  <a href="https://awesome.re">
    <img src="https://awesome.re/badge.svg" alt="Awesome" />
  </a>
  <a href="https://makeapullrequest.com">
    <img src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat-square" alt="PRs Welcome" />
  </a>
  <a href="https://opensource.org/licenses/MIT">
    <img src="https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square" alt="License: MIT" />
  </a>
</p>

<div>
<p align="center">
  <a href="https://twitter.com/composio">
    <img src="https://img.shields.io/badge/Follow%20on%20X-000000?style=for-the-badge&logo=x&logoColor=white" alt="Follow on X" />
  </a>
  <a href="https://www.linkedin.com/company/composiohq/">
    <img src="https://img.shields.io/badge/Follow%20on%20LinkedIn-0077B5?style=for-the-badge&logo=linkedin&logoColor=white" alt="Follow on LinkedIn" />
  </a>
  <a href="https://discord.com/invite/composio">
    <img src="https://img.shields.io/badge/Join%20our%20Discord-5865F2?style=for-the-badge&logo=discord&logoColor=white" alt="Join our Discord" />
  </a>
</p>
</div>

<p align="center">
A curated list of production-ready plugins for Claude Code to supercharge your development workflow.
</p>

> **Want plugins that do more than generate text?** The [connect-apps](./connect-apps) plugin lets Claude send emails, create issues, post to Slack, and take actions across 1000+ apps.

---

## Give your skills real-world actions

Skills tell your agent **how** to work. An MCP Gateway gives it secure access to the tools it needs.

Composio [MCP Gateway](https://composio.dev/mcp-gateway) provides a single MCP endpoint for 1,000+ integrations with built-in authentication, team-based access controls, audit logs, and production-ready reliability.


### 1. Clone & Run

```bash
git clone https://github.com/composiohq/awesome-claude-plugins.git
cd awesome-claude-plugins
claude --plugin-dir ./connect-apps
```

### 2. Run Setup

```shell
/connect-apps:setup
```

Paste your API key when asked. (Get a free key at [dashboard.composio.dev](https://dashboard.composio.dev/login?utm_source=Github&utm_medium=Banner&utm_content=AwesomePlugins)

### 3. Try It

Ask Claude to send you a test email. If you receive it, Claude is now connected to 1000+ apps.

**[See all supported apps →](https://composio.dev/tools)**

---

## Contents

- [What Are Claude Plugins?](#what-are-claude-plugins)
- [Plugins](#plugins)
  - [Integrations](#integrations)
  - [Frontend & Design](#frontend--design)
  - [Git & Version Control](#git--version-control)
  - [Code Quality & Testing](#code-quality--testing)
  - [Backend & Architecture](#backend--architecture)
  - [DevOps & Performance](#devops--performance)
  - [Documentation & Security](#documentation--security)
  - [Developer Productivity](#developer-productivity)
  - [Business & Finance](#business--finance)
  - [Companion & Personality](#companion--personality)
- [Getting Started](#getting-started)
- [Contributing](#contributing)
- [Resources](#resources)
- [License](#license)

## What Are Claude Plugins?

Claude Plugins are extensions that enhance Claude Code with custom slash commands, specialized agents, hooks, and skills. Plugins can be shared across projects and teams, providing consistent tooling and workflows.

## Plugins

### Integrations

- [connect-apps](./connect-apps) - Connect Claude to any app. Send emails, create issues, post messages, update databases - take real actions across Gmail, Slack, GitHub, Notion, and 1000+ services.
- [kaggle-skill](https://github.com/shepsci/kaggle-skill) - Complete Kaggle integration — account setup, competition reports, dataset/model downloads, notebook execution, submissions, and badge collection.

### Frontend & Design

- [frontend-design](./frontend-design) - Create distinctive, production-grade interfaces. Avoids generic "AI slop" with bold typography, unique color palettes, and creative layouts.
- [artifacts-builder](./artifacts-builder) - Suite of tools for creating elaborate, multi-component HTML artifacts using React, Tailwind CSS, and shadcn/ui.
- [theme-factory](./theme-factory) - Applies professional font and color themes to artifacts including slides, docs, reports, and HTML landing pages with 10 pre-set themes.
- [canvas-design](./canvas-design) - Creates beautiful visual art in PNG and PDF documents using design philosophy and aesthetic principles for posters and static pieces.
- [senior-frontend](./senior-frontend) - React/Next.js/TypeScript development patterns with bundle analysis, component generation, and accessibility best practices.
- [frontend-developer](./frontend-developer) - Frontend development specialist agent for building modern web interfaces.

### Git & Version Control

- [commit](./commit) - Creates smart git commits using conventional commit format with meaningful messages and emojis.
- [create-pr](./create-pr) - Automates pull request creation with proper templates, descriptions, and labels.
- [pr-review](./pr-review) - Comprehensive PR reviews with detailed feedback on code quality, security, and best practices.
- [changelog-generator](./changelog-generator) - Automatically creates user-facing changelogs from git commits by analyzing history and transforming technical commits into customer-friendly release notes.
- [ship](./ship) - Complete PR workflow from commit to production. Lint, test, review, and deploy.

### Code Quality & Testing

- [AgentLint](https://github.com/0xmariowu/AgentLint) - Lint your repo for AI agent compatibility. 33 evidence-backed checks across 5 dimensions. Claude Code plugin.
- [code-review](./code-review) - Comprehensive code review with best practices, patterns, and improvement suggestions.
- [test-writer-fixer](./test-writer-fixer) - Automatically write and fix unit tests. Supports Jest, Vitest, Pytest, and more.
- [debugger](./debugger) - Advanced debugging assistant for tracking down and fixing complex bugs.
- [bug-fix](./bug-fix) - Analyzes stack traces and code to identify and fix bugs in your codebase.

### Backend & Architecture

- [backend-architect](./backend-architect) - Backend architecture patterns, API design, database schemas, and system design.
- [mcp-builder](./mcp-builder) - Guides creation of high-quality MCP (Model Context Protocol) servers for integrating external APIs and services with LLMs.
- [agent-sdk-dev](./agent-sdk-dev) - Claude Agent SDK development helper for building custom AI agents.
- [maestro-orchestrate](https://github.com/josstei/maestro-orchestrate) - Multi-agent development orchestration coordinating 22 specialized subagents through 4-phase workflows with native parallel execution, persistent sessions, and standalone commands for code review, debugging, security audit, and more.

### DevOps & Performance

- [perf](./perf) - Performance analysis and optimization. Identify bottlenecks and improve speed.
- [audit-project](./audit-project) - Full project audit for code quality, dependencies, security, and best practices.
- [MyVibe](https://www.myvibe.so) - Instant deployment to live URLs with `/myvibe:publish`.
- [aws-cost-saver](https://github.com/prajapatimehul/aws-cost-saver) - Automated AWS cost optimization with 173 checks across EC2, RDS, S3, Lambda, and more. ML-powered recommendations and real pricing from AWS API.
- [Manifest](https://github.com/mnfst/manifest) - Real-time cost observability for OpenClaw agents — track tokens, costs, messages, and model usage. Includes Claude Code [skill](https://github.com/mnfst/manifest/blob/main/skills/manifest/SKILL.md) for guided setup. Self-hosted, OTLP ingestion, 28+ LLM models. ([Website](https://manifest.build))

### Documentation & Security

- [documentation-generator](./documentation-generator) - Generate comprehensive documentation from code. READMEs, API docs, and guides.
- [security-guidance](./security-guidance) - Security best practices and vulnerability detection. OWASP guidelines and secure coding.
- [security-sweep](https://github.com/Onome-AJ/security-sweep-plugin) - Comprehensive security scanner covering OWASP Top 10 (2025), Mobile Top 10 (2024), and LLM Top 10 (2025). Scans for hardcoded secrets, injection flaws, auth issues, misconfigurations, and AI-specific vulnerabilities.
- [asqav-claude-code](https://github.com/jagmarques/asqav-claude-code) - Signs a tamper-evident Asqav receipt at the end of each Claude Code session: files edited (content hashes before/after), commands run (hashed), and git context. Verifiable by anyone at asqav.com/verify.

### Developer Productivity

- [CCHub](https://github.com/Moresl/cchub) - Desktop app for managing the Claude Code ecosystem — MCP marketplace, config profiles, skills & plugins browser, workflow templates, security audit. Built with Tauri v2 + React + Rust.

- [developer-growth-analysis](./developer-growth-analysis) - Analyzes your recent Claude Code chat history to identify coding patterns, development gaps, and curates personalized learning resources.
- [skill-bus](./skill-bus) - The skill for connecting skills. Wire context, conditions, and other skills into any skill invocation — declaratively, without modification. Zero dependencies.
- [context-mode](https://github.com/mksglu/claude-context-mode) - Process large outputs in sandboxed subprocesses, keeping only summaries in the context window. 98% context savings across 21 benchmarked scenarios.
- [codebase-graph](https://github.com/Phoenixrr2113/codebase-graph) - Code intelligence MCP server that builds knowledge graphs from source code with 42-language tree-sitter AST parsing and FalkorDB.
- [agntk](https://github.com/Phoenixrr2113/agntk) - Zero-config AI agent CLI with persistent named agents, 20+ built-in tools, and hardware-aware local model selection.
- [backlog](https://github.com/backloghq/backlog) - Persistent, cross-session task management. 24 MCP tools for tasks, projects, tags, dependencies, and docs. 7 skills for planning, standups, and handoffs. Event-sourced storage, agent coordination, pure TypeScript. ([Website](https://backloghq.io))

### Business & Finance

- [mcp-amortization](https://github.com/theluckystrike/mcp-amortization) - Loan and lease schedules from the terms of the agreement, to the minor unit.
- [mcp-asset-register](https://github.com/theluckystrike/mcp-asset-register) - A fixed asset register that depreciates on the rates the tax authorities actually publish, with the schedule, the journal and the gain on sale.
- [mcp-bank-statement](https://github.com/theluckystrike/mcp-bank-statement) - Bank CSV exports categorised, summarised and reconciled with expenses.
- [mcp-barcode](https://github.com/theluckystrike/mcp-barcode) - QR codes and barcodes drawn on your machine, with no upload and no network call.
- [mcp-billing-docs](https://github.com/theluckystrike/mcp-billing-docs) - Credit notes and purchase orders, on the same engine as your invoices.
- [mcp-calendar](https://github.com/theluckystrike/mcp-calendar) - Read .ics calendars: events, free and busy, conflicts, exports.
- [mcp-cash-book](https://github.com/theluckystrike/mcp-cash-book) - One double-entry ledger derived from the books you already keep, proved to the minor unit.
- [mcp-catalogue](https://github.com/theluckystrike/mcp-catalogue) - One price list and one rate card, kept where the invoice and the quote can both read them.
- [mcp-change-order](https://github.com/theluckystrike/mcp-change-order) - Change orders against a quote or a work order, with the running contract value derived from what the client approved.
- [mcp-checklist](https://github.com/theluckystrike/mcp-checklist) - Checklists you build once and run many times, and the dated record of each run that somebody signs.
- [mcp-clauses](https://github.com/theluckystrike/mcp-clauses) - Reusable contract clauses, searched and assembled into Word.
- [mcp-currency](https://github.com/theluckystrike/mcp-currency) - ECB reference rates: convert, history, and fx_rates for rebilling.
- [mcp-delivery-schedule](https://github.com/theluckystrike/mcp-delivery-schedule) - Dated deliverables against a quote or a work order, and what is late as at any date you name.
- [mcp-deposits](https://github.com/theluckystrike/mcp-deposits) - Security and retainer deposits, held per client, on the same engine as your invoices.
- [mcp-docx](https://github.com/theluckystrike/mcp-docx) - Real Word documents from chat: proposals, contracts, quotes.
- [mcp-expense-tracker](https://github.com/theluckystrike/mcp-expense-tracker) - Receipts, mileage and expenses that turn into invoice lines.
- [mcp-image](https://github.com/theluckystrike/mcp-image) - Resize, convert, compress and watermark images, pure JavaScript.
- [mcp-invoice](https://github.com/theluckystrike/mcp-invoice) - Numbered invoices with tax lines, rendered to a professional PDF.
- [mcp-kanban](https://github.com/theluckystrike/mcp-kanban) - A task board per project that hands off to the time tracker.
- [mcp-office-suite](https://github.com/theluckystrike/mcp-office-suite) - One install that exposes every tool of the whole set, 292 of them, for small business accounting and paperwork.
- [mcp-packing-list](https://github.com/theluckystrike/mcp-packing-list) - Packing slips that carry no prices: what is in each carton, what it weighs, and what is still to pack.
- [mcp-pdf](https://github.com/theluckystrike/mcp-pdf) - Merge, split, stamp and read PDFs, pure JavaScript.
- [mcp-per-diem](https://github.com/theluckystrike/mcp-per-diem) - Statutory travel allowances on the rate tables the tax authorities publish, and the trips you priced with them.
- [mcp-petty-cash](https://github.com/theluckystrike/mcp-petty-cash) - A petty cash float on the imprest system, reconciled to the minor unit.
- [mcp-price-tracker](https://github.com/theluckystrike/mcp-price-tracker) - Check and watch product prices on ordinary shop pages.
- [mcp-quotes](https://github.com/theluckystrike/mcp-quotes) - Priced, VAT-correct quotes from chat, and the yes turns into an invoice.
- [mcp-recurring](https://github.com/theluckystrike/mcp-recurring) - Scheduled invoices, generated into your invoice book with PDFs.
- [mcp-resume](https://github.com/theluckystrike/mcp-resume) - Resumes and cover letters as Word files from one profile, never invented.
- [mcp-spreadsheet](https://github.com/theluckystrike/mcp-spreadsheet) - Read, query, edit and convert xlsx and csv files safely.
- [mcp-statement-of-account](https://github.com/theluckystrike/mcp-statement-of-account) - The one document that answers what a client actually owes you, aged as at any date, with the chaser drafted.
- [mcp-time-tracker](https://github.com/theluckystrike/mcp-time-tracker) - Track billable time without leaving the chat.
- [mcp-timezone](https://github.com/theluckystrike/mcp-timezone) - Find meeting slots inside everyone's working hours.
- [mcp-work-order](https://github.com/theluckystrike/mcp-work-order) - Job orders for trades and field work, priced the way the invoice will be.
- [mcp-zip](https://github.com/theluckystrike/mcp-zip) - Make a zip, look inside one, and unpack one, entirely on your machine.

### Companion & Personality

- [claude-familiar](https://github.com/yaniv-golan/claude-familiar) - Enhance Claude Code's `/buddy` companion with personality, mood, lore, and interactive commands (fortune, roast, haiku, focus timer). Mood shifts automatically on tool success/failure. Extensible — other plugins can layer traits and lore via `"x-familiarExtensions"` in their `plugin.json`.

### Image and Video Generation

- [nano-banana](https://github.com/Ibrahim-3d/nano-banana-claude-plugin) - Google Gemini image generation plugin. Text-to-image, text-guided image editing, style transfer, 4K output, search grounding, and multi-reference composition — all from a single `/genimage` command. Powered by `gemini-2.5-flash-image` and `gemini-3-pro-image-preview`.
- [taisly-agent-kit](https://github.com/taisly/agent) - Claude Code plugin, skill, SDK, CLI, and MCP server for publishing short-form videos to TikTok, Instagram Reels, YouTube Shorts, X, and Facebook through Taisly.

## Getting Started

### Using Plugins

Clone the repo and run Claude with any plugin:

```bash
git clone https://github.com/composiohq/awesome-claude-plugins.git
cd awesome-claude-plugins
claude --plugin-dir ./commit
```

Load multiple plugins at once:

```bash
claude --plugin-dir ./commit --plugin-dir ./code-review --plugin-dir ./connect-apps
```

### Plugin Structure

Each plugin follows the standard Claude Code plugin format:

```
plugin-name/
├── .claude-plugin/
│   └── plugin.json       # Plugin metadata
├── skills/               # Skill definitions (optional)
│   └── skill-name/
│       └── SKILL.md
├── commands/             # Slash commands (optional)
│   └── command.md
├── agents/               # Agent definitions (optional)
│   └── agent.md
└── hooks/                # Event hooks (optional)
    └── hooks.json
```

## Contributing

Want to add your plugin?

1. Fork this repository
2. Add your plugin folder with the standard structure
3. Update this README with your plugin details
4. Submit a pull request

Please ensure your plugin:
- Addresses a real use case
- Doesn't duplicate existing functionality
- Follows the template structure
- Has been tested

## Resources

- [Claude Code Documentation](https://code.claude.com/docs)
- [Plugin Development Guide](https://code.claude.com/docs/en/plugins)
- [Discover Plugins](https://code.claude.com/docs/en/discover-plugins)
- [ComposioHQ/awesome-claude-skills](https://github.com/ComposioHQ/awesome-claude-skills) - More skills and resources

## License

MIT - See individual plugins for their specific licenses.
