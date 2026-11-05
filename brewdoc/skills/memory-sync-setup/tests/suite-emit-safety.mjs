#!/usr/bin/env node
// generate.sh emit owns exactly 5 paths (SKILL.md + 4 references); `rm -rf $TARGET && mv` deleted PARKED/KEPT user files.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, realpathSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
// GENERATE_SH=<path> runs another copy (pre-fix falsification); each case = real generator in own mkdtemp MEMORY_SYNC_ROOT.
const GEN = process.env.GENERATE_SH || join(HERE, '..', 'scripts', 'generate.sh');
const BASE = realpathSync(mkdtempSync(join(tmpdir(), 'memory-sync-emit-')));
const SKILL = '.claude/skills/memory-sync';

let passed = 0, failed = 0;
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { passed++; console.log(`  ok   ${name}`); return; }
  failed++;
  console.log(`  FAIL ${name}\n       expected ${JSON.stringify(expected)}\n       actual   ${JSON.stringify(actual)}`);
}

function run(root, mode, env = {}) {
  const e = { ...process.env, MEMORY_SYNC_ROOT: root };
  delete e.MEMORY_SYNC_FORCE;
  const r = spawnSync('bash', [GEN, mode], { cwd: root, encoding: 'utf8', env: { ...e, ...env } });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
}

function project(name) {
  const root = join(BASE, name);
  mkdirSync(root, { recursive: true });
  return root;
}

const hash = p => (existsSync(p) ? createHash('sha256').update(readFileSync(p)).digest('hex') : 'ABSENT');
// A file a mode failed to write is a FAILing assertion, never a suite crash that swallows the rest.
const read = p => (existsSync(p) ? readFileSync(p, 'utf8') : '(ABSENT)');
const write = (p, body) => { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, body); };

// ── 1. baseline emit ───────────────────────────────────────────────────────────
{
  const root = project('fresh');
  const r = run(root, 'emit');
  check('fresh emit exits 0', r.code, 0);
  check('fresh emit wrote the owned set', [
    existsSync(join(root, SKILL, 'SKILL.md')),
    existsSync(join(root, SKILL, 'references/memory-guide.md')),
    existsSync(join(root, SKILL, 'references/agent-audit.md')),
    existsSync(join(root, SKILL, 'references/hard-sync.md')),
    existsSync(join(root, SKILL, 'references/prompting-guide.md')),
  ], [true, true, true, true, true]);
  // THEN the emitted batch rules keep another setup's marker block whole (semble re-adds it on upgrade).
  const body = read(join(root, SKILL, 'SKILL.md')).split('\n');
  const at = body.findIndex(l => l.startsWith("- A block delimited by another tool's begin/end markers"));
  check('emitted SKILL.md carries the foreign marker-block rule', body.slice(at, at + 3), [
    "- A block delimited by another tool's begin/end markers (e.g. `<!-- BEGIN brewcode:semble -->` ..",
    '  `<!-- END brewcode:semble -->`) is owned by that setup, which re-creates it on upgrade: never compress, move,',
    '  dedup or delete it, both marker lines included. Dedup from the other copy; report it as `managed by <setup>`.',
  ]);
}

// ── 2. uninstall KEEPS a user file, and the next emit must not undo that ───────
{
  const root = project('kept-after-uninstall');
  run(root, 'emit');
  const note = join(root, SKILL, 'user-note.md');
  write(note, 'hand-written by the user\n');
  const before = hash(note);

  const un = run(root, 'uninstall');
  check('uninstall exits 0', un.code, 0);
  check('uninstall reports the user file as KEPT', un.out.includes('KEPT:'), true);
  check('uninstall left the user file on disk', hash(note), before);

  // Acceptance: either the emit refuses, or it succeeds with the user file byte-identical.
  const em = run(root, 'emit');
  check('post-uninstall emit did not destroy the user file', hash(note), before);
  check('post-uninstall emit resolved (refused or succeeded, never a crash)', [em.code === 0 || em.code === 1, existsSync(join(root, SKILL, 'SKILL.md')) || em.code !== 0], [true, true]);
}

// ── 3. a PARKED install is an install ──────────────────────────────────────────
{
  const root = project('parked');
  run(root, 'emit');
  const dis = run(root, 'disable');
  check('disable exits 0', dis.code, 0);
  const parked = join(root, SKILL, 'SKILL.md.disabled');
  const before = hash(parked);
  check('disable parked SKILL.md', before === 'ABSENT', false);

  const em = run(root, 'emit');
  check('emit over a parked install refuses', em.code !== 0, true);
  check('emit over a parked install names the enable path', em.out.includes('enable'), true);
  check('parked body is byte-identical after the refused emit', hash(parked), before);

  const forced = run(root, 'emit', { MEMORY_SYNC_FORCE: '1' });
  check('FORCE does not override a parked install', forced.code !== 0, true);
  check('parked body is byte-identical after the forced emit', hash(parked), before);
}

