#!/usr/bin/env node
// Shell contract: `scripts/brewpage-lib.sh` (BD03 history location, protection, validation) + SKILL.md commands and
// `scripts/brewpage-run.sh` (BD02 values as single-quoted argv of one allow-listed command).
// Fixtures under one mkdtemp base, removed at end; no network, no upload, no real `.claude` touched.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, symlinkSync, existsSync, statSync, rmSync, realpathSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const LIB = join(HERE, '..', 'scripts', 'brewpage-lib.sh');
const SKILL = readFileSync(join(HERE, '..', 'SKILL.md'), 'utf8');
const LINES = SKILL.split('\n');

const BASE = realpathSync(mkdtempSync(join(tmpdir(), 'brewdoc-publish-s-')));
const TMP = join(BASE, 'tmp');
mkdirSync(TMP);

let passed = 0;
let failed = 0;
const results = [];

function deepEqual(a, b) {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => deepEqual(v, b[i]));
  }
  return false;
}

function check(name, actual, expected, message) {
  if (deepEqual(actual, expected)) {
    passed++;
    results.push(`  PASS  ${name}  (${message})`);
  } else {
    failed++;
    results.push(
      `  FAIL  ${name}  (${message} | actual=${JSON.stringify(actual)} expected=${JSON.stringify(expected)})`,
    );
  }
}

/** Run `code` with the lib sourced, in `cwd`, with a clean env. */
function sh(code, { cwd, env = {} } = {}) {
  // An `undefined` value unsets the variable: spawnSync drops undefined env entries.
  // Paths reach bash as env vars (T_LIB, callers' T_ARG), never spliced into the command text.
  const r = spawnSync('bash', ['-c', `. "$T_LIB"\n${code}`], {
    cwd, encoding: 'utf8', env: { ...process.env, TMPDIR: TMP, T_LIB: LIB, ...env }, timeout: 20000,
  });
  return { out: (r.stdout || '').trim(), err: (r.stderr || '').trim(), status: r.status };
}

const countLines = (re) => LINES.filter((l) => re.test(l)).length;

// GIVEN the namespace question WHEN rendering public guidance THEN benefits and the read-by-anyone warning both show.
check('skill.discovery.public', [
  'public pages, sites and files are listed in the public gallery and the sitemap, so Google, Bing and AI search can find and index them and people can discover them.',
  'Anyone can find and read a public publication: never put secrets, tokens or personal data there.',
].map((s) => SKILL.includes(s)), [true, true], 'public namespace states its discovery benefits and its exposure warning');
check('skill.discovery.obsolete', SKILL.includes('Dedicated subdomain hosts use noindex'), false,
  'the removed blanket subdomain noindex claim stays absent');

// ── BD03: project root resolution ──────────────────────────────────────────
{
  const explicit = join(BASE, 'explicit');
  mkdirSync(explicit, { recursive: true });
  check('root.env', sh('printf %s "$HISTORY_FILE"', { cwd: BASE, env: { CLAUDE_PROJECT_DIR: explicit } }).out,
    join(explicit, '.claude', 'brewpage-history.md'),
    'CLAUDE_PROJECT_DIR wins and the history file hangs off it');
}
{
  const repo = join(BASE, 'repo');
  const nested = join(repo, 'packages', 'web');
  mkdirSync(nested, { recursive: true });
  spawnSync('git', ['init', '-q', repo], { encoding: 'utf8' });
  check('root.git', sh('printf %s "$HISTORY_FILE"', { cwd: nested, env: { CLAUDE_PROJECT_DIR: undefined } }).out,
    join(repo, '.claude', 'brewpage-history.md'),
    'from a nested package the git toplevel is used, not cwd — the BD03 second-file case');
}
{
  const marked = join(BASE, 'marked');
  const deep = join(marked, 'a', 'b');
  mkdirSync(join(marked, '.claude'), { recursive: true });
  mkdirSync(deep, { recursive: true });
  check('root.walk', sh('printf %s "$HISTORY_FILE"', {
    cwd: deep, env: { CLAUDE_PROJECT_DIR: undefined, GIT_CEILING_DIRECTORIES: BASE },
  }).out, join(marked, '.claude', 'brewpage-history.md'),
  'with no git the upward .claude walk finds the project root');
}

