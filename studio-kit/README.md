# studio-kit

Guardrails and QA for building websites with Claude Code.

- **deploy-gate** (PreToolUse hook): asks a person before the deploy and publish commands it recognizes (about 20 tools) and before pushes to production branches; denies when permissions are bypassed. Unknown tools pass through.
- **secret-guard** (PreToolUse hook): blocks key formats from common providers in source files, in browser-exposed env vars (`VITE_`, `NEXT_PUBLIC_`, `PUBLIC_`, `REACT_APP_` ...) and `git add` of a `.env` that is not ignored. Findings are masked.
- **launch-qa** (skill): renders the page at 390, 768 and 1440 px with Playwright and fails on console errors, failed requests, sideways scroll, missing alt text and broken links.
- **five-attacks** (skill): a ten-minute pre-launch security test with `scan_bundle.py` and `probe_endpoint.py`.
- **concrete-copy** (skill): copy rules for site pages and `copy_lint.py`.

Setup: Python 3.9 or later; Playwright + Chromium for launch-qa. Settings (`STUDIO_KIT_DEPLOY_GATE`, `STUDIO_KIT_SECRET_GUARD`,
allowlists in `.claude/`) and real example output are in the repository README:
https://github.com/megwebstudio/studio-kit