// ── 4. MEMORY_SYNC_FORCE=1 still overrides a LIVE install ──────────────────────
{
  const root = project('force');
  run(root, 'emit');
  const skill = join(root, SKILL, 'SKILL.md');
  write(skill, `${read(skill)}\nHAND EDIT\n`);
  const edited = hash(skill);

  const plain = run(root, 'emit');
  check('emit over a live install refuses', plain.code !== 0, true);
  check('refused emit left the hand-edit alone', hash(skill), edited);

  const forced = run(root, 'emit', { MEMORY_SYNC_FORCE: '1' });
  check('FORCE emit exits 0', forced.code, 0);
  check('FORCE emit overwrote the hand-edit', read(skill).includes('HAND EDIT'), false);
}

// ── 5. a FORCE emit still owns only its own 5 paths ────────────────────────────
{
  const root = project('force-keeps-foreign');
  run(root, 'emit');
  const note = join(root, SKILL, 'user-note.md');
  const nested = join(root, SKILL, 'references/user-ref.md');
  write(note, 'note\n');
  write(nested, 'nested\n');
  const [n1, n2] = [hash(note), hash(nested)];

  const forced = run(root, 'emit', { MEMORY_SYNC_FORCE: '1' });
  check('FORCE emit exits 0 with foreign files present', forced.code, 0);
  check('FORCE emit kept foreign files byte-identical', [hash(note), hash(nested)], [n1, n2]);
}

// ── 6. purge still wipes everything ────────────────────────────────────────────
{
  const root = project('purge');
  run(root, 'emit');
  write(join(root, SKILL, 'user-note.md'), 'note\n');
  const pu = run(root, 'purge');
  check('purge exits 0', pu.code, 0);
  check('purge removed the whole skill dir', existsSync(join(root, SKILL)), false);
}

// ── 7. a reference emitted under an OLDER name is swept; unowned files are not ──
{
  const root = project('stale-owned-ref');
  run(root, 'emit');
  const stale = join(root, SKILL, 'references/old-guide.md');
  const foreign = join(root, SKILL, 'references/user-ref.md');
  const note = join(root, SKILL, 'user-note.md');
  // Same provenance marker every emitted reference carries on its first line.
  write(stale, '<!-- brewcode-meta: version=5.0.0 content_version=5.0.0 generated_by=brewdoc:memory-sync-setup -->\n# Old Guide\n');
  write(foreign, 'a reference the user wrote by hand\n');
  write(note, 'note\n');
  const [f1, n1] = [hash(foreign), hash(note)];

  const forced = run(root, 'emit', { MEMORY_SYNC_FORCE: '1' });
  check('emit exits 0 with a stale owned reference present', forced.code, 0);
  check('emit removed the stale owned reference', existsSync(stale), false);
  check('emit kept unowned files byte-identical', [hash(foreign), hash(note)], [f1, n1]);
  check('emit still wrote the owned references', [
    existsSync(join(root, SKILL, 'references/memory-guide.md')),
    existsSync(join(root, SKILL, 'references/hard-sync.md')),
  ], [true, true]);
}

// ── 8. the marker STRING is not ownership - only the line-1 provenance comment is ─
// User file mentioning `generated_by=brewdoc:memory-sync-setup` or marker off line 1 was swept (substring match on head -5).
{
  const root = project('marker-mention');
  run(root, 'emit');
  const MARK = '<!-- brewcode-meta: version=5.0.0 content_version=5.0.0 generated_by=brewdoc:memory-sync-setup -->';

  const mention = join(root, SKILL, 'references/mention-in-body.md');
  const past = join(root, SKILL, 'references/past-window.md');
  const notLine1 = join(root, SKILL, 'references/not-line-1.md');
  const stale = join(root, SKILL, 'references/old-guide.md');
  write(mention, `# House notes\n\nWe use generated_by=brewdoc:memory-sync-setup markers.\n`);
  write(past, `# Long note\n${'\nfiller\n'.repeat(6)}\n${MARK}\n`);
  write(notLine1, `# Hand-written\n${MARK}\n`);
  write(stale, `${MARK}\n# Old Guide\n`);
  const before = [hash(mention), hash(past), hash(notLine1)];

  const forced = run(root, 'emit', { MEMORY_SYNC_FORCE: '1' });
  check('sweep emit exits 0 with marker-mentioning files present', forced.code, 0);
  check('files merely MENTIONING the marker survive byte-identical', [hash(mention), hash(past), hash(notLine1)], before);
  check('the genuinely owned stale ref is still swept', existsSync(stale), false);
}