// ── BD03: the history file is created private and kept out of git ──────────
{
  const proj = join(BASE, 'proj');
  mkdirSync(proj, { recursive: true });
  // A real repo, not a bare `.git` directory: the ignore guard asks git itself
  // (`rev-parse --git-dir`), so that it also works in worktrees and submodules.
  spawnSync('git', ['init', '-q', proj], { encoding: 'utf8' });
  const hist = join(proj, '.claude', 'brewpage-history.md');
  const gi = join(proj, '.gitignore');

  const r = sh('bp_history_init && printf %s "$HISTORY_FILE"', { cwd: proj, env: { CLAUDE_PROJECT_DIR: proj } });
  check('history.init.exit', r.status, 0, 'init succeeds on a fresh project');
  check('history.init.path', r.out, hist, 'the file is created at the project-root path');
  check('history.init.exists', existsSync(hist), true, 'the history file exists after init');
  check('history.init.mode', existsSync(hist) ? statSync(hist).mode & 0o777 : -1, 0o600,
    'the token-bearing file is owner-only — the skill used to only ask the user to keep it private');
  const readLines = (p) => (existsSync(p) ? readFileSync(p, 'utf8').split('\n').filter((l) => l !== '') : ['<missing>']);
  // Run dirs moved out of the protected .claude/ to $TMPDIR, so .claude/tmp/ is neither made nor ignored.
  check('history.init.gitignore', readLines(gi), ['.claude/brewpage-history.md'],
    'the token file is ignored, not merely documented');
  check('history.init.notmp', existsSync(join(proj, '.claude', 'tmp')), false,
    'no run-dir parent is created under the protected .claude/');

  sh('bp_history_init', { cwd: proj, env: { CLAUDE_PROJECT_DIR: proj } });
  check('history.init.idempotent', readLines(gi),
    ['.claude/brewpage-history.md'], 're-running adds no duplicate ignore lines');

  check('history.header.token', readLines(hist).join('\n').includes('X-Owner-Token: TOKEN'), true,
    'the header carries the delete recipe');

  sh('bp_history_init && bp_history_append "https://brewpage.app/public/abc" "tok-123" 15 html',
    { cwd: proj, env: { CLAUDE_PROJECT_DIR: proj } });
  const rows = readLines(hist).filter((l) => l.includes('brewpage.app/public/abc'));
  check('history.append.rows', rows.length, 1, 'exactly one row is appended per publish');
  check('history.append.shape',
    (rows[0] || '<missing>').replace(/^\| [0-9-]{10} [0-9:]{5} \|/, '| DATE |'),
    '| DATE | [https://brewpage.app/public/abc](https://brewpage.app/public/abc) | `tok-123` | 15d | html |',
    'legacy four-argument callers retain the exact history row shape');
  // GIVEN routing metadata WHEN appending THEN retain exact owner API and identity privately.
  const append = sh('bp_history_append "https://fixture123.brewpage.app/" "tok-new" 15 html "https://brewpage.app/api/html/public/Fixture123" \'{"id":"Fixture123","routingCohort":"new-v1","deliveryMode":"subdomain"}\'',
    { cwd: proj, env: { CLAUDE_PROJECT_DIR: proj } });
  check('history.append.metadata.exit', append.status, 0, 'metadata-aware append succeeds');
  const metadataRows = readLines(hist).filter(line => line.includes('fixture123.brewpage.app/'));
  check('history.append.metadata.rows', metadataRows.length, 1, 'metadata-aware append creates exactly one row');
  check('history.append.metadata.shape', metadataRows[0].replace(/^\| [0-9-]{10} [0-9:]{5} \|/, '| DATE |'),
    '| DATE | [https://fixture123.brewpage.app/](https://fixture123.brewpage.app/) | `tok-new` | 15d | html | https://brewpage.app/api/html/public/Fixture123 | `{"id":"Fixture123","routingCohort":"new-v1","deliveryMode":"subdomain"}` |',
    'NEW root slash and identity metadata are preserved without changing legacy rows');
}
{
  const bare = join(BASE, 'bare');
  mkdirSync(bare, { recursive: true });
  sh('bp_history_init', { cwd: bare, env: { CLAUDE_PROJECT_DIR: bare } });
  check('history.nogit.gitignore', existsSync(join(bare, '.gitignore')), false,
    'no .gitignore is invented in a directory that is not a git repo');
  check('history.nogit.file', existsSync(join(bare, '.claude', 'brewpage-history.md')), true,
    'the history file is still created there');
}

