#!/usr/bin/env node
// Standalone SITE fences through each copy's own brewpage-run.sh: real zip/unzip, real curl to a local server.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test, { after } from 'node:test';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const COPIES = [
  { name: 'skills', dir: join(ROOT, 'skills/brewpage-publish'), token: '${CLAUDE_SKILL_DIR}', userAgent: 'ClaudeCode/1.0' },
  { name: 'openclaw', dir: join(ROOT, 'openclaw/brewpage-publish'), token: '{baseDir}', userAgent: 'OpenClaw/1.0' },
];
const FIXTURE = {
  'index.html': '<h1>home</h1>',
  'assets/site.css': 'body{color:#111}',
  'nested/about.html': '<h1>about</h1>',
  '.env': 'excluded fixture',
  '.env.local': 'excluded fixture',
  '.git/config': 'excluded fixture',
  'node_modules/pkg.js': 'excluded fixture',
  '.DS_Store': 'excluded fixture',
  'Thumbs.db': 'excluded fixture',
  '.idea/workspace.xml': 'excluded fixture',
  '.vscode/settings.json': 'excluded fixture',
  '.cache/build.json': 'excluded fixture',
  'assets/site.css.map': 'excluded fixture',
  'build.log': 'excluded fixture',
  'nested/.env': 'excluded fixture',
  'nested/.env.local': 'excluded fixture',
  'nested/.git/config': 'excluded fixture',
  'nested/node_modules/pkg.js': 'excluded fixture',
  'nested/.DS_Store': 'excluded fixture',
  'nested/.idea/workspace.xml': 'excluded fixture',
  'nested/.vscode/settings.json': 'excluded fixture',
  'nested/.cache/build.json': 'excluded fixture',
};
const EXPECTED_FILES = ['assets/site.css', 'index.html', 'nested/about.html'];
const NOT_VERIFIED = 'FAILED: archive not verified (publish.mjs exit 1) — nothing was uploaded';
// Fakes `zip -q -X -@ <out>` ($4 = archive); reads the piped list to EOF like real `-@`, else exiting
// first races node's stdin write: EPIPE -> publish.mjs prints "zip failed (EPIPE)" (flaky on Linux CI).
const READ_LIST = 'cat > /dev/null\n';
const FAILURES = [
  ['zip failure', READ_LIST + 'printf partial > "$4"\nexit 3', 'FAILED: zip exited 3 — no archive produced'],
  ['empty archive', READ_LIST + ': > "$4"\nexit 0', 'FAILED: zip produced no usable archive'],
  ['corrupt archive', READ_LIST + 'printf invalid > "$4"\nexit 0', 'FAILED: archive has no valid central directory'],
];
// Unread ZIP stdin amplified by a test preload: actual OS EPIPE with a valid source tree.
const UNREAD_FAILURES = [
  ['zip exits 0 unread', 'exit 0', 'FAILED: zip failed (EPIPE) — no archive produced'],
  ['zip exits 3 unread', 'exit 3', 'FAILED: zip exited 3 — no archive produced'],
];
const confirmLine = digest => `CONFIRM: review this manifest, then re-run with --confirmed --review-sha256 ${digest}`;

const base = realpathSync(mkdtempSync(join(tmpdir(), 'standalone-archive-')));
const tmp = join(base, 'tmp');
mkdirSync(tmp);
const realCurl = process.env.BREWPAGE_TEST_REAL_CURL || spawnSync('sh', ['-c', 'command -v curl'], { encoding: 'utf8' }).stdout.trim();
const runNames = () => readdirSync(tmp).filter(name => name.startsWith('brewpage.'));
let seq = 0;

function binWith(stubs) {
  const bin = join(base, 'bin-' + (seq++));
  mkdirSync(bin);
  for (const [name, script] of Object.entries(stubs)) writeFileSync(join(bin, name), `#!/bin/bash\n${script}\n`, { mode: 0o755 });
  return bin;
}
const UPLOAD_STUB = 'printf "%s\\n" "$@" > "$TEST_BASE/curl-args"\nfor arg in "$@"; do\n  case "$arg" in archive=@*) file="${arg#archive=@}"; file="${file#\\\"}"; file="${file%\\\"}"; cp "$file" "$TEST_BASE/uploaded.zip" || exit 1 ;; esac\ndone\n'
  + 'printf %s \'{"link":"https://example.test/","fileCount":3}\'';
