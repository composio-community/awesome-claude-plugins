#!/usr/bin/env node
// E2E: docsync hooks (track/watch/gate) as real child processes + INSTALL.md transactions; BD04 (nested cwd
// !=relocate config/state), BD05, audit `item N`. Isolated: per-case tmpdir, CLAUDE_PROJECT_DIR scrubbed, DOCSYNC_NOW+TZ pinned.
import { spawnSync, spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, utimesSync, statSync, existsSync, chmodSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const ASSETS = join(fileURLToPath(import.meta.url), '..', '..', 'assets');
const HOOK = { track: join(ASSETS, 'docsync-track.mjs'), watch: join(ASSETS, 'docsync-watch.mjs'), gate: join(ASSETS, 'docsync-gate.mjs') };
const BASE = realpathSync(mkdtempSync(join(tmpdir(), 'docsync-test-')));
// Pinned clock: noon UTC, so the local day is 2026-03-10 under TZ=UTC.
const NOW = '2026-03-10T12:00:00Z';
const TODAY = '2026-03-10';

let passed = 0, failed = 0;
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { passed++; console.log(`  ok   ${name}`); return; }
  failed++;
  console.log(`  FAIL ${name}\n       expected ${JSON.stringify(expected)}\n       actual   ${JSON.stringify(actual)}`);
}

/** Builds a project with .claude/docsync/config.json plus the given docs. */
function makeProject(name, config, docs) {
  const root = join(BASE, name);
  mkdirSync(join(root, '.claude', 'docsync'), { recursive: true });
  writeFileSync(join(root, '.claude', 'docsync', 'config.json'), JSON.stringify(config));
  for (const [rel, body] of Object.entries(docs)) {
    const abs = join(root, rel);
    mkdirSync(join(abs, '..'), { recursive: true });
    writeFileSync(abs, body);
  }
  return root;
}

function childEnv({ projectDir, now = NOW, tz = 'UTC' } = {}) {
  const env = { ...process.env, DOCSYNC_NOW: now, TZ: tz };
  delete env.CLAUDE_PROJECT_DIR;
  if (projectDir) env.CLAUDE_PROJECT_DIR = projectDir;
  return env;
}
function run(hook, payload, { cwd, projectDir, now, tz } = {}) {
  const r = spawnSync(process.execPath, [HOOK[hook]], {
    input: JSON.stringify(payload), encoding: 'utf8', cwd: cwd || BASE, env: childEnv({ projectDir, now, tz })
  });
  return { code: r.status, out: r.stdout.trim(), err: r.stderr.trim() };
}
// Shorthands: one hook call from the project root, and the parsed stdout of a call.
const edit = (root, rel, session = 's1') => run('track', { session_id: session, cwd: root, tool_input: { file_path: join(root, rel) } }, { cwd: root, projectDir: root });
const stop = (root, extra = {}, opts = {}) => run('gate', { session_id: 's1', cwd: root, ...extra }, { cwd: root, projectDir: root, ...opts });
const parsed = r => [r.code, JSON.parse(r.out)];

const stateFiles = root => readdirSync(join(root, '.claude', 'docsync')).filter(f => f.startsWith('state')).sort();
// A log a hook failed to write is a FAILing assertion, never a suite crash that
// swallows the remaining cases and the summary line.
const events = (root, f) => {
  try { return readFileSync(join(root, '.claude', 'docsync', f), 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)); } catch { return []; }
};
// Sets a file's modification time to noon UTC of the given day.
const touch = (root, rel, day) => { const t = new Date(`${day}T12:00:00Z`); utimesSync(join(root, rel), t, t); };
const doc = day => `---\nlast_updated: "${day}"\n---\n\n# doc\n`;

const DATED = doc('2000-01-01');
const UNDATED = '# no frontmatter\n';
const NUDGE = (rel, day = TODAY) => ({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: `docsync: \`${rel}\` has no \`last_updated\` frontmatter. Add YAML frontmatter with \`last_updated: "${day}"\` (quoted — unquoted a real YAML parser types it as a Date), optionally \`doc_type: llm|user|skip\` (bare, unquoted; absent = user) and \`sync_procedure: "..."\`, so staleness tracking works.` } });
const BLOCK = (findings, day = TODAY) => ({ decision: 'block', reason: `docsync: docs edited this session need a look at their \`last_updated\`. ${findings} Where the date is missing or unusable, or your edit already brought the doc fully up to date, set \`last_updated: "${day}"\` (quoted) and move on. Otherwise the doc needs a sync: re-check it against the code (its \`sync_procedure\`, when present, says where to look), fix what is wrong, then set the date; decide this yourself. Ask the user first only when the sync would delete or wholesale rewrite content — with the AskUserQuestion tool if it is available; if it is not, list those docs in your final message and finish without waiting for an answer. docsync raises a doc again this session only after it is edited again.` });

