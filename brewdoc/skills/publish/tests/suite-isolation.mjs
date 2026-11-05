#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, chmodSync, statSync, existsSync, rmSync, realpathSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const lib = join(here, '../scripts/brewpage-lib.sh');
const base = realpathSync(mkdtempSync(join(tmpdir(), 'publish-isolation-')));
const root = join(base, 'project');
const bin = join(base, 'bin');
const tmp = join(base, 'tmp');
mkdirSync(root); mkdirSync(bin); mkdirSync(tmp);
const mock = join(bin, 'curl');
writeFileSync(mock, [
  '#!/usr/bin/env node',
  'const fs = require("node:fs");',
  'const args = process.argv.slice(2);',
  'fs.writeFileSync(process.env.CURL_ARGS, JSON.stringify(args));',
  'const headers = args.filter((value, index) => args[index - 1] === "-H" && value.startsWith("@"));',
  'fs.writeFileSync(process.env.CURL_HEADERS, Buffer.concat(headers.map(value => fs.readFileSync(value.slice(1)))));',
  'fs.writeFileSync(process.env.CURL_HEADERS + ".modes", JSON.stringify(headers.map(value => fs.statSync(value.slice(1)).mode & 0o777)));',
  'const data = args[args.indexOf("-d") + 1];',
  'fs.writeFileSync(process.env.CURL_ARGS + ".payload", args.includes("-d") ? (data.startsWith("@") ? fs.readFileSync(data.slice(1)) : data) : "");',
  'process.stdout.write(process.env.CURL_RESPONSE);',
].join('\n'));
chmodSync(mock, 0o755);
// `script`: lib code, or a shipped() fill { code, env }; skill dir and path slots arrive as env refs, never in the command text.
function run(script, suffix, extraEnv = {}) {
  const { code, env } = typeof script === 'string' ? { code: script, env: {} } : script;
  return spawnSync('bash', ['-c', 'set -euo pipefail\n. "$LIB"\n' + code], {
    cwd: root, encoding: 'utf8', timeout: 10000,
    env: { ...process.env, LIB: lib, CLAUDE_SKILL_DIR: join(here, '..'), SUBST_SKILL_DIR: join(here, '..'), CLAUDE_PROJECT_DIR: root, TMPDIR: tmp,
      PATH: bin + ':' + process.env.PATH, CURL_ARGS: join(base, 'args-' + suffix), CURL_HEADERS: join(base, 'headers-' + suffix),
      CURL_RESPONSE: JSON.stringify({ link: 'https://example.invalid/result', ownerToken: 'fixture-owner' }), ...env, ...extraEnv },
  });
}
function prepare() {
  const result = run('bp_prepare', 'prepare');
  assert.equal(result.status, 0, 'GIVEN private invocation allocation succeeds');
  const dir = result.stdout.trim();
  assert.equal(statSync(dir).mode & 0o777, 0o700, 'THEN invocation directory is private');
  assert.equal(dirname(dir), tmp, 'THEN invocation directory sits under $TMPDIR, outside the protected .claude/');
  return dir;
}
function begin(dir, mode, delivery = '') {
  return "bp_begin mysite 15 '' '" + basename(dir) + "' " + mode + " '" + delivery + "'";
}
try {
  // GIVEN stale shared password WHEN explicit mode is none THEN curl receives no password.
  // The shared parent moved from .claude/tmp/ to $TMPDIR (protected-path fix); a stale file there stays inert.
  const stale = join(tmp, 'brewpage-password.txt');
  writeFileSync(stale, 'stale-password');
  const noPassword = prepare();
  const result = run(begin(noPassword, 'none') + '\nbp_post https://example.invalid/upload > /dev/null', 'none');
  assert.equal(result.status, 0, 'THEN explicit no-password request succeeds through fake curl');
  assert.deepEqual(JSON.parse(readFileSync(join(base, 'args-none'), 'utf8')), ['-s', '-X', 'POST', 'https://example.invalid/upload'],
    'THEN stale source creates no password header');
  assert.equal(readFileSync(stale, 'utf8'), 'stale-password', 'THEN unrelated shared source is preserved');
  assert.equal(existsSync(noPassword), false, 'THEN successful run cleans only its inputs');

  // GIVEN password file WHEN posting THEN curl reads exact private bytes without argv/log exposure.
  const protectedRun = prepare();
  const password = 'fixture-$(id)-пароль';
  const passwordSource = join(base, 'source-password.txt');
  writeFileSync(passwordSource, password + '\n', { mode: 0o600 });
  writeFileSync(join(protectedRun, 'brewpage-password-source.txt'), passwordSource + '\n');
  const protectedResult = run(begin(protectedRun, 'file', 'subdomain') + '\nbp_post https://example.invalid/upload > /dev/null', 'file');
  assert.equal(protectedResult.status, 0, 'THEN file password request succeeds');
  assert.equal(readFileSync(join(base, 'headers-file'), 'utf8'), 'X-Password: ' + password + '\n',
    'THEN fake curl reads exact header contents from private file');
  assert.deepEqual(JSON.parse(readFileSync(join(base, 'headers-file.modes'), 'utf8')), [0o600],
    'THEN supplied password header payload is private at consumer read time');
  assert.deepEqual(JSON.parse(readFileSync(join(base, 'args-file'), 'utf8')),
    ['-s', '-X', 'POST', 'https://example.invalid/upload', '-H', '@' + protectedRun + '/password-header.txt', '-H', 'X-Delivery-Mode: subdomain'],
    'THEN password bytes stay file-only alongside the explicit delivery header');
  assert.equal(protectedResult.stdout + protectedResult.stderr, '', 'THEN helper logs no password or response');
  assert.equal(existsSync(protectedRun), false, 'THEN password transport files are cleaned on completion');
  assert.equal(readFileSync(passwordSource, 'utf8'), password + '\n', 'THEN explicit user password source is preserved');

  // GIVEN valid delivery choices WHEN posting THEN only the creation header changes.
  for (const mode of ['path', 'subdomain']) {
    const modeRun = prepare();
    const outcome = run(begin(modeRun, 'none', mode) + '\nbp_post https://example.invalid/upload > /dev/null', mode);
    assert.equal(outcome.status, 0, 'THEN valid delivery choice succeeds');
    assert.deepEqual(JSON.parse(readFileSync(join(base, 'args-' + mode), 'utf8')),
      ['-s', '-X', 'POST', 'https://example.invalid/upload', '-H', 'X-Delivery-Mode: ' + mode],
      'THEN creation carries exact delivery header');
  }
  // GIVEN invalid delivery input WHEN beginning THEN fail before curl and clean only our run.
  const invalidRun = prepare();
  const invalid = run(begin(invalidRun, 'none', 'invalid') + ' || exit 1\nbp_post https://example.invalid/upload', 'invalid');
  assert.equal(invalid.status, 1, 'THEN invalid delivery mode fails');
  assert.equal(existsSync(join(base, 'args-invalid')), false, 'THEN invalid mode never reaches curl');
  assert.equal(existsSync(invalidRun), false, 'THEN invalid mode cleans its inputs');

  // GIVEN simultaneous shells WHEN preparing THEN each run owns a distinct directory.
  const parallel = run([
    '(r=$(bp_prepare); printf "%s\\n" "$r" > "$BP_TMPDIR/first-run"; bp_begin mysite 15 "" "${r##*/}" none; sleep 0.1) &',
    'first=$!',
    '(r=$(bp_prepare); printf "%s\\n" "$r" > "$BP_TMPDIR/second-run"; bp_begin mysite 15 "" "${r##*/}" none; sleep 0.1) &',
    'second=$!', 'wait "$first"', 'wait "$second"',
  ].join('\n'), 'parallel');
  assert.equal(parallel.status, 0, 'THEN simultaneous invocation preludes both succeed');
  const paths = ['first-run', 'second-run'].map(name => readFileSync(join(tmp, name), 'utf8').trim());
  assert.equal(new Set(paths).size, 2, 'THEN concurrent runs own distinct directories');
  assert.deepEqual(paths.map(existsSync), [false, false], 'THEN both shells clean their own invocation directories');

  // GIVEN another prepared run WHEN cancellation/failure cleans ours THEN preserve other owner.
  const cancelled = prepare();
  const other = prepare();
  writeFileSync(join(other, 'source.txt'), 'other owner');
  const cancel = run("bp_run_dir '" + basename(cancelled) + "'; bp_cleanup", 'cancel');
  assert.equal(cancel.status, 0, 'THEN pre-upload cancellation cleanup succeeds');
  assert.equal(existsSync(cancelled), false, 'THEN cancellation removes its owned directory');
  assert.equal(readFileSync(join(other, 'source.txt'), 'utf8'), 'other owner', 'THEN cancellation preserves concurrent inputs');
  const failed = prepare();
  const failure = run(begin(failed, 'file') + ' || exit 1', 'failure');
  assert.equal(failure.status, 1, 'THEN missing explicit password fails without upload');
  assert.equal(existsSync(failed), false, 'THEN failure cleans invocation inputs');
  assert.equal(readFileSync(join(other, 'source.txt'), 'utf8'), 'other owner', 'THEN failure preserves unrelated run');
  assert.equal(run("bp_run_dir '" + basename(other) + "'; bp_cleanup", 'other-cleanup').status, 0, 'THEN other owner cleans its own run');

  // GIVEN a password path that exists only relative to cwd WHEN bp_begin reads it THEN reject before copying any bytes.
  writeFileSync(join(root, 'relative-password.txt'), 'fixture-relative\n');
  const relativeRun = prepare();
  writeFileSync(join(relativeRun, 'brewpage-password-source.txt'), 'relative-password.txt\n');
  const relative = run('set +e\n' + begin(relativeRun, 'file') + '\nrc=$?\nls "$BP_RUN_DIR"\nexit "$rc"', 'relative');
  assert.deepEqual([relative.status, relative.stdout, existsSync(relativeRun), existsSync(join(base, 'args-relative'))],
    [1, 'FAILED: password file must be an absolute path\nbrewpage-password-source.txt\n', false, false],
    'THEN a cwd-relative password file fails with no transport copy, no upload, and its run is cleaned');

  const skill = readFileSync(join(here, '../SKILL.md'), 'utf8');
  assert.equal(skill.indexOf('before the first tool action') < skill.indexOf('### Step 1:'), true,
    'THEN PLAN instruction precedes all workflow actions');
  const blocks = [...skill.matchAll(/```bash\n([\s\S]*?)```/g)].map(match => match[1]);
  for (const block of blocks) assert.equal(spawnSync('bash', ['-n'], { input: block }).status, 0,
    'THEN every shipped Bash block parses');
  // Load-time substitution, then the slots the model fills (single-quoted, '\'' escaped), as { code, env }:
  // skill dir and path slots become env refs set by run().
  const quote = value => value.replaceAll("'", "'\\''");
  const PATH_SLOTS = { path: 'SUBST_PATH', password_file: 'SUBST_PASSWORD_FILE' };
  const shipped = (marker, slots) => {
    const env = {};
    const code = Object.entries(slots).reduce((text, [key, value]) => {
      if (!(key in PATH_SLOTS)) return text.replaceAll('{' + key + '}', quote(value));
      env[PATH_SLOTS[key]] = value;
      return text.replaceAll('{' + key + '}', `'"$${PATH_SLOTS[key]}"'`);
    }, blocks.find(block => block.includes(marker)).replaceAll('${CLAUDE_SKILL_DIR}', '${SUBST_SKILL_DIR}'));
    return { code, env };
  };
  const runNames = () => readdirSync(tmp).filter(name => name.startsWith('brewpage.'));
  // GIVEN actual shipped text command WHEN run with hostile text THEN argv carries it verbatim and nothing executes.
  const hostile = "Fixture it's $(touch injected) `id`; && | markdown";
  const caller = shipped("--text '{content}'", { type: 'html', ns: 'my', days: '15', delivery_mode: '', password_file: '', content: hostile });
  const callerResult = run(caller, 'caller');
  assert.equal(callerResult.status, 0, 'THEN actual shipped caller succeeds with fake curl');
  assert.deepEqual(JSON.parse(readFileSync(join(base, 'args-caller'), 'utf8')).map(arg => arg.replace(/brewpage\.[A-Za-z0-9]{6}/, 'brewpage.RUN')),
    ['-s', '-X', 'POST', 'https://brewpage.app/api/html?ns=my&ttl=15&format=markdown',
      '-H', 'Content-Type: application/json', '-d', '@' + tmp + '/brewpage.RUN/payload.json'],
    'THEN the my profile namespace reaches upload with the file-backed payload in a private run dir');
  assert.deepEqual(JSON.parse(readFileSync(join(base, 'args-caller.payload'), 'utf8')), { content: hostile },
    'THEN quote, substitution, backtick and operators reach the payload verbatim');
  assert.equal(existsSync(join(root, 'injected')), false, 'THEN nothing in the text executes');
  assert.equal(callerResult.stdout, 'OK https://example.invalid/result\n', 'THEN caller exposes URL only');
  assert.equal(callerResult.stderr, '', 'THEN caller emits no response or owner token in errors');
  assert.deepEqual(runNames(), [], 'THEN actual caller cleans its owned run');
  const history = readFileSync(join(root, '.claude/brewpage-history.md'), 'utf8');
  assert.equal(history.split('`fixture-owner`').length - 1, 1, 'THEN response owner token is consumed into history exactly once');

  // GIVEN text split into stage chunks WHEN published by run id THEN chunks rejoin with one newline.
  const first = run(shipped('stage --run', { run_id: '', chunk: 'part one' }), 'stage-1');
  assert.equal(first.status, 0, 'THEN the first stage call allocates a run: ' + first.stdout);
  const staged = first.stdout.split('\n')[0].replace('RUN: ', '');
  const second = run(shipped('stage --run', { run_id: staged, chunk: "part two's" }), 'stage-2');
  assert.equal(second.stdout, 'RUN: ' + staged + '\nBYTES: 19\n', 'THEN the second chunk appends to the same run');
  const runPublish = shipped("--password-file '{password_file}' --run '{run_id}'", { type: 'html', delivery_mode: '', password_file: '', run_id: staged });
  const badFlag = run({ ...runPublish, code: runPublish.code.replaceAll('{ns}', 'Bad NS').replaceAll('{days}', '15') }, 'staged-bad');
  assert.deepEqual([badFlag.status, badFlag.stdout, runNames()], [1, 'FAILED: namespace must be 1-32 chars of a-z0-9-\n', [staged]],
    'THEN a bad flag fails before the staged run is touched, so the text survives a retry');
  const stagedPublish = run({ ...runPublish, code: runPublish.code.replaceAll('{ns}', 'my').replaceAll('{days}', '') }, 'staged');
  assert.equal(stagedPublish.stdout, 'OK https://example.invalid/result\n', 'THEN the staged run publishes');
  assert.equal(JSON.parse(readFileSync(join(base, 'args-staged'), 'utf8'))[3], 'https://brewpage.app/api/html?ns=my&ttl=15&format=markdown',
    'THEN an empty ttl slot means the 15-day default');
  assert.deepEqual(JSON.parse(readFileSync(join(base, 'args-staged.payload'), 'utf8')), { content: "part one\npart two's" },
    'THEN the payload is both chunks joined by one newline');
  assert.deepEqual(runNames(), [], 'THEN publishing removes the staged run');
  const abandoned = run(shipped('stage --run', { run_id: '', chunk: 'drop me' }), 'stage-3').stdout.split('\n')[0].replace('RUN: ', '');
  const cleaned = run(shipped('cleanup --run', { run_id: abandoned }), 'cleanup');
  assert.deepEqual([cleaned.status, cleaned.stdout, runNames()], [0, 'CLEANED: ' + abandoned + '\n', []],
    'THEN cleanup removes an abandoned staged run');

  // GIVEN a password file WHEN the shipped text command names it THEN curl reads the header from a private file only.
  const pwRun = run(shipped("--text '{content}'", { type: 'html', ns: 'my', days: '15', delivery_mode: '', password_file: passwordSource, content: 'x' }), 'pw-shipped');
  assert.equal(pwRun.status, 0, 'THEN password publish succeeds: ' + pwRun.stdout);
  assert.equal(readFileSync(join(base, 'headers-pw-shipped'), 'utf8'), 'X-Password: ' + password + '\n',
    'THEN the password reaches curl only through the header file');
  assert.equal(JSON.parse(readFileSync(join(base, 'args-pw-shipped'), 'utf8')).some(arg => arg.includes(password)), false,
    'THEN no curl argv carries the password');

  // GIVEN a staged run WHEN the shipped publish names a bad password file THEN fail before the run is touched.
  const runPublishWith = (runId, passwordFile) => shipped("--password-file '{password_file}' --run '{run_id}'",
    { type: 'html', ns: 'my', days: '15', delivery_mode: '', password_file: passwordFile, run_id: runId });
  writeFileSync(join(base, 'short-password.txt'), 'abc\n');
  const pwStaged = run(shipped('stage --run', { run_id: '', chunk: 'keep me' }), 'pw-stage').stdout.split('\n')[0].replace('RUN: ', '');
  const badPasswords = [
    ['relative-password.txt', 'FAILED: password file must be an absolute path\n'],
    [join(base, 'missing-password.txt'), 'FAILED: password source must be a non-symlink regular file\n'],
    [join(base, 'short-password.txt'), 'FAILED: password must have at least 4 characters and no control characters\n'],
  ];
  const runFiles = id => readdirSync(tmp, { recursive: true }).filter(name => name === id || name.startsWith(id + '/')).sort();
  const pwOutcomes = badPasswords.map(([file], index) => {
    const outcome = run(runPublishWith(pwStaged, file), 'pw-slot-' + index);
    return [outcome.status, outcome.stdout, runFiles(pwStaged), existsSync(join(base, 'args-pw-slot-' + index))];
  });
  assert.deepEqual(pwOutcomes, badPasswords.map(([, message]) => [1, message, [pwStaged, pwStaged + '/brewpage-content.md'], false]),
    'THEN each password slot error leaves the staged run untouched and never uploads');
  const pwRetry = run(runPublishWith(pwStaged, passwordSource), 'pw-retry');
  assert.deepEqual([pwRetry.stdout, readFileSync(join(base, 'headers-pw-retry'), 'utf8'),
    JSON.parse(readFileSync(join(base, 'args-pw-retry.payload'), 'utf8')), runNames()],
  ['OK https://example.invalid/result\n', 'X-Password: ' + password + '\n', { content: 'keep me' }, []],
  'THEN the retry with an absolute password file publishes the surviving staged text and removes the run');

  // GIVEN mktemp yields a non-private dir (setgid parent, default ACL) WHEN a fresh run is allocated THEN it is discarded.
  const leakyBin = join(base, 'leaky-bin');
  mkdirSync(leakyBin);
  writeFileSync(join(leakyBin, 'mktemp'), '#!/bin/sh\nd="${2%XXXXXX}LEAKED"; mkdir "$d" && chmod 755 "$d" && printf \'%s\\n\' "$d"\n');
  chmodSync(join(leakyBin, 'mktemp'), 0o755);
  const leaky = { PATH: leakyBin + ':' + bin + ':' + process.env.PATH };
  const unsafeDir = 'FAILED: publish run directory must be owned, private and non-symlink\n';
  const leakStage = run(shipped('stage --run', { run_id: '', chunk: 'x' }), 'leak-stage', leaky);
  assert.deepEqual([leakStage.status, leakStage.stdout, runNames()], [1, unsafeDir, []],
    'THEN stage rejects its fresh run dir and removes it');
  const leakPublish = run(shipped("--text '{content}'", { type: 'html', ns: 'my', days: '15', delivery_mode: '', password_file: '', content: 'x' }),
    'leak-publish', leaky);
  assert.deepEqual([leakPublish.status, leakPublish.stdout, runNames(), existsSync(join(base, 'args-leak-publish'))], [1, unsafeDir, [], false],
    'THEN publish rejects its fresh run dir, removes it and never uploads');

  // GIVEN an EXISTING staged run bp_run_dir rejects WHEN publish or stage names it THEN it is neither discarded nor written.
  const kept = run(shipped('stage --run', { run_id: '', chunk: 'kept' }), 'kept-stage').stdout.split('\n')[0].replace('RUN: ', '');
  chmodSync(join(tmp, kept), 0o755);
  const keptPublish = run(runPublishWith(kept, ''), 'kept-publish');
  const keptStage = run(shipped('stage --run', { run_id: kept, chunk: 'more' }), 'kept-stage-2');
  assert.deepEqual([keptPublish.status, keptPublish.stdout, keptStage.status, keptStage.stdout,
    runFiles(kept), existsSync(join(base, 'args-kept-publish'))],
  [1, unsafeDir, 1, unsafeDir, [kept, kept + '/brewpage-content.md'], false], 'THEN the rejected existing run is neither discarded nor uploaded');
  assert.equal(readFileSync(join(tmp, kept, 'brewpage-content.md'), 'utf8'), 'kept', 'THEN its staged text is byte-identical');
  chmodSync(join(tmp, kept), 0o700);
  assert.equal(run(shipped('cleanup --run', { run_id: kept }), 'kept-cleanup').status, 0, 'THEN the owner cleans the restored run');

  // GIVEN nested site entry with query metacharacters WHEN running shipped path caller THEN encode it as one query value.
  const siteSource = join(base, 'site-source');
  const siteEntry = 'nested/hello & page.html';
  mkdirSync(join(siteSource, 'nested'), { recursive: true });
  writeFileSync(join(siteSource, siteEntry), '<h1>Fixture site</h1>');
  const siteCode = shipped("--path '{path}'", { type: 'site-dir', ns: 'public', days: '15', entry: '', delivery_mode: '', password_file: '', path: siteSource });
  const siteOutcome = run(siteCode, 'encoded-entry');
  assert.equal(siteOutcome.status, 0, 'THEN nested site archive verifies and reaches upload: ' + siteOutcome.stdout + siteOutcome.stderr);
  const siteArgs = JSON.parse(readFileSync(join(base, 'args-encoded-entry'), 'utf8'));
  assert.equal(siteArgs[3], 'https://brewpage.app/api/sites?ns=public&ttl=15&entry=' + encodeURIComponent(siteEntry),
    'THEN spaces, slash and ampersand are encoded without additional query parameters');
  assert.equal(readFileSync(join(siteSource, siteEntry), 'utf8'), '<h1>Fixture site</h1>', 'THEN authored site source stays unchanged');
  assert.deepEqual(runNames(), [], 'THEN directory caller cleans its archive and transport inputs');

  // GIVEN shipped callers and OLD/NEW winners WHEN publishing THEN exact server identity wins.
  // Standalone copies ship their own scripts: covered by suite-standalone.mjs.
  const variants = [
    { name: 'brewdoc', path: join(here, '../SKILL.md'), history: '.claude/brewpage-history.md' },
  ];
  const responses = [
    { link: 'https://fixture123.brewpage.app/', ownerToken: 'private-new-owner', ownerLink: 'https://brewpage.app/api/html/public/Fixture123',
      id: 'Fixture123', namespace: 'public', routingCohort: 'new-v1', deliveryMode: 'subdomain', modeLocked: false, hostingVersion: 1,
      createdAt: '2026-10-01T12:00:00Z', expiresAt: '2026-10-16T12:00:00Z' },
    { link: 'https://brewpage.app/public/Legacy1234', ownerToken: 'private-old-owner' },
    { link: 'https://brewpage.app/public/LegacyNull', ownerToken: 'private-null-owner', routingCohort: 'old', deliveryMode: null, hostingVersion: null },
  ];
  for (const variant of variants) {
    const source = readFileSync(variant.path, 'utf8');
    const shippedBlocks = [...source.matchAll(/```bash\n([\s\S]*?)```/g)].map(match => match[1]);
    for (const block of shippedBlocks) assert.equal(spawnSync('bash', ['-n'], { input: block }).status, 0,
      'THEN every variant Bash block parses');
    const uploadBlocks = shippedBlocks.filter(block => block.includes(' publish '));
    assert.equal(uploadBlocks.length, 3, 'THEN existing upload formats remain unchanged');
    assert.equal(uploadBlocks.every(block => block.includes("--delivery-mode '{delivery_mode}'")), true,
      'THEN every existing upload block carries the optional header');
    const html = uploadBlocks.find(block => block.includes("--text '{content}'")).replaceAll('${CLAUDE_SKILL_DIR}', '${SUBST_SKILL_DIR}')
      .replaceAll('{type}', 'html').replaceAll('{password_file}', '');
    const textCode = mode => html.replaceAll('{ns}', 'public').replaceAll('{days}', '15')
      .replaceAll('{delivery_mode}', mode).replaceAll('{content}', 'Fixture markdown');
    const modes = [['', 'default', []], ['path', 'path', ['X-Delivery-Mode: path']], ['subdomain', 'subdomain', ['X-Delivery-Mode: subdomain']]];
    for (const [mode, label, header] of modes) for (const [index, response] of responses.entries()) {
      const suffix = variant.name + '-' + label + '-' + index;
      const outcome = run(textCode(mode), suffix, { CURL_RESPONSE: JSON.stringify(response) });
      assert.equal(outcome.status, 0, 'THEN shipped HTML caller succeeds: ' + suffix + ' ' + outcome.stderr);
      assert.equal(outcome.stdout, 'OK ' + response.link + '\n', 'THEN returned winner URL retains exact root slash or OLD form');
      assert.equal(outcome.stderr, '', 'THEN caller emits no response secrets');
      const args = JSON.parse(readFileSync(join(base, 'args-' + suffix), 'utf8'));
      assert.deepEqual(args.filter(value => value.startsWith('X-Delivery-Mode:')),
        header, 'THEN only explicit requests carry a mode header even when winner differs');
      assert.deepEqual(JSON.parse(readFileSync(join(base, 'args-' + suffix + '.payload'), 'utf8')),
        { content: 'Fixture markdown' },
        'THEN routing metadata does not enter authored HTML payload');
      const privateHistory = readFileSync(join(root, variant.history), 'utf8');
      assert.equal(privateHistory.includes('[' + response.link + '](' + response.link + ')'), true,
        'THEN history stores exact server winner URL');
      assert.equal(privateHistory.includes('`' + response.ownerToken + '`'), true, 'THEN owner token stays in per-tool history');
      assert.equal(outcome.stdout.includes(response.ownerToken), false, 'THEN no token enters output');
      const identityFields = ['id', 'namespace', 'type', 'routingCohort', 'deliveryMode', 'modeLocked', 'hostingVersion', 'managementLink', 'createdAt', 'expiresAt'];
      const known = { ...Object.fromEntries(identityFields.map(key => [key, null])), ...response };
      const projection = Object.fromEntries(identityFields.map(key => [key, known[key]]));
      assert.equal(privateHistory.includes('`' + JSON.stringify(projection) + '`'), true,
        'THEN exact winner metadata and available original expiry, including OLD nulls, are retained');
    }
    // GIVEN invalid mode in the shipped HTML caller WHEN executed THEN reject before curl.
    const bad = run(textCode('invalid'), variant.name + '-invalid');
    assert.equal(bad.status, 1, 'THEN shipped invalid mode rejects');
    assert.equal(existsSync(join(base, 'args-' + variant.name + '-invalid')), false, 'THEN shipped invalid mode never uploads');

    // GIVEN a rejected response with a token WHEN rendering failure THEN reveal no response body.
    const rejected = run(textCode(''), variant.name + '-rejected', { CURL_RESPONSE: JSON.stringify({ ownerToken: 'error-private-owner' }) });
    assert.equal(rejected.stdout, 'FAILED: publish rejected (no .link in response)\n', 'THEN failure prints only its safe explanation');
    assert.equal(rejected.stderr, '', 'THEN no rejected-response token appears in errors');

    // GIVEN server error bodies and notices WHEN the shipped caller renders them THEN status + message or notices, never a token.
    const rendered = [
      [{ status: 400, error: 'Bad Request', message: 'Sites allow at most 200 files.\nRemove some.', ownerToken: 'error-private-owner' },
        1, 'FAILED: publish rejected (HTTP 400: Sites allow at most 200 files. Remove some.)\n'],
      [{ status: 408, error: 'Request Timeout', message: 'Upload was interrupted before it finished; please retry.' },
        1, 'FAILED: publish rejected (HTTP 408: Upload was interrupted before it finished; please retry.)\n'],
      [{ link: 'https://example.invalid/n', ownerToken: 'private-notice-owner', notices: [{ code: 'a', message: 'Tags were cut.' }, { code: 'b', message: 'Second.' }] },
        0, 'OK https://example.invalid/n\nNOTICE: Tags were cut.\nNOTICE: Second.\n'],
    ];
    assert.deepEqual(rendered.map(([body], i) => {
      const r = run(textCode(''), variant.name + '-reason-' + i, { CURL_RESPONSE: JSON.stringify(body) });
      return [r.status, r.stdout, r.stderr];
    }), rendered.map(([, status, stdout]) => [status, stdout, '']), 'THEN each response renders exactly its reason or notices');
  }

  // GIVEN the limits endpoint answering limits or an error WHEN the shipped limits command runs THEN exact lines or one FAILED line.
  const limitsBody = { requestMaxBytes: 26214400, sites: { maxFiles: 200, maxFileBytes: 5242880, maxTotalBytes: 20971520,
    maxArchiveExpansionBytes: 41943040, maxPathChars: 380, maxPathBytes: 900, maxNameBytes: 200, defaultTtlDays: 15 } };
  const limits = [
    [limitsBody, 0, 'REQUEST_MAX_MB: 25\nSITE_MAX_FILES: 200\nSITE_MAX_FILE_MB: 5\nSITE_MAX_TOTAL_MB: 20\n'
      + 'SITE_MAX_ARCHIVE_EXPANSION_MB: 40\nPATH_MAX_CHARS: 380\nPATH_MAX_BYTES: 900\nNAME_MAX_BYTES: 200\n'],
    [{ status: 404, error: 'Not Found', message: 'Resource not found' }, 1, 'FAILED: limits unavailable (unexpected response)\n'],
  ];
  assert.deepEqual(limits.map(([body], i) => {
    const r = run('bash "$SUBST_SKILL_DIR/scripts/brewpage-run.sh" limits', 'limits-' + i, { CURL_RESPONSE: JSON.stringify(body) });
    return [r.status, r.stdout, JSON.parse(readFileSync(join(base, 'args-limits-' + i), 'utf8'))];
  }), limits.map(([, status, stdout]) => [status, stdout, ['-s', '-A', 'ClaudeCode/1.0', 'https://brewpage.app/api/limits']]),
  'THEN limits print exact KEY: value lines from one GET, or fail on an error body');
  assert.equal(existsSync(join(root, '.claude/tmp')), false, 'THEN no run ever touched the protected project .claude/tmp');
  assert.deepEqual(readdirSync(tmp).sort(), ['brewpage-password.txt', 'first-run', 'second-run'],
    'THEN every run dir under $TMPDIR was removed; only fixture files remain');
  console.log('PASS publish isolation: credentials, concurrent ownership, mode headers, exact OLD/NEW winner URLs and shipped callers');

  // GIVEN outer/.git > h/.claude > h/notes/misc WHEN h is HOME, the config-dir parent, or plain
  // THEN the history file skips a profile h (lands under outer); plain h stays the root
  const outer = join(base, 'profile-walk');
  const h = join(outer, 'h');
  const cwdMisc = join(h, 'notes', 'misc');
  mkdirSync(join(outer, '.git'), { recursive: true });
  mkdirSync(join(h, '.claude'), { recursive: true });
  mkdirSync(cwdMisc, { recursive: true });
  const historyAs = (envOver) => {
    const env = { ...process.env, LIB: lib, HOME: join(outer, 'elsewhere'), CLAUDE_PROJECT_DIR: undefined, CLAUDE_CONFIG_DIR: undefined, ...envOver };
    const r = spawnSync('bash', ['-c', '. "$LIB"\nprintf "%s" "$HISTORY_FILE"'], { cwd: cwdMisc, encoding: 'utf8', timeout: 10000, env });
    return [r.status, r.stdout];
  };
  assert.deepEqual(
    [historyAs({ HOME: h }), historyAs({ CLAUDE_CONFIG_DIR: join(h, '.claude') }), historyAs({})],
    [[0, join(outer, '.claude', 'brewpage-history.md')], [0, join(outer, '.claude', 'brewpage-history.md')], [0, join(h, '.claude', 'brewpage-history.md')]],
    'THEN a HOME or config-dir-parent .claude is the profile: the token history never lands in the global profile',
  );
} finally {
  rmSync(base, { recursive: true, force: true });
}
