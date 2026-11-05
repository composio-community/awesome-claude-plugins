#!/usr/bin/env node
// Standalone copies (skills/ + openclaw/): frontmatter, one-command fences, script drift vs brewdoc, run safety.
// Offline: fake curl, mkdtemp fixtures removed at the end.
import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '../../../..');
const REF = join(HERE, '../scripts');
const COPIES = [
  { name: 'skills', dir: join(ROOT, 'skills/brewpage-publish'), token: '${CLAUDE_SKILL_DIR}', history: '.claude/brewpage-history.md' },
  { name: 'openclaw', dir: join(ROOT, 'openclaw/brewpage-publish'), token: '{baseDir}', history: 'brewpage-history.md' },
];
const FRONTMATTER = {
  skills: [
    'name: brewpage-publish',
    'description: "Publish content to brewpage.app — text, markdown, JSON, file, or multi-file site. Asks namespace and password, returns public URL. Triggers: publish, share link, upload to brewpage, host page, brewpage, publish site, upload site, upload directory, deploy site, сделай публичную ссылку, опубликуй."',
    'user-invocable: true',
    'disable-model-invocation: false',
    'argument-hint: "<text|file_path|directory_path|zip_path> [--ttl N] [--entry filename] [--delivery-mode path|subdomain]"',
    "allowed-tools: [Read, 'Bash(bash ${CLAUDE_SKILL_DIR}/scripts/brewpage-run.sh *)', AskUserQuestion, Glob]",
    'model: haiku',
    'license: MIT',
  ],
  openclaw: [
    'name: brewpage-publish',
    'description: "Publish HTML, markdown, text, any file, or a multi-file site to brewpage.app — free hosting with no sign-up. Paste text, share a file, upload a site, or host a temporary page and get an instant public URL to share a link. Asks namespace and password, returns the public URL. Triggers: publish, publish HTML, share link, share a link, share a file, upload to brewpage, host page, host a temporary page, host a website, free hosting, paste text, instant public URL, no sign-up, brewpage, publish site, upload site, upload directory, deploy site, сделай публичную ссылку, опубликуй."',
    'homepage: https://brewpage.app',
    'user-invocable: true',
    'license: MIT',
  ],
};
// Reference text -> copy text: [from, to] pairs, each `from` present exactly once in the brewdoc script.
const RUN_LINE2 = '# brewpage-run.sh <probe|limits|stage|publish|cleanup> [flags] - the only command brewdoc:publish runs.\n';
const RUN_LINE3 = '# One allowed-tools rule covers every call; values arrive as single-quoted argv, never as shell source.\n';
const LIB_LINE3 = '# Owns token-history location (BD03) and URL-safety of prompt-derived query params (BD02).\n';
const libRootBlock = ref => ref.slice(ref.indexOf('# rc 0: $1 is HOME'), ref.indexOf('BP_TMPDIR="${TMPDIR:-/tmp}"'));
const DRIFT = {
  skills: {
    'brewpage-run.sh': () => [[RUN_LINE2, RUN_LINE2.replace('brewdoc:publish', 'brewpage-publish')]],
    'brewpage-lib.sh': () => [],
    'publish.mjs': () => [],
    'history.py': () => [],
  },
  openclaw: {
    'brewpage-run.sh': () => [
      [RUN_LINE2 + RUN_LINE3, '# brewpage-run.sh <probe|limits|stage|publish|cleanup> [flags] - the only command OpenClaw brewpage-publish runs.\n'
        + '# Values arrive as single-quoted argv, never as shell source.\n'],
      ['-H "User-Agent: ClaudeCode/1.0"', '-H "User-Agent: OpenClaw/1.0"'],
      ['-A "ClaudeCode/1.0"', '-A "OpenClaw/1.0"'],
    ],
    'brewpage-lib.sh': ref => [
      [LIB_LINE3, '# Owns token-history location (workspace cwd) and URL-safety of prompt-derived query params.\n'],
      [libRootBlock(ref), 'BP_ROOT="$PWD"\nHISTORY_FILE="$BP_ROOT/brewpage-history.md"\n'
        + '# Run dirs stay outside the workspace; only brewpage-run.sh writes into them.\n'],
    ],
    'publish.mjs': () => [],
    'history.py': () => [],
  },
};