// ── 9. recursive rule inventory stays consistent through scan, emit and status ──
{
  // GIVEN top-level/nested rules, an excluded dependency copy, and independently owned agents/conventions.
  const root = project('recursive-rules');
  write(join(root, 'CLAUDE.md'), '# Project\n');
  write(join(root, '.claude/rules/root.md'), '# Root rule\n');
  write(join(root, '.claude/rules/domain/nested rule.md'), '---\npaths: src/domain/**\n---\n# Scoped rule');
  write(join(root, '.claude/rules/domain/deep/leaf.md'), '# Deep rule\n');
  write(join(root, '.claude/rules/domain/readme.txt'), 'not a Markdown rule\n');
  write(join(root, '.claude/rules/node_modules/copy.md'), '# Excluded dependency\n');
  write(join(root, '.claude/agents/review/expert.md'), '---\nname: expert\ndescription: Review domain\n---\n');
  write(join(root, '.claude/convention/root.md'), '# Convention\n');
  write(join(root, '.claude/convention/nested/out.md'), '# Outside single-level convention scope\n');
  const rulePaths = ['.claude/rules/domain/deep/leaf.md', '.claude/rules/domain/nested rule.md', '.claude/rules/root.md'];
  const before = rulePaths.map(p => hash(join(root, p)));

  // WHEN the real producer scans, emits its consumer and reports live status.
  const scan = run(root, 'scan');
  check('recursive rules scan exits 0', scan.code, 0);
  check('scan lists every recursive rule exactly once in path order',
    scan.out.split('\n').filter(l => l.startsWith('.claude/rules/')).map(l => l.split(' :: ')[0]), rulePaths);
  check('nested rule metadata and unterminated final line survive scanning',
    scan.out.split('\n').find(l => l.startsWith(rulePaths[1] + ' :: ')),
    '.claude/rules/domain/nested rule.md :: 4 lines :: src/domain/**');
  const expected = '6 files: 1 root, 0 nested CLAUDE.md, 0 AGENTS.md, 3 rules, 1 conventions, 1 agents, 0 skill files';
  check('scan counts recursive rules without top-level double counting',
    scan.out.split('\n').find(l => l.startsWith('SURFACE_COUNTS=')), `SURFACE_COUNTS=${expected}`);
  const emit = run(root, 'emit');
  check('recursive-rule emit exits 0', emit.code, 0);
  check('emitted consumer stamps the same complete inventory',
    read(join(root, SKILL, 'SKILL.md')).split('\n').find(l => l.startsWith('surface_files:')), `surface_files: "${expected}"`);
  // Agent check 9 reads "exists" from the emitted roster probe: a nested agent must be listed.
  const probe = read(join(root, SKILL, 'references/agent-audit.md')).split('\n').find(l => l.endsWith('# roster'));
  write(join(root, 'roster.sh'), `${probe}\n`);
  const roster = spawnSync('bash', [join(root, 'roster.sh')], { cwd: root, encoding: 'utf8' });
  check('emitted roster probe lists the nested agent', roster.stdout.split('\n').filter(l => l.startsWith('.claude/agents/')),
    ['.claude/agents/review/expert.md']);
  const status = run(root, 'status');
  check('recursive-rule status exits 0', status.code, 0);
  check('status agrees on live and emitted counts without self-inventory drift',
    status.out.split('\n').filter(l => /^SURFACE_FILES_(NOW|STAMPED)=/.test(l)),
    ['SURFACE_FILES_NOW=6', 'SURFACE_FILES_STAMPED=6']);
  check('status keys remain unique for key-value consumers',
    status.out.trim().split('\n').map(l => l.split('=')[0]).length,
    new Set(status.out.trim().split('\n').map(l => l.split('=')[0])).size);
  // THEN scan/status/emit did not mutate the source rules or independently owned files.
  check('source rule bytes remain unchanged', rulePaths.map(p => hash(join(root, p))), before);
  check('single-level convention ownership remains unchanged', read(join(root, '.claude/convention/nested/out.md')),
    '# Outside single-level convention scope\n');
}

