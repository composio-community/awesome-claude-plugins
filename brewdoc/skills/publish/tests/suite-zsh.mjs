#!/usr/bin/env node
// Shipped SKILL.md commands as zsh -f (macOS Bash-tool shell) parses them: quoting rule, argv, archive branches.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, chmodSync, statSync, existsSync, rmSync, realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

assert.equal(spawnSync('zsh', ['-f', '--version']).error, undefined, 'GIVEN zsh on PATH (CI plugins shard installs it)');

const skillDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const base = realpathSync(mkdtempSync(join(tmpdir(), 'publish-zsh-')));
const root = join(base, 'project');
const bin = join(base, 'bin');
const tmp = join(base, 'tmp');
mkdirSync(root); mkdirSync(bin); mkdirSync(tmp);
const curl = join(bin, 'curl');
writeFileSync(curl, [
  '#!/usr/bin/env node',
  'const fs = require("node:fs");',
  'const args = process.argv.slice(2);',
  'const files = {};',
  'for (const a of args) { const m = /^(?:[a-z]+=)?@(.+)$/.exec(a); if (m) { const p = m[1].startsWith("\\\"") ? JSON.parse(m[1]) : m[1]; files[p] = fs.existsSync(p) ? fs.readFileSync(p).length : null; } }',
  'const d = args.includes("-d") ? args[args.indexOf("-d") + 1].slice(1) : "";',
  'const payload = d && fs.existsSync(d) ? fs.readFileSync(d, "utf8") : null;',
  'fs.writeFileSync(process.env.CURL_LOG, JSON.stringify({ args, files, payload }));',
  'process.stdout.write(process.env.CURL_RESPONSE);',
].join('\n'));
chmodSync(curl, 0o755);

const skill = readFileSync(join(skillDir, 'SKILL.md'), 'utf8');
// Load-time substitution of the skill dir, as Claude Code does it before the model sees the body.
const blocks = [...skill.matchAll(/```bash\n([\s\S]*?)```/g)].map(m => m[1].replaceAll('${CLAUDE_SKILL_DIR}', skillDir));
function shipped(marker) {
  const found = blocks.filter(b => b.includes(marker));
  assert.equal(found.length, 1, 'GIVEN exactly one shipped command contains ' + marker);
  return found[0];
}
const commands = { text: shipped("--text '{content}'"), path: shipped("--path '{path}'"), probe: shipped(' probe ') };
const response = JSON.stringify({ link: 'https://fixture.brewpage.app/', ownerToken: 'zsh-owner', fileCount: 3 });
const escape = value => value.replaceAll("'", "'\\''");
let seq = 0;

function fill(command, slots, quoteRule = escape) {
  return Object.entries(slots).reduce((code, [key, value]) => code.replaceAll('{' + key + '}', quoteRule(value)), command);
}
function zsh(code) {
  const file = join(base, 'case-' + (seq++) + '.zsh');
  const log = join(base, 'curl-' + seq + '.json');
  writeFileSync(file, code);
  const result = spawnSync('zsh', ['-f', file], {
    cwd: root, encoding: 'utf8', timeout: 20000,
    env: { ...process.env, CLAUDE_PROJECT_DIR: root, TMPDIR: tmp + '/', PATH: bin + ':' + process.env.PATH, CURL_LOG: log, CURL_RESPONSE: response },
  });
  return { result, log };
}
const curlOf = run => JSON.parse(readFileSync(run.log, 'utf8'));
const runDirs = () => readdirSync(tmp).filter(name => name.startsWith('brewpage.'));
const normalize = values => values.map(value => value.replace(/brewpage\.[A-Za-z0-9]{6}/, 'brewpage.RUN'));
function manifest(zipName, bytes) {
  return ['ARCHIVE MANIFEST — ' + zipName, '  index.html', '  sub/page.html', '  sub/style.css', 'FILES: 3',
    'BYTES: ' + bytes, 'ENTRY: sub/page.html', 'SKIPPED: 0', 'RESULT: ok'].join('\n') + '\n';
}