// ── BD04: a nested cwd must not relocate config or state ─────────────────────
console.log('BD04 — project root vs hook cwd');
{
  const root = makeProject('bd04-disabled', { enabled: false, threshold_days: 7, exclude: [] }, { 'docs/a.md': UNDATED });
  mkdirSync(join(root, 'pkg', 'nested'), { recursive: true });
  const nested = join(root, 'pkg', 'nested');
  const payload = { session_id: 's1', cwd: nested, tool_input: { file_path: join(root, 'docs/a.md') } };

  const viaEnv = run('track', payload, { cwd: nested, projectDir: root });
  check('disabled install stays inert from a nested cwd (env)', [viaEnv.code, viaEnv.out], [0, '{}']);

  const viaWalk = run('track', payload, { cwd: nested });
  check('disabled install stays inert from a nested cwd (upward walk)', [viaWalk.code, viaWalk.out], [0, '{}']);

  check('no stray state dir below the root', readdirSync(root).sort(), ['.claude', 'docs', 'pkg']);
}
{
  const root = makeProject('bd04-rel', { enabled: true, threshold_days: 7, exclude: [] }, { 'docs/a.md': DATED });
  mkdirSync(join(root, 'pkg'), { recursive: true });
  const r = run('track', { session_id: 's1', cwd: join(root, 'pkg'), tool_input: { file_path: '../docs/a.md' } }, { cwd: join(root, 'pkg'), projectDir: root });
  check('relative tool_input resolves against cwd', [r.code, r.out], [0, '{}']);
  check('recorded key is root-relative', events(root, 'state-s1.jsonl'), [{ ev: 'edit', file: 'docs/a.md' }]);
}
{
  // RESOLVED root (!=input.cwd) must reach loadConfig/statePath; nested decoy config would disable hook + misplace state.
  const root = makeProject('bd04-decoy', { enabled: true, threshold_days: 7, exclude: [] }, { 'docs/a.md': UNDATED });
  const nested = join(root, 'pkg');
  mkdirSync(join(nested, '.claude', 'docsync'), { recursive: true });
  writeFileSync(join(nested, '.claude', 'docsync', 'config.json'), JSON.stringify({ enabled: false }));

  const r = run('track', { session_id: 's1', cwd: nested, tool_input: { file_path: join(root, 'docs/a.md') } }, { cwd: nested, projectDir: root });
  check('track reads config from the resolved root, not the cwd decoy', parsed(r), [0, NUDGE('docs/a.md')]);
  check('track writes state under the resolved root', stateFiles(root), ['state-s1.jsonl']);
  check('track wrote nothing under the nested cwd', readdirSync(join(nested, '.claude', 'docsync')).sort(), ['config.json']);
}
{
  const root = makeProject('bd04-excl', { enabled: true, threshold_days: 7, exclude: ['vendor/**'] }, { 'vendor/v.md': UNDATED });
  const nested = join(root, 'vendor');
  const r = run('track', { session_id: 's1', cwd: nested, tool_input: { file_path: join(root, 'vendor/v.md') } }, { cwd: nested, projectDir: root });
  check('exclude globs still apply from a nested cwd', [r.code, r.out], [0, '{}']);
  check('excluded file produced no state', stateFiles(root), []);
}
// GIVEN outer/.git > h/.claude/docsync > h/notes/misc/doc.md WHEN h is HOME, the config-dir parent, or plain
// THEN hooks and every skill/runbook ROOT line skip h as a profile and use outer; plain h stays the root
{
  const cfg = { enabled: true, threshold_days: 7, exclude: [] };
  const fixture = (name) => {
    const outer = makeProject(name, cfg, {});
    mkdirSync(join(outer, '.git'));
    const h = join(outer, 'h');
    mkdirSync(join(h, '.claude', 'docsync'), { recursive: true });
    writeFileSync(join(h, '.claude', 'docsync', 'config.json'), JSON.stringify(cfg));
    const cwd = join(h, 'notes', 'misc');
    mkdirSync(cwd, { recursive: true });
    writeFileSync(join(cwd, 'doc.md'), UNDATED);
    return { outer, h, cwd };
  };
  const rootLines = ['../SKILL.md', '../assets/INSTALL.md'].flatMap((rel) => {
    const lines = readFileSync(join(ASSETS, rel), 'utf8').split('\n');
    return lines.flatMap((l, i) => l.includes('until [ -d "$d/.git" ]')
      ? [(lines[i - 1].trim().startsWith('is_profile_parent()') ? lines[i - 1].trim() + '\n' : '') + l.trim()] : []);
  });
  const observe = (name, envOf) => {
    const { outer, h, cwd } = fixture(name);
    const env = { ...process.env, DOCSYNC_NOW: NOW, TZ: 'UTC', HOME: join(outer, 'elsewhere'), ...envOf(h) };
    delete env.CLAUDE_PROJECT_DIR;
    if (!envOf(h).CLAUDE_CONFIG_DIR) delete env.CLAUDE_CONFIG_DIR;
    const hook = (kind, payload) => spawnSync(process.execPath, [HOOK[kind]], { input: JSON.stringify({ session_id: 's1', cwd, ...payload }), encoding: 'utf8', cwd, env }).stdout.trim();
    hook('watch', { tool_input: { file_path: join(cwd, 'doc.md') } });
    hook('track', { tool_input: { file_path: join(cwd, 'doc.md') } });
    const gate = JSON.parse(hook('gate', {}) || '{}').decision ?? 'none';
    const roots = rootLines.map((line) => spawnSync('bash', ['-c', `ROOT=""\n${line}\nprintf '%s' "$ROOT"`], { cwd, env, encoding: 'utf8' }).stdout);
    const evs = (root) => events(root, 'state-s1.jsonl').map((e) => (e.file ? `${e.ev}:${e.file}` : e.ev));
    return { gate, outer: evs(outer), h: evs(h), roots: roots.map((r) => r === outer ? 'outer' : r === h ? 'h' : r) };
  };
  const toOuter = { gate: 'block', outer: ['read:h/notes/misc/doc.md', 'edit:h/notes/misc/doc.md', 'nudge:h/notes/misc/doc.md', 'ask'],
    h: [], roots: Array(6).fill('outer') };
  check('docsync hooks and ROOT lines skip a profile parent (HOME, config-dir parent) but keep a plain .claude root',
    [observe('profile-home', (h) => ({ HOME: h })), observe('profile-cfg', (h) => ({ CLAUDE_CONFIG_DIR: join(h, '.claude') })), observe('profile-plain', () => ({}))],
    [toOuter, toOuter, { gate: 'block', outer: [], h: ['read:notes/misc/doc.md', 'edit:notes/misc/doc.md', 'nudge:notes/misc/doc.md', 'ask'],
      roots: Array(6).fill('h') }]);
}

// ── BD05: one state file per session ─────────────────────────────────────────
console.log('BD05 — per-session state');
{
  const root = makeProject('bd05-sessions', { enabled: true, threshold_days: 7, exclude: [] }, { 'a.md': DATED, 'b.md': DATED });
  run('track', { session_id: 'aaa', cwd: root, tool_input: { file_path: join(root, 'a.md') } }, { cwd: root, projectDir: root });
  run('watch', { session_id: 'bbb', cwd: root, tool_input: { file_path: join(root, 'b.md') } }, { cwd: root, projectDir: root });
  check('two sessions own two files', stateFiles(root), ['state-aaa.jsonl', 'state-bbb.jsonl']);
  check('session aaa kept its entry', events(root, 'state-aaa.jsonl'), [{ ev: 'edit', file: 'a.md' }]);
  check('session bbb kept its entry', events(root, 'state-bbb.jsonl'), [{ ev: 'read', file: 'b.md' }]);
  check('no temp file survived', readdirSync(join(root, '.claude', 'docsync')).filter(f => f.endsWith('.tmp')), []);
}
{
  const root = makeProject('bd05-sanitize', { enabled: true, threshold_days: 7, exclude: [] }, { 'a.md': DATED });
  run('track', { session_id: '../../evil id', cwd: root, tool_input: { file_path: join(root, 'a.md') } }, { cwd: root, projectDir: root });
  check('session id is sanitized into a flat filename', stateFiles(root), ['state-.._.._evil_id.jsonl']);
}
{
  const root = makeProject('bd05-nosession', { enabled: true, threshold_days: 7, exclude: [] }, { 'a.md': DATED });
  run('track', { cwd: root, tool_input: { file_path: join(root, 'a.md') } }, { cwd: root, projectDir: root });
  check('absent session id falls back to state.jsonl', stateFiles(root), ['state.jsonl']);
}

// ── gate: decision, scope, prune ─────────────────────────────────────────────
console.log('gate — decision + prune');
{
  // GIVEN a doc dated 2026-02-01 that the session edited on 2026-03-10.
  const root = makeProject('gate-block', { enabled: true, threshold_days: 7, exclude: [] }, { 'a.md': doc('2026-02-01') });
  edit(root, 'a.md');
  touch(root, 'a.md', TODAY);
  const nested = join(root, 'pkg');
  mkdirSync(nested, { recursive: true });
  // WHEN the gate runs from a nested cwd.
  const first = run('gate', { session_id: 's1', cwd: nested }, { cwd: nested, projectDir: root });
  // THEN it blocks with the exact reason and records the ask in the root log.
  check('gate blocks from a nested cwd with the exact reason', parsed(first),
    [0, BLOCK('Edited more than 7 days after their `last_updated`: a.md (37d).')]);
  check('the ask is recorded after the one line the gate had read', events(root, 'state-s1.jsonl'),
    [{ ev: 'edit', file: 'a.md' }, { ev: 'ask', seen: 1 }]);
}
{
  // GIVEN four old state files and one recent one, relative to the pinned clock.
  const root = makeProject('gate-prune', { enabled: true, threshold_days: 7, exclude: [] }, { 'a.md': DATED });
  const dir = join(root, '.claude', 'docsync');
  for (const f of ['state-ancient.json', 'state.json', 'state-x.json.1234.tmp', 'state-old.jsonl']) {
    writeFileSync(join(dir, f), '{}');
    touch(root, join('.claude', 'docsync', f), '2026-02-01');
  }
  writeFileSync(join(dir, 'state-fresh.json'), '{}');
  touch(root, join('.claude', 'docsync', 'state-fresh.json'), '2026-03-09');
  // WHEN the gate runs for a session that touched nothing.
  const r = stop(root);
  // THEN only files older than 14 days are gone and the gate wrote no file of its own.
  check('an idle Stop stays silent', [r.code, r.out], [0, '{}']);
  check('gate prunes logs, old JSON state and temp files older than 14 days', stateFiles(root), ['state-fresh.json']);
}
{
  const root = makeProject('gate-off', { enabled: false, threshold_days: 7, exclude: [] }, { 'a.md': DATED });
  const r = run('gate', { session_id: 's1', cwd: root }, { cwd: root, projectDir: root });
  check('disabled gate never blocks', [r.code, r.out], [0, '{}']);
}
{
  // Crash-safety only, NOT polarity: with no config there is also no tracked doc to gate on.
  const root = makeProject('gate-missing-cfg', { enabled: true, threshold_days: 7, exclude: [] }, { 'a.md': DATED });
  rmSync(join(root, '.claude', 'docsync', 'config.json'));
  const r = run('gate', { session_id: 's1', cwd: root }, { cwd: root, projectDir: root });
  check('a missing config file never crashes the gate', [r.code, r.out, r.err], [0, '{}', '']);
}

