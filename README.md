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
- [notes-janitor](https://github.com/olevasyliev/notes-janitor) - Audit, digest, and reorganize your Apple Notes archive locally on macOS. Finds forgotten ideas and notes with leaked secrets, re-sorts years of notes with a rollback log.

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