// ── 10. auto memory follows the active profile (CLAUDE_CONFIG_DIR) ─────────────
{
  // GIVEN a profile dir holding this project's memory and a HOME without one.
  const root = project('profile-memory');
  const home = join(BASE, 'profile-home');
  const cfg = join(BASE, 'profile-cfg');
  const mem = join(cfg, 'projects', root.replaceAll('/', '-'), 'memory');
  mkdirSync(join(home, '.claude'), { recursive: true });
  mkdirSync(mem, { recursive: true });
  // WHEN scan runs under that profile, then with the profile unset.
  const line = out => out.split('\n').find(l => l.startsWith('MEMORY_DIR='));
  const profiled = run(root, 'scan', { HOME: home, CLAUDE_CONFIG_DIR: cfg });
  const unset = run(root, 'scan', { HOME: home, CLAUDE_CONFIG_DIR: '' });
  // THEN the profile's memory dir is reported, and only under that profile.
  check('scan reports the active profile memory dir', [profiled.code, line(profiled.out), unset.code, line(unset.out)],
    [0, `MEMORY_DIR=${mem}`, 0, 'MEMORY_DIR=none']);
}

// ── 11. validate checks only the skill's OWN references/*.md citations ────────
{
  const refLines = out => out.split('\n').filter(l => /references consistent|cites |never cited/.test(l));
  const ok = '✅ references consistent both ways (every citation resolves, every emitted reference is cited)';
  const skill = root => join(root, SKILL, 'SKILL.md');

  // GIVEN an emitted skill that mentions another skill's reference and a docs `.mdx` page.
  const foreign = project('validate-foreign-refs');
  run(foreign, 'emit');
  write(skill(foreign), `${read(skill(foreign))}\nSee \`.claude/skills/docs/references/review-prompt.md\`, docs/references/x.md and \`references/mdx-template.mdx\`.\n`);
  // WHEN validate runs THEN neither mention is read as a missing own file (the only error left: 2 open BLOCKs).
  const v1 = run(foreign, 'validate');
  check('foreign and .mdx reference mentions are not own citations', [v1.code, refLines(v1.out)], [1, [ok]]);

  // GIVEN own citations of absent files in the three own spellings.
  const own = project('validate-own-missing');
  run(own, 'emit');
  const n = read(skill(own)).split('\n').length;
  write(skill(own), `${read(skill(own))}Own: references/missing.md. \`.claude/skills/memory-sync/references/gone.md\`, \${CLAUDE_SKILL_DIR}/references/nope.md\n`);
  const v2 = run(own, 'validate');
  check('own citations of absent files still fail with their line', [v2.code, refLines(v2.out)], [4, [
    `❌ FAILED: ${SKILL}/SKILL.md:${n}: cites references/gone.md which does not exist`,
    `❌ FAILED: ${SKILL}/SKILL.md:${n}: cites references/missing.md which does not exist`,
    `❌ FAILED: ${SKILL}/SKILL.md:${n}: cites references/nope.md which does not exist`,
  ]]);

  // GIVEN an emitted reference mentioned only under ANOTHER dir's references/.
  const uncited = project('validate-foreign-only-cite');
  run(uncited, 'emit');
  write(skill(uncited), read(skill(uncited)).replaceAll('references/prompting-guide.md', 'docs/references/prompting-guide.md'));
  const v3 = run(uncited, 'validate');
  check('a foreign-dir mention does not count as citing an emitted reference', [v3.code, refLines(v3.out)], [2, [
    `❌ FAILED: ${SKILL}/references/prompting-guide.md is emitted but never cited by ${SKILL}/SKILL.md`,
  ]]);
}

// ── 12. scan reads frontmatter `paths:` in inline AND YAML block-list form ─────
{
  // GIVEN rules covering every `paths:` spelling plus a body-only `paths:` line.
  const root = project('scan-paths-forms');
  write(join(root, '.claude/rules/a-block.md'), '---\npaths:\n  - "src/a/**"\n  - "src/b/**"\n---\n# Block\n');
  write(join(root, '.claude/rules/b-flush.md'), '---\npaths:\n- src/c/**\n\n  # note\n- src/d/**\ndescription: x\n---\n# Flush\n');
  write(join(root, '.claude/rules/c-flow.md'), '---\npaths: ["src/e/**", "src/f/**"]\n---\n# Flow\n');
  write(join(root, '.claude/rules/d-scalar.md'), '---\npaths: src/g/**\n---\n# Scalar\n');
  write(join(root, '.claude/rules/e-body.md'), '# Body only\n\npaths: not/frontmatter/**\n');
  // WHEN scan runs.
  const scan = run(root, 'scan');
  // THEN each rule reports its real globs; a body line is not frontmatter.
  check('scan renders every paths: form', [scan.code, scan.out.split('\n').filter(l => l.startsWith('.claude/rules/'))], [0, [
    '.claude/rules/a-block.md :: 6 lines :: ["src/a/**", "src/b/**"]',
    '.claude/rules/b-flush.md :: 9 lines :: [src/c/**, src/d/**]',
    '.claude/rules/c-flow.md :: 4 lines :: ["src/e/**", "src/f/**"]',
    '.claude/rules/d-scalar.md :: 4 lines :: src/g/**',
    '.claude/rules/e-body.md :: 3 lines :: (no paths:)',
  ]]);
}

