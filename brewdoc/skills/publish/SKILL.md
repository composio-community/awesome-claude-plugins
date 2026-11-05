---
name: publish
description: "Publishes text, Markdown, JSON, a file, a folder or a ZIP site to brewpage.app and returns a shareable URL. Use when asked to publish or share content as a link. Triggers: publish, share link, host page, brewpage, опубликуй."
user-invocable: true
disable-model-invocation: false
argument-hint: "[prompt] <text|file_path|directory_path|zip_path> [--ttl N] [--entry filename] [--delivery-mode path|subdomain]"
allowed-tools: [Read, 'Bash(bash ${CLAUDE_SKILL_DIR}/scripts/brewpage-run.sh *)', AskUserQuestion, Glob]
model: haiku
license: MIT
---

# brewdoc:publish

Publishes HTML/Markdown, JSON, files and multi-file sites to **brewpage.app** (free, no sign-up) and returns the URL.

## Prompt contract

`$ARGUMENTS` is one free-form RU/EN prompt; the content (text, file/dir/zip path) and the flags `--ttl N`,
`--entry <filename>`, `--delivery-mode path|subdomain` may sit anywhere in it.

1. Mode: the content type of what is published — detected in Step 2, scored by the keyword table there.
2. Scope: a sentence naming a file/dir resolves to that file/dir (e.g. "publish my report.md" ->
   `content_arg = report.md`, resolved against cwd). Never guess, never silently fall back to an empty
   HTML page. Fired by Claude mid-task (`Skill` tool), its `args` is the prompt: the path, or the
   exact text to publish, never a summary of it.
3. Ask: a sentence with no path and no inline text/JSON has nothing to publish -> ONE `AskUserQuestion`
   asking what to publish. Namespace and password -> the two dedicated `AskUserQuestion` calls in Steps
   4-5; nothing else asks. Headless or unanswered -> stop before upload unless this workflow already has explicit namespace and password choices.

Print once, before the first tool action, including filesystem probes and questions (labels literal,
values in the conversation language). Use `unresolved` for type/namespace/password until determined;
report resolved stats in Step 3.

```
PLAN — brewdoc:publish
INPUT:  <arguments verbatim, or "(empty)">
MODE:   <detected type — SITE|MARKDOWN|FILE|JSON|HTML> — <matched extension/shape | prose-resolved path>
SCOPE:  namespace=<ns>; ttl=<days>; password=<set|none>; delivery-mode=<server-default|path|subdomain>
DO:     <2-5 imperative bullets>
RESULT: <published URL>
```

## Running commands

Every shell step is ONE command of the exact shape in the fences below: the single `allowed-tools`
rule pre-approves exactly that shape, so the skill never prompts, headless included.

- Fill each `'{…}'` slot with the raw value and write every `'` inside it as `'\''`; nothing else is
  escaped. Never wrap a value in double quotes. An empty slot stays `''` (= omitted).
- Never quote the script path, prefix or chain the command (`cd`, `VAR=…`, `;`, `&&`, `|`, `$(…)`): any
  other shape falls back to the normal permission prompt.
- Keep every command under 8,000 characters (longer ones are always refused); longer text goes
  through `stage` (Step 6).
- The script prints one decisive line: `OK {url}` or `OK {url} | Files: N` (then any `NOTICE: …` lines:
  what the server skipped or adjusted), `CONFIRM: …` (exit 2, nothing uploaded) or `FAILED: …` (server reason `HTTP <status>: <message>`).
  It removes its private run directory on every exit.

## Workflow

### Step 1: Parse Arguments

Extract from the prompt:
- `--ttl N` → TTL in days (default: `15`)
- `--entry <filename>` → entry file for SITE uploads (default: auto-detect)
- `--delivery-mode path|subdomain` → optional creation header; omitted = server default; reject other values before upload
- Remaining text → `content_arg`, per Prompt contract rules 2-3

### Step 2: Detect Content Type

A `content_arg` that names a path -> probe it (read-only; prints `TYPE:`, the absolute `PATH:` to use
below, and the Step 3 stats) — **EXECUTE** using Bash tool:

```bash
bash ${CLAUDE_SKILL_DIR}/scripts/brewpage-run.sh probe '{path}'
```

