# docsync hooks — install runbook

Self-contained hook assets. The `/brewdoc:docsync-setup` skill copies these into a
target project's `.claude/hooks/` and wires `.claude/settings.json`. All three
files are independent (no shared lib, no plugin-root deps) and read project
state from `<projectRoot>/.claude/docsync/` at runtime, where `projectRoot` is
`CLAUDE_PROJECT_DIR` -> upward walk for `.git`/`.claude` -> the hook's `cwd`. The
hook payload's `cwd` drifts mid-session and is used for one thing only: resolving a
relative `tool_input` path.

| File | Event | Matcher | Action |
|------|-------|---------|--------|
| `docsync-track.mjs` | PostToolUse | `Write\|Edit` | Logs an `edit` event for the .md; nudges to add `last_updated` when missing, once per file per session |
| `docsync-watch.mjs` | PostToolUse | `Read` | Logs one `read` event per .md read by the main session (subagent reads are skipped). Silent; informational only |
| `docsync-gate.mjs` | Stop | — | Looks only at docs EDITED since its last ask, re-applies `exclude` + `doc_type: skip`, and blocks once when a `last_updated` is missing, unusable or too far behind the file. Silent again until one of them is edited again |

> Scripts are pure ESM, Node built-ins only (`fs`, `path`), no plugin-root / npm
> deps. Each reads stdin, never throws, exits 0 (gate may emit a `block` decision).
> State is an append-only log: one JSON line per event, one `O_APPEND` write each.

**What the gate reports.** For each doc edited since the last ask (deleted files are
skipped), with `last_updated` read as a LOCAL `YYYY-MM-DD`:

| Condition | Reported as |
|-----------|-------------|
| no `last_updated` | `No last_updated` |
| not a real date (`soon`, `2026-13-45`) or later than today | `Unusable last_updated` |
| file's modification day minus `last_updated` > `threshold_days` | `Edited more than N days after their last_updated` |
| anything else | nothing — the gate stays silent |

The date is compared with the file's own modification day, not with the clock, so a
doc is never called stale merely because time passed. The gate never blocks when
`stop_hook_active` is `true`, and never blocks when it cannot record the ask (unwritable
state dir) — both would otherwise repeat the block on every Stop. Its message has Claude
sync on its own judgment and ask the user only before deleting or wholesale rewriting
content: through `AskUserQuestion` when that tool is available, else by listing those
docs in its final message.

> Line 2 of each file is a `// brewcode-meta: version=<plugin version>
> content_version=<content version> generated_by=brewdoc:docsync-setup` stamp, baked at release. The files are copied
> BYTE-FOR-BYTE, so an installed copy that differs from the plugin's is out of date —
> never edit an installed copy in place.

> **Requires `node` on `PATH`** for the shell that runs hooks. Under nvm/asdf a
> non-interactive shell may not have `node` — if hooks silently do nothing, ensure
> `node` resolves in the hook's environment (e.g. a system symlink or a login shell).

---

## Target install dir

`.claude/hooks/` under the project root:

- `<repo>/.claude/hooks/docsync-track.mjs`
- `<repo>/.claude/hooks/docsync-watch.mjs`
- `<repo>/.claude/hooks/docsync-gate.mjs`

## State / config dir

`<repo>/.claude/docsync/`:

- `config.json` — `{ "version": "{PLUGIN_VERSION}", "content_version": "{CONTENT_VERSION}", "generated_by": "brewdoc:docsync-setup", "last_updated": "{LAST_UPDATED}", "enabled": true, "threshold_days": 7, "exclude": ["node_modules/**", ...] }`.
  The hooks parse it with `JSON.parse` and read only `enabled`, `threshold_days` and
  `exclude`, so the four provenance keys (and any other key) are inert to them.
  `enabled: false` (written by `disable`) makes all three hooks return an empty result
  immediately — registered, wired, inert. An absent `enabled` key counts as `true`, so
  a config written before this key existed keeps working. `threshold_days` defaults to
  7. An absent `exclude` key means `[".claude/**"]`; install always seeds `.claude/**`
  into the list (agent reports, plans and agent definitions are not project docs) —
  delete that entry to track docs under `.claude/`. Every date docsync writes or
  compares (`last_updated` here and in doc frontmatter) is the LOCAL calendar day, the
  same day `date +%F` prints
