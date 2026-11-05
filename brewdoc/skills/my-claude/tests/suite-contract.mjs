#!/usr/bin/env node
// Static contract: refresh rows + hint, REFRESH never asks, Stale rule + report heading, internal template, plugins single-sourced.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
const SKILL = readFileSync(join(DIR, 'SKILL.md'), 'utf8');
const REF = readFileSync(join(DIR, 'references', 'internal-mode.md'), 'utf8');
const section = (text, head) => {
    const s = text.indexOf(`\n${head}\n`);
    const e = text.indexOf('\n## ', s + head.length + 2);
    return text.slice(s + 1, e < 0 ? undefined : e);
};
const TEMPLATE = REF.slice(REF.indexOf('```markdown\n'), REF.indexOf('\n```\n', REF.indexOf('```markdown\n')));

// GIVEN SKILL.md WHEN its frontmatter is read THEN keys, order and values match the house invariant with the refresh hint.
assert.deepEqual(SKILL.slice(4, SKILL.indexOf('\n---\n', 4)).split('\n').map(l => [l.slice(0, l.indexOf(':')), l.slice(l.indexOf(':') + 2)]), [
    ['name', 'my-claude'],
    ['description', 'Documents a Claude Code installation - local setup, plugins and mods, hook/context architecture, web research; refresh regenerates guides older than the installed brewdoc. Triggers - my claude, installation docs.'],
    ['user-invocable', 'true'],
    ['disable-model-invocation', 'true'],
    ['argument-hint', '"[prompt] [ext [context]] | [r <query>] | [refresh] — no args = internal installation docs"'],
    ['allowed-tools', '[Read, Glob, Grep, Bash, Agent, WebFetch, WebSearch, AskUserQuestion]'],
    ['model', 'opus'],
    ['license', 'MIT'],
], 'THEN the frontmatter keeps the key order, both invocation flags and the prompt-first hint ending in | [refresh]');

// GIVEN the Mode Detection section WHEN its tables are read THEN refresh has its keyword row and its literal prefix row.
assert.deepEqual(section(SKILL, '## Mode Detection').split('\n').filter(l => /^\| (`|empty|starts)/.test(l)), [
    '| `internal` (DEFAULT) | *(empty)*, internal, my setup, my installation, document my claude | внутренний, мой setup, документируй мой claude | yes |',
    '| `external` | ext, external, architecture, hook/context schema | внешний, архитектура, схема контекста | yes |',
    '| `research` | r, research, look up, find out about | research, исследуй, найди информацию | yes |',
    '| `refresh` | refresh, update, regenerate | обнови, освежи | yes |',
    '| empty | INTERNAL | — |',
    '| `ext` or `external` (alone) | EXTERNAL | default |',
    '| `ext context` or `external context` | EXTERNAL | context-schema |',
    '| starts with `r ` or `research ` | RESEARCH | query = rest of args |',
    '| `refresh` | REFRESH | the other words name research slugs to include |',
], 'THEN the keyword table and the literal prefix table both route refresh');

// GIVEN the Prompt contract WHEN rules 1 and 3 are read THEN refresh is an explicit prefix, wins its ties and never asks.
assert.deepEqual(section(SKILL, '## Prompt contract').split('\n').filter(l => /refresh/.test(l)), [
    '1. Mode: an explicit prefix (`ext`, `external`, `r `, `research `, `refresh`) anywhere wins outright, the first',
    '   a tie with `refresh` -> `refresh`, any other tie -> `AskUserQuestion`. No hit or empty -> `internal` (documented default).',
    '2. Scope: prose that is not a mode/query is still input: take the topic/query from it. In `refresh` it names',
    '   guide -> no question. `refresh` asks nothing: it always takes the "Yes, update" answer.',
    '`refresh` prints it right after its read-only scan:',
    'SCOPE:  <sources to analyze | research query | refresh: the STALE guide keys>',
], 'THEN the contract names refresh in the prefix list, the tie rule, the scope rule, the ask rule and the PLAN timing');

// GIVEN the REFRESH section (last in the file) WHEN scanned THEN it never calls the question tool.
const REFRESH = SKILL.slice(SKILL.indexOf('\n## REFRESH Mode\n') + 1);
assert.deepEqual({ head: REFRESH.split('\n')[0], asks: REFRESH.match(/AskUserQuestion/g) }, { head: '## REFRESH Mode', asks: null },
    'THEN REFRESH exists and holds no AskUserQuestion');

// GIVEN the internal template WHEN its headings are listed THEN Plugins and mods sits between Global and Project and Keeping this current closes it.
assert.deepEqual(TEMPLATE.split('\n').filter(l => l.startsWith('#')), [
    '# Claude Code Internal Setup — {YYYY-MM-DD}',
    '## Global Configuration',
    '### Hooks ({N})',
    '### Rules ({N} files)',
    '### Agents ({N} files)',
    '### Skills ({N})',
    '## Plugins and mods',
    '## Project Configuration',
    '## Memory',
    '## Summary',
    '## Keeping this current',
], 'THEN the template headings are exactly these, in this order');

// GIVEN the internal template WHEN the plugin table header, Summary row and setup pointer are read THEN each is present once.
assert.deepEqual(TEMPLATE.split('\n').filter(l => /^\| Plugin|^\| Plugins and mods|setup-status`\.$/.test(l)), [
    '| Plugin | Version | Scope | Enabled | Kind |',
    'Setup states (installed, stale, disabled) are tracked by `/brewcode:setup-status`.',
    '| Plugins and mods | {N} ({M} mods) | `claude plugin list --json` |',
], 'THEN the 5-column header, the setup-status pointer line and the Summary row are in the template');

// GIVEN Keeping this current WHEN its steps are listed THEN the 4 commands appear in update order.
assert.deepEqual(TEMPLATE.slice(TEMPLATE.indexOf('## Keeping this current')).split('\n').filter(l => /^\d\. /.test(l)).map(l => l.split('`')[1]), [
    '/brewtools:plugin-update',
    '/reload-plugins',
    '/brewcode:setup-status upgrade',
    '/brewdoc:my-claude refresh',
], 'THEN plugin-update, reload, setup-status upgrade and my-claude refresh come in this order');

// GIVEN the internal reference WHEN searched for the word optional THEN mods and plugins are never called optional.
assert.deepEqual(REF.match(/optional/gi), null, 'THEN internal-mode.md never says optional');

// GIVEN the Global Explore row and the Explore brief WHEN read THEN neither inventories plugins: the plugins fence is the one source.
assert.deepEqual({
    ref: REF.match(/installed_plugins|enabled plugins/g),
    done: SKILL.match(/DONE: per-section inventory \(([^)]*)\)/)[1].replace(/\s+/g, ' '),
}, {
    ref: null,
    done: 'instructions summary, rules N + one line each, settings keys + hook events, agents N + purpose, skills N + purpose',
}, 'THEN internal-mode.md names no installed_plugins.json or enabled plugins and the brief DONE lists no plugins');