// ── polarity: an ABSENT `enabled` key means ENABLED ──────────────────────────
// `c.enabled !== false` keeps pre-toggle configs working; only these 3 omit `enabled`, catching an inverted `=== true`.
console.log('polarity — absent `enabled` key');
{
  const root = makeProject('polarity-track', { threshold_days: 7, exclude: [] }, { 'a.md': DATED });
  const r = run('track', { session_id: 's1', cwd: root, tool_input: { file_path: join(root, 'a.md') } }, { cwd: root, projectDir: root });
  check('track runs with no `enabled` key and writes session state', [r.code, stateFiles(root)], [0, ['state-s1.jsonl']]);
  check('track recorded the doc with no `enabled` key', events(root, 'state-s1.jsonl'), [{ ev: 'edit', file: 'a.md' }]);
}
{
  const root = makeProject('polarity-watch', { threshold_days: 7, exclude: [] }, { 'a.md': DATED });
  const r = run('watch', { session_id: 's1', cwd: root, tool_input: { file_path: join(root, 'a.md') } }, { cwd: root, projectDir: root });
  check('watch records the doc with no `enabled` key', [r.code, events(root, 'state-s1.jsonl')], [0, [{ ev: 'read', file: 'a.md' }]]);
}
{
  const root = makeProject('polarity-gate', { threshold_days: 7, exclude: [] }, { 'a.md': UNDATED });
  edit(root, 'a.md');
  check('gate blocks with no `enabled` key in the config', parsed(stop(root)), [0, BLOCK('No `last_updated`: a.md.')]);
}

// ── item 1: reads never reach the gate; subagent reads are not recorded ──────
console.log('item 1 — reads vs edits');
{
  // GIVEN a doc dated long before its modification that the main session only read.
  const root = makeProject('i1-read-only', { enabled: true, threshold_days: 7, exclude: [] }, { 'a.md': DATED });
  touch(root, 'a.md', TODAY);
  const read = { session_id: 's1', cwd: root, tool_input: { file_path: join(root, 'a.md') } };
  // WHEN it is read twice and the turn ends.
  run('watch', read, { cwd: root, projectDir: root });
  run('watch', read, { cwd: root, projectDir: root });
  const r = stop(root);
  // THEN one read event is logged and the gate stays silent.
  check('a doc that was only read never blocks the Stop', [r.code, r.out], [0, '{}']);
  check('a repeated read is logged once and no ask is recorded', events(root, 'state-s1.jsonl'), [{ ev: 'read', file: 'a.md' }]);
}
{
  // GIVEN a tracked doc.
  const root = makeProject('i1-subagent', { enabled: true, threshold_days: 7, exclude: [] }, { 'a.md': DATED });
  // WHEN a subagent reads it (the payload carries agent_id).
  const r = run('watch', { session_id: 's1', agent_id: 'a1b2', agent_type: 'Explore', cwd: root, tool_input: { file_path: join(root, 'a.md') } }, { cwd: root, projectDir: root });
  // THEN nothing is recorded.
  check('a subagent read leaves no state behind', [r.code, r.out, stateFiles(root)], [0, '{}', []]);
}

// ── item 2: the gate re-arms when a doc is edited after the ask ──────────────
console.log('item 2 — re-arm after new edits');
{
  // GIVEN an ask about a.md that the user declined (a.md is not edited again).
  const root = makeProject('i2-rearm', { enabled: true, threshold_days: 7, exclude: [] }, { 'a.md': UNDATED, 'b.md': UNDATED });
  edit(root, 'a.md');
  check('the first Stop asks about a.md', parsed(stop(root)), [0, BLOCK('No `last_updated`: a.md.')]);
  // WHEN the turn ends again with no new edit.
  const quiet = stop(root);
  // THEN the gate is silent.
  check('an ask is not repeated while nothing new was edited', [quiet.code, quiet.out], [0, '{}']);
  // WHEN b.md is edited afterwards and the turn ends.
  edit(root, 'b.md');
  // THEN the gate asks again, about b.md only.
  check('an edit after the ask re-arms the gate for that doc only', parsed(stop(root)), [0, BLOCK('No `last_updated`: b.md.')]);
  check('the log holds both asks with the line counts they covered', events(root, 'state-s1.jsonl'), [
    { ev: 'edit', file: 'a.md' }, { ev: 'nudge', file: 'a.md' }, { ev: 'ask', seen: 2 },
    { ev: 'edit', file: 'b.md' }, { ev: 'nudge', file: 'b.md' }, { ev: 'ask', seen: 5 }
  ]);
}
{
  // GIVEN a log where b.md was appended while the gate was deciding: the ask covers 1 line.
  const root = makeProject('i2-race', { enabled: true, threshold_days: 7, exclude: [] }, { 'a.md': UNDATED, 'b.md': UNDATED });
  writeFileSync(join(root, '.claude', 'docsync', 'state-s1.jsonl'),
    '{"ev":"edit","file":"a.md"}\n{"ev":"edit","file":"b.md"}\n{"ev":"ask","seen":1}\n');
  // WHEN the next Stop arrives.
  // THEN b.md is still pending although its line precedes the ask line.
  check('an edit logged during the ask is not swallowed by it', parsed(stop(root)), [0, BLOCK('No `last_updated`: b.md.')]);
}

// ── item 3: staleness against the file's modification day ────────────────────
console.log('item 3 — real modification state');
{
  // GIVEN six edited docs: one per verdict plus a deleted one.
  const root = makeProject('i3-verdicts', { enabled: true, threshold_days: 7, exclude: [] }, {
    'lagging.md': doc('2026-02-01'), 'within.md': doc('2026-02-01'), 'current.md': doc(TODAY),
    'future.md': doc('2099-01-01'), 'mistyped.md': doc('2026-13-45'), 'gone.md': doc('2026-02-01')
  });
  for (const f of ['lagging.md', 'within.md', 'current.md', 'future.md', 'mistyped.md', 'gone.md']) edit(root, f);
  touch(root, 'lagging.md', TODAY);
  touch(root, 'within.md', '2026-02-05');
  touch(root, 'current.md', TODAY);
  rmSync(join(root, 'gone.md'));
  // WHEN the turn ends on 2026-03-10.
  const r = stop(root);
  // THEN only the lagging, future and mistyped docs are reported, each for its own reason.
  check('the gate compares last_updated with the modification day and rejects impossible dates', parsed(r), [0, BLOCK(
    'Edited more than 7 days after their `last_updated`: lagging.md (37d). ' +
    'Unusable `last_updated`: future.md (2099-01-01 is in the future), mistyped.md ("2026-13-45" is not a YYYY-MM-DD date).')]);
}
{
  // GIVEN a doc dated 37 days ago whose last modification is 4 days after that date.
  const root = makeProject('i3-clock', { enabled: true, threshold_days: 7, exclude: [] }, { 'a.md': doc('2026-02-01') });
  edit(root, 'a.md');
  touch(root, 'a.md', '2026-02-05');
  // WHEN the turn ends.
  const r = stop(root);
  // THEN the passing of time alone does not make it stale.
  check('a doc is not stale merely because the clock moved on', [r.code, r.out], [0, '{}']);
}
{
  // GIVEN twenty-two undated docs edited in one session.
  const names = Array.from({ length: 22 }, (_, i) => `d${String(i + 1).padStart(2, '0')}.md`);
  const root = makeProject('i3-cap', { enabled: true, threshold_days: 7, exclude: [] }, Object.fromEntries(names.map(n => [n, UNDATED])));
  for (const n of names) edit(root, n);
  // WHEN the turn ends.
  // THEN the reason names twenty of them and counts the rest.
  check('a long list is capped at twenty names', parsed(stop(root)), [0, BLOCK(`No \`last_updated\`: ${names.slice(0, 20).join(', ')} and 2 more.`)]);
}