- `state-<session_id>.jsonl` — one log PER SESSION, created and owned by the hooks;
  install seeds nothing. One JSON object per line: `{"ev":"edit","file":"docs/a.md"}`,
  `{"ev":"read",...}`, `{"ev":"nudge",...}` (track already nudged this file) and
  `{"ev":"ask","seen":N}` (the gate asked after reading N lines; only edits logged
  after line N are pending). `file` is root-relative. No session id falls back to
  `state.jsonl`. The Stop gate prunes logs, the `state*.json` files of earlier
  versions and stray `.tmp` files once they are older than 14 days

---

## settings.json hook entries

Exec form: `command` is the executable, `args` carries the path. Upstream prefers it
for any hook that references a path placeholder, and `${CLAUDE_PROJECT_DIR}` is
substituted per `args` element on every shell — a shell-form `$CLAUDE_PROJECT_DIR`
resolves to `$null` under PowerShell and launches node on `/.claude/hooks/...`.

```json
{
  "hooks": {
    "PostToolUse": [
      { "matcher": "Write|Edit", "hooks": [
        { "type": "command", "command": "node", "args": ["${CLAUDE_PROJECT_DIR}/.claude/hooks/docsync-track.mjs"], "if": "Write(**/*.md)", "timeout": 5 },
        { "type": "command", "command": "node", "args": ["${CLAUDE_PROJECT_DIR}/.claude/hooks/docsync-track.mjs"], "if": "Edit(**/*.md)", "timeout": 5 }
      ] },
      { "matcher": "Read", "hooks": [
        { "type": "command", "command": "node", "args": ["${CLAUDE_PROJECT_DIR}/.claude/hooks/docsync-watch.mjs"], "if": "Read(**/*.md)", "timeout": 5 }
      ] }
    ],
    "Stop": [
      { "hooks": [ { "type": "command", "command": "node", "args": ["${CLAUDE_PROJECT_DIR}/.claude/hooks/docsync-gate.mjs"], "timeout": 10 } ] }
    ]
  }
}
```

Why this shape (observed on Claude Code 2.1.296):

- **`if`** keeps node from starting on non-`.md` files. One rule matches ONE tool, so
  track is registered twice — `Edit(**/*.md)` alone would drop every `Write`. There is
  no combined syntax, and a malformed rule disables its handler without any warning:
  copy the three strings verbatim. `**/*.md` is not anchored (it also fires outside the
  project), so the scripts keep their own project / extension / exclude checks.
- **No `if` on the Stop entry** — `if` is evaluated for tool events only; on `Stop` the
  hook would never run.
- **`timeout`** is in seconds. Without it a `command` hook inherits 600 s. The hooks
  finish in about 30 ms (median of 20 runs each, max 36 ms); 5 s for the two PostToolUse
  hooks and 10 s for the gate leave room for a cold node start and still bound a hang.
  A timeout cancels the hook and the tool call or Stop goes ahead.
- **No `onFailure`** — it has no effect on `Stop`, and a tracker must never block a
  tool call because its own script failed.

---

## Install / upgrade

One transaction, node only. Export the parameters, then run the block:

| Parameter | Value |
|-----------|-------|
| `RUNBOOK` | absolute path of this `INSTALL.md` (the hook sources sit next to it) |
| `MODE` | `install` or `upgrade` |
| `THRESHOLD` | integer >= 1, default 7 (`install` only) |
| `EXCLUDE` | JSON array of globs, default `["node_modules/**","**/CHANGELOG.md","dist/**","build/**","vendor/**"]` (`install` only) |