try {
  const site = join(base, 'site');
  mkdirSync(join(site, 'sub'), { recursive: true });
  writeFileSync(join(site, 'index.html'), '<h1>home</h1>');
  writeFileSync(join(site, 'sub/page.html'), '<h1>page</h1>');
  writeFileSync(join(site, 'sub/style.css'), 'h1{}');
  const fixtureZip = join(base, 'fixture.zip');
  const packed = spawnSync('node', [join(skillDir, 'scripts/publish.mjs'), 'pack', '--dir', site, '--out', fixtureZip], { encoding: 'utf8' });
  assert.equal(packed.status, 0, 'GIVEN the fixture zip packs: ' + packed.stdout);
  const fixtureBytes = statSync(fixtureZip).size;
  const common = { ns: 'public', days: '15', delivery_mode: '', password_file: '' };

  // GIVEN hostile multi-line text quoted per the rule WHEN zsh -f parses the shipped command THEN argv is verbatim, nothing runs.
  const hostile = "Fixture it's $(touch injected) `touch ticked`; && | > out\nline two\n";
  const text = zsh(fill(commands.text, { ...common, type: 'html', content: hostile }));
  assert.equal(text.result.status, 0, 'THEN the zsh text command exits 0: ' + text.result.stdout + text.result.stderr);
  assert.deepEqual([text.result.stdout, text.result.stderr], ['OK https://fixture.brewpage.app/\n', ''],
    'THEN the zsh text command prints only the URL line');
  const textCurl = curlOf(text);
  assert.deepEqual({ ...textCurl, args: normalize(textCurl.args), files: Object.keys(textCurl.files).length },
    { args: ['-s', '-X', 'POST', 'https://brewpage.app/api/html?ns=public&ttl=15&format=markdown', '-H', 'Content-Type: application/json',
      '-d', '@' + tmp + '/brewpage.RUN/payload.json'], files: 1, payload: JSON.stringify({ content: hostile }, null, 2) + '\n' },
    'THEN curl gets exact argv and the payload holds the text byte for byte');
  assert.deepEqual(['injected', 'ticked', 'out'].map(name => existsSync(join(root, name))), [false, false, false],
    'THEN no substitution, backtick or redirect in the text executed');
  assert.deepEqual(runDirs(), [], 'THEN the script removed its run dir at exit');

  // GIVEN the same text with a raw quote (rule broken) WHEN zsh parses it THEN the command fails before curl (control).
  const broken = zsh(fill(commands.text, { ...common, type: 'html', content: hostile }, value => value));
  assert.notEqual(broken.result.status, 0, 'THEN an unescaped quote breaks the command');
  assert.equal(existsSync(broken.log), false, 'THEN the broken command never reaches curl');
  assert.equal(existsSync(join(root, 'injected')), false, 'THEN the break-out did not run the substitution either');

  // GIVEN the shipped probe command WHEN zsh runs it on the site dir THEN it reports type, absolute path and entry.
  const probe = zsh(fill(commands.probe, { path: site }));
  assert.deepEqual(probe.result.stdout.split('\n').filter(line => /^(TYPE|PATH|FILES|HTML|ENTRY):/.test(line)),
    ['TYPE: site-dir', 'PATH: ' + site, 'FILES: 3', 'HTML: 2', 'ENTRY: index.html'], 'THEN probe classifies the directory');

  // GIVEN the shipped path command for a directory and a nested entry WHEN run under zsh -f THEN the manifest honours it.
  const dir = zsh(fill(commands.path, { ...common, type: 'site-dir', entry: 'sub/page.html', path: site }));
  assert.equal(dir.result.status, 0, 'THEN zsh site-dir command exits 0: ' + dir.result.stdout + dir.result.stderr);
  const dirCurl = curlOf(dir);
  const dirZip = Object.keys(dirCurl.files)[0];
  assert.equal(dir.result.stdout, manifest('site.zip', dirCurl.files[dirZip]) + 'OK https://fixture.brewpage.app/ | Files: 3\n',
    'THEN zsh site-dir command prints the manifest with the requested entry and the URL line');
  assert.deepEqual(normalize(dirCurl.args), ['-s', '-X', 'POST', 'https://brewpage.app/api/sites?ns=public&ttl=15&entry=sub%2Fpage.html',
    '-H', 'User-Agent: ClaudeCode/1.0', '-F', 'archive=@"' + tmp + '/brewpage.RUN/site.zip"'], 'THEN curl gets the encoded entry and the run-dir archive');
  assert.deepEqual(runDirs(), [], 'THEN the site-dir run dir is removed at exit');

  // GIVEN the shipped path command for a ZIP and a nested entry WHEN run under zsh -f THEN inspect honours the entry.
  const zip = zsh(fill(commands.path, { ...common, type: 'site-zip', entry: 'sub/page.html', path: fixtureZip }));
  assert.equal(zip.result.status, 0, 'THEN zsh site-zip command exits 0: ' + zip.result.stdout + zip.result.stderr);
  assert.equal(zip.result.stdout, manifest('fixture.zip', fixtureBytes) + 'OK https://fixture.brewpage.app/ | Files: 3\n',
    'THEN zsh site-zip command prints the manifest with the requested entry and the URL line');
  const stagedZip = tmp + '/brewpage.RUN/archive/fixture.zip';
  const zipCurl = curlOf(zip);
  assert.deepEqual({ ...zipCurl, args: normalize(zipCurl.args), files: Object.fromEntries(Object.entries(zipCurl.files).map(([path, bytes]) => [normalize([path])[0], bytes])) }, {
    args: ['-s', '-X', 'POST', 'https://brewpage.app/api/sites?ns=public&ttl=15&entry=sub%2Fpage.html',
      '-H', 'User-Agent: ClaudeCode/1.0', '-F', 'archive=@"' + stagedZip + '"'],
    files: { [stagedZip]: fixtureBytes }, payload: null,
  }, 'THEN curl uploads the user zip unchanged');
  assert.equal(existsSync(fixtureZip), true, 'THEN the user-supplied zip is preserved');
  assert.deepEqual(runDirs(), [], 'THEN the site-zip run dir is removed at exit');
  console.log('PASS publish zsh: shipped text, probe, site-dir and site-zip commands under zsh -f; the unescaped-quote control fails');
} finally {
  rmSync(base, { recursive: true, force: true });
}