// ── item 4: one nudge per file per session ───────────────────────────────────
console.log('item 4 — nudge once');
{
  // GIVEN an undated doc.
  const root = makeProject('i4-once', { enabled: true, threshold_days: 7, exclude: [] }, { 'a.md': UNDATED });
  // WHEN it is edited twice in one session and once in another.
  const first = edit(root, 'a.md');
  const second = edit(root, 'a.md');
  const other = edit(root, 'a.md', 's2');
  // THEN only the first edit of each session carries the nudge.
  check('the first edit nudges', parsed(first), [0, NUDGE('a.md')]);
  check('the second edit of the same file is silent', [second.code, second.out], [0, '{}']);
  check('another session nudges on its own first edit', parsed(other), [0, NUDGE('a.md')]);
  check('every edit is still logged', events(root, 'state-s1.jsonl'),
    [{ ev: 'edit', file: 'a.md' }, { ev: 'nudge', file: 'a.md' }, { ev: 'edit', file: 'a.md' }]);
}

// ── item 5: parallel hooks never lose an entry ───────────────────────────────
console.log('item 5 — atomic append');
{
  // GIVEN forty dated docs.
  const names = Array.from({ length: 40 }, (_, i) => `p${String(i + 1).padStart(2, '0')}.md`);
  const root = makeProject('i5-parallel', { enabled: true, threshold_days: 7, exclude: [] }, Object.fromEntries(names.map(n => [n, doc(TODAY)])));
  // WHEN forty track hooks for one session run at the same time.
  const codes = await Promise.all(names.map(n => new Promise(done => {
    const child = spawn(process.execPath, [HOOK.track], { cwd: root, env: childEnv({ projectDir: root }), stdio: ['pipe', 'ignore', 'ignore'] });
    child.on('close', done);
    child.stdin.end(JSON.stringify({ session_id: 's1', cwd: root, tool_input: { file_path: join(root, n) } }));
  })));
  // THEN every hook exits 0 and the log holds exactly one edit event per doc.
  check('all forty parallel hooks exit 0', codes, names.map(() => 0));
  check('no parallel append is lost or torn', events(root, 'state-s1.jsonl').map(e => `${e.ev}:${e.file}`).sort(), names.map(n => `edit:${n}`));
}

// ── item 6: the gate cannot loop ─────────────────────────────────────────────
console.log('item 6 — stop_hook_active + unwritable state');
{
  // GIVEN an undated edited doc.
  const root = makeProject('i6-active', { enabled: true, threshold_days: 7, exclude: [] }, { 'a.md': UNDATED });
  edit(root, 'a.md');
  // WHEN the Stop already follows a forced continuation.
  const r = stop(root, { stop_hook_active: true });
  // THEN the gate allows it and records no ask, so the doc is raised at the next ordinary Stop.
  check('stop_hook_active allows the Stop', [r.code, r.out], [0, '{}']);
  check('the pending doc is not marked as asked', events(root, 'state-s1.jsonl'), [{ ev: 'edit', file: 'a.md' }, { ev: 'nudge', file: 'a.md' }]);
  check('the next ordinary Stop raises it', parsed(stop(root)), [0, BLOCK('No `last_updated`: a.md.')]);
}
{
  // GIVEN an undated edited doc and a session log that can no longer be written.
  const root = makeProject('i6-readonly', { enabled: true, threshold_days: 7, exclude: [] }, { 'a.md': UNDATED });
  edit(root, 'a.md');
  const log = join(root, '.claude', 'docsync', 'state-s1.jsonl');
  chmodSync(log, 0o444);
  // WHEN the turn ends twice.
  const first = stop(root);
  const second = stop(root);
  chmodSync(log, 0o644);
  // THEN neither Stop is blocked and the reason goes to stderr only.
  check('an unwritable log never blocks a Stop',
    [first.code, first.out, second.code, second.out, first.err.startsWith('[docsync-gate] state not writable, not blocking: EACCES')],
    [0, '{}', 0, '{}', true]);
}

// ── item 9: `.claude/**` is excluded unless the config says otherwise ────────
console.log('item 9 — default excludes');
{
  // GIVEN a config without an `exclude` key and an undated report under .claude/.
  const root = makeProject('i9-default', { enabled: true, threshold_days: 7 }, { '.claude/reports/r.md': UNDATED });
  // WHEN the report is edited and read.
  const tracked = edit(root, '.claude/reports/r.md');
  const watched = run('watch', { session_id: 's1', cwd: root, tool_input: { file_path: join(root, '.claude/reports/r.md') } }, { cwd: root, projectDir: root });
  // THEN neither hook nudges or records it.
  check('a doc under .claude/ is ignored by default', [tracked.code, tracked.out, watched.code, watched.out, stateFiles(root)], [0, '{}', 0, '{}', []]);
}
{
  // GIVEN a config whose `exclude` list was emptied on purpose.
  const root = makeProject('i9-optout', { enabled: true, threshold_days: 7, exclude: [] }, { '.claude/rules/r.md': UNDATED });
  // WHEN a doc under .claude/ is edited.
  // THEN it is tracked like any other doc.
  check('an explicit empty exclude list tracks .claude/ docs', parsed(edit(root, '.claude/rules/r.md')), [0, NUDGE('.claude/rules/r.md')]);
}
{
  // GIVEN an empty exclude list, undated auto-loaded instruction files, and an older log naming one.
  const files = ['CLAUDE.md', 'pkg/CLAUDE.local.md', 'pkg/AGENTS.md'];
  const root = makeProject('i9-instruction', { enabled: true, threshold_days: 7, exclude: [] },
    Object.fromEntries([...files, 'MY-CLAUDE.md'].map(f => [f, UNDATED])));
  // WHEN each is edited and read, then the gate sees a pre-exemption edit event.
  const hooked = files.flatMap(f => [edit(root, f, 'i'), run('watch', { session_id: 'i', cwd: root, tool_input: { file_path: join(root, f) } }, { cwd: root, projectDir: root })]);
  writeFileSync(join(root, '.claude/docsync/state-s1.jsonl'), '{"ev":"edit","file":"CLAUDE.md"}\n');
  // THEN none is nudged, logged or gated, while a lookalike name is still tracked.
  check('instruction files are exempt whatever exclude says', [hooked.map(r => [r.code, r.out]), stateFiles(root), parsed(stop(root))],
    [files.flatMap(() => [[0, '{}'], [0, '{}']]), ['state-s1.jsonl'], [0, {}]]);
  check('a lookalike name is still tracked', parsed(edit(root, 'MY-CLAUDE.md')), [0, NUDGE('MY-CLAUDE.md')]);
}

// ── item 11: BOM handling without a literal U+FEFF in the source ─────────────
console.log('item 11 — BOM');
{
  // GIVEN a dated doc that starts with a UTF-8 byte order mark.
  const root = makeProject('i11-bom', { enabled: true, threshold_days: 7, exclude: [] }, { 'a.md': '﻿' + doc(TODAY) });
  // WHEN it is edited.
  const r = edit(root, 'a.md');
  // THEN its frontmatter is recognised, so there is no nudge.
  check('frontmatter behind a BOM is parsed', [r.code, r.out], [0, '{}']);
  check('no hook source carries a literal BOM byte sequence',
    Object.values(HOOK).map(f => readFileSync(f).includes(Buffer.from([0xEF, 0xBB, 0xBF]))), [false, false, false]);
}

// ── item 12: every docsync date is the LOCAL calendar day ────────────────────
console.log('item 12 — one clock');
{
  // GIVEN an undated doc and a zone 14 hours ahead of UTC, where 12:00Z is already 2026-03-11.
  const root = makeProject('i12-local', { enabled: true, threshold_days: 7, exclude: [] }, { 'a.md': UNDATED, 'b.md': doc('2026-03-11') });
  // WHEN the hooks run at 2026-03-10T12:00Z.
  const nudge = run('track', { session_id: 's1', cwd: root, tool_input: { file_path: join(root, 'a.md') } }, { cwd: root, projectDir: root, tz: 'Pacific/Kiritimati' });
  run('track', { session_id: 's2', cwd: root, tool_input: { file_path: join(root, 'b.md') } }, { cwd: root, projectDir: root, tz: 'Pacific/Kiritimati' });
  touch(root, 'b.md', TODAY);
  const gate = run('gate', { session_id: 's2', cwd: root }, { cwd: root, projectDir: root, tz: 'Pacific/Kiritimati' });
  // THEN the nudge proposes the local day and a doc dated with it is not "in the future".
  check('the nudge proposes the local day, not the UTC day', parsed(nudge), [0, NUDGE('a.md', '2026-03-11')]);
  check('a doc dated with the local day is current', [gate.code, gate.out], [0, '{}']);
}

