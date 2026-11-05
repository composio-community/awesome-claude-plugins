# Publish (BrewPage)

Publishes text, markdown, JSON, a file, a folder or a ZIP site to [brewpage.app](https://brewpage.app) and returns a shareable URL. No sign-up; content expires after its TTL (default 15 days). Private means unlisted, not locked: anyone with the link can open it unless a password is set. Owner tokens go to a local history file, never into the chat.

BrewPage needs no account; anonymous publications last up to 30 days, or up to 90 days with a profile. Updates keep the original expiry. To compare it with GitHub Pages, Netlify Drop, Tiiny Host and others, see [brewpage.app/compare](https://brewpage.app/compare).

Optional: sign in free (Google or any email) at [account.brewpage.app](https://account.brewpage.app) to manage publications and owner-token history. Publications still expire; sign-in is not needed to publish.

## Install

Install the [Brewdoc plugin](../../README.md#install), then `/reload-plugins`. Requires a POSIX runtime (macOS/Linux or WSL), `bash`, `curl`, `jq`, Python 3 (`python3`) with `fcntl`, and `git` inside Git checkouts. Site uploads also need Node.js (`node`) and `unzip`; directories need `zip`. Native Windows Python is unsupported.

The skill is model-invocable: ask Claude to "publish this" or "share a link". One scoped `allowed-tools` rule (`scripts/brewpage-run.sh`) covers every step, so there are no Bash or Write prompts. Headless and `dontAsk` runs need `Skill(brewdoc:publish *)` allowed.

## Usage

| Input | Example | Endpoint |
|-------|---------|----------|
| Text / Markdown | `/brewdoc:publish "# Hello"` | `/api/html` |
| JSON (starts with `{` or `[`) | `/brewdoc:publish '{"key": "value"}'` | `/api/json` |
| File | `/brewdoc:publish report.pdf --ttl 1` | `/api/files` |
| Directory site | `/brewdoc:publish docs/v1/ --entry hub.html` | `/api/sites` |
| ZIP site | `/brewdoc:publish site.zip` | `/api/sites` |

Flags: `--ttl N` (days), `--entry <filename>` (sites), `--delivery-mode path|subdomain` (omit for the server default). The skill requires explicit namespace and password choices before upload. Choose `public` or a private slug, then no password or an existing local password-file path; never paste the password contents. Explicit “Skip” selects the suggested private slug or no password for its respective question. An empty, unavailable, ambiguous or unanswered choice stops before upload. Headless runs need both choices already explicit for the current content/workflow.

In `public`, pages, sites and files are listed in the public gallery and the sitemap, so Google, Bing and AI search can find and index them and people can discover them. Use it for anything meant to be found or shared. Anyone can find and read a public publication, so never put secrets, tokens or personal data there. A private slug is unlisted and not indexed; anyone with the link can still open it unless a password is set.

It returns `Published: <exact server URL>`; share that link exactly. Owner tokens stay in `.claude/brewpage-history.md` (mode `600`, git-ignored), never in chat; unsafe history writes stop publication. To delete a page locally, use `curl -X DELETE "{ownerLink}" -H "X-Owner-Token: {ownerToken}"` with both values from that history.

Site entry is the root `index.html`, else the shallowest page (`--entry` overrides); the root `.well-known/` ships; the skill knows the upload limits ([details](https://doc-claude.brewcode.app/brewdoc/skills/publish/)).

Local ZIP inspection is bounded and rejects unsupported archives before upload; see [local safety requirements](SKILL.md#notes).

Do not publish `.env` files or secrets: pages are reachable by anyone with the link.

## Documentation

- [Publish docs](https://doc-claude.brewcode.app/brewdoc/skills/publish/): hosting modes, security, owner operations.
- [Skill source](SKILL.md) and [MD to PDF](../md-to-pdf/README.md) for PDFs before publishing.
- Tests: `bash brewdoc/skills/publish/tests/run.sh` (no network, no upload).
