#!/usr/bin/env node
// BD12: CONVERT+PROMPT temp file unique per run, touches only own `.tmp_*`; static (mktemp + basename trap, no fixed `.tmp_{original_name}.md`/`rm -f "TEMP_FILE_PATH"`) + runtime (2 concurrent copies, stub converter: user dotfile + source survive byte-identical).
// Fixtures under one mkdtemp base, removed at end; SKILL_MD=<path> targets another SKILL.md copy.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, readdirSync, existsSync, rmSync, realpathSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SKILL_PATH = process.env.SKILL_MD || join(HERE, '..', 'SKILL.md');
const SKILL = readFileSync(SKILL_PATH, 'utf8');
const BASE = realpathSync(mkdtempSync(join(tmpdir(), 'brewdoc-mdpdf-t-')));

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

/** Text of the `### CONVERT+PROMPT Mode` section, up to the next `###` heading. */
function convertPromptSection() {
  const start = SKILL.indexOf('### CONVERT+PROMPT Mode');
  const rest = SKILL.slice(start + 1);
  const end = rest.indexOf('\n### ');
  return SKILL.slice(start, end === -1 ? SKILL.length : start + 1 + end);
}

const SECTION = convertPromptSection();
const SECTION_LINES = SECTION.split('\n');
const countLines = (re) => SECTION_LINES.filter((l) => re.test(l)).length;

const fences = [...SECTION.matchAll(/```bash\n([\s\S]*?)```/g)].map((m) => m[1]);
const BLOCK = fences.length === 1 ? fences[0] : '';

check('fence-count', fences.length, 1, 'CONVERT+PROMPT documents exactly one bash block');
check('no-fixed-temp-name', countLines(/\.tmp_\{original_name\}/), 0,
  'no fixed `.tmp_{original_name}.md` path anywhere in the section');
check('no-unconstrained-rm', countLines(/^rm -f "TEMP_FILE_PATH"/), 0,
  'no model-substituted `rm -f "TEMP_FILE_PATH"`');
check('mktemp-line', countLines(/^TMP="\$\(mktemp "\$SRC_DIR\/\.tmp_XXXXXX"\)"$/), 1,
  'temp path comes from mktemp with a 6-X template in the source directory');
check('constrained-trap', countLines(/^trap 'case "\$\{TMP##\*\/\}" in \.tmp_\?{6}\) rm -f "\$TMP" ;; esac' EXIT$/), 1,
  'cleanup is trapped and gated on a `.tmp_??????` basename');

// --- runtime fixture -------------------------------------------------------
const docDir = join(BASE, 'docs');
const skillDir = join(BASE, 'skill');
mkdirSync(docDir, { recursive: true });
mkdirSync(join(skillDir, 'scripts'), { recursive: true });

const SOURCE_MD = '# Report\n\noriginal body\n';
const DECOY = 'user notes that must survive\n';
writeFileSync(join(docDir, 'report.md'), SOURCE_MD);
writeFileSync(join(docDir, '.tmp_note.md'), DECOY);

const LOG = join(BASE, 'inputs.log');
writeFileSync(LOG, '');
writeFileSync(join(skillDir, 'scripts', 'md_to_pdf.py'), `import os, sys, time
src, out = sys.argv[1], sys.argv[2]
with open(os.environ["STUB_LOG"], "a") as fh:
    fh.write(os.path.basename(src) + "\\n")
time.sleep(0.3)
body = open(src).read()
open(out, "w").write("PDF:" + body)
`);

function prepare(name, body) {
  const script = BLOCK
    .replace('ORIGINAL_DIR', docDir)
    .replace('TRANSFORMED_MARKDOWN', body)
    .replace('OUTPUT_PATH', join(docDir, `${name}.pdf`))
    .replace('ENGINE', 'reportlab')
    .replaceAll('${CLAUDE_SKILL_DIR}', skillDir);
  const path = join(BASE, `${name}.sh`);
  writeFileSync(path, script);
  return path;
}

const scriptA = prepare('runA', 'transformed A');
const scriptB = prepare('runB', 'transformed B');
// Script paths reach bash via env, never spliced into the command text.
const run = spawnSync('bash', ['-c', 'bash "$T_SCRIPT_A" & bash "$T_SCRIPT_B" & wait'], {
  encoding: 'utf8', timeout: 60000, env: { ...process.env, STUB_LOG: LOG, T_SCRIPT_A: scriptA, T_SCRIPT_B: scriptB },
});
const stdout = run.stdout || '';
const read = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '(missing)');
const tempNames = readFileSync(LOG, 'utf8').split('\n').filter((l) => l !== '');

check('run-status', run.status, 0, 'both concurrent invocations exit 0');
check('convert-ok-count', (stdout.match(/---CONVERT_OK---/g) || []).length, 2,
  'both invocations report ---CONVERT_OK---');
check('decoy-intact', read(join(docDir, '.tmp_note.md')), DECOY,
  'a pre-existing user `.tmp_*.md` file is untouched');
check('source-intact', read(join(docDir, 'report.md')), SOURCE_MD,
  'the source document is untouched');
check('output-a', read(join(docDir, 'runA.pdf')), 'PDF:transformed A\n',
  'invocation A converted its own transformed content');
check('output-b', read(join(docDir, 'runB.pdf')), 'PDF:transformed B\n',
  'invocation B converted its own transformed content');
check('temp-names-unique', new Set(tempNames).size, 2,
  'the two concurrent invocations used two distinct temp files');
check('temp-names-generated', tempNames.filter((n) => /^\.tmp_[A-Za-z0-9]{6}$/.test(n)).length, 2,
  'both temp names are mktemp-generated, not derived from the source name');
check('leftovers', readdirSync(docDir).filter((f) => f.startsWith('.tmp_')).sort(), ['.tmp_note.md'],
  'no temp file survives the run');

rmSync(BASE, { recursive: true, force: true });

console.log(results.join('\n'));
console.log('\n| Result | Value |');
console.log('|--------|-------|');
console.log(`| passed | ${passed} |`);
console.log(`| failed | ${failed} |`);
process.exit(failed === 0 ? 0 : 1);