// Exercise the runbook's own transactions: the bash fences of assets/INSTALL.md, verbatim.
console.log('installer — prevalidation and transactional rollback');
const RUNBOOK = join(ASSETS, 'INSTALL.md');
const runbook = readFileSync(RUNBOOK, 'utf8');
const fence = (heading, lang) => runbook.slice(runbook.indexOf(heading)).match(new RegExp('```' + lang + '\\n([\\s\\S]*?)\\n```'))[1];
const installBlock = fence('## Install / upgrade', 'bash');
const removeBlock = fence('## Uninstall / purge', 'bash');
const PLUGIN_VERSION = JSON.parse(readFileSync(join(ASSETS, '../../../.claude-plugin/plugin.json'), 'utf8')).version;
const CONTENT_VERSION = /brewcode-meta:[^\n]*content_version=([0-9.]+)/.exec(readFileSync(join(ASSETS, '../SKILL.md'), 'utf8'))[1];
const TRACK = '${CLAUDE_PROJECT_DIR}/.claude/hooks/docsync-track.mjs';
const WATCH = '${CLAUDE_PROJECT_DIR}/.claude/hooks/docsync-watch.mjs';
const GATE = '${CLAUDE_PROJECT_DIR}/.claude/hooks/docsync-gate.mjs';
// The registration, byte for byte. A typo in an `if` rule disables its handler silently.
const REGISTRATION = {
  hooks: {
    PostToolUse: [
      { matcher: 'Write|Edit', hooks: [
        { type: 'command', command: 'node', args: [TRACK], if: 'Write(**/*.md)', timeout: 5 },
        { type: 'command', command: 'node', args: [TRACK], if: 'Edit(**/*.md)', timeout: 5 }
      ] },
      { matcher: 'Read', hooks: [{ type: 'command', command: 'node', args: [WATCH], if: 'Read(**/*.md)', timeout: 5 }] }
    ],
    Stop: [{ hooks: [{ type: 'command', command: 'node', args: [GATE], timeout: 10 }] }]
  }
};
const readJsonFile = file => JSON.parse(readFileSync(file, 'utf8'));
function remove(root, mode = 'uninstall') {
  const env = { ...childEnv({ projectDir: root }), MODE: mode };
  const r = spawnSync('bash', ['-c', removeBlock], { cwd: root, encoding: 'utf8', env });
  return { code: r.status, out: r.stdout.trim(), err: r.stderr.trim() };
}
function install(root, { mode = 'install', threshold = '7', exclude = '["vendor/**"]', tz = 'UTC', fault = '', concurrent = '' } = {}) {
  const script = installBlock;
  const env = { ...childEnv({ projectDir: root, tz }), RUNBOOK, MODE: mode, THRESHOLD: threshold, EXCLUDE: exclude };
  delete env.NODE_OPTIONS;
  if (fault) {
    const shim = join(BASE, 'installer-fault.cjs');
    writeFileSync(shim, `const fs = require('node:fs'); const rename = fs.renameSync; let fired = false;
      fs.renameSync = function(from, to) {
        if (!fired && to === ${JSON.stringify(fault)}) {
          fired = true;
          ${concurrent ? `fs.writeFileSync(${JSON.stringify(concurrent)}, 'concurrent editor');` : ''}
          throw new Error('injected write failure');
        }
        return rename.apply(this, arguments);
      };`);
    env.NODE_OPTIONS = `--require=${shim}`;
  }
  return spawnSync('bash', ['-c', script], { cwd: root, encoding: 'utf8', env });
}
function tree(root) {
  return readdirSync(root, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).map(entry => {
    const file = join(root, entry.name);
    return entry.isDirectory() ? [entry.name, tree(file)] : [entry.name, readFileSync(file).toString('base64'), statSync(file).mode & 0o777];
  });
}
function partialInstall(name, settings = '{"env":{"KEEP":"yes"},"hooks":{"Stop":[{"hooks":[{"type":"command","command":"foreign-stop"}]}]}}\n') {
  const root = makeProject(name, { enabled: false, threshold_days: 30, exclude: ['legacy/**'], custom: { keep: true } }, {});
  mkdirSync(join(root, '.claude/hooks'));
  writeFileSync(join(root, '.claude/hooks/docsync-track.mjs'), 'old track bytes\n');
  chmodSync(join(root, '.claude/hooks/docsync-track.mjs'), 0o640);
  writeFileSync(join(root, '.claude/settings.json'), settings);
  writeFileSync(join(root, '.claude/settings.json.bak'), 'existing user backup\n');
  writeFileSync(join(root, '.claude/docsync/state-personal.json'), 'session state untouched\n');
  return root;
}
{
  // GIVEN a fresh project with no installed settings, config or hooks.
  const root = join(BASE, 'install-fresh-success');
  mkdirSync(root);
  check('fresh install fixture has no owned destinations', tree(root), []);
  // WHEN the emitted installer completes and the installed track hook executes.
  const result = install(root);
  writeFileSync(join(root, 'a.md'), DATED);
  const tracked = spawnSync(process.execPath, [join(root, '.claude/hooks/docsync-track.mjs')], {
    cwd: root, env: { ...process.env, CLAUDE_PROJECT_DIR: root }, encoding: 'utf8',
    input: JSON.stringify({ session_id: 'installed-proof', cwd: root, tool_input: { file_path: join(root, 'a.md') } })
  });
  // THEN real installed hooks consume the installed config and write session state.
  check('fresh installation succeeds', result.status, 0);
  check('fresh config carries provenance, the local day, the chosen values and the seeded .claude exclude (items 9, 12)',
    readJsonFile(join(root, '.claude/docsync/config.json')),
    { version: PLUGIN_VERSION, content_version: CONTENT_VERSION, generated_by: 'brewdoc:docsync-setup', last_updated: TODAY, enabled: true, threshold_days: 7, exclude: ['vendor/**', '.claude/**'] });
  check('installed hook executes successfully', tracked.status, 0);
  check('installed hook tracks the project document', events(root, 'state-installed-proof.jsonl'), [{ ev: 'edit', file: 'a.md' }]);
  check('the installer writes exactly the registration (items 7, 8, 14)', readJsonFile(join(root, '.claude/settings.json')), REGISTRATION);
  check('the runbook documents exactly the registration the installer writes', JSON.parse(fence('## settings.json hook entries', 'json')), REGISTRATION);
  check('install leaves no settings backup behind', readdirSync(join(root, '.claude')).sort(), ['docsync', 'hooks', 'settings.json']);
}
{
  // GIVEN another setup skill holds a fresh settings.json.lock.
  const root = partialInstall('install-lock-held');
  mkdirSync(join(root, '.claude/settings.json.lock'));
  const before = tree(root);
  // WHEN install runs while the lock stays held.
  const result = install(root);
  // THEN it aborts after its wait, writes nothing and leaves the holder's lock alone.
  check('a held settings lock aborts install untouched', [result.status, /settings\.json\.lock is held by another installer/.test(result.stderr), tree(root)], [1, true, before]);
}
{
  // GIVEN an installed project and a stale settings.json.lock from a crashed installer.
  const root = join(BASE, 'remove-lock-stale');
  mkdirSync(root);
  install(root);
  const held = join(root, '.claude/settings.json.lock');
  mkdirSync(held);
  const old = new Date(Date.now() - 60000);
  utimesSync(held, old, old);
  // WHEN uninstall runs.
  const result = remove(root);
  // THEN the stale lock is broken, the registrations go, and no lock is left behind.
  check('a stale settings lock is broken and released', [result.code, existsSync(join(root, '.claude/settings.json')), existsSync(held)], [0, false, false]);
}
{
  // GIVEN an installed project where another installer takes the lock right after step 1 and step 2 then fails.
  const root = join(BASE, 'remove-lock-once');
  mkdirSync(root);
  install(root);
  const held = join(root, '.claude/settings.json.lock');
  const shim = join(BASE, 'remove-fault.cjs');
  writeFileSync(shim, `const fs = require('node:fs'); const unlink = fs.unlinkSync;
    fs.unlinkSync = function(file) {
      if (String(file).endsWith('docsync-track.mjs')) { fs.mkdirSync(${JSON.stringify(held)}); throw new Error('injected unlink failure'); }
      return unlink.apply(this, arguments);
    };`);
  // WHEN uninstall runs.
  const env = { ...childEnv({ projectDir: root }), MODE: 'uninstall', NODE_OPTIONS: `--require=${shim}` };
  const r = spawnSync('bash', ['-c', removeBlock], { cwd: root, encoding: 'utf8', env });
  // THEN it fails, and the catch path leaves the other installer's lock in place.
  check('a failed uninstall never releases a lock it no longer holds', [r.status, /injected unlink failure/.test(r.stderr), existsSync(held)], [1, true, true]);
}
{
  // GIVEN a fresh project and a zone 14 hours ahead of UTC.
  const root = join(BASE, 'install-local-clock');
  mkdirSync(root);
  // WHEN install runs at 2026-03-10T12:00Z without THRESHOLD or EXCLUDE.
  const env = { ...childEnv({ projectDir: root, tz: 'Pacific/Kiritimati' }), RUNBOOK };
  const result = spawnSync('bash', ['-c', installBlock], { cwd: root, encoding: 'utf8', env });
  // THEN the config is stamped with the local day and the documented defaults.
  check('install with defaults succeeds', result.status, 0);
  check('config last_updated is the local day and the defaults include .claude/** (items 9, 12)',
    readJsonFile(join(root, '.claude/docsync/config.json')),
    { version: PLUGIN_VERSION, content_version: CONTENT_VERSION, generated_by: 'brewdoc:docsync-setup', last_updated: '2026-03-11', enabled: true, threshold_days: 7,
      exclude: ['node_modules/**', '**/CHANGELOG.md', 'dist/**', 'build/**', 'vendor/**', '.claude/**'] });
}
{
  // GIVEN malformed prior configuration and a partial prior installation.
  const root = partialInstall('install-invalid-config');
  writeFileSync(join(root, '.claude/docsync/config.json'), '{broken');
  const before = tree(root);
  // WHEN upgrade validates the config before replacing any hook.
  const result = install(root, { mode: 'upgrade' });
  // THEN the complete previous installation remains intact.
  check('invalid configuration rejects upgrade', result.status, 1);
  check('invalid configuration preserves every destination', tree(root), before);
}
{
  // GIVEN malformed foreign settings and a partial prior installation.
  const root = partialInstall('install-invalid-settings', '{broken');
  const before = tree(root);
  // WHEN the emitted installer validates its inputs.
  const result = install(root);
  // THEN it fails before any destination changes.
  check('invalid settings reject installation', result.status, 1);
  check('invalid settings preserve every prior byte, mode and directory', tree(root), before);
}
{
  // GIVEN invalid threshold input and an existing partial installation.
  const root = partialInstall('install-invalid-threshold');
  const before = tree(root);
  // WHEN the emitted installer validates configuration.
  const result = install(root, { threshold: '0' });
  // THEN neither hooks nor config nor settings are overwritten.
  check('invalid threshold rejects installation', result.status, 1);
  check('invalid threshold leaves the full installation intact', tree(root), before);
}
{
  // GIVEN a partial install with byte-sensitive hooks, backup and session state.
  const root = partialInstall('install-rollback');
  const before = tree(root);
  // WHEN settings replacement fails after the other owned files commit.
  const result = install(root, { fault: join(root, '.claude/settings.json') });
  // THEN all changed files and newly created hooks are restored individually.
  check('settings write failure rejects installation', result.status, 1);
  check('rollback restores partial install bytes and modes exactly', tree(root), before);
}
{
  // GIVEN a new project and no docsync or settings destinations.
  const root = join(BASE, 'install-fresh-rollback');
  mkdirSync(root);
  // WHEN settings replacement fails after creating hooks and config.
  const result = install(root, { fault: join(root, '.claude/settings.json') });
  // THEN the rollback removes only files and directories created by this run.
  check('fresh install write failure rejects installation', result.status, 1);
  check('fresh rollback returns to the empty project', tree(root), []);
}
{
  // GIVEN an existing partial install and an independent editor of its track hook.
  const root = partialInstall('install-concurrent-rollback');
  const hook = join(root, '.claude/hooks/docsync-track.mjs');
  const config = readFileSync(join(root, '.claude/docsync/config.json'), 'utf8');
  // WHEN the editor changes an already committed file before another write fails.
  const result = install(root, { fault: join(root, '.claude/settings.json'), concurrent: hook });
  // THEN rollback retains the editor's bytes and reports the unresolved conflict.
  check('concurrent rollback still reports installer failure', result.status, 1);
  check('concurrent hook edit survives rollback', readFileSync(hook, 'utf8'), 'concurrent editor');
  check('independent config rollback succeeds', readFileSync(join(root, '.claude/docsync/config.json'), 'utf8'), config);
  check('rollback reports concurrent edit explicitly', /concurrent edit preserved/.test(result.stderr), true);
  check('new hook is removed during concurrent rollback', existsSync(join(root, '.claude/hooks/docsync-watch.mjs')), false);
}
{
  // GIVEN a disabled prior install, foreign settings, user backup and session state.
  const root = partialInstall('install-upgrade');
  const expected = JSON.parse(readFileSync(join(root, '.claude/docsync/config.json'), 'utf8'));
  // WHEN the same emission runs twice in upgrade mode.
  check('upgrade transaction succeeds', install(root, { mode: 'upgrade' }).status, 0);
  const once = tree(root);
  check('second upgrade succeeds', install(root, { mode: 'upgrade' }).status, 0);
  // THEN private config, foreign settings, backups and state are preserved.
  const { version, content_version, generated_by, last_updated, ...actual } = JSON.parse(readFileSync(join(root, '.claude/docsync/config.json'), 'utf8'));
  check('upgrade preserves all private fields and disabled polarity', actual, expected);
  check('upgrade settings merge is idempotent', tree(root), once);
  const settings = JSON.parse(readFileSync(join(root, '.claude/settings.json'), 'utf8'));
  check('foreign settings survive upgrade', settings.env, { KEEP: 'yes' });
  check('foreign stop hook survives upgrade', settings.hooks.Stop[0].hooks[0], { type: 'command', command: 'foreign-stop' });
  check('portable stop hook path is emitted', settings.hooks.Stop[0].hooks[1], { type: 'command', command: 'node', args: [GATE], timeout: 10 });
  check('existing settings backup is byte-identical', readFileSync(join(root, '.claude/settings.json.bak'), 'utf8'), 'existing user backup\n');
  check('session state is byte-identical', readFileSync(join(root, '.claude/docsync/state-personal.json'), 'utf8'), 'session state untouched\n');
}

