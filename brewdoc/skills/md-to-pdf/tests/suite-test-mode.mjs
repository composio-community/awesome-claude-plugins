#!/usr/bin/env node
// TEST mode output goes to a private 0700 mktemp dir (TMPDIR, else /tmp) removed on exit; never a fixed /tmp path.
// Stub converter, fixtures under one mkdtemp base; SKILL_MD=<path> targets another SKILL.md copy.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync, realpathSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SKILL = readFileSync(process.env.SKILL_MD || join(HERE, '..', 'SKILL.md'), 'utf8');
const BASE = realpathSync(mkdtempSync(join(tmpdir(), 'brewdoc-mdpdf-test-mode-')));
after(() => rmSync(BASE, { recursive: true, force: true }));

const start = SKILL.indexOf('### TEST Mode');
const tail = SKILL.slice(start + 1);
const SECTION = SKILL.slice(start, start + 1 + tail.search(/\n##+ /));
const FENCES = [...SECTION.matchAll(/```bash\n([\s\S]*?)```/g)].map((m) => m[1]);

const skillDir = join(BASE, 'skill');
mkdirSync(join(skillDir, 'scripts'), { recursive: true });
writeFileSync(join(skillDir, 'scripts', 'md_to_pdf.py'), `import json, os, sys
src, out = sys.argv[1], sys.argv[2]
d = os.path.dirname(out)
open(out, "w").write("PDF")
print("STATUS=OK")
print("OUTPUT=" + out)
print("PROBE=" + json.dumps({"input": os.path.relpath(src, os.environ["STUB_SKILL"]), "dir": d,
    "parent": os.path.dirname(d), "name": os.path.basename(out), "mode": oct(os.stat(d).st_mode & 0o777),
    "engine": sys.argv[sys.argv.index("--engine") + 1]}))
`);

function runFence(name, tmp) {
  const script = join(BASE, `${name}.sh`);
  writeFileSync(script, (FENCES[0] || 'exit 9\n').replaceAll('ENGINE', 'reportlab').replaceAll('${CLAUDE_SKILL_DIR}', skillDir));
  const env = { ...process.env, STUB_SKILL: skillDir };
  delete env.TMPDIR;
  if (tmp !== undefined) env.TMPDIR = tmp;
  const r = spawnSync('bash', [script], { encoding: 'utf8', timeout: 30000, env });
  const probe = JSON.parse((/^PROBE=(.*)$/m.exec(r.stdout || '') || [null, '{}'])[1]);
  return { r, probe };
}

test('GIVEN SKILL.md WHEN scanning for /tmp THEN only the ${TMPDIR:-/tmp} fallback appears and TEST has one fence', () => {
  const fixed = SKILL.split('\n').filter((l) => (l.match(/\/tmp\b/g) || []).length !== (l.match(/\$\{TMPDIR:-\/tmp\}/g) || []).length);
  assert.deepEqual({ fixed, fences: FENCES.length }, { fixed: [], fences: 1 },
    'no fixed /tmp path anywhere in SKILL.md; TEST mode documents exactly one bash block');
});

test('GIVEN a private TMPDIR WHEN the TEST fence runs THEN the PDF lands in a 0700 mktemp dir under TMPDIR, removed on exit', () => {
  const tmp = join(BASE, 'tmpdir');
  mkdirSync(tmp);
  const { r, probe } = runFence('private', tmp);
  assert.deepEqual(
    { status: r.status, ok: (r.stdout || '').includes('---CONVERT_OK---'), input: probe.input, parent: probe.parent,
      dirName: /^md-to-pdf-test\.[A-Za-z0-9]{6}$/.test((probe.dir || '').slice(tmp.length + 1)), name: probe.name,
      mode: probe.mode, engine: probe.engine, exists: existsSync(probe.dir || tmp) },
    { status: 0, ok: true, input: 'test/test-all-elements.md', parent: tmp, dirName: true,
      name: 'md-to-pdf-test-reportlab.pdf', mode: '0o700', engine: 'reportlab', exists: false },
    'bundled input, private 0700 dir under TMPDIR, converter rc kept, dir removed by the EXIT trap');
});

test('GIVEN TMPDIR unset WHEN the TEST fence runs THEN it falls back to a 0700 dir under /tmp, removed on exit', () => {
  const { r, probe } = runFence('fallback', undefined);
  assert.deepEqual(
    { status: r.status, ok: (r.stdout || '').includes('---CONVERT_OK---'), parent: probe.parent, mode: probe.mode,
      exists: existsSync(probe.dir || '/tmp') },
    { status: 0, ok: true, parent: '/tmp', mode: '0o700', exists: false },
    'unset TMPDIR -> /tmp fallback, still private and removed');
});