const base = realpathSync(mkdtempSync(join(tmpdir(), 'standalone-publish-')));
const bin = join(base, 'bin');
const tmp = join(base, 'tmp');
mkdirSync(bin); mkdirSync(tmp);
writeFileSync(join(bin, 'curl'), [
  '#!/usr/bin/env node',
  'const fs = require("node:fs");',
  'const args = process.argv.slice(2);',
  'fs.writeFileSync(process.env.CURL_ARGS, JSON.stringify(args));',
  'const headers = args.filter((value, index) => args[index - 1] === "-H" && value.startsWith("@"));',
  'fs.writeFileSync(process.env.CURL_HEADERS, Buffer.concat(headers.map(value => fs.readFileSync(value.slice(1)))));',
  'const data = args[args.indexOf("-d") + 1];',
  'fs.writeFileSync(process.env.CURL_ARGS + ".payload", args.includes("-d") ? fs.readFileSync(data.slice(1)) : "");',
  'process.stdout.write(process.env.CURL_RESPONSE);',
].join('\n'), { mode: 0o755 });
const leakyBin = join(base, 'leaky-bin');
mkdirSync(leakyBin);
writeFileSync(join(leakyBin, 'mktemp'), '#!/bin/sh\nd="${2%XXXXXX}LEAKED"; mkdir "$d" && chmod 755 "$d" && printf \'%s\\n\' "$d"\n', { mode: 0o755 });
const password = 'fixture-$(id)-пароль';
const passwordSource = join(base, 'source-password.txt');
writeFileSync(passwordSource, password + '\n', { mode: 0o600 });
writeFileSync(join(base, 'short-password.txt'), 'abc\n');

const skillText = copy => readFileSync(join(copy.dir, 'SKILL.md'), 'utf8');
const frontmatter = copy => { const lines = skillText(copy).split('\n'); return lines.slice(1, lines.indexOf('---', 1)); };
const fences = copy => [...skillText(copy).matchAll(/```bash\n([\s\S]*?)```/g)].map(m => m[1].replace(/\n$/, ''));
const prefix = copy => 'bash ' + copy.token + '/scripts/brewpage-run.sh';
const projectOf = copy => join(base, copy.name + '-project');
const outFile = (copy, suffix) => join(base, copy.name + '-args-' + suffix);
const runNames = () => readdirSync(tmp).filter(name => name.startsWith('brewpage.')).sort();
const runFiles = id => readdirSync(tmp, { recursive: true }).filter(name => name === id || name.startsWith(id + '/')).sort();
const response = token => JSON.stringify({ link: 'https://example.invalid/result', ownerToken: token });

// The one fence holding `marker` as { code, env }: skill dir and path slots -> env refs (paths never enter the command text),
// other slots single-quote-escaped as the model fills them.
const PATH_SLOTS = { path: 'SUBST_PATH', password_file: 'SUBST_PASSWORD_FILE' };
function fill(copy, marker, slots) {
  const found = fences(copy).filter(f => f.includes(marker));
  assert.equal(found.length, 1, 'GIVEN exactly one ' + copy.name + ' fence contains ' + marker);
  const env = { SUBST_SKILL_DIR: copy.dir };
  const code = Object.entries(slots).reduce((text, [key, value]) => {
    if (!(key in PATH_SLOTS)) return text.replaceAll('{' + key + '}', value.replaceAll("'", "'\\''"));
    env[PATH_SLOTS[key]] = value;
    return text.replaceAll('{' + key + '}', `'"$${PATH_SLOTS[key]}"'`);
  }, found[0].replaceAll(copy.token, '${SUBST_SKILL_DIR}'));
  return { code, env };
}
function run(copy, { code, env }, suffix, extraEnv = {}, shell = ['bash', '-c']) {
  return spawnSync(shell[0], [...shell.slice(1), code], {
    cwd: projectOf(copy), encoding: 'utf8', timeout: 20000,
    env: { ...process.env, CLAUDE_PROJECT_DIR: projectOf(copy), TMPDIR: tmp, PATH: bin + ':' + process.env.PATH,
      CURL_ARGS: outFile(copy, suffix), CURL_HEADERS: outFile(copy, suffix) + '.headers', CURL_RESPONSE: response('fixture-owner'), ...env, ...extraEnv },
  });
}
const textPublish = (copy, slots) => fill(copy, "--text '{content}'", { type: 'html', ns: 'my', days: '15', delivery_mode: '', password_file: '', ...slots });
const runPublish = (copy, runId, passwordFile) => fill(copy, "--password-file '{password_file}' --run '{run_id}'",
  { type: 'html', ns: 'my', days: '15', delivery_mode: '', password_file: passwordFile, run_id: runId });