// ── upgrade from the 6.4 registration ────────────────────────────────────────
console.log('upgrade — legacy registration migrates');
const FOREIGN = { type: 'command', command: 'foreign-format' };
const LEGACY_SETTINGS = {
  env: { KEEP: 'yes' },
  hooks: {
    PostToolUse: [
      { matcher: 'Write|Edit|MultiEdit', hooks: [FOREIGN, { type: 'command', command: 'node', args: [TRACK] }] },
      { matcher: 'Read', hooks: [{ type: 'command', command: 'node "$CLAUDE_PROJECT_DIR/.claude/hooks/docsync-watch.mjs"' }] }
    ],
    Stop: [{ hooks: [{ type: 'command', command: 'node', args: [GATE] }] }]
  }
};
function legacyInstall(name, extra = {}) {
  const root = makeProject(name, { enabled: true, threshold_days: 30, exclude: ['vendor/**'] }, extra);
  mkdirSync(join(root, '.claude/hooks'));
  for (const n of ['track', 'watch', 'gate']) writeFileSync(join(root, `.claude/hooks/docsync-${n}.mjs`), 'old bytes\n');
  writeFileSync(join(root, '.claude/settings.json'), JSON.stringify(LEGACY_SETTINGS, null, 2) + '\n');
  return root;
}
{
  // GIVEN an install wired the 6.4 way: MultiEdit matcher, shell form, no `if`, no timeout.
  const root = legacyInstall('upgrade-legacy');
  // WHEN upgrade runs.
  const first = install(root, { mode: 'upgrade' });
  // THEN every docsync entry is rewritten in today's shape and foreign entries stay put.
  check('legacy upgrade succeeds', first.status, 0);
  check('legacy registrations are replaced, not skipped (items 7, 8, 14)', readJsonFile(join(root, '.claude/settings.json')), {
    env: { KEEP: 'yes' },
    hooks: {
      PostToolUse: [{ matcher: 'Write|Edit|MultiEdit', hooks: [FOREIGN] }, ...REGISTRATION.hooks.PostToolUse],
      Stop: REGISTRATION.hooks.Stop
    }
  });
  check('the upgrade that meets a legacy registration seeds .claude/** once (item 9)',
    readJsonFile(join(root, '.claude/docsync/config.json')),
    { version: PLUGIN_VERSION, content_version: CONTENT_VERSION, generated_by: 'brewdoc:docsync-setup', last_updated: TODAY, enabled: true, threshold_days: 30, exclude: ['vendor/**', '.claude/**'] });
  // WHEN the user removes the seeded entry and upgrades again.
  writeFileSync(join(root, '.claude/docsync/config.json'), JSON.stringify({ enabled: true, threshold_days: 30, exclude: ['vendor/**'] }));
  const second = install(root, { mode: 'upgrade' });
  // THEN the choice sticks.
  check('second upgrade succeeds', second.status, 0);
  check('a later upgrade does not re-add a removed exclude', readJsonFile(join(root, '.claude/docsync/config.json')).exclude, ['vendor/**']);
}