const REDIRECT_STUB = 'args=()\nfor a in "$@"; do args+=("${a/https:\\/\\/brewpage.app/$BP_ENDPOINT}"); done\nexec "$REAL_CURL" --disable --proxy "" "${args[@]}"';

function siteFence(copy, slots) {
  const source = readFileSync(join(copy.dir, 'SKILL.md'), 'utf8');
  const found = [...source.matchAll(/```bash\n([\s\S]*?)```/g)].map(m => m[1].replace(/\n$/, '')).filter(f => f.includes("--path '{path}'"));
  assert.equal(found.length, 1, 'GIVEN exactly one ' + copy.name + ' path fence');
  // Skill dir and {path} become env refs filled by runSync/runAsync: paths never enter the command text.
  return Object.entries(slots).reduce((code, [key, value]) => code.replaceAll('{' + key + '}', value.replaceAll("'", "'\\''")),
    found[0].replaceAll(copy.token, '${SUBST_SKILL_DIR}').replaceAll('{path}', `'"$SUBST_PATH"'`));
}
const slots = (type, extra = {}) => ({ type, ns: 'fixture', days: '7', entry: '', delivery_mode: '', password_file: '', ...extra });
function writeTree(dir, files) {
  for (const [name, content] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, name)), { recursive: true });
    writeFileSync(join(dir, name), content);
  }
}
function project(copy) {
  const dir = join(base, copy.name + '-project');
  mkdirSync(dir, { recursive: true });
  return dir;
}
function runSync(copy, code, path, bin, extraEnv = {}) {
  return spawnSync('bash', ['-c', code], { cwd: project(copy), encoding: 'utf8', timeout: 20000,
    env: { ...process.env, CLAUDE_PROJECT_DIR: project(copy), TMPDIR: tmp, PATH: bin + ':' + process.env.PATH, TEST_BASE: base,
      SUBST_SKILL_DIR: copy.dir, SUBST_PATH: path, ...extraEnv } });
}
function runAsync(copy, code, path, bin, extraEnv) {
  return new Promise((done, fail) => {
    const child = spawn('bash', ['-c', code], { cwd: project(copy), timeout: 20000,
      env: { ...process.env, CLAUDE_PROJECT_DIR: project(copy), TMPDIR: tmp, PATH: bin + ':' + process.env.PATH,
        SUBST_SKILL_DIR: copy.dir, SUBST_PATH: path, ...extraEnv } });
    let stdout = '', stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', fail);
    child.on('close', status => done({ status, stdout, stderr }));
  });
}
const lastLine = out => out.trimEnd().split('\n').pop();
const clearUpload = () => ['curl-args', 'uploaded.zip'].forEach(name => rmSync(join(base, name), { force: true }));

after(() => rmSync(base, { recursive: true, force: true }));
const pipeSite = join(base, 'pipe-site');
writeTree(pipeSite, { 'index.html': '<p>x</p>' });
const amplify = join(base, 'amplify-zip-input.cjs');
writeFileSync(amplify, `const cp=require('node:child_process'),run=cp.spawn;
cp.spawn=(bin,args,options)=>{const child=run(bin,args,options);if(bin==='zip'){const end=child.stdin.end.bind(child.stdin);child.stdin.end=input=>end(input.repeat(Math.ceil(2097152/input.length)));}return child;};
require('node:module').syncBuiltinESMExports();\n`);