const stage = (copy, runId, chunk, suffix, extraEnv) => run(copy, fill(copy, ' stage --run', { run_id: runId, chunk }), suffix, extraEnv);
// Per-copy tool-rule case: skills scopes Bash by one rule, OpenClaw has no allowed-tools key at all.
const TOOL_RULE = {
  skills: ['the skills fence and allowed-tools rule agree', copy => assert.deepEqual([...skillText(copy).matchAll(/'Bash\(([^)]*) \*\)'/g)].map(m => m[1]),
    [prefix(copy)], 'one rule, same prefix as every fence')],
  openclaw: ['frontmatter has no allowed-tools key', copy => assert.deepEqual(frontmatter(copy).filter(line => line.startsWith('allowed-tools:')), [],
    'OpenClaw frontmatter carries no allowed-tools key')],
};

for (const copy of COPIES) {
  mkdirSync(projectOf(copy));
  spawnSync('git', ['init', '-q', projectOf(copy)]);

  test(`${copy.name}: frontmatter is exact`, () => {
    // GIVEN the shipped SKILL.md WHEN its frontmatter lines are read THEN they match the pinned contract.
    assert.deepEqual(frontmatter(copy), FRONTMATTER[copy.name], 'frontmatter lines and key order are exact');
  });

  test(`${copy.name}: every fence is one plain brewpage-run.sh command`, () => {
    // GIVEN the shipped fences WHEN each is checked THEN one line, script prefix, no operator or expansion outside single quotes.
    const all = fences(copy);
    const outsideQuotes = cmd => cmd.replace(/'[^']*'/g, '');
    assert.deepEqual(all.map(f => [f.startsWith(prefix(copy) + ' '), f.includes('\n'), /[;&|$`()<>"\\]/.test(outsideQuotes(f.slice(prefix(copy).length)))]),
      Array(7).fill([true, false, false]), 'seven single-line commands, all inert outside single-quoted slots');
    assert.deepEqual(all.map(f => f.split(' ')[2]), ['probe', 'limits', 'publish', 'publish', 'stage', 'publish', 'cleanup'],
      'probe, limits, path/text/staged publish, stage and cleanup are covered');
    assert.deepEqual(all.filter(f => f.includes(' publish ')).map(f => [f.split(' ')[3], ...[...f.matchAll(/ --([a-z-]+) '\{?([a-z_]*)\}?'/g)].map(m => m[1] + '=' + m[2])]), [
      ['{type}', 'ns=ns', 'ttl=days', 'entry=entry', 'delivery-mode=delivery_mode', 'password-file=password_file', 'path=path'],
      [{ skills: '{type}', openclaw: 'html' }[copy.name], 'ns=ns', 'ttl=days', 'entry=', 'delivery-mode=delivery_mode', 'password-file=password_file', 'text=content'],
      [{ skills: '{type}', openclaw: 'html' }[copy.name], 'ns=ns', 'ttl=days', 'entry=', 'delivery-mode=delivery_mode', 'password-file=password_file', 'run=run_id'],
    ], 'every publish value sits in a single-quoted slot');
    assert.deepEqual(['RESPONSE=$(', 'BREWPAGE_EOF', 'PASS_H', '$PASSWORD', 'tr -dc', 'mktemp', '{original_json}', '{entry_shell_quoted}']
      .filter(legacy => skillText(copy).includes(legacy)), [], 'no inline heredoc, inline password or hand-built archive is left');
  });

  test(`${copy.name}: scripts track the brewdoc reference`, () => {
    // GIVEN the brewdoc scripts WHEN the documented per-copy edits are applied THEN each copy is byte-identical.
    for (const file of ['brewpage-run.sh', 'brewpage-lib.sh', 'publish.mjs', 'history.py']) {
      const ref = readFileSync(join(REF, file), 'utf8');
      const pairs = DRIFT[copy.name][file](ref);
      assert.deepEqual(pairs.map(([from]) => ref.split(from).length - 1), pairs.map(() => 1),
        `${file}: every replaced reference region exists exactly once (a reference edit there needs a port)`);
      assert.equal(readFileSync(join(copy.dir, 'scripts', file), 'utf8'), pairs.reduce((text, [from, to]) => text.replace(from, () => to), ref),
        `${file}: copy equals the reference plus its documented edits; port the reference change`);
    }
  });

  test(`${copy.name}: ${TOOL_RULE[copy.name][0]}`, () => {
    // GIVEN the shipped frontmatter WHEN its tool rule is read THEN it matches this copy's case.
    TOOL_RULE[copy.name][1](copy);
  });

  test(`${copy.name}: probe types a markdown file and FILE publishes it as multipart`, () => {
    // GIVEN a relative .md path WHEN probed and published as FILE THEN the absolute path reaches curl -F.
    mkdirSync(join(projectOf(copy), 'notes'));
    writeFileSync(join(projectOf(copy), 'notes/report.md'), '# Report\n');
    const probe = run(copy, fill(copy, ' probe ', { path: 'notes/report.md' }), 'probe');
    const abs = join(projectOf(copy), 'notes/report.md');
    assert.deepEqual([probe.status, probe.stdout.split('\n').slice(0, 3)], [0, ['TYPE: markdown', 'PATH: ' + abs, 'BYTES: 9']],
      'probe prints type, absolute path and size');
    const published = run(copy, fill(copy, "--path '{path}'", { type: 'file', ns: 'my', days: '7', entry: '', delivery_mode: '', password_file: '', path: abs }), 'file');
    assert.deepEqual([published.status, published.stdout, JSON.parse(readFileSync(outFile(copy, 'file'), 'utf8')), runNames()],
      [0, 'OK https://example.invalid/result\n', ['-s', '-X', 'POST', 'https://brewpage.app/api/files?ns=my&ttl=7', '-F', 'file=@"' + abs + '"'], []],
      'file upload posts the exact path and leaves no run dir');
  });

  test(`${copy.name}: hostile text reaches the payload verbatim and the token only the history`, () => {
    // GIVEN text with quote, substitution, backtick and operators WHEN the text fence runs THEN nothing executes.
    const hostile = "Fixture it's $(touch injected) `id`; && | markdown";
    const r = run(copy, textPublish(copy, { content: hostile }), 'hostile', { CURL_RESPONSE: response('hostile-owner') });
    assert.deepEqual([r.status, r.stdout, r.stderr], [0, 'OK https://example.invalid/result\n', ''], 'URL only, no response or token in output');
    assert.deepEqual(JSON.parse(readFileSync(outFile(copy, 'hostile'), 'utf8')).map(arg => arg.replace(/brewpage\.[A-Za-z0-9]{6}/, 'brewpage.RUN')),
      ['-s', '-X', 'POST', 'https://brewpage.app/api/html?ns=my&ttl=15&format=markdown', '-H', 'Content-Type: application/json',
        '-d', '@' + tmp + '/brewpage.RUN/payload.json'], 'file-backed payload from a private run dir');
    assert.deepEqual(JSON.parse(readFileSync(outFile(copy, 'hostile') + '.payload', 'utf8')), { content: hostile }, 'text arrives byte-identical');
    assert.equal(existsSync(join(projectOf(copy), 'injected')), false, 'no substitution in the text ran');
    assert.deepEqual(runNames(), [], 'the run dir is removed');
    const history = join(projectOf(copy), copy.history);
    assert.deepEqual([readFileSync(history, 'utf8').split('`hostile-owner`').length - 1, statSync(history).mode & 0o777],
      [1, 0o600], 'owner token lands once in the private per-copy history file');
    assert.deepEqual(readFileSync(join(projectOf(copy), '.gitignore'), 'utf8').split('\n').filter(Boolean), [copy.history],
      'the history file is git-ignored');
  });

  test(`${copy.name}: hostile text survives zsh parsing too`, () => {
    // GIVEN the macOS Bash-tool shell WHEN zsh -f parses the filled fence THEN argv is identical to bash.
    assert.equal(spawnSync('zsh', ['-f', '--version']).error, undefined, 'GIVEN zsh on PATH (CI plugins shard installs it)');
    const hostile = "zsh it's $(touch zsh-injected) `id` *.md ~ !";
    const file = join(base, copy.name + '-case.zsh');
    const filled = textPublish(copy, { content: hostile });
    writeFileSync(file, filled.code);
    const r = run(copy, { ...filled, code: file }, 'zsh', {}, ['zsh', '-f']);
    assert.deepEqual([r.status, r.stdout, JSON.parse(readFileSync(outFile(copy, 'zsh') + '.payload', 'utf8')), existsSync(join(projectOf(copy), 'zsh-injected'))],
      [0, 'OK https://example.invalid/result\n', { content: hostile }, false], 'zsh passes the slot verbatim and runs nothing');
  });

  test(`${copy.name}: a relative password file is rejected before any run or upload`, () => {
    // GIVEN a password path that exists only relative to cwd WHEN publishing THEN fail with no run dir and no curl.
    writeFileSync(join(projectOf(copy), 'relative-password.txt'), 'fixture-relative\n');
    const r = run(copy, textPublish(copy, { password_file: 'relative-password.txt', content: 'x' }), 'relative');
    assert.deepEqual([r.status, r.stdout, runNames(), existsSync(outFile(copy, 'relative'))],
      [1, 'FAILED: password file must be an absolute path\n', [], false], 'relative path refused up front');
  });

  test(`${copy.name}: staged text survives bad password files and the retry publishes it`, () => {
    // GIVEN two staged chunks WHEN publish names bad password files THEN the run is untouched; a good one publishes.
    const first = stage(copy, '', 'part one', 'stage-1');
    const staged = first.stdout.split('\n')[0].replace('RUN: ', '');
    assert.match(staged, /^brewpage\.[A-Za-z0-9]{6}$/, 'first stage allocates a run id');
    assert.equal(stage(copy, staged, "part two's", 'stage-2').stdout, 'RUN: ' + staged + '\nBYTES: 19\n', 'second chunk appends');
    const bad = [
      ['relative-password.txt', 'FAILED: password file must be an absolute path\n'],
      [join(base, 'missing-password.txt'), 'FAILED: password source must be a non-symlink regular file\n'],
      [join(base, 'short-password.txt'), 'FAILED: password must have at least 4 characters and no control characters\n'],
    ];
    const outcomes = bad.map(([file], index) => {
      const r = run(copy, runPublish(copy, staged, file), 'pw-bad-' + index);
      return [r.status, r.stdout, runFiles(staged), existsSync(outFile(copy, 'pw-bad-' + index))];
    });
    assert.deepEqual(outcomes, bad.map(([, message]) => [1, message, [staged, staged + '/brewpage-content.md'], false]),
      'each password error leaves the staged run byte-for-byte and never uploads');
    const retry = run(copy, runPublish(copy, staged, passwordSource), 'pw-retry');
    assert.deepEqual([retry.stdout, readFileSync(outFile(copy, 'pw-retry') + '.headers', 'utf8'),
      JSON.parse(readFileSync(outFile(copy, 'pw-retry') + '.payload', 'utf8')), runNames()],
    ['OK https://example.invalid/result\n', 'X-Password: ' + password + '\n', { content: "part one\npart two's" }, []],
    'retry sends the header from a file, publishes the joined chunks and removes the run');
    assert.equal(JSON.parse(readFileSync(outFile(copy, 'pw-retry'), 'utf8')).some(arg => arg.includes(password)), false, 'no curl argv carries the password');
  });

  test(`${copy.name}: cleanup removes an abandoned staged run`, () => {
    // GIVEN a staged but cancelled run WHEN cleanup runs THEN only that run goes.
    const id = stage(copy, '', 'drop me', 'abandon').stdout.split('\n')[0].replace('RUN: ', '');
    const r = run(copy, fill(copy, ' cleanup --run', { run_id: id }), 'cleanup');
    assert.deepEqual([r.status, r.stdout, runNames()], [0, 'CLEANED: ' + id + '\n', []], 'cleanup prints the id and leaves no run');
  });

  test(`${copy.name}: a fresh run dir failing the private check is discarded`, () => {
    // GIVEN mktemp yields a non-private dir WHEN stage or publish allocates THEN it is removed and nothing uploads.
    const leaky = { PATH: leakyBin + ':' + bin + ':' + process.env.PATH };
    const unsafe = 'FAILED: publish run directory must be owned, private and non-symlink\n';
    const staged = stage(copy, '', 'x', 'leak-stage', leaky);
    const published = run(copy, textPublish(copy, { content: 'x' }), 'leak-publish', leaky);
    assert.deepEqual([staged.status, staged.stdout, published.status, published.stdout, runNames(), existsSync(outFile(copy, 'leak-publish'))],
      [1, unsafe, 1, unsafe, [], false], 'both allocations are discarded, no upload');
  });

  test(`${copy.name}: OLD/NEW winners keep the exact server identity`, () => {
    // GIVEN OLD/NEW server winners WHEN the text fence publishes per delivery mode THEN link, header and history are exact.
    const responses = [
      { link: 'https://fixture123.brewpage.app/', ownerToken: 'private-new-owner', ownerLink: 'https://brewpage.app/api/html/public/Fixture123',
        id: 'Fixture123', namespace: 'public', routingCohort: 'new-v1', deliveryMode: 'subdomain', modeLocked: false, hostingVersion: 1,
        createdAt: '2026-10-01T12:00:00Z', expiresAt: '2026-10-16T12:00:00Z' },
      { link: 'https://brewpage.app/public/Legacy1234', ownerToken: 'private-old-owner' },
      { link: 'https://brewpage.app/public/LegacyNull', ownerToken: 'private-null-owner', routingCohort: 'old', deliveryMode: null, hostingVersion: null },
    ];
    const fields = ['id', 'namespace', 'type', 'routingCohort', 'deliveryMode', 'modeLocked', 'hostingVersion', 'managementLink', 'createdAt', 'expiresAt'];
    const nulls = Object.fromEntries(fields.map(key => [key, null]));
    const modes = [['', 'default', []], ['path', 'path', ['X-Delivery-Mode: path']], ['subdomain', 'subdomain', ['X-Delivery-Mode: subdomain']]];
    const outcomes = [];
    const expected = [];
    for (const [mode, label, header] of modes) for (const [index, winner] of responses.entries()) {
      const suffix = 'winner-' + label + '-' + index;
      const r = run(copy, textPublish(copy, { ns: 'public', delivery_mode: mode, content: 'Fixture markdown' }), suffix, { CURL_RESPONSE: JSON.stringify(winner) });
      const history = readFileSync(join(projectOf(copy), copy.history), 'utf8');
      const known = { ...nulls, ...winner };
      const identity = JSON.stringify(Object.fromEntries(fields.map(key => [key, known[key]])));
      outcomes.push([r.status, r.stdout, r.stderr, JSON.parse(readFileSync(outFile(copy, suffix), 'utf8')).filter(arg => arg.startsWith('X-Delivery-Mode:')),
        JSON.parse(readFileSync(outFile(copy, suffix) + '.payload', 'utf8')),
        history.includes('[' + winner.link + '](' + winner.link + ')'), history.includes('`' + winner.ownerToken + '`'), history.includes('`' + identity + '`')]);
      expected.push([0, 'OK ' + winner.link + '\n', '', header, { content: 'Fixture markdown' }, true, true, true]);
    }
    assert.deepEqual(outcomes, expected, 'exact winner URL, header only when asked, metadata never in the payload, identity in history');
    const invalid = run(copy, textPublish(copy, { delivery_mode: 'invalid', content: 'x' }), 'winner-invalid');
    const rejected = run(copy, textPublish(copy, { content: 'x' }), 'winner-rejected', { CURL_RESPONSE: JSON.stringify({ ownerToken: 'error-private-owner' }) });
    assert.deepEqual([invalid.status, invalid.stdout, existsSync(outFile(copy, 'winner-invalid')), rejected.status, rejected.stdout, rejected.stderr,
      readFileSync(join(projectOf(copy), copy.history), 'utf8').includes('error-private-owner'), runNames()],
    [1, 'FAILED: delivery mode must be path or subdomain\n', false, 1, 'FAILED: publish rejected (no .link in response)\n', '', false, []],
    'an invalid mode never uploads; a rejected response reveals no body and stores no token');
  });
}

after(() => rmSync(base, { recursive: true, force: true }));
