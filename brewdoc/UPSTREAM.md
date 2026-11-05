# Upstream snapshot

This is the existing Brewdoc documentation toolkit, version 6.12.5, copied from [kochetkov-ma/claude-brewcode at 61dfaa8bdbcb59aa8a7b45570dd71885ccae52f8](https://github.com/kochetkov-ma/claude-brewcode/tree/61dfaa8bdbcb59aa8a7b45570dd71885ccae52f8/brewdoc). The 66 Claude plugin files retain original MIT licenses and author attribution; the separate upstream `.codex` adapter is excluded. The README's links to optional companion products now point to upstream; runtime source files are unchanged.

The five skills cover documentation sync, project memory-sync generation, installation guides, Markdown-to-PDF conversion and BrewPage publishing. This is a broader documentation toolkit, not a BrewPage-only plugin. Its runtime scripts and references are inside this folder; optional companion commands described in the upstream guide are separate plugins.

Publishing needs a POSIX environment with Bash, curl, jq, Python 3 with fcntl, and Git inside repositories; sites additionally need Node.js, zip and unzip. PDF conversion needs reportlab or weasyprint. No credentials or dependencies are installed by this snapshot. BrewPage publications expire; the hosted service is proprietary and separate from the MIT client.

Existing offline regression suites were run against the source snapshot. The standalone-distribution synchronization suites also require the upstream repository's `skills/brewpage-publish` and `openclaw/brewpage-publish` fixtures; these are test fixtures, not plugin runtime dependencies. Native plugin installation and model execution were not performed for this contribution. No live publication was made.