| Input | Type | `publish` type + source | API | EN keywords | RU keywords | Mutates? |
|-------|------|-------------------------|-----|--------------|--------------|----------|
| `TYPE: site-dir` | SITE | `site-dir` + `--path` | `POST /api/sites` (ZIP built from the dir) | publish site, publish folder/directory | опубликуй сайт, опубликуй папку | yes |
| `TYPE: site-zip` (`.zip` file) | SITE | `site-zip` + `--path` | `POST /api/sites` (archive upload) | publish zip, publish archive | опубликуй архив, опубликуй zip | yes |
| `TYPE: markdown` (`.md`/`.markdown` file) | MARKDOWN | `html` + `--path` | `POST /api/html` (format=markdown, content read from the file — renders styled, NOT a raw download) | publish markdown, share this .md | опубликуй markdown, поделись .md | yes |
| `TYPE: file` (any other file) | FILE | `file` + `--path` | `POST /api/files` (multipart) | publish file, share this file | опубликуй файл, поделись файлом | yes |
| No path (`TYPE: none`), `content_arg` starts with `{` or `[` | JSON | `json` + `--text` | `POST /api/json` | publish json, share this json | опубликуй json | yes |
| Anything else | HTML | `html` + `--text` | `POST /api/html` (format=markdown) | publish text, share link, publish this | опубликуй текст, поделись ссылкой | yes |

### Step 3: Show Pre-Publish Stats

From the probe lines — SITE (dir): `HTML`, `SIZE_KB`, `ENTRY`. SITE (ZIP): `BYTES`, entry override. FILE and
MARKDOWN: `BYTES` + `MIME`. Text/JSON: char count.

For HTML/MARKDOWN/JSON/FILE:
```
Content:  <type description> · <size> · <api endpoint>
TTL:      <N> days
```

For SITE (entry = server rule: `--entry` > root `index.html` > shallowest `.html`; another page → pass `--entry`; `ENTRY: none` → fail with an explicit error, never guess):
```
Content:  site · <N> files · <total_size> · POST /api/sites
Entry:    <entry_file>
TTL:      <N> days
```
These are source-tree estimates: report the ARCHIVE MANIFEST that Step 6 prints before upload; its
`ENTRY:` line is the entry `scripts/publish.mjs` resolved in the built archive.

**Site limits** (`GET https://brewpage.app/api/limits` returns the current ones): 25 MB per request; a site
holds 200 files, 5 MB per file, 20 MB total uncompressed, a ZIP expands to at most 40 MB; a path is at most
380 characters / 900 bytes, each file or folder name at most 200 bytes. A big site (`FILES` or `SIZE_KB`
near a limit) → check the current values first, and send many files as one ZIP (a folder is always zipped).
**EXECUTE** using Bash tool:
```bash
bash ${CLAUDE_SKILL_DIR}/scripts/brewpage-run.sh limits
```
Pre-checks, folder or ZIP: system files (`.DS_Store`, `__MACOSX/`, `Thumbs.db`) never count and are
dropped; hidden files and folders are dropped too, except the root `.well-known/`; at least one `.html`
file must remain.

### Step 4: Ask Namespace

Use **AskUserQuestion**:

```
Namespace decides who can find the publication; it also appears in its address on brewpage.app.

Options:
1) public — public pages, sites and files are listed in the public gallery and the sitemap, so Google, Bing and AI search can find and index them and people can discover them. Use it for anything meant to be found or shared: docs, guides, demos, portfolios, reports, landing pages. Public pages are served right on the brewpage.app domain, which gives them the strongest reach in search; a page whose code needs its own origin (cookies, storage) gets its own subdomain automatically. Anyone can find and read a public publication: never put secrets, tokens or personal data there.
2) {suggested slug} — private: unlisted and not indexed; anyone who has the link can still open it (a password restricts access).
3) Enter custom namespace (private, like 2)
4) Skip → use suggested slug (private)

Reply with a number or your custom namespace (1-32 lowercase letters, digits or hyphens).
```

Suggested slug: 3-16 chars of `a-z0-9-` named after the content (`api-docs`, `report-q2`,
`pricing`, `user-config`), else the project or directory name; never random strings or truncated filenames.

Resolution: explicit `2` or `4` → suggested slug | `1` → `public` | custom slug → validate it.
An empty, unavailable, ambiguous or unanswered choice → stop before upload. Never infer publication consent from silence.

### Step 5: Ask Password

Use **AskUserQuestion**:

```
Password protection (if set, page is hidden from gallery):

Options:
1) No password (explicit choice)
2) Use an existing local password file (min 4 characters)
3) Skip → no password

Reply with a number and, for option 2, the absolute local file path. Do not paste password contents.
```

Resolution: explicit `1` or `3` → `{password_file}` = `''` (no password; every password file,
stale ones included, is ignored). `2` + an existing local file path → `{password_file}` = that absolute
path: the script moves the bytes via private header files (never shell literals or curl argv) and rejects
control characters (header injection). Never Read, generate or print the password contents.
An empty, unavailable, ambiguous or unanswered choice → stop before upload. A previous explicit choice for this content/workflow may be reused; never invent one.

### Step 6: Publish and Save Token (secure)