```bash
ROOT="${CLAUDE_PROJECT_DIR}"
[ -n "$ROOT" ] && [ -d "$ROOT" ] || ROOT=$(git rev-parse --show-toplevel 2>/dev/null || true)
is_profile_parent() { _pp=$(cd "${1}" 2>/dev/null && pwd -P) || return 1; { [ -n "${HOME:-}" ] && [ "$_pp" = "$(cd "$HOME" 2>/dev/null && pwd -P)" ]; } || { [ -n "${CLAUDE_CONFIG_DIR:-}" ] && [ "$_pp/.claude" = "$(cd "$CLAUDE_CONFIG_DIR" 2>/dev/null && pwd -P)" ]; }; }
[ -n "$ROOT" ] || { d=$PWD; until [ -d "$d/.git" ] || { [ -d "$d/.claude" ] && ! is_profile_parent "$d"; } || [ "$d" = / ]; do d=$(dirname "$d"); done; [ "$d" = / ] && ROOT=$PWD || ROOT=$d; }
[ -f "$RUNBOOK" ] || { echo "❌ RUNBOOK must be the absolute path of INSTALL.md" >&2; exit 1; }
export MODE="${MODE:-install}" THRESHOLD="${THRESHOLD:-7}"
export EXCLUDE="${EXCLUDE:-[\"node_modules/**\",\"**/CHANGELOG.md\",\"dist/**\",\"build/**\",\"vendor/**\"]}"
node - "$ROOT" "$(dirname "$RUNBOOK")" <<'NODE'
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const [root, assets] = process.argv.slice(2);
const mode = process.env.MODE;
const names = ['docsync-track', 'docsync-watch', 'docsync-gate'];
const settings = path.join(root, '.claude/settings.json');
const config = path.join(root, '.claude/docsync/config.json');
// [event, matcher, hook, if rule, timeout s]. One `if` rule = one tool; Stop takes none.
const WANT = [
  ['PostToolUse', 'Write|Edit', names[0], 'Write(**/*.md)', 5],
  ['PostToolUse', 'Write|Edit', names[0], 'Edit(**/*.md)', 5],
  ['PostToolUse', 'Read', names[1], 'Read(**/*.md)', 5],
  ['Stop', '', names[2], null, 10],
];
const isDocsync = h => names.some(n => [h.command ?? '', ...(h.args ?? [])].join(' ').includes(`${n}.mjs`));
// First word of `command` != node: the project's own launcher around the hook, kept and never duplicated.
const launcher = h => { const m = /^\s*(?:"([^"]*)"|'([^']*)'|(\S+))/.exec(typeof h.command === 'string' ? h.command : ''); return m ? String(m[1] ?? m[2] ?? m[3]).split(/[\\/]/).pop() : ''; };
const isWrapped = h => isDocsync(h) && typeof h.command === 'string' && !/^node(\.exe)?$/i.test(launcher(h));
const wraps = (h, name) => isWrapped(h) && [h.command, ...(h.args ?? [])].join(' ').includes(`${name}.mjs`);
const seeded = list => list.includes('.claude/**') ? list : [...list, '.claude/**'];
const planned = [];
const createdDirs = [];
const committed = [];
const temps = [];
function snapshot(file) {
  try {
    const stat = fs.lstatSync(file);
    if (!stat.isFile()) throw new Error(`not a regular file: ${file}`);
    return { bytes: fs.readFileSync(file), mode: stat.mode & 0o7777, atime: stat.atime, mtime: stat.mtime };
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}
function matches(file, expected) {
  const actual = snapshot(file);
  return expected === null ? actual === null : actual !== null && actual.bytes.equals(expected.bytes) && actual.mode === expected.mode;
}
function plan(file, bytes, before = snapshot(file)) {
  planned.push({ file, before, after: { bytes: Buffer.from(bytes), mode: before?.mode ?? 0o600 } });
}
function mkdir(dir) {
  if (fs.existsSync(dir)) return;
  mkdir(path.dirname(dir));
  fs.mkdirSync(dir);
  createdDirs.push(dir);
}
function atomic(file, state, expected) {
  const temp = `${file}.${process.pid}.${temps.length}.tmp`;
  const fd = fs.openSync(temp, 'wx', state.mode);
  temps.push(temp);
  try { fs.writeFileSync(fd, state.bytes); } finally { fs.closeSync(fd); }
  fs.chmodSync(temp, state.mode);
  if (!matches(file, expected)) throw new Error(`changed during setup: ${file}`);
  fs.renameSync(temp, file);
}
// `<settings>.lock` dir shared with other setup skills' merges; held 10 s -> abort, older than 30 s -> stale.
function lock(file) {
  const dir = `${file}.lock`, wait = new Int32Array(new SharedArrayBuffer(4));
  for (let i = 0; i < 100; i++) {
    try { fs.mkdirSync(dir); return () => { try { fs.rmdirSync(dir); } catch {} }; } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      try { if (Date.now() - fs.statSync(dir).mtimeMs > 30000) fs.rmdirSync(dir); } catch {}
      Atomics.wait(wait, 0, 0, 100);
    }
  }
  throw new Error(`${dir} is held by another installer`);
}
let release = () => {};
try {
  if (!['install', 'upgrade'].includes(mode)) throw new Error('MODE must be install or upgrade');
  const version = JSON.parse(fs.readFileSync(path.join(assets, '../../../.claude-plugin/plugin.json'), 'utf8')).version;
  const header = fs.readFileSync(path.join(assets, '../SKILL.md'), 'utf8');
  const contentVersion = /brewcode-meta:[^\n]*content_version=([0-9]+\.[0-9]+\.[0-9]+)/.exec(header)?.[1];
  if (!version || !contentVersion) throw new Error('missing plugin/content version');
  const threshold = Number(process.env.THRESHOLD);
  const exclude = JSON.parse(process.env.EXCLUDE);
  if (!Number.isInteger(threshold) || threshold < 1 || !Array.isArray(exclude) || exclude.some(x => typeof x !== 'string')) throw new Error('invalid THRESHOLD or EXCLUDE');
  const beforeConfig = snapshot(config);
  const previous = beforeConfig ? JSON.parse(beforeConfig.bytes.toString('utf8').replace(/^﻿/, '')) : {};
  if (!previous || typeof previous !== 'object' || Array.isArray(previous)) throw new Error('config must be an object');
  if (mode === 'upgrade' && !beforeConfig) throw new Error('not installed; run install');
  mkdir(path.dirname(settings));
  release = lock(settings);
  const beforeSettings = snapshot(settings);
  const raw = beforeSettings?.bytes.toString('utf8').replace(/^﻿/, '') ?? '';
  const data = raw.trim() ? JSON.parse(raw) : {};
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('settings must be an object');
  data.hooks ??= {};
  if (!data.hooks || typeof data.hooks !== 'object' || Array.isArray(data.hooks)) throw new Error('settings hooks must be an object');
  // Replace, never skip: an entry from an older version (no `if`, no `timeout`,
  // the 6.4 matcher) is removed and written again in today's shape.
  let legacy = false;
  for (const event of ['PostToolUse', 'Stop']) {
    const groups = data.hooks[event] ?? [];
    if (!Array.isArray(groups) || groups.some(g => !g || !Array.isArray(g.hooks) || g.hooks.some(h => !h || typeof h !== 'object' || (h.args !== undefined && !Array.isArray(h.args))))) throw new Error(`invalid ${event} hooks`);
    const next = [];
    const wrapped = groups.flatMap(g => g.hooks).filter(isWrapped);
    for (const group of groups) {
      const mine = group.hooks.filter(h => isDocsync(h) && !isWrapped(h));
      if (mine.some(h => h.timeout === undefined)) legacy = true;
      const rest = group.hooks.filter(h => !mine.includes(h));
      if (!mine.length) next.push(group);
      else if (rest.length) next.push({ ...group, hooks: rest });
    }
    for (const [wantEvent, matcher, name, rule, timeout] of WANT) {
      if (wantEvent !== event) continue;
      if (wrapped.some(h => wraps(h, name))) continue;   // the project launches it itself: no unwrapped copy
      let group = next.find(g => (g.matcher ?? '') === matcher);
      if (!group) { group = matcher ? { matcher, hooks: [] } : { hooks: [] }; next.push(group); }
      group.hooks.push({ type: 'command', command: 'node', args: ['${CLAUDE_PROJECT_DIR}/.claude/hooks/' + name + '.mjs'], ...(rule ? { if: rule } : {}), timeout });
    }
    data.hooks[event] = next;
  }
  // LOCAL calendar day, the clock every docsync date uses (DOCSYNC_NOW pins it in tests).
  const pinned = Date.parse(process.env.DOCSYNC_NOW || '');
  const now = Number.isNaN(pinned) ? new Date() : new Date(pinned);
  const today = [now.getFullYear(), now.getMonth() + 1, now.getDate()].map(n => String(n).padStart(2, '0')).join('-');
  const { version: oldVersion, content_version, generated_by, last_updated, ...rest } = previous;
  // `.claude/**` joins the excludes at install, and once on the upgrade that meets a legacy
  // registration; later upgrades leave the list alone, so removing the entry sticks.
  if (mode === 'upgrade' && legacy && Array.isArray(rest.exclude)) rest.exclude = seeded(rest.exclude);
  const next = { version, content_version: contentVersion, generated_by: 'brewdoc:docsync-setup', last_updated: today, ...(mode === 'upgrade' ? rest : { enabled: true, threshold_days: threshold, exclude: seeded(exclude) }) };
  for (const name of names) {
    const source = path.join(assets, `${name}.mjs`);
    const checked = spawnSync(process.execPath, ['--check', source], { encoding: 'utf8' });
    if (checked.status !== 0) throw new Error(`invalid hook source: ${source}`);
    plan(path.join(root, '.claude/hooks', `${name}.mjs`), fs.readFileSync(source));
  }
  plan(config, JSON.stringify(next, null, 2) + '\n', beforeConfig);
  plan(settings, JSON.stringify(data, null, 2) + '\n', beforeSettings);
  // Every input is validated and every destination snapshotted before the first write.
  for (const entry of planned) {
    mkdir(path.dirname(entry.file));
    atomic(entry.file, entry.after, entry.before);
    committed.push(entry);
  }
  console.log(`docsync ${mode}: hooks, config and settings committed`);
} catch (error) {
  console.error(`docsync ${mode} failed: ${error.message}`);
  for (const entry of committed.reverse()) {
    try {
      if (!matches(entry.file, entry.after)) throw new Error('concurrent edit preserved; reconcile manually');
      if (entry.before) {
        atomic(entry.file, entry.before, entry.after);
        fs.utimesSync(entry.file, entry.before.atime, entry.before.mtime);
      } else fs.unlinkSync(entry.file);
    } catch (rollbackError) { console.error(`rollback ${entry.file}: ${rollbackError.message}`); }
  }
  process.exitCode = 1;
} finally {
  release();
  for (const temp of temps) { try { fs.unlinkSync(temp); } catch (error) { if (error.code !== 'ENOENT') console.error(`cleanup ${temp}: ${error.message}`); } }
  for (const dir of createdDirs.reverse()) { try { fs.rmdirSync(dir); } catch (error) { if (!['ENOENT', 'ENOTEMPTY', 'EEXIST'].includes(error.code)) console.error(`cleanup ${dir}: ${error.message}`); } }
}
NODE
```

- **Stop on a nonzero exit.** A validation error (bad `THRESHOLD`/`EXCLUDE`, unparsable
  `settings.json` or `config.json`, a hook source that fails `node --check`) leaves every
  destination untouched; a write failure restores each committed file on its own and
  keeps a concurrent edit instead of overwriting it.
- **`upgrade`** keeps `threshold_days`, `exclude`, `enabled` and any unknown config key,
  refreshes the four provenance keys, and rewrites the docsync registrations in the
  shape above whatever shape they had. Foreign hooks, `env` and permissions are untouched.
- **Wrapped registrations are the project's.** A docsync handler whose launcher, the first
  word of `command` unquoted, is not `node` (e.g. `"$CLAUDE_PROJECT_DIR/.claude/scripts/preflight.py"
  exec node -- ".../docsync-track.mjs"`) is never removed or rewritten, its missing `if`/`timeout`
  is never "legacy", and install/upgrade add no unwrapped handler for a hook the same event
  already runs through it. A hook with no handler at all is still added.
- **No `settings.json.bak`** is written: the transaction is its own rollback, and a
  backup left in `.claude/` was never cleaned up. An existing `.bak` is not touched here.
- Session logs are never deleted by install or upgrade.
- **`settings.json.lock`** (a `mkdir` dir lock, the one other setup skills' settings
  merges take) covers the read-modify-write: held -> retry 10 s, then abort with nothing
  written; older than 30 s -> stale, broken.
- Settings files are watched: the change normally applies in the running session; restart
  it if the hooks do not fire.

---

## Uninstall / purge

`uninstall` removes the registrations and the three `.claude/hooks/docsync-*.mjs` files
and keeps `.claude/docsync/` (config + session logs) for a later `install`. `purge` also
deletes `.claude/docsync/`.
Node only — no `python3`, no `jq`. `MODE` = `uninstall` (default) or `purge`:

```bash
ROOT="${CLAUDE_PROJECT_DIR}"
[ -n "$ROOT" ] && [ -d "$ROOT" ] || ROOT=$(git rev-parse --show-toplevel 2>/dev/null || true)
is_profile_parent() { _pp=$(cd "${1}" 2>/dev/null && pwd -P) || return 1; { [ -n "${HOME:-}" ] && [ "$_pp" = "$(cd "$HOME" 2>/dev/null && pwd -P)" ]; } || { [ -n "${CLAUDE_CONFIG_DIR:-}" ] && [ "$_pp/.claude" = "$(cd "$CLAUDE_CONFIG_DIR" 2>/dev/null && pwd -P)" ]; }; }
[ -n "$ROOT" ] || { d=$PWD; until [ -d "$d/.git" ] || { [ -d "$d/.claude" ] && ! is_profile_parent "$d"; } || [ "$d" = / ]; do d=$(dirname "$d"); done; [ "$d" = / ] && ROOT=$PWD || ROOT=$d; }
export MODE="${MODE:-uninstall}"
node - "$ROOT" <<'NODE'
const fs = require('node:fs');
const path = require('node:path');
const [root] = process.argv.slice(2);
const mode = process.env.MODE;
const names = ['docsync-track', 'docsync-watch', 'docsync-gate'];
const settings = path.join(root, '.claude/settings.json');
const isDocsync = h => names.some(n => [h.command ?? '', ...(Array.isArray(h.args) ? h.args : [])].join(' ').includes(`${n}.mjs`));
const isState = name => /^state(-.*)?\.jsonl?$/.test(name) || name.endsWith('.tmp');
const rmdirEmpty = dir => { try { fs.rmdirSync(dir); } catch (error) { if (!['ENOENT', 'ENOTEMPTY', 'EEXIST'].includes(error.code)) throw error; } };
const read = file => { try { return fs.readFileSync(file, 'utf8'); } catch (error) { if (error.code === 'ENOENT') return null; throw error; } };
// Same `<settings>.lock` dir as install: held 10 s -> abort, older than 30 s -> stale.
function lock(file) {
  const dir = `${file}.lock`, wait = new Int32Array(new SharedArrayBuffer(4));
  for (let i = 0; i < 100; i++) {
    try { fs.mkdirSync(dir); return () => { try { fs.rmdirSync(dir); } catch {} }; } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      try { if (Date.now() - fs.statSync(dir).mtimeMs > 30000) fs.rmdirSync(dir); } catch {}
      Atomics.wait(wait, 0, 0, 100);
    }
  }
  throw new Error(`${dir} is held by another installer`);
}
const done = [];
let release = () => {};
try {
  if (!['uninstall', 'purge'].includes(mode)) throw new Error('MODE must be uninstall or purge');
  // 1. Registrations first: an entry that outlives its script starts a failing node on every call.
  if (fs.existsSync(path.dirname(settings))) release = lock(settings);
  const raw = read(settings);
  let cleaned = {};
  if (raw !== null && raw.trim()) {
    const data = JSON.parse(raw.replace(/^﻿/, ''));
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('settings must be an object');
    let removed = 0;
    if (data.hooks && typeof data.hooks === 'object' && !Array.isArray(data.hooks)) {
      for (const event of Object.keys(data.hooks)) {
        if (!Array.isArray(data.hooks[event])) continue;
        const kept = [];
        for (const group of data.hooks[event]) {
          if (!group || !Array.isArray(group.hooks)) { kept.push(group); continue; }
          const rest = group.hooks.filter(h => !(h && typeof h === 'object' && isDocsync(h)));
          removed += group.hooks.length - rest.length;
          if (rest.length === group.hooks.length) kept.push(group);
          else if (rest.length) kept.push({ ...group, hooks: rest });
        }
        if (kept.length) data.hooks[event] = kept; else delete data.hooks[event];
      }
      if (removed && !Object.keys(data.hooks).length) delete data.hooks;
    }
    cleaned = data;
    if (removed && !Object.keys(data).length) {
      fs.unlinkSync(settings); // docsync was its only content
      done.push(`${removed} registrations removed, empty settings.json deleted`);
    } else if (removed) {
      const temp = `${settings}.${process.pid}.tmp`;
      fs.writeFileSync(temp, JSON.stringify(data, null, 2) + '\n', { mode: fs.statSync(settings).mode & 0o7777 });
      fs.renameSync(temp, settings);
      done.push(`${removed} registrations removed`);
    }
  }
  const once = release; release = () => {}; once(); // catch must not free a lock another installer took since
  // 2. Hook files, only now that nothing points at them.
  const hooksDir = path.join(root, '.claude/hooks');
  let files = 0;
  for (const name of names) { try { fs.unlinkSync(path.join(hooksDir, `${name}.mjs`)); files++; } catch (error) { if (error.code !== 'ENOENT') throw error; } }
  rmdirEmpty(hooksDir);
  done.push(`${files} hook files removed`);
  // 3. `settings.json.bak` from an older docsync: removed only when deleting it loses nothing
  //    (empty, taken while docsync was wired, or equal to the cleaned settings).
  const bak = read(`${settings}.bak`);
  if (bak !== null) {
    let same = false;
    try { same = JSON.stringify(JSON.parse(bak)) === JSON.stringify(cleaned); } catch {}
    if (same || bak.trim() === '{}' || names.some(n => bak.includes(`${n}.mjs`))) { fs.unlinkSync(`${settings}.bak`); done.push('settings.json.bak removed'); }
    else done.push(`KEPT ${settings}.bak (differs from settings.json and holds no docsync entry: not provably ours)`);
  }
  // `config.json.bak` an older `enable`/`disable` wrote: never read, inside docsync's own dir.
  try { fs.unlinkSync(path.join(root, '.claude/docsync/config.json.bak')); done.push('config.json.bak removed'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  // 4. State dirs that pre-6.0 hooks created under a drifted cwd: a nested
  //    `.claude/docsync/` holding nothing but session state. One with a config is an install.
  let strays = 0;
  (function walk(dir) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name === '.git' || entry.name === 'node_modules') continue;
      const sub = path.join(dir, entry.name);
      if (fs.existsSync(path.join(sub, '.git'))) continue; // another checkout or worktree
      const stray = path.join(sub, '.claude/docsync');
      let inside = null;
      try { inside = fs.readdirSync(stray); } catch {}
      if (inside && inside.every(isState)) {
        for (const name of inside) fs.unlinkSync(path.join(stray, name));
        fs.rmdirSync(stray);
        rmdirEmpty(path.join(sub, '.claude'));
        strays++;
      }
      walk(sub);
    }
  })(root);
  done.push(`${strays} stray nested state dirs removed`);
  // 5. purge: config and session logs go too.
  if (mode === 'purge') {
    fs.rmSync(path.join(root, '.claude/docsync'), { recursive: true, force: true });
    done.push('.claude/docsync removed');
  }
  rmdirEmpty(path.join(root, '.claude'));
  console.log(`docsync ${mode}: ${done.join('; ')}`);
} catch (error) {
  release();
  console.error(`docsync ${mode} failed: ${error.message}${done.length ? ` (already done: ${done.join('; ')})` : ' (nothing was changed)'}`);
  process.exitCode = 1;
}
NODE
```

- **Stop on a nonzero exit.** An unparsable `settings.json` aborts before anything is
  removed, so the hook files stay as long as registrations point at them.
- Removes ONLY handlers whose `command`/`args` name `docsync-track.mjs`,
  `docsync-watch.mjs` or `docsync-gate.mjs` (exec form and the older shell form), then
  drops a matcher group, event array or `hooks` object that this emptied. A
  `settings.json` whose only content was docsync is deleted. Foreign hooks, `env` and
  permissions are untouched, and a file with no docsync entry is not rewritten.
- A `KEPT ...settings.json.bak` line means the backup could be the user's own; delete
  it by hand if it is not wanted.
- Doc frontmatter (`last_updated`, `doc_type`, `sync_procedure`) is never touched.
- Takes the same `settings.json.lock` as install; applies in the running session (watched).

---

## Limitations

- Only `.md` is tracked (case-sensitive `.md` suffix); `.mdx` and other formats are not.
- The gate judges only docs edited in this session through `Write`/`Edit`. A doc that
  was merely read, or changed by a Bash command or outside Claude Code, is never raised.
- "Too far behind" uses the file's mtime. A checkout or a `touch` moves mtime without
  changing content; the gate only reads mtime of files the session itself edited.
- `stop_hook_active` suppresses the gate for the Stop that follows any forced
  continuation, including one caused by another hook; pending docs are raised at the
  next ordinary Stop.
- Nothing in the hook input says whether the user can be asked (headless run), so the
  gate message leaves that choice to Claude: ask (only before a destructive sync) if
  `AskUserQuestion` exists, else report.
- `CLAUDE.md`, `CLAUDE.local.md` and `AGENTS.md` (any depth) are auto-loaded instruction
  files, never tracked, nudged or gated, whatever `exclude` says.
- Path keys are normalised to `/` on Windows; that path is not covered by the test suite.
