#!/usr/bin/env node
// `publish.mjs inspect`: supplied-ZIP branch, BD01 disclosure route (formerly uploaded uninspected).
// Fixtures built with real `zip` under one mkdtemp base, removed at end; no network, no upload.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, statSync, rmSync, realpathSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PUBLISH = join(HERE, '..', 'scripts', 'publish.mjs');

const BASE = realpathSync(mkdtempSync(join(tmpdir(), 'brewdoc-publish-i-')));

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

/** Build a real ZIP from {relpath: body} and return its path. */
function makeZip(name, files) {
  const src = join(BASE, `src-${name}`);
  for (const [rel, body] of Object.entries(files)) {
    mkdirSync(dirname(join(src, rel)), { recursive: true });
    writeFileSync(join(src, rel), body);
  }
  const zipPath = join(BASE, `${name}.zip`);
  const r = spawnSync('zip', ['-q', '-X', '-r', zipPath, '.'], { cwd: src, encoding: 'utf8' });
  assert.equal(r.status, 0, `GIVEN fixture zip ${name} builds: ${r.stderr}`);
  return zipPath;
}

function inspect(args, extraEnv = {}) {
  const r = spawnSync('node', [PUBLISH, 'inspect', ...args], { encoding: 'utf8', timeout: 30000, env: { ...process.env, ...extraEnv } });
  const out = r.stdout || '';
  return {
    status: r.status,
    out,
    field: (key) => {
      const m = out.match(new RegExp(`^${key}: (.*)$`, 'm'));
      return m === null ? '' : m[1];
    },
    entries: out.split('\n').filter((l) => l.startsWith('  ')).map((l) => l.slice(2)).sort(),
  };
}

// ── a clean supplied ZIP passes and its manifest is printed ─────────────────
{
  const z = makeZip('clean', {
    'index.html': '<h1>hi</h1>', 'css/site.css': 'body{}', 'assets/logo.png': 'PNG',
  });
  const r = inspect(['--zip', z]);
  check('clean.exit', r.status, 0, 'a bundle of known web assets is accepted');
  check('clean.result', r.field('RESULT'), 'ok', 'nothing needs a human decision');
  check('clean.manifest', r.entries, ['assets/logo.png', 'css/site.css', 'index.html'],
    'the manifest lists exactly the archived files, before any upload');
  check('clean.count', r.field('FILES'), '3', 'FILES matches the manifest length');
  check('clean.entry', r.field('ENTRY'), 'index.html', 'index.html wins entry auto-detection');
  check('clean.bytes', r.field('BYTES'), String(statSync(z).size), 'BYTES equals the file size on disk');
}

// ── BD01: a supplied ZIP carrying private material stops for confirmation ───
{
  const z = makeZip('dirty', {
    'index.html': '<h1>hi</h1>', '.env': 'API_KEY=sk-live-000', 'app.js.map': '{"version":3}',
  });
  const r = inspect(['--zip', z]);
  check('dirty.exit', r.status, 2, 'an unexpected entry blocks the upload pending confirmation');
  check('dirty.result', r.field('RESULT'), 'confirm', 'the caller must ask before publishing');
  check('dirty.unexpected', r.field('UNEXPECTED').split(', ').sort(), ['.env', 'app.js.map'],
    'both non-allowlisted entries are named exactly');
  check('dirty.sensitive', r.field('SENSITIVE').split(', ').sort(), ['.env', 'app.js.map'],
    'both also match the sensitive pattern');
  check('dirty.manifest', r.entries, ['.env', 'app.js.map', 'index.html'],
    'the full archive contents are shown, so the user decides on facts');
}

// ── entry resolution on a supplied ZIP ─────────────────────────────────────
{
  const z = makeZip('multi', { 'index.html': 'a', 'about.html': 'b' });
  check('entry.override', inspect(['--zip', z, '--entry', 'about.html']).field('ENTRY'), 'about.html',
    '--entry overrides index.html when it exists in the archive');
  const miss = inspect(['--zip', z, '--entry', 'nope.html']);
  check('entry.missing.exit', miss.status, 1, 'an entry absent from the archive is a hard failure');
  check('entry.missing.result', miss.field('RESULT'), 'fail', 'the failure is machine-readable');
}