Delivery mode: NEW sites and non-public HTML pages (format `html`) get a Dedicated subdomain (an explicit `path` is not refused: the publication lands on
its subdomain and the response reports the mismatch); everything else defaults to Promotion (`path`) and may
select `subdomain`, password-protected included. Send it only as `X-Delivery-Mode`, never in authored JSON, text or multipart fields. A deduplicated
OLD or NEW winner may differ: keep its identity, cohort, mode and exact `link`. Missing/null OLD routing
metadata means Existing link; never infer mode from its address.

> **SECURITY:** the ownerToken NEVER appears in conversation output: the script does curl, token parsing and history save in one run and prints only the URL; failures print only the server's status and message.

Every slot is re-validated by the script before anything is written or uploaded:

| Slot | Must match | Re-checked by |
|------|------------|---------------|
| `{ns}` | `^[a-z0-9-]{1,32}$` | `bp_validate` |
| `{days}` | positive integer; `''` = 15 | `bp_validate` |
| `{entry}` | plain relative file name, no `..`; `''` = auto-detect; sites only | `bp_validate` |
| `{delivery_mode}` | `''`, `path` or `subdomain` | `bp_begin` |
| `{password_file}` | `''` or an absolute path to an existing regular file | `bp_begin` |

A value failing its pattern: re-ask; never clean it up or substitute it anyway. A slot error fails before
any run is touched, so staged text survives the retry. `{type}` comes from the Step 2 table.

**SITE, MARKDOWN, FILE** — `{path}` is the probe's `PATH:` — **EXECUTE** using Bash tool:
```bash
bash ${CLAUDE_SKILL_DIR}/scripts/brewpage-run.sh publish {type} --ns '{ns}' --ttl '{days}' --entry '{entry}' --delivery-mode '{delivery_mode}' --password-file '{password_file}' --path '{path}'
```

**HTML text, JSON** — `{content}` is the exact text or JSON, verbatim — **EXECUTE** using Bash tool:
```bash
bash ${CLAUDE_SKILL_DIR}/scripts/brewpage-run.sh publish {type} --ns '{ns}' --ttl '{days}' --entry '' --delivery-mode '{delivery_mode}' --password-file '{password_file}' --text '{content}'
```

**Longer text or JSON** (the command would pass 8,000 characters): split it at line ends into chunks
of at most 6,000 characters. The first `stage` call passes `--run ''` and prints `RUN: brewpage.XXXXXX`;
every later chunk and the final publish pass that id. The script rejoins chunks with one newline.
**EXECUTE** using Bash tool, once per chunk:
```bash
bash ${CLAUDE_SKILL_DIR}/scripts/brewpage-run.sh stage --run '{run_id}' --text '{chunk}'
```
Then **EXECUTE** using Bash tool:
```bash
bash ${CLAUDE_SKILL_DIR}/scripts/brewpage-run.sh publish {type} --ns '{ns}' --ttl '{days}' --entry '' --delivery-mode '{delivery_mode}' --password-file '{password_file}' --run '{run_id}'
```
Staged but not published (cancelled) — **EXECUTE** using Bash tool:
```bash
bash ${CLAUDE_SKILL_DIR}/scripts/brewpage-run.sh cleanup --run '{run_id}'
```

### Step 7: Output Result

**Success** (the script printed `OK {url}`):
```
Published: {url from bash output}
Owner token saved to <project-root>/.claude/brewpage-history.md (mode 600, git-ignored)
Optional: sign in free (Google or any email) at https://account.brewpage.app to manage publications and token history, and extend publication retention up to 90 days. Publications still expire. Not needed to publish.
```

**Success for SITE** (the script printed `OK {url} | Files: {count}`):
```
Published site: {url from bash output}
Entry: {entry_file} | Files: {count}
Owner token saved to <project-root>/.claude/brewpage-history.md (mode 600, git-ignored)
Optional: sign in free (Google or any email) at https://account.brewpage.app to manage publications and token history, and extend publication retention up to 90 days. Publications still expire. Not needed to publish.

Share the server URL exactly as printed, including any trailing slash.
```

Mention the sign-in line only as optional; never ask the user to sign in.
If a NOTICE says no owner capability was saved, omit the token-saved line and report only the reader URL plus that notice; existing history stays unchanged.

For a private (non-`public`) namespace, append one short line after the link (skip if the reply must stay brief): *Unlisted link — anyone who has it can open it, but it's not in the gallery or search. Want it discoverable? Publish to `public`.*

**Needs confirmation** (the script printed `CONFIRM: ...`, exit 2; nothing uploaded): show the manifest
lines, name the flagged entries, ask ONE `AskUserQuestion` (publish anyway / cancel). Publish anyway ->
re-run the identical command with ` --confirmed --review-sha256 '{review_sha256}'` appended, using the exact
`REVIEW_SHA256` printed beside the approved manifest. Changed archive bytes produce a fresh manifest and
digest: ask again; never silently approve the replacement. No payload is retained between calls.
Cancel or no answer -> stop: the script already
removed its own run directory and never touches other runs, user source files or the shared tmp directory.