// GIVEN the REFRESH Stale rule WHEN its table and both fences are read THEN each step is defined once and both keyOf copies are identical.
const STALE = REFRESH.slice(REFRESH.indexOf('Stale rule, the one definition'), REFRESH.indexOf('Step 1, **EXECUTE**'));
const KEYOF = [...SKILL.matchAll(/^const keyOf = r => \{\n[\s\S]*?\n\};$/gm)].map(m => m[0]);
assert.deepEqual({
    steps: STALE.split('\n').filter(l => /^\| [A-Z]/.test(l)).map(l => l.slice(2, l.indexOf(' |'))),
    keyOf: { copies: KEYOF.length, distinct: new Set(KEYOF).size, contextSchema: KEYOF.map(k => k.includes('/_context-schema\\.md$/.test(p)')) },
}, {
    steps: ['Step', 'Key', 'Newest', 'Path', 'Version', 'Parse', 'Verdict'],
    keyOf: { copies: 2, distinct: 1, contextSchema: [true, true] },
}, 'THEN the rule table has its six steps and the save and scan fences share one keyOf classifying context-schema by file name');

// GIVEN the REFRESH report WHEN its heading table and example are read THEN any 🔴 row forces the 🔴 heading and ⚪ needs no STALE line.
const REPORT = REFRESH.slice(REFRESH.indexOf('Step 4 report'));
const EXAMPLE = REPORT.slice(REPORT.indexOf('```markdown\n') + 12, REPORT.indexOf('\n```', REPORT.indexOf('```markdown\n')));
const ROWS = EXAMPLE.split('\n').filter(l => l.startsWith('| **'));
assert.deepEqual({
    cases: REPORT.split('\n').filter(l => /^\| (scan|any|no STALE|else) /.test(l)),
    heading: EXAMPLE.split('\n')[0],
    rows: { refreshed: ROWS.filter(l => l.includes('| 🟢 ')).length, failed: ROWS.filter(l => l.includes('| 🔴 ')).length },
}, {
    cases: [
        '| scan printed `NONE` | only the line `⚪ No my-claude guide in this project yet: run /brewdoc:my-claude.`, no table |',
        '| any 🔴 row | `## 🔴 my-claude guides: N refreshed, M failed (brewdoc <PV>)` |',
        '| no STALE line | `## ⚪ my-claude guides are current (brewdoc <PV>)` |',
        '| else | `## 🟢 my-claude guides: N refreshed, K current (brewdoc <PV>)` |',
    ],
    heading: '## 🔴 my-claude guides: 1 refreshed, 1 failed (brewdoc 6.10.0)',
    rows: { refreshed: 1, failed: 1 },
}, 'THEN the heading cases are exact and the example with one 🟢 and one 🔴 row carries the 🔴 heading with those counts');

console.log('suite-contract: PASS');