// ── server pre-checks on a supplied ZIP: system files pass, hidden ones need a human, entry = shallowest HTML ──
for (const [name, files, want] of [
  ['system', { 'site/page.html': 'p', 'top.html': 't', '.DS_Store': 'd', '__MACOSX/._top.html': 'm', '.well-known/a.json': '{}' },
    [0, 'ok', 'top.html', '']],
  ['hidden', { 'index.html': 'i', '.cache/app.js': 'c', 'css/.draft.css': 'd' }, [2, 'confirm', 'index.html', '.cache/app.js, css/.draft.css']],
  ['wellknownbare', { 'index.html': 'i', '.well-known/apple-app-site-association': '{}', 'sub/README': 'r' },
    [2, 'confirm', 'index.html', 'sub/README']],
]) {
  const r = inspect(['--zip', makeZip(name, files)]);
  check(`precheck.${name}`, [r.status, r.field('RESULT'), r.field('ENTRY'), r.field('UNEXPECTED')], want,
    'GIVEN a supplied ZIP WHEN inspected THEN only hidden entries need confirmation and the entry follows the server rule');
}

// ── refusals: nothing unverified reaches curl ──────────────────────────────
{
  const empty = join(BASE, 'zero.zip');
  writeFileSync(empty, '');
  check('zero.exit', inspect(['--zip', empty]).status, 1, 'a 0-byte archive is rejected outright');

  const corrupt = join(BASE, 'corrupt.zip');
  writeFileSync(corrupt, 'not a zip at all');
  check('corrupt.exit', inspect(['--zip', corrupt]).status, 1, 'a corrupt archive fails its integrity check');

  check('missing.exit', inspect(['--zip', join(BASE, 'absent.zip')]).status, 1, 'a missing archive fails');

  const nohtml = makeZip('nohtml', { 'notes.txt': 'no pages' });
  check('nohtml.exit', inspect(['--zip', nohtml]).status, 1,
    'an archive with no .html fails instead of guessing an entry');
}

// ── failure cause: an unfinished unzip check is not a corrupt archive ───────
{
  // GIVEN a valid ZIP with a fake unzip killed by a signal first on PATH, and a corrupt ZIP with real unzip.
  const valid = makeZip('cause', { 'index.html': '<h1>hi</h1>' });
  const fake = join(BASE, 'fake-unzip-kill');
  mkdirSync(fake, { recursive: true });
  writeFileSync(join(fake, 'unzip'), '#!/bin/sh\nkill -9 $$\n', { mode: 0o755 });
  const corrupt = join(BASE, 'cause-corrupt.zip');
  writeFileSync(corrupt, 'not a zip at all');
  // WHEN both are inspected THEN the signal is named, and a non-zero unzip exit keeps the integrity message.
  const killed = inspect(['--zip', valid], { PATH: `${fake}:${process.env.PATH}` });
  const bad = inspect(['--zip', corrupt]);
  check('cause.unzip', [[killed.status, killed.out], [bad.status, bad.out]], [
    [1, 'FAILED: archive could not be checked: unzip killed by SIGKILL\nRESULT: fail\n'],
    [1, 'FAILED: archive has no valid central directory\nRESULT: fail\n'],
  ], 'a killed check and a corrupt archive get distinct, exact reasons');
}

// ── usage ──────────────────────────────────────────────────────────────────
{
  const r = spawnSync('node', [PUBLISH], { encoding: 'utf8' });
  check('usage.exit', r.status, 1, 'no mode is a failure, not a silent no-op');
  const r2 = spawnSync('node', [PUBLISH, 'inspect'], { encoding: 'utf8' });
  check('usage.zip.exit', r2.status, 1, 'inspect without --zip fails');
}

console.log('suite-inspect.mjs (inspect: BD01 supplied-ZIP branch)');
for (const line of results) console.log(line);
console.log(`  ${passed} passed, ${failed} failed`);
rmSync(BASE, { recursive: true, force: true });
process.exit(failed === 0 ? 0 : 1);
