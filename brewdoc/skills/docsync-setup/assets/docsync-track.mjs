#!/usr/bin/env node
// brewcode-meta: version=6.12.5 content_version=6.5.2 generated_by=brewdoc:docsync-setup

// SPDX-License-Identifier: MIT
// Copyright (c) 2025-2026 Maksim Kochetkov

// PostToolUse Write|Edit on a tracked .md: log an `edit` event; no `last_updated` -> nudge once per file per session.
// Self-contained (Node built-ins), state in <projectRoot>/.claude/docsync/; never throws, exit 0.
import { readFileSync, appendFileSync, mkdirSync, existsSync, realpathSync } from 'fs';
import { join, relative, isAbsolute, dirname, resolve, sep } from 'path';

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
// Session log: one JSON event per line, one O_APPEND write each, so parallel hooks
// never overwrite each other (the old read-modify-write of a JSON file lost entries).
function appendEvent(p, ev) {
  try {
    mkdirSync(dirname(p), { recursive: true });
    appendFileSync(p, JSON.stringify(ev) + '\n');
    return true;
  } catch (err) {
    try { console.error(`[docsync-track] state not writable: ${err.message}`); } catch {}
    return false;
  }
}
function readEvents(p) {
  let txt;
  try { txt = readFileSync(p, 'utf8'); } catch { return []; }
  return txt.split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } });
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

// Minimal glob -> RegExp: supports **/ (any dir prefix), **, *, ?.
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
      else v = v.replace(/\s+#.*$/, '').trim(); // drop trailing comment on unquoted scalar
      fields[mm[1]] = v;
    }
    return { present: true, fields };
  } catch { return { present: false, fields: {} }; }
}
// `cwd` resolves a relative tool_input path; the key itself is root-relative, so
// the Stop gate resolves it the same way no matter where the session wandered.
function relOf(cwd, root, fp) {
  const abs = isAbsolute(fp) ? fp : join(cwd, fp);
  const rel = relative(root, abs);
  return sep === '\\' ? rel.replace(/\\/g, '/') : rel; // exclude globs are written with `/`
}
// doc_type default: absent or unrecognized => 'user'. Only 'skip' removes a file from scope.
function docTypeOf(fields) {
  const v = String(fields.doc_type || '').trim().toLowerCase();
  return (v === 'llm' || v === 'user' || v === 'skip') ? v : 'user';
}
// A path is tracked when it is an in-project .md, not excluded, not doc_type: skip.
function isTracked(cwd, root, fp, cfg) {
  if (!fp || !fp.endsWith('.md')) return false;
  const rel = relOf(cwd, root, fp);
  if (!rel || /^\.\.(\/|$)/.test(rel) || isAbsolute(rel)) return false;
  if (isExcluded(rel, cfg.exclude)) return false;
  if (docTypeOf(parseFm(join(root, rel)).fields) === 'skip') return false;
  return true;
}
// ---------------------------------------------------------------------------

async function main() {
  try {
    const input = await readStdin();
    const cwd = input.cwd || process.cwd(); // relative tool_input paths ONLY
    const root = projectRoot(input.cwd);    // config + state live here
    const sessionId = input.session_id;
    const fp = input.tool_input && input.tool_input.file_path;

    const cfg = loadConfig(root);
    if (!cfg.enabled) { output({}); return; } // `disable`: registered but inert
    if (!isTracked(cwd, root, fp, cfg)) { output({}); return; }

    const rel = relOf(cwd, root, fp);
    const log = statePath(root, sessionId);
    const nudged = readEvents(log).some(e => e && e.ev === 'nudge' && e.file === rel);
    const recorded = appendEvent(log, { ev: 'edit', file: rel });

    const fm = parseFm(join(root, rel));
    // Once per file per session. A nudge that cannot be recorded would repeat, so it is skipped.
    if (!fm.fields.last_updated && !nudged && recorded && appendEvent(log, { ev: 'nudge', file: rel })) {
      output({
        hookSpecificOutput: {
          hookEventName: 'PostToolUse',
          additionalContext: `docsync: \`${rel}\` has no \`last_updated\` frontmatter. Add YAML frontmatter with \`last_updated: "${today()}"\` (quoted — unquoted a real YAML parser types it as a Date), optionally \`doc_type: llm|user|skip\` (bare, unquoted; absent = user) and \`sync_procedure: "..."\`, so staleness tracking works.`
        }
      });
      return;
    }
    output({});
  } catch (err) {
    try { console.error(`[docsync-track] ${err.message}`); } catch {}
    output({});
  }
}

main();
