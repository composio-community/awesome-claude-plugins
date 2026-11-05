#!/usr/bin/env node
// brewcode-meta: version=6.12.5 content_version=6.5.2 generated_by=brewdoc:docsync-setup

// SPDX-License-Identifier: MIT
// Copyright (c) 2025-2026 Maksim Kochetkov

// Stop: docs EDITED since last ask, in scope, with `last_updated` missing/unusable/> threshold_days behind mtime
// -> block once, record the ask; never with `stop_hook_active` or an unrecordable ask. Self-contained, never throws.
import { readFileSync, appendFileSync, mkdirSync, existsSync, readdirSync, statSync, unlinkSync, realpathSync } from 'fs';
import { join, dirname, resolve } from 'path';

// --- inlined helpers -------------------------------------------------------
async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  try { return JSON.parse(raw); } catch { return {}; }
}
function output(r) { try { console.log(JSON.stringify(r)); } catch { console.log('{}'); } }
function readJson(p, fb) { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return fb; } }
// Mirrors semble isProfileParent: HOME or the active config dir's parent holds a profile .claude, never a root.
function isProfileParent(dir) {
  const real = (p) => { try { return realpathSync(p); } catch { return ''; } };
  const p = real(dir);
  if (!p) return false;
  if (process.env.HOME && real(process.env.HOME) === p) return true;
  const cfg = process.env.CLAUDE_CONFIG_DIR;
  return Boolean(cfg) && real(cfg) === join(p, '.claude');
}
// Project root: CLAUDE_PROJECT_DIR -> upward walk for a root marker (profile parents skipped) -> hook cwd; never throws.
// Hook `cwd` drifts mid-session (CwdChanged) -> only for relative `tool_input` paths, never for state.
function projectRoot(hookCwd) {
  const env = process.env.CLAUDE_PROJECT_DIR;
  if (env && existsSync(env)) return resolve(env);

  let dir = resolve(hookCwd || process.cwd());
  for (;;) {
    if (existsSync(join(dir, '.git'))) return dir;
    if (existsSync(join(dir, '.claude')) && !isProfileParent(dir)) return dir;
    const up = dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return resolve(hookCwd || process.cwd()); // last resort: never guess, never throw in a hook
}
// Session log: one JSON event per line, one O_APPEND write each (see docsync-track).
function appendEvent(p, ev) {
  try {
    mkdirSync(dirname(p), { recursive: true });
    appendFileSync(p, JSON.stringify(ev) + '\n');
    return true;
  } catch (err) {
    try { console.error(`[docsync-gate] state not writable, not blocking: ${err.message}`); } catch {}
    return false;
  }
}
// Clock: DOCSYNC_NOW (ISO instant) pins it for the test suite; unset = real time.
function now() {
  const t = Date.parse(process.env.DOCSYNC_NOW || '');
  return Number.isNaN(t) ? new Date() : new Date(t);
}
// Local-time YYYY-MM-DD (matches `date +%F` used by the sync flow).
function today() {
  const d = now(), p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
// One log per session — a shared file let two concurrent sessions reset each
// other's touched-set. No session id (rare) falls back to state.jsonl.
function statePath(root, sessionId) {
  const id = String(sessionId || '').replace(/[^A-Za-z0-9._-]/g, '_');
  return join(root, '.claude', 'docsync', id ? `state-${id}.jsonl` : 'state.jsonl');
}

function loadConfig(root) {
  const c = readJson(join(root, '.claude', 'docsync', 'config.json'), {});
  return {
    // `disable` flips this to false and leaves everything else in place. Absent = on,
    // so a config written before the toggle existed keeps working.
    enabled: c.enabled !== false,
    threshold_days: Number.isInteger(c.threshold_days) && c.threshold_days > 0 ? c.threshold_days : 7,
    // No list in the config: `.claude/**` (reports, plans, agent files) is not project docs.
    exclude: Array.isArray(c.exclude) ? c.exclude : ['.claude/**']
  };
}
// Minimal glob -> RegExp: supports **/ (any dir prefix), **, *, ?. Same as track/watch.
function globToRegex(g) {
  let re = '';
  for (let i = 0; i < g.length; i++) {
    const c = g[i];
    if (c === '*') {
      if (g[i + 1] === '*') { i++; if (g[i + 1] === '/') { re += '(?:.*/)?'; i++; } else re += '.*'; }
      else re += '[^/]*';
    } else if (c === '?') re += '[^/]';
    else if ('.+^${}()|[]\\'.includes(c)) re += '\\' + c;
    else re += c;
  }
  return new RegExp('^' + re + '$');
}
// Auto-loaded instruction files (any depth) never take docsync frontmatter, whatever `exclude` says.
const INSTRUCTION = /(^|\/)(CLAUDE|CLAUDE\.local|AGENTS)\.md$/;
function isExcluded(rel, globs) {
  return INSTRUCTION.test(rel) || globs.some(g => { try { return globToRegex(g).test(rel); } catch { return false; } });
}
// doc_type default: absent or unrecognized => 'user'. Only 'skip' removes a file from scope.
function docTypeOf(fields) {
  const v = String(fields.doc_type || '').trim().toLowerCase();
  return (v === 'llm' || v === 'user' || v === 'skip') ? v : 'user';
}
// One file per session accumulates; the gate is the only once-per-turn hook, so it
// sweeps. Older than PRUNE_DAYS goes: logs, earlier-version `state*.json`, stray `.tmp`.
const PRUNE_DAYS = 14;
function pruneOldSessions(root, keepPath) {
  try {
    const dir = join(root, '.claude', 'docsync');
    const cutoff = now().getTime() - PRUNE_DAYS * 86400000;
    for (const name of readdirSync(dir)) {
      if (!/^state(-.*)?\.jsonl?$/.test(name) && !name.endsWith('.tmp')) continue;
      const p = join(dir, name);
      if (p === keepPath) continue;
      try { if (statSync(p).mtimeMs < cutoff) unlinkSync(p); } catch {}
    }
  } catch {}
}
function parseFm(abs) {
  try {
    const txt = readFileSync(abs, 'utf8').replace(/^\uFEFF/, ''); // strip UTF-8 BOM
    if (!txt.startsWith('---')) return { present: false, fields: {} };
    const m = txt.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!m) return { present: false, fields: {} };
    const fields = {};
    for (const line of m[1].split(/\r?\n/)) {
      const mm = line.match(/^\s*([A-Za-z_][A-Za-z0-9_-]*)\s*:\s*(.*)$/);
      if (!mm) continue;
      let v = mm[2].trim();
      if (v[0] === '"' || v[0] === "'") v = v.replace(/^["']|["']$/g, '');
      else v = v.replace(/\s+#.*$/, '').trim();
      fields[mm[1]] = v;
    }
    return { present: true, fields };
  } catch { return { present: false, fields: {} }; }
}
// YYYY-MM-DD -> LOCAL midnight; null for a non-date, including a rolled-over one (2026-13-45).
function parseDay(dateStr) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr).trim());
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]) - 1, Number(m[3])];
  const day = new Date(y, mo, d);
  return day.getFullYear() === y && day.getMonth() === mo && day.getDate() === d ? day : null;
}
// LOCAL midnight of an instant.
function dayOf(ms) {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
// Complete lines of the session log; a half-written tail waits for the next Stop.
function readLines(p) {
  let txt;
  try { txt = readFileSync(p, 'utf8'); } catch { return []; }
  return txt.split('\n').slice(0, -1);
}
// Docs edited since the last ask. `ask.seen` = log lines the gate had read when it asked,
// so an edit appended while it was deciding stays pending instead of being swallowed.
function pendingEdits(lines) {
  const evs = lines.map(l => { try { return JSON.parse(l); } catch { return null; } });
  let seen = 0;
  for (const e of evs) if (e && e.ev === 'ask' && Number.isInteger(e.seen) && e.seen > seen) seen = e.seen;
  const files = [];
  evs.forEach((e, i) => {
    if (i >= seen && e && e.ev === 'edit' && typeof e.file === 'string' && !files.includes(e.file)) files.push(e.file);
  });
  return files;
}
// Keeps the block reason short when a session edited many docs.
const LIST_MAX = 20;
function list(items) {
  return items.length > LIST_MAX ? `${items.slice(0, LIST_MAX).join(', ')} and ${items.length - LIST_MAX} more` : items.join(', ');
}
// ---------------------------------------------------------------------------

async function main() {
  try {
    const input = await readStdin();
    // Brake: this Stop already follows a forced continuation, so never block it again.
    if (input.stop_hook_active === true) { output({}); return; }
    const root = projectRoot(input.cwd); // config + state live here, never raw cwd
    const sessionId = input.session_id;

    const cfg = loadConfig(root);
    if (!cfg.enabled) { output({}); return; } // `disable`: never block a Stop while off
    const log = statePath(root, sessionId);
    pruneOldSessions(root, log);

    const lines = readLines(log);
    const todayMid = dayOf(now().getTime());
    const stale = [], undated = [], unusable = [];
    for (const rel of pendingEdits(lines)) {
      // Re-apply scope at gate time: exclude globs and doc_type may have changed
      // AFTER the file was recorded (e.g. the doc was marked `skip` mid-session).
      if (isExcluded(rel, cfg.exclude)) continue;
      let mtimeMs;
      try { mtimeMs = statSync(join(root, rel)).mtimeMs; } catch { continue; } // deleted since the edit
      const fm = parseFm(join(root, rel));
      if (docTypeOf(fm.fields) === 'skip') continue;
      const lu = fm.fields.last_updated;
      if (!lu) { undated.push(rel); continue; }
      const stamp = parseDay(lu);
      if (!stamp) { unusable.push(`${rel} ("${lu.slice(0, 20)}" is not a YYYY-MM-DD date)`); continue; }
      if (stamp > todayMid) { unusable.push(`${rel} (${lu} is in the future)`); continue; }
      // The date is judged against the file's own modification day, not against the clock.
      const lag = Math.round((dayOf(mtimeMs) - stamp) / 86400000);
      if (lag > cfg.threshold_days) stale.push(`${rel} (${lag}d)`);
    }

    if (stale.length + undated.length + unusable.length === 0) { output({}); return; }

    // Record the ask before blocking: an ask that cannot be recorded would repeat on
    // every Stop, so an unwritable state dir means no block at all.
    if (!appendEvent(log, { ev: 'ask', seen: lines.length })) { output({}); return; }
    const parts = [];
    if (stale.length) parts.push(`Edited more than ${cfg.threshold_days} days after their \`last_updated\`: ${list(stale)}.`);
    if (undated.length) parts.push(`No \`last_updated\`: ${list(undated)}.`);
    if (unusable.length) parts.push(`Unusable \`last_updated\`: ${list(unusable)}.`);
    output({
      decision: 'block',
      reason: `docsync: docs edited this session need a look at their \`last_updated\`. ${parts.join(' ')} Where the date is missing or unusable, or your edit already brought the doc fully up to date, set \`last_updated: "${today()}"\` (quoted) and move on. Otherwise the doc needs a sync: re-check it against the code (its \`sync_procedure\`, when present, says where to look), fix what is wrong, then set the date; decide this yourself. Ask the user first only when the sync would delete or wholesale rewrite content — with the AskUserQuestion tool if it is available; if it is not, list those docs in your final message and finish without waiting for an answer. docsync raises a doc again this session only after it is edited again.`
    });
  } catch (err) {
    try { console.error(`[docsync-gate] ${err.message}`); } catch {}
    output({});
  }
}

main();