// GIVEN outer/CLAUDE.md > h/.claude > h/notes/misc, no git WHEN h is HOME, the config-dir parent, or plain
// THEN the root-like-ancestor refusal skips a profile h and names outer; plain h is named
{
  const outer = project('profile-walk');
  const h = join(outer, 'h');
  const cwd = join(h, 'notes', 'misc');
  write(join(outer, 'CLAUDE.md'), '# outer\n');
  mkdirSync(join(h, '.claude'), { recursive: true });
  mkdirSync(cwd, { recursive: true });
  const refusalAs = (envOver) => {
    const env = { ...process.env, HOME: join(outer, 'elsewhere'), ...envOver };
    delete env.MEMORY_SYNC_ROOT;
    delete env.MEMORY_SYNC_FORCE;
    if (!envOver.CLAUDE_CONFIG_DIR) delete env.CLAUDE_CONFIG_DIR;
    const r = spawnSync('bash', [GEN, 'status'], { cwd, encoding: 'utf8', env });
    return [r.status, `${r.stdout}${r.stderr}`.split('\n')[0]];
  };
  const refusal = (up) => [1, `❌ FAILED: ${cwd} is not a repo root (no git, but ${up} looks like one).`];
  check('root refusal skips a profile parent (HOME, config-dir parent) but names a plain .claude ancestor',
    [refusalAs({ HOME: h }), refusalAs({ CLAUDE_CONFIG_DIR: join(h, '.claude') }), refusalAs({})],
    [refusal(outer), refusal(outer), refusal(h)]);
}

// ── 13. run-artifact snapshots and worktree checkouts never inflate the surface ──
{
  // GIVEN one real nested CLAUDE.md beside snapshot copies under .claude/reports and a worktree checkout (brewai-hub: 377 copies).
  const root = project('reports-worktrees');
  write(join(root, 'CLAUDE.md'), '# Project\n');
  write(join(root, 'app/CLAUDE.md'), '# App\n');
  write(join(root, '.claude/rules/r.md'), '# Rule\n');
  write(join(root, '.claude/reports/20261006-124907_audit/snap/CLAUDE.md'), '# Snapshot\n');
  write(join(root, '.claude/reports/20261006-124907_audit/AGENTS.md'), '# Snapshot\n');
  write(join(root, '.claude/reports/20261006-124907_audit/.claude/rules/copy.md'), '# Snapshot rule\n');
  write(join(root, '.claude/worktrees/feat/CLAUDE.md'), '# Checkout\n');
  write(join(root, '.claude/worktrees/feat/app/CLAUDE.md'), '# Checkout\n');
  const expected = '3 files: 1 root, 1 nested CLAUDE.md, 0 AGENTS.md, 1 rules, 0 conventions, 0 agents, 0 skill files';

  // WHEN scan runs, then emit with a hand-written SURFACE_COUNTS export, then status.
  const scan = run(root, 'scan');
  const emit = run(root, 'emit', { SURFACE_COUNTS: '78 files: 2 root, 12 memory-dir notes, 1 team roster' });
  const status = run(root, 'status');
  const line = (out, re) => out.split('\n').filter(l => re.test(l));

  // THEN all three count the same 3 files and status reports no surface drift.
  check('scan prunes .claude/reports and .claude/worktrees', line(scan.out, /^SURFACE_COUNTS=/), [`SURFACE_COUNTS=${expected}`]);
  check('emit stamps the derived count, not the exported one',
    [emit.code, line(read(join(root, SKILL, 'SKILL.md')), /^surface_files:/)], [0, [`surface_files: "${expected}"`]]);
  check('status sees no phantom surface move',
    [status.code, line(status.out, /^(SURFACE_FILES_NOW|SURFACE_FILES_STAMPED|NOTE_SURFACE)=/)],
    [0, ['SURFACE_FILES_NOW=3', 'SURFACE_FILES_STAMPED=3']]);
}

rmSync(BASE, { recursive: true, force: true });
console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'}  passed=${passed} failed=${failed}`);
process.exit(failed === 0 ? 0 : 1);