// ── Run dir: private mktemp under $TMPDIR, never under the protected .claude/ ──
{
  const proj = join(BASE, 'runproj');
  mkdirSync(proj, { recursive: true });
  const env = { CLAUDE_PROJECT_DIR: proj };
  const shape = (out) => out.replace(/brewpage\.[A-Za-z0-9]{6}$/, 'brewpage.XXXXXX');
  const plain = sh('r=$(bp_prepare) && printf %s "$r"', { cwd: proj, env });
  check('rundir.location', [plain.status, shape(plain.out)], [0, join(TMP, 'brewpage.XXXXXX')],
    'bp_prepare allocates directly under $TMPDIR with the brewpage.XXXXXX run-id shape');
  check('rundir.mode', statSync(plain.out).mode & 0o777, 0o700, 'the run dir is private (umask 077)');
  check('rundir.notmp', existsSync(join(proj, '.claude', 'tmp')), false,
    'allocation creates nothing under the project .claude/');
  const slash = sh('r=$(bp_prepare) && printf %s "$r"', { cwd: proj, env: { ...env, TMPDIR: TMP + '/' } });
  check('rundir.slash', shape(slash.out), join(TMP, 'brewpage.XXXXXX'),
    'a trailing slash in TMPDIR (macOS default) yields no double slash');
  check('rundir.fallback', sh('printf %s "$BP_TMPDIR"', { cwd: proj, env: { ...env, TMPDIR: undefined } }).out, '/tmp',
    'unset TMPDIR falls back to /tmp');
  const cleaned = sh('bp_run_dir "${R1##*/}" && bp_cleanup && bp_run_dir "${R2##*/}" && bp_cleanup',
    { cwd: proj, env: { ...env, R1: plain.out, R2: slash.out } });
  check('rundir.cleanup', [cleaned.status, existsSync(plain.out), existsSync(slash.out)], [0, false, false],
    'bp_cleanup removes exactly the named run dirs');
}