**Error** (the script printed `FAILED: ...`):
```
Publish failed: {the FAILED line, verbatim}
```

| Status | Meaning | Do |
|--------|---------|----|
| 400 | Fixable limit or path problem (file count/size, path length, bad value) | Fix what the message names, retry |
| 413 | Request over 25 MB, or too many parts | Shrink the bundle; many files → one ZIP |
| 422 | No servable file left (every file has an unsupported or missing extension) | Add the `.html`/assets |
| 408 | Upload interrupted | Retry the identical command once |

Unstorable metadata (tags, names, control characters) is stored as the closest valid value with a notice;
a value that still cannot be stored is a 400, not a 409.

## Notes

- Requires a POSIX runtime (macOS/Linux or WSL), `bash`, `curl`, `jq`, POSIX `python3` with `fcntl` (secure atomic history), and `git` inside repositories; sites also `node`, `zip`, `unzip`. Native Windows Python is unsupported and fails before upload.
- History writes reject symlinks, hardlinks, tracked history and directories writable by others; failure stops publication. Archive inspection caps 25 MiB compressed, 40 MiB expanded, 200 files, 400 entries, 5 MiB/member and 1 MiB metadata; ZIP64/split archives are refused.

- **`format`**: `/api/html` takes `?format=` or a JSON body `format`; a non-blank body value wins over the query, neither -> default `html` (markdown stored as raw text). The scripts send `?format=markdown` with a `{content}`-only body.
- History: `<project-root>/.claude/brewpage-history.md` (root: `CLAUDE_PROJECT_DIR` → git toplevel → upward `.git`/`.claude` walk (a `.claude` in HOME or in the profile parent, the dir whose `.claude` IS the active config dir, is skipped; a `.git` there still counts) → `PWD`, via `scripts/brewpage-lib.sh`), mode `600`, added to the project `.gitignore`. Its header holds the **delete** command for the owner token.
- Run dirs: private `brewpage.XXXXXX` under `$TMPDIR` (else `/tmp`), outside the protected `.claude/`; only `scripts/brewpage-run.sh` creates, fills and removes them, so the skill needs no `Write`/`Edit` grant.
- Permissions: model-invocable, so `allowed-tools` holds one scoped Bash rule that matches every step above, in `default`, `dontAsk` and headless runs alike (verified on CC 2.1.296). A script path containing spaces breaks the unquoted command shape.
- History TTL = requested days; stored `createdAt`/`expiresAt` are authoritative: a deduplicated winner keeps its original expiry, and ordinary PUT/update does not renew it.
- Owner API calls use the returned `ownerLink` and stored identity metadata, never a NEW root hostname parsed for namespace/ID; OLD rows without metadata keep their existing API identifiers.
- **Update a site**: `PUT` the new bundle to its apex owner API with `X-Owner-Token`; it replaces the file set and keeps the host. No `X-Delivery-Mode` on ordinary PUT/update. Old publications (made before 5 October 2026) are read-only: 409 OLD_PUBLICATION_READ_ONLY; publish anew; report only the new URL; the owner token stays in private history, never chat.
- Owner-only `GET`/`PATCH /api/{type}/{ns}/{id}/hosting` supports `html|files|json|kv|sites` with `X-Owner-Token`. Read current `hostingVersion`, then PATCH `deliveryMode: path|subdomain` with that `expectedVersion`. NEW publications without a required subdomain may switch, including non-public non-HTML content; OLD returns 200 unchanged with a notice. Sites and non-public HTML (format `html`) retain their forced subdomain policy; mismatches return a notice. A missing version applies against the stored version; a stale version also applies, with a notice, rather than 409. Use the returned link/version afterward.
- NEW password-protected links stay clean: never generate or append `?p=`. API password requests use `X-Password`; OLD password behavior is unchanged.
- **SITE bundles are allowlisted**: `pack` drops dot-entries (`.env`, `.git/`, `.DS_Store`; the root `.well-known/` stays, extension-less files included), `node_modules/`, `__MACOSX/`, symlinks and unknown types, and verifies the archive (bounded central-directory budgets, `unzip -t` with a 10-second timeout, name set) before `curl`, else deletes it and exits 1. `inspect` never rewrites a supplied ZIP; it exits 2 when anything unexpected, hidden or sensitive is inside (system files the server drops are left alone).
- Keep `.link` exact (NEW subdomain roots keep `/`, OLD links their form); never reconstruct a host from IDs. Verify NEW native sites at the exact URL and asset paths in a browser; OLD sites may redirect via a landing page: check in a browser or fetch the explicit entry asset.