{
  // GIVEN the project-dusk fork: track and gate wrapped in the project launcher, no `if`, no timeout, no watch.
  const W = n => ({ type: 'command', command: `"$CLAUDE_PROJECT_DIR/.claude/scripts/toolchain_preflight.py" exec node -- "$CLAUDE_PROJECT_DIR/.claude/hooks/docsync-${n}.mjs"` });
  const forked = { hooks: {
    PostToolUse: [{ matcher: 'Write|Edit|MultiEdit', hooks: [W('track')] }],
    Stop: [{ hooks: [W('gate')] }]
  } };
  const root = makeProject('upgrade-wrapped', { enabled: true, threshold_days: 30, exclude: ['vendor/**'] }, {});
  mkdirSync(join(root, '.claude/hooks'));
  for (const n of ['track', 'gate']) writeFileSync(join(root, `.claude/hooks/docsync-${n}.mjs`), 'fork bytes\n');
  writeFileSync(join(root, '.claude/settings.json'), JSON.stringify(forked, null, 2) + '\n');
  // WHEN upgrade runs.
  const r = install(root, { mode: 'upgrade' });
  // THEN the wrapped handlers stay byte-equal with no unwrapped twin, only the absent watch is added, no legacy seeding.
  check('wrapped upgrade succeeds', r.status, 0);
  check('wrapped track and gate are kept, never duplicated; only the missing watch joins', readJsonFile(join(root, '.claude/settings.json')), {
    hooks: { PostToolUse: [forked.hooks.PostToolUse[0], REGISTRATION.hooks.PostToolUse[1]], Stop: forked.hooks.Stop }
  });
  check('a wrapped handler without timeout is not a legacy registration', readJsonFile(join(root, '.claude/docsync/config.json')).exclude, ['vendor/**']);
}

{
  // GIVEN the project-dusk fork, a plain install and a bare project (the unattended upgrade preconditions).
  const skill = readFileSync(join(ASSETS, '../SKILL.md'), 'utf8');
  const detect = skill.slice(skill.indexOf('### First-run detection')).match(/```bash\n([\s\S]*?)\n```/)[1];
  const W = n => ({ type: 'command', command: `"$CLAUDE_PROJECT_DIR/.claude/scripts/toolchain_preflight.py" exec node -- "$CLAUDE_PROJECT_DIR/.claude/hooks/docsync-${n}.mjs"` });
  const fork = makeProject('detect-wrapped', { enabled: true, threshold_days: 30, exclude: [] }, {});
  mkdirSync(join(fork, '.claude/hooks'));
  for (const n of ['track', 'gate']) writeFileSync(join(fork, `.claude/hooks/docsync-${n}.mjs`), 'fork bytes\n');
  writeFileSync(join(fork, '.claude/settings.json'), JSON.stringify({ hooks: { PostToolUse: [{ matcher: 'Write|Edit|MultiEdit', hooks: [W('track')] }], Stop: [{ hooks: [W('gate')] }] } }));
  const plain = join(BASE, 'detect-plain');
  mkdirSync(plain);
  const plainRc = install(plain).status;
  const bare = join(BASE, 'detect-bare');
  mkdirSync(bare);
  // WHEN first-run detection runs in each.
  const out = root => { const r = spawnSync('bash', ['-c', detect], { cwd: root, encoding: 'utf8', env: childEnv({ projectDir: root }) }); return [r.status, r.stdout, r.stderr]; };
  // THEN only the fork prints the WRAPPED line the Unattended rule skips on, naming its launcher.
  check('first-run detection names a wrapping launcher; a plain install and a bare project print none',
    { plainRc, fork: out(fork), plain: out(plain), bare: out(bare) },
    { plainRc: 0, fork: [0, 'docsync: INSTALLED\ndocsync: WRAPPED toolchain_preflight.py\n', ''],
      plain: [0, 'docsync: INSTALLED\n', ''], bare: [0, 'docsync: NOT_INSTALLED\n', ''] });
}