// ── BD02: ns / ttl / entry are validated as data ───────────────────────────
// GIVEN namespace boundaries WHEN validating THEN accept only backend-compatible values.
for (const [ns, days, entry, want, why] of [
  ['mysite', '15', '', 0, 'a plain namespace, ttl and empty entry pass'],
  ['my-site-2026', '1', 'index.html', 0, 'hyphens, digits and a bare entry pass'],
  ['abc', '365', 'sub/page.html', 0, 'a nested relative entry passes'],
  ['a', '15', '', 0, 'a 1-char namespace passes'],
  ['my', '15', '', 0, 'the 2-char my profile namespace passes'],
  ['-notes-', '15', '', 0, 'leading and trailing namespace hyphens pass'],
  ['a'.repeat(32), '15', '', 0, 'a 32-char namespace passes'],
  ['My', '15', '', 1, 'uppercase namespace letters are rejected'],
  ['', '15', '', 1, 'an empty namespace is rejected'],
  ['a'.repeat(33), '15', '', 1, 'a 33-char namespace is rejected'],
  ['my site', '15', '', 1, 'a namespace with a space is rejected'],
  ['my$(id -un)', '15', '', 1, 'a namespace carrying a command substitution is rejected'],
  ['my;rm -rf /', '15', '', 1, 'a namespace carrying a command separator is rejected'],
  ['mysite', '15x', '', 1, 'a non-integer ttl is rejected'],
  ['mysite', '0', '', 1, 'a zero ttl is rejected'],
  ['mysite', '', '', 1, 'an empty ttl is rejected'],
  ['mysite', '-3', '', 1, 'a negative ttl is rejected'],
  ['mysite', '15', '../../etc/passwd', 1, 'a traversal entry is rejected'],
  ['mysite', '15', 'a b.html', 1, 'an entry with a space is rejected'],
  ['mysite', '15', '$(id -un).html', 1, 'an entry carrying a command substitution is rejected'],
]) {
  const r = sh(`bp_validate '${ns.replace(/'/g, "'\\''")}' '${days}' '${entry}'`, { cwd: BASE });
  check(`validate.${JSON.stringify([ns, days, entry])}`, r.status, want, why);
}
{
  // GIVEN LANG=en_US.UTF-8 with LC_ALL unset WHEN validating THEN collation never widens a-z, A-Z or 0-9 (bash 3.2 did).
  const utf8 = { LANG: 'en_US.UTF-8', LC_ALL: undefined, LC_COLLATE: undefined, LC_CTYPE: undefined };
  const probe = (code, vars) => { const r = sh(code, { cwd: BASE, env: { ...utf8, ...vars } }); return [r.status, r.out]; };
  const nsMsg = 'FAILED: namespace must be 1-32 chars of a-z0-9-';
  check('validate.locale.utf8', [
    probe('bp_validate "$T_NS" 15 ""', { T_NS: 'My' }),
    probe('bp_validate "$T_NS" 15 ""', { T_NS: 'xÄ' }),
    probe('bp_validate "$T_NS" 15 ""', { T_NS: 'é' }),
    probe('bp_validate my 15 "$T_ENTRY"', { T_ENTRY: 'é.html' }),
    probe('bp_run_dir "$T_ID"', { T_ID: 'brewpage.é12345' }),
    probe('bp_validate "$T_NS" 15 "$T_ENTRY"', { T_NS: 'my-site-2026', T_ENTRY: 'Sub/Page.html' }),
  ], [
    [1, nsMsg], [1, nsMsg], [1, nsMsg],
    [1, 'FAILED: entry must be a plain relative file name'],
    [1, 'FAILED: invalid publish run id'],
    [0, ''],
  ], 'uppercase and accented letters are rejected with the exact message in a UTF-8 locale, ASCII entry letters still pass');
}
{
  // Single-quoted substitution is what keeps the value inert: proof that the
  // BD02 vector does not fire even before bp_validate sees it.
  const r = sh(`NS='p$(id -un)x'; printf %s "$NS"`, { cwd: BASE });
  check('validate.inert', r.out, 'p$(id -un)x',
    'a single-quoted substitution reaches bp_validate as literal text, unexpanded');
}
// GIVEN {password_file} slot values WHEN bp_password_check runs THEN only an absolute regular file with a valid password passes.
{
  const pw = join(BASE, 'pw');
  mkdirSync(pw);
  writeFileSync(join(pw, 'good.txt'), 'fixture-pass\n');
  writeFileSync(join(pw, 'short.txt'), 'abc\n');
  writeFileSync(join(pw, 'ctrl.txt'), 'pass\tword\n');
  symlinkSync(join(pw, 'good.txt'), join(pw, 'link.txt'));
  const notAbsolute = 'FAILED: password file must be an absolute path';
  const notRegular = 'FAILED: password source must be a non-symlink regular file';
  const invalid = 'FAILED: password must have at least 4 characters and no control characters';
  for (const [file, want, why] of [
    [join(pw, 'good.txt'), [0, ''], 'an absolute regular file with a valid password passes'],
    ['good.txt', [1, notAbsolute], 'a cwd-relative path is rejected although it exists from cwd'],
    ['./good.txt', [1, notAbsolute], 'a dot-relative path is rejected'],
    ['', [1, notAbsolute], 'an empty path is rejected'],
    [join(pw, 'missing.txt'), [1, notRegular], 'a missing file is rejected'],
    [join(pw, 'link.txt'), [1, notRegular], 'a symlink is rejected'],
    [pw, [1, notRegular], 'a directory is rejected'],
    [join(pw, 'short.txt'), [1, invalid], 'a 3-char password is rejected'],
    [join(pw, 'ctrl.txt'), [1, invalid], 'a control character (header injection) is rejected'],
  ]) {
    const r = sh('bp_password_check "$T_ARG"', { cwd: pw, env: { T_ARG: file } });
    check(`password.${JSON.stringify(file)}`, [r.status, r.out, r.err], [want[0], want[1], ''], why);
  }
}

