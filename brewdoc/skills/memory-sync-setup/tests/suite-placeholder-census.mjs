#!/usr/bin/env node
// Placeholder census: 2 templates, generate.sh (RUNTIME_ALLOW + scalars), SKILL.md tables must agree (BLOCK in RUNTIME_ALLOW -> never reported; runtime token missing -> `validate` bricked); sets regex-derived, never hand-copied.
// MEMORY_SYNC_SKILL_DIR=<path> targets another skill copy (perturbed copy proves each check can go red).
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DIR = process.env.MEMORY_SYNC_SKILL_DIR || join(HERE, '..');

// Adding a placeholder updates this line in lockstep with its three homes (templates, generate.sh, SKILL.md).
const N_SCALARS = 8, N_BLOCKS = 13, N_RUNTIME = 12;

let passed = 0, failed = 0;
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { passed++; console.log(`  ok   ${name}`); return; }
  failed++;
  console.log(`  FAIL ${name}\n       expected ${JSON.stringify(expected)}\n       actual   ${JSON.stringify(actual)}`);
}

// A home the regex cannot find is a FAILing assertion, never a suite crash that swallows the rest.
const read = p => readFileSync(join(DIR, p), 'utf8');
const capture = (src, re, what) => (src.match(re) || [, `(NOT FOUND: ${what})`])[1];
const set = a => [...new Set(a)].sort();
const words = s => set(s.trim().split(/\s+/));
const diff = (a, b) => a.filter(x => !b.includes(x));
const inter = (a, b) => a.filter(x => b.includes(x));

// Same rule as generate.sh `_open_tokens`: \{[A-Z_]+\}, ignoring a `$`-prefixed shell expansion.
const tokens = s => set([...s.matchAll(/(.?)\{([A-Z_]+)\}/g)].filter(m => m[1] !== '$').map(m => m[2]));

// First column of a markdown table, where each cell is a backticked `{TOKEN}`.
const tableTokens = s => set((s.match(/^\|\s*`\{[A-Z_]+\}`\s*\|/gm) || []).map(r => r.match(/[A-Z_]+/)[0]));

// The contiguous `>` blockquote containing `marker`.
function quoteBlock(src, marker, what) {
  const lines = src.split('\n');
  const i = lines.findIndex(l => l.startsWith('>') && l.includes(marker));
  if (i < 0) return `(NOT FOUND: ${what})`;
  let a = i, b = i;
  while (a > 0 && lines[a - 1].startsWith('>')) a--;
  while (b + 1 < lines.length && lines[b + 1].startsWith('>')) b++;
  return lines.slice(a, b + 1).join('\n');
}

const gen = read('scripts/generate.sh');
const skillMd = read('SKILL.md');
const TEMPLATE_TOKENS = tokens(read('references/SKILL.md.template') + read('references/hard-sync.md'));

// ── the three homes ────────────────────────────────────────────────────────────
const RUNTIME_GEN = words(capture(gen, /^RUNTIME_ALLOW="([^"]*)"/m, 'generate.sh RUNTIME_ALLOW'));
const RUNTIME_SKILL = tokens(quoteBlock(skillMd, 'RUNTIME tokens', 'SKILL.md runtime-token note'));

const SCALARS_GEN = words(capture(gen, /^SCALAR_KEYS="([^"]*)"/m, 'generate.sh SCALAR_KEYS'));
const SCALARS_HDR = words(capture(gen, /^# SCALAR env overrides[^\n]*\n#([A-Z_ ]+)\n/m, 'generate.sh _scalar_default comment scalar list'));
const SCALARS_CASE = set((capture(gen, /^_scalar_default\(\) \{\n([\s\S]*?)\n\}/m, 'generate.sh _scalar_default body')
  .match(/^ {4}([A-Z_]+)\)/gm) || []).map(r => r.trim().slice(0, -1)));
const SCALARS_SKILL = tableTokens(capture(skillMd, /\*\*SCALARS\*\*([\s\S]*?)\*\*BLOCKS\*\*/, 'SKILL.md SCALARS table'));

// Phase 3 names every block with the emitted file it lands in; bounded to that section.
const BLOCKS_SKILL = set((capture(skillMd, /^### Phase 3[^\n]*\n([\s\S]*?)\n#{2,3} /m, 'SKILL.md Phase 3 block table')
  .match(/^\|\s*`\{[A-Z_]+\}`\s*\|\s*(?:SKILL\.md|hard-sync\.md)\s*\|/gm) || []).map(r => r.match(/[A-Z_]+/)[0]));

const CLASSIFIED = set([...SCALARS_GEN, ...BLOCKS_SKILL, ...RUNTIME_GEN]);

// ── a. every template token is classified exactly once ─────────────────────────
check('a1 no name is both a SCALAR and a RUNTIME token', inter(SCALARS_GEN, RUNTIME_GEN), []);
check('a2 no name is both a SCALAR and a BLOCK', inter(SCALARS_GEN, BLOCKS_SKILL), []);
check('a3 no name is both a BLOCK and a RUNTIME token', inter(BLOCKS_SKILL, RUNTIME_GEN), []);
check('a4 every template token is classified (scalar | block | runtime)', diff(TEMPLATE_TOKENS, CLASSIFIED), []);
check('a5 every classified name occurs in the templates', diff(CLASSIFIED, TEMPLATE_TOKENS), []);

// ── b. the RUNTIME set, three homes ────────────────────────────────────────────
check('b1 RUNTIME_ALLOW == the SKILL.md runtime-token note', RUNTIME_GEN, RUNTIME_SKILL);
check('b2 every RUNTIME_ALLOW name occurs in the templates', diff(RUNTIME_GEN, TEMPLATE_TOKENS), []);

// ── c. the SCALAR set, every home that declares it ─────────────────────────────
check('c1 SCALAR_KEYS == the SKILL.md SCALARS table', SCALARS_GEN, SCALARS_SKILL);
check('c2 SCALAR_KEYS == the generate.sh _scalar_default comment list', SCALARS_GEN, SCALARS_HDR);
check('c3 SCALAR_KEYS == the _scalar_default case labels', SCALARS_GEN, SCALARS_CASE);

// ── d. the tripwire counts ─────────────────────────────────────────────────────
check('d1 scalar count', SCALARS_GEN.length, N_SCALARS);
check('d2 block count', BLOCKS_SKILL.length, N_BLOCKS);
check('d3 runtime count', RUNTIME_GEN.length, N_RUNTIME);

console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'}  passed=${passed} failed=${failed}`);
process.exit(failed === 0 ? 0 : 1);