{
  // GIVEN the WRAPPED probe (SKILL.md First-run detection) and the installer predicates it copies (INSTALL.md).
  const skill = readFileSync(join(ASSETS, '../SKILL.md'), 'utf8');
  const detect = skill.slice(skill.indexOf('### First-run detection')).match(/```bash\n([\s\S]*?)\n```/)[1];
  const probe = detect.match(/node -e '\n([\s\S]*?)\n' "\$ROOT\//)?.[1] ?? 'process.exit(9)';
  // The probe sits in a bash single-quoted string, so it spells `'` as `\x27`; nothing else differs.
  const shared = (src, label) => {
    const line = src.split('\n').find(l => l.startsWith('const launcher = ')) ?? '';
    return {
      launcherRe: /const m = (\/.+?\/)\.exec\(/.exec(line)?.[1] ?? `NO launcher regex in ${label}`,
      basename: / return m \? (.+?) : /.exec(line)?.[1] ?? `NO basename in ${label}`,
      nodeRe: /!(\/\^node[^/]*\/i)\.test\(launcher\(/.exec(src)?.[1] ?? `NO node test in ${label}`,
    };
  };
  const defs = ['names', 'isDocsync', 'launcher', 'isWrapped'].map(n => installBlock.split('\n').find(l => l.startsWith(`const ${n} = `)) ?? `throw new Error('NO ${n} in INSTALL.md');`);
  const { launcher, isWrapped } = new Function(`${defs.join('\n')}\nreturn { launcher, isWrapped };`)();
  const corpus = [
    { type: 'command', command: 'node', args: [TRACK] },
    { type: 'command', command: 'node "$CLAUDE_PROJECT_DIR/.claude/hooks/docsync-gate.mjs"' },
    { type: 'command', command: '"C:\\Program Files\\nodejs\\node.exe" "%CLAUDE_PROJECT_DIR%\\.claude\\hooks\\docsync-watch.mjs"' },
    { type: 'command', command: '/usr/local/bin/NODE', args: [GATE] },
    { type: 'command', command: '"$CLAUDE_PROJECT_DIR/.claude/scripts/toolchain_preflight.py" exec node -- "$CLAUDE_PROJECT_DIR/.claude/hooks/docsync-track.mjs"' },
    { type: 'command', command: "'/opt/hooks/wrap.sh' node docsync-watch.mjs" },
    { type: 'command', command: 'bun', args: ['run', GATE] },
    { type: 'command', command: '  uv run .claude/hooks/docsync-track.mjs' },
    { type: 'command', command: 'node-wrapper docsync-gate.mjs' },
    { type: 'command', command: 'wrap docsync-other.mjs' },
    { type: 'command', command: 'bash .claude/scripts/lint.sh' },
    { type: 'command', args: [TRACK] },
  ];
  const settings = join(BASE, 'lockstep-settings.json');
  writeFileSync(settings, JSON.stringify({ hooks: { PostToolUse: [{ matcher: 'Write|Edit', hooks: corpus }], Stop: [{ hooks: corpus }] } }));
  // WHEN the probe runs on that registration and the installer predicates classify the same hooks.
  const r = spawnSync(process.execPath, ['-e', probe, settings, join(BASE, 'lockstep-absent.json')], { encoding: 'utf8' });
  const installer = [...new Set(corpus.filter(isWrapped).map(launcher))];
  // THEN both copies share one launcher parse and both name exactly the wrapping launchers.
  check('WRAPPED probe stays in lockstep with INSTALL.md launcher/isWrapped (V3-6)',
    { shared: shared(probe.replaceAll('\\x27', "'"), 'SKILL.md'), installer, probe: [r.status, r.stdout, r.stderr] },
    { shared: shared(installBlock, 'INSTALL.md'), installer: ['toolchain_preflight.py', 'wrap.sh', 'bun', 'uv', 'node-wrapper'],
      probe: [0, 'docsync: WRAPPED toolchain_preflight.py,wrap.sh,bun,uv,node-wrapper\n', ''] });
}

// ── uninstall / purge leave nothing of docsync behind ────────────────────────
console.log('uninstall / purge — lifecycle');
{
  // GIVEN a fresh install in a project that holds one doc and one session log.
  const root = join(BASE, 'purge-fresh');
  mkdirSync(root);
  writeFileSync(join(root, 'a.md'), UNDATED);
  const before = tree(root);
  check('install before purge succeeds', install(root).status, 0);
  writeFileSync(join(root, '.claude/docsync/state-s1.jsonl'), '{"ev":"edit","file":"a.md"}\n');
  // WHEN purge runs.
  const r = remove(root, 'purge');
  // THEN the project is byte-identical to what it was before install.
  check('purge reports each step', [r.code, r.out, r.err],
    [0, 'docsync purge: 4 registrations removed, empty settings.json deleted; 3 hook files removed; 0 stray nested state dirs removed; .claude/docsync removed', '']);
  check('purge returns the project to its pre-install tree', tree(root), before);
}
{
  // GIVEN a fresh install with one session log and a config backup an older toggle left.
  const root = join(BASE, 'uninstall-fresh');
  mkdirSync(root);
  check('install before uninstall succeeds', install(root).status, 0);
  writeFileSync(join(root, '.claude/docsync/state-s1.jsonl'), '{"ev":"edit","file":"a.md"}\n');
  writeFileSync(join(root, '.claude/docsync/config.json.bak'), '{"enabled":true}\n');
  // WHEN uninstall runs.
  const r = remove(root);
  // THEN only the config and the session log remain.
  check('uninstall succeeds', [r.code, r.err], [0, '']);
  check('uninstall reports the legacy config backup removed', r.out.includes('; config.json.bak removed;'), true);
  check('uninstall keeps config and session logs and nothing else', readdirSync(root, { recursive: true, withFileTypes: true }).filter(e => e.isFile()).map(e => e.name).sort(),
    ['config.json', 'state-s1.jsonl']);
  check('the kept files sit in .claude/docsync', readdirSync(join(root, '.claude')), ['docsync']);
}
{
  // GIVEN a legacy install with foreign settings and a backup that is the user's own.
  const root = legacyInstall('uninstall-foreign');
  writeFileSync(join(root, '.claude/settings.json.bak'), 'existing user backup\n');
  // WHEN uninstall runs.
  const r = remove(root);
  // THEN only docsync handlers leave settings.json and the foreign backup is kept and named.
  check('uninstall names the backup it could not attribute', [r.code, r.out, r.err],
    [0, `docsync uninstall: 3 registrations removed; 3 hook files removed; KEPT ${join(root, '.claude/settings.json')}.bak (differs from settings.json and holds no docsync entry: not provably ours); 0 stray nested state dirs removed`, '']);
  check('foreign settings survive uninstall exactly', readJsonFile(join(root, '.claude/settings.json')),
    { env: { KEEP: 'yes' }, hooks: { PostToolUse: [{ matcher: 'Write|Edit|MultiEdit', hooks: [FOREIGN] }] } });
  check('the user backup is byte-identical', readFileSync(join(root, '.claude/settings.json.bak'), 'utf8'), 'existing user backup\n');
  check('the hook files are gone and the emptied hooks dir with them', readdirSync(join(root, '.claude')).sort(), ['docsync', 'settings.json', 'settings.json.bak']);
}
{
  // GIVEN three legacy installs whose settings.json.bak came from docsync itself.
  const wired = legacyInstall('uninstall-bak-wired');
  writeFileSync(join(wired, '.claude/settings.json.bak'), JSON.stringify(LEGACY_SETTINGS));
  const empty = legacyInstall('uninstall-bak-empty');
  writeFileSync(join(empty, '.claude/settings.json.bak'), '{}\n');
  const same = legacyInstall('uninstall-bak-same');
  writeFileSync(join(same, '.claude/settings.json.bak'), JSON.stringify({ env: { KEEP: 'yes' }, hooks: { PostToolUse: [{ matcher: 'Write|Edit|MultiEdit', hooks: [FOREIGN] }] } }));
  // WHEN uninstall runs on each.
  const codes = [wired, empty, same].map(root => remove(root).code);
  // THEN each backup is removed, because deleting it loses nothing.
  check('uninstall succeeds on all three', codes, [0, 0, 0]);
  check('a docsync-made settings backup is removed (lifecycle gap)',
    [wired, empty, same].map(root => existsSync(join(root, '.claude/settings.json.bak'))), [false, false, false]);
}
{
  // GIVEN a legacy install plus nested .claude/docsync dirs of four kinds.
  const root = legacyInstall('uninstall-strays', {
    'pkg/sub/.claude/docsync/state.json': '{}',
    'pkg/sub/.claude/docsync/state-s9.json.77.tmp': '{}',
    'other/.claude/docsync/config.json': '{}',
    'other/.claude/docsync/state-x.json': '{}',
    'node_modules/m/.claude/docsync/state.json': '{}',
    'wt/.git': 'gitdir: elsewhere\n',
    'wt/.claude/docsync/state.json': '{}'
  });
  writeFileSync(join(root, '.claude/docsync/state-s1.jsonl'), '{"ev":"edit","file":"a.md"}\n');
  // WHEN uninstall runs.
  const r = remove(root);
  // THEN only the state-only dir below a plain subdirectory is removed.
  check('uninstall counts the stray dir', [r.code, r.out.includes('; 1 stray nested state dirs removed')], [0, true]);
  check('stray raw-cwd state is removed, nested installs and other checkouts are kept (lifecycle gap)',
    ['pkg/sub/.claude', 'pkg/sub', 'other/.claude/docsync/config.json', 'other/.claude/docsync/state-x.json', 'node_modules/m/.claude/docsync/state.json', 'wt/.claude/docsync/state.json', '.claude/docsync/config.json', '.claude/docsync/state-s1.jsonl']
      .map(p => existsSync(join(root, p))),
    [false, true, true, true, true, true, true, true]);
}
{
  // GIVEN a legacy install whose settings.json no longer parses.
  const root = legacyInstall('uninstall-broken');
  writeFileSync(join(root, '.claude/settings.json'), '{broken');
  const before = tree(root);
  // WHEN uninstall and purge run.
  const results = [remove(root), remove(root, 'purge'), remove(root, 'wipe')].map(r => r.code);
  // THEN each aborts before deleting anything, so no registration points at a missing script.
  check('unparsable settings and an unknown mode abort the removal', results, [1, 1, 1]);
  check('an aborted removal leaves every file in place', tree(root), before);
}

rmSync(BASE, { recursive: true, force: true });
console.log(`\n| checks | ${passed + failed} |\n| passed | ${passed} |\n| failed | ${failed} |`);
process.exit(failed === 0 ? 0 : 1);