// ── BD02/BD03: frontmatter, shipped commands and the entry script ─────────
const RUN = readFileSync(join(HERE, '..', 'scripts', 'brewpage-run.sh'), 'utf8');
const RUN_LINES = RUN.split('\n');
const countRun = (re) => RUN_LINES.filter((l) => re.test(l)).length;
const FM = LINES.slice(1, LINES.indexOf('---', 1));
check('skill.frontmatter.keys', FM.map((l) => l.split(':')[0]),
  ['name', 'description', 'user-invocable', 'disable-model-invocation', 'argument-hint', 'allowed-tools', 'model', 'license'],
  'GIVEN publish frontmatter WHEN its keys are listed THEN the house key order holds, DMI key explicit');
check('skill.frontmatter.invocation', FM.filter((l) => /^(user-invocable|disable-model-invocation|allowed-tools|license):/.test(l)), [
  'user-invocable: true',
  'disable-model-invocation: false',
  "allowed-tools: [Read, 'Bash(bash ${CLAUDE_SKILL_DIR}/scripts/brewpage-run.sh *)', AskUserQuestion, Glob]",
  'license: MIT',
], 'GIVEN publish frontmatter WHEN invocation keys are read THEN user- and model-invocable, one scoped Bash rule, no Write/Edit, license line exactly MIT');
{
  // GIVEN the one allowed-tools Bash rule WHEN every shipped bash fence is read THEN each is that single command.
  const rules = [...FM.join('\n').matchAll(/'Bash\(([^)]*) \*\)'/g)].map((m) => m[1]);
  const fences = [...SKILL.matchAll(/```bash\n([\s\S]*?)```/g)].map((m) => m[1].replace(/\n$/, ''));
  const outsideQuotes = (cmd) => cmd.replace(/'[^']*'/g, '');
  check('skill.fences.rule', [rules, fences.length, fences.map((f) => [
    f.startsWith(rules[0] + ' '), f.includes('\n'), /[;&|$`()<>"\\]/.test(outsideQuotes(f.slice(rules[0].length))),
  ])], [['bash ${CLAUDE_SKILL_DIR}/scripts/brewpage-run.sh'], 7, Array(7).fill([true, false, false])],
  'GIVEN the rule prefix WHEN each fence is checked THEN it starts with it, is one line and has no operator, quote or expansion outside single quotes');
  check('skill.fences.subcommands', fences.map((f) => f.split(' ')[2]),
    ['probe', 'limits', 'publish', 'publish', 'stage', 'publish', 'cleanup'],
    'GIVEN the shipped fences WHEN their subcommands are listed THEN probe, limits, path/text/staged publish, stage and cleanup are covered');
  check('skill.fences.slots', fences.filter((f) => f.includes(' publish ')).map((f) => [...f.matchAll(/ --([a-z-]+) '\{?([a-z_]*)\}?'/g)].map((m) => m[1] + '=' + m[2])), [
    ['ns=ns', 'ttl=days', 'entry=entry', 'delivery-mode=delivery_mode', 'password-file=password_file', 'path=path'],
    ['ns=ns', 'ttl=days', 'entry=', 'delivery-mode=delivery_mode', 'password-file=password_file', 'text=content'],
    ['ns=ns', 'ttl=days', 'entry=', 'delivery-mode=delivery_mode', 'password-file=password_file', 'run=run_id'],
  ], 'GIVEN the publish fences WHEN their flags are read THEN every value sits in a single-quoted slot');
}
check('skill.lib.sourced', countRun(/^\. "\$HERE\/brewpage-lib\.sh"$/), 1,
  'the entry script sources the lib exactly once');
check('skill.validate.called', countRun(/^  bp_begin "\$ns" "\$days" "\$entry" "\$id" "\$pwmode" "\$mode" \|\| exit 1$/), 1,
  'every publish runs the shared prelude, which validates before uploading');
check('skill.history.init', [
  sh("run=$(bp_prepare); bp_begin 'mysite' '15' '' \"${run##*/}\" none >/dev/null", { cwd: BASE, env: { CLAUDE_PROJECT_DIR: BASE } }).status,
  sh("run=$(bp_prepare); bp_begin 'my site' '15' '' \"${run##*/}\" none >/dev/null", { cwd: BASE, env: { CLAUDE_PROJECT_DIR: BASE } }).status,
], [0, 1], 'bp_begin validates and prepares the history file, and fails the block on a bad namespace');
check('skill.history.relative', countLines(/HISTORY_FILE="\.claude/) + countRun(/HISTORY_FILE="\.claude/), 0,
  'no shipped command hardcodes a cwd-relative history path');
check('skill.heredoc', (SKILL + RUN).split('BREWPAGE_EOF').length - 1, 0,
  'no content heredoc: a BREWPAGE_EOF line in the content can never close one');
check('skill.placeholders', [
  SKILL.split('{original_json}').length - 1,
  SKILL.split('{password_header}').length - 1,
  SKILL.split('{run_dir}').length - 1,
], [0, 0, 0], 'no raw JSON, password or run-dir placeholder is left in SKILL.md');
check('skill.password.file', countRun(/response=\$\(bp_post "https:\/\/brewpage\.app\/api\//), 4,
  'every upload (html, json, file, site) POSTs through bp_post, which adds the X-Password header from a file');
check('skill.payload.file', countRun(/-d @"\$(BP_RUN_DIR\/payload\.json|content)"/), 2,
  'JSON and markdown bodies are posted from files, never inlined');

// ── BD01 + BD-N03: the upload is gated on the verifier ─────────────────────
{
  const packLine = RUN_LINES.findIndex((l) => l.includes('publish.mjs" pack'));
  const inspectLine = RUN_LINES.findIndex((l) => l.includes('publish.mjs" inspect'));
  const gateLines = RUN_LINES.map((l, i) => [l, i]).filter(([l]) => l.includes('bp_archive_gate')).map(([, i]) => i);
  const curlLine = RUN_LINES.findIndex((l) => l.includes('form_file archive'));
  check('gate.calls', [packLine >= 0, inspectLine >= 0], [true, true],
    'the directory branch packs and the supplied-ZIP branch inspects');
  check('gate.curl.count', countRun(/form_file archive/), 1, 'exactly one upload line sends an archive, shared by both site types');
  check('gate.order', [packLine < gateLines[0], inspectLine < gateLines[1], gateLines[1] < curlLine], [true, true, true],
    'the manifest and the gate come before the upload line in both branches');
  check('gate.abort', countRun(/^ {8}bp_archive_gate "\$rc" "\$manifest" "(\$archive)?" \|\| exit \$\?$/), 2,
    'both branches abort through the shared gate on a non-zero verifier exit before reaching curl');
  const gateZip = join(BASE, 'gate.zip'); writeFileSync(gateZip, 'fixture');
  const digest = createHash('sha256').update('fixture').digest('hex');
  const confirm = sh('bp_archive_gate 2 "ENTRY: index.html" "$GATE_ZIP"', { cwd: BASE, env: { BREWPAGE_CONFIRMED: undefined, GATE_ZIP: gateZip } });
  const ok = sh('bp_archive_gate 0 "ENTRY: index.html" "" && printf %s "$ENTRY"', { cwd: BASE });
  check('gate.confirm', [confirm.status, confirm.out, ok.status, ok.out],
    [2, `REVIEW_SHA256: ${digest}\nCONFIRM: review this manifest, then re-run with --confirmed --review-sha256 ${digest}`, 0, 'index.html'],
    'the gate stops for confirmation on flagged entries and otherwise hands back the manifest ENTRY');
  check('gate.confirmed.flag', [countRun(/^  BREWPAGE_CONFIRMED=0$/), countRun(/--confirmed\) BREWPAGE_CONFIRMED=1; shift ;;/)], [1, 1],
    'only the --confirmed flag confirms: an inherited BREWPAGE_CONFIRMED is reset first');
  check('gate.tmpzip', countRun(/^ {8}archive="\$BP_RUN_DIR\/site\.zip"$/), 1,
    'the archive path belongs to the unique private run directory');
  check('gate.mktemp', countRun(/\$\(mktemp/), 0,
    'the entry script never calls mktemp itself — its 0-byte file is what made zip exit 3 (BD-N03)');
}

console.log('suite-skill.mjs (brewpage-lib.sh + brewpage-run.sh + SKILL.md commands)');
for (const line of results) console.log(line);
console.log(`  ${passed} passed, ${failed} failed`);
rmSync(BASE, { recursive: true, force: true });
process.exit(failed === 0 ? 0 : 1);