for (const copy of COPIES) {
  for (const [kind, uploadSuffix] of [['site-dir', ''], ['site-zip', '.zip']]) {
    test(`${copy.name}: ${kind} sends an auto-detected hostile entry as one encoded query value through real curl`, async () => {
      // GIVEN one-page sites whose entry names carry query and shell characters, and a local HTTP server.
      const entries = ['pages/A & B.html', "pages/quote'$(touch entry-injected)`id`.html"];
      const requests = [];
      const server = createServer((request, reply) => {
        const chunks = [];
        request.on('data', chunk => chunks.push(chunk));
        request.on('end', () => {
          requests.push({ url: request.url, userAgent: request.headers['user-agent'], body: Buffer.concat(chunks) });
          reply.writeHead(200, { 'Content-Type': 'application/json' });
          reply.end(JSON.stringify({ link: 'https://example.test/', fileCount: 2 }));
        });
      });
      await new Promise(listening => server.listen(0, '127.0.0.1', listening));
      try {
        const endpoint = `http://127.0.0.1:${server.address().port}`;
        const bin = binWith({ curl: REDIRECT_STUB });
        // WHEN the shipped path fence publishes each site with the entry slot empty (auto-detect).
        const outcomes = [];
        for (const [index, entry] of entries.entries()) {
          const site = join(base, `${copy.name}-${kind}-${index}`);
          writeTree(site, { [entry]: '<h1>entry fixture</h1>' });
          const archive = site + '.zip';
          assert.equal(spawnSync('zip', ['-qr', archive, '.'], { cwd: site }).status, 0, 'GIVEN a valid fixture archive');
          outcomes.push(await runAsync(copy, siteFence(copy, slots(kind)), site + uploadSuffix, bin, { BP_ENDPOINT: endpoint, REAL_CURL: realCurl }));
        }
        // THEN each entry decodes to its original name, the copy's user agent and real ZIP bytes reach the server.
        assert.deepEqual(outcomes.map(o => [o.status, lastLine(o.stdout), o.stdout.split('\n').filter(l => l.startsWith('ENTRY: '))]),
          entries.map(entry => [0, 'OK https://example.test/ | Files: 2', ['ENTRY: ' + entry]]), 'both uploads succeed with the manifest entry');
        assert.deepEqual(requests.map(r => Object.fromEntries(new URL(r.url, endpoint).searchParams)),
          entries.map(entry => ({ ns: 'fixture', ttl: '7', entry })), 'query decoding preserves every entry character');
        assert.equal(requests[0].url, '/api/sites?ns=fixture&ttl=7&entry=pages%2FA%20%26%20B.html', 'slash, space and ampersand are percent-encoded');
        assert.deepEqual(requests.map(r => [r.userAgent, r.body.includes(Buffer.from('PK\x03\x04'))]),
          [[copy.userAgent, true], [copy.userAgent, true]], 'per-copy user agent and a real ZIP local-file signature');
        assert.deepEqual([existsSync(join(project(copy), 'entry-injected')), runNames()], [false, []], 'nothing executes, no run dir remains');
      } finally {
        await new Promise(closed => server.close(closed));
      }
    });
  }

  test(`${copy.name}: an explicit hostile --entry is refused before any upload`, () => {
    // GIVEN an entry slot with a space and an ampersand WHEN the path fence runs THEN the slot check fails first.
    const site = join(base, copy.name + '-explicit');
    writeTree(site, { 'pages/A & B.html': '<h1>x</h1>' });
    clearUpload();
    const r = runSync(copy, siteFence(copy, slots('site-dir', { entry: 'pages/A & B.html' })), site, binWith({ curl: UPLOAD_STUB }));
    assert.deepEqual([r.status, r.stdout, existsSync(join(base, 'curl-args')), runNames()],
      [1, 'FAILED: entry must be a plain relative file name\n', false, []], 'refused, curl never called');
  });

  test(`${copy.name}: built directory uploads an intact allowlisted archive`, () => {
    // GIVEN built assets plus excluded root/nested entries WHEN the path fence packs the directory.
    const site = join(base, copy.name + '-built site');
    writeTree(site, FIXTURE);
    clearUpload();
    const r = runSync(copy, siteFence(copy, slots('site-dir', { delivery_mode: 'subdomain' })), site, binWith({ curl: UPLOAD_STUB }));
    // THEN the upload holds exactly the kept files, byte-identical, and the run dir is gone.
    const archive = join(base, 'uploaded.zip');
    const listing = spawnSync('unzip', ['-Z1', archive], { encoding: 'utf8' }).stdout.trim().split('\n').filter(n => !n.endsWith('/')).sort();
    const bytes = EXPECTED_FILES.map(name => spawnSync('unzip', ['-p', archive, name], { encoding: 'utf8' }).stdout);
    const args = readFileSync(join(base, 'curl-args'), 'utf8').split('\n');
    assert.deepEqual([r.status, lastLine(r.stdout), listing, bytes, args.includes('User-Agent: ' + copy.userAgent), args.includes('X-Delivery-Mode: subdomain'),
      spawnSync('unzip', ['-tq', archive]).status, runNames(), readFileSync(join(site, '.env'), 'utf8')],
    [0, 'OK https://example.test/ | Files: 3', EXPECTED_FILES, EXPECTED_FILES.map(name => FIXTURE[name]), true, true, 0, [], 'excluded fixture'],
    'allowlisted files only, intact bytes, headers kept, run dir removed, source untouched');
  });

  for (const [failure, stub, message] of FAILURES) {
    test(`${copy.name}: ${failure} aborts before upload`, () => {
      // GIVEN zip fails or fakes success WHEN the path fence packs THEN the verifier stops curl and the run dir goes.
      const site = join(base, copy.name + '-fail-' + failure.replace(' ', '-'));
      writeTree(site, { 'index.html': '<h1>x</h1>' });
      clearUpload();
      const r = runSync(copy, siteFence(copy, slots('site-dir')), site, binWith({ curl: UPLOAD_STUB, zip: stub }));
      assert.deepEqual([r.status, r.stdout, existsSync(join(base, 'curl-args')), runNames()],
        [1, `${message}\nRESULT: fail\n${NOT_VERIFIED}\n`, false, []], 'failure explained, curl never called, run dir removed');
    });
  }

  for (const [failure, stub, message] of UNREAD_FAILURES) {
    test(`${copy.name}: ${failure} names the real cause and aborts before upload`, () => {
      // GIVEN a valid site and transport-only amplification to exceed the OS pipe/socket buffer.
      assert.deepEqual(readdirSync(pipeSite), ['index.html'], 'GIVEN source selection stays within snapshot budgets');
      clearUpload();
      // WHEN the path fence packs it THEN the cause is exact, curl never runs and the run dir goes.
      const r = runSync(copy, siteFence(copy, slots('site-dir')), pipeSite, binWith({ curl: UPLOAD_STUB, zip: stub }), { NODE_OPTIONS: `--require=${amplify}` });
      assert.deepEqual([r.status, r.stdout, existsSync(join(base, 'curl-args')), runNames()],
        [1, `${message}\nRESULT: fail\n${NOT_VERIFIED}\n`, false, []], 'real cause named, curl never called, run dir removed');
    });
  }

  test(`${copy.name}: a sensitive name needs --confirmed before upload`, () => {
    // GIVEN a kept file whose name looks secret WHEN published THEN CONFIRM (exit 2) first, upload only with --confirmed.
    const site = join(base, copy.name + '-sensitive');
    writeTree(site, { 'index.html': '<h1>x</h1>', 'secret-config.json': '{}' });
    clearUpload();
    const bin = binWith({ curl: UPLOAD_STUB });
    const command = siteFence(copy, slots('site-dir'));
    const asked = runSync(copy, command, site, bin);
    const digest = /^REVIEW_SHA256: ([0-9a-f]{64})$/m.exec(asked.stdout)?.[1];
    assert.match(digest, /^[0-9a-f]{64}$/, 'review digest accompanies the manifest');
    const askedState = [asked.status, asked.stdout.split('\n').filter(l => l.startsWith('SENSITIVE: ')), lastLine(asked.stdout), existsSync(join(base, 'curl-args')), runNames()];
    const confirmed = runSync(copy, command + ' --confirmed --review-sha256 ' + digest, site, bin);
    const listing = spawnSync('unzip', ['-Z1', join(base, 'uploaded.zip')], { encoding: 'utf8' }).stdout.trim().split('\n').sort();
    assert.deepEqual([askedState, confirmed.status, lastLine(confirmed.stdout), listing, runNames()],
      [[2, ['SENSITIVE: secret-config.json'], confirmLine(digest), false, []], 0, 'OK https://example.test/ | Files: 3', ['index.html', 'secret-config.json'], []],
      'nothing uploads until the identical command is re-run with --confirmed');
  });
}
