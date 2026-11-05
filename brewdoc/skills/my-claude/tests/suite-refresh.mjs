#!/usr/bin/env node
// SKILL.md fences on mkdtemp fixtures: scan verdicts, legacy ~/ keys, save in place, title from heading, plugin table via a stub `claude`.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const SKILL = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'SKILL.md'), 'utf8');
const bashFences = text => [...text.matchAll(/^```bash\n([\s\S]*?)^```$/gm)].map(m => m[1]);
const between = (from, to) => SKILL.slice(SKILL.indexOf(`\n${from}\n`), to ? SKILL.indexOf(`\n${to}\n`) : undefined);
const FENCES = {
    save: bashFences(between('## INDEX Tracking', '## INTERNAL Mode')),
    plugins: bashFences(between('## INTERNAL Mode', '## EXTERNAL Mode')),
    scan: bashFences(between('## REFRESH Mode')),
};
const DOC_LINE = '<document — provenance frontmatter first, then the body>\n';

// GIVEN SKILL.md WHEN its sections are split THEN save, plugins and scan each own exactly one bash fence.
assert.deepEqual(Object.values(FENCES).map(f => f.length), [1, 1, 1], 'THEN INDEX Tracking, INTERNAL and REFRESH hold one bash fence each');
assert.equal(FENCES.save[0].split(DOC_LINE).length, 2, 'THEN the save fence carries the document placeholder line once');

const base = realpathSync(mkdtempSync(join(tmpdir(), 'my-claude-refresh-')));
process.on('exit', () => rmSync(base, { recursive: true, force: true }));
const pluginRoot = join(base, 'plugin');
mkdirSync(join(pluginRoot, '.claude-plugin'), { recursive: true });
writeFileSync(join(pluginRoot, '.claude-plugin', 'plugin.json'), JSON.stringify({ name: 'brewdoc', version: '6.10.0' }));
const bin = join(base, 'bin');
const scripts = join(base, 'scripts');
mkdirSync(bin);
mkdirSync(scripts);
writeFileSync(join(bin, 'claude'), `#!/usr/bin/env node
const fs = require('fs');
fs.appendFileSync(process.env.STUB_LOG, JSON.stringify({ args: process.argv.slice(2), claudecode: process.env.CLAUDECODE ?? null }) + '\\n');
if (process.env.STUB_MODE === 'fail') { process.stderr.write('boom\\n'); process.exit(1); }
process.stdout.write(fs.readFileSync(process.env.STUB_JSON, 'utf8'));
`);
chmodSync(join(bin, 'claude'), 0o755);

let n = 0;
function runFence(fence, { project, home, subs = {}, env = {}, shell = ['/bin/bash'] }) {
    const script = join(scripts, `fence-${n++}.sh`);
    writeFileSync(script, Object.entries(subs).reduce((t, [k, v]) => t.replaceAll(k, v), fence));
    const r = spawnSync(shell[0], [...shell.slice(1), script], {
        cwd: base, encoding: 'utf8', timeout: 15000,
        env: { PATH: `${bin}:${process.env.PATH}`, HOME: home, CLAUDE_PROJECT_DIR: project, CLAUDE_PLUGIN_ROOT: pluginRoot, ...env },
    });
    return { rc: r.status, stdout: r.stdout, stderr: r.stderr };
}

function tree(dir) {
    const out = {};
    const walk = d => {
        for (const e of readdirSync(d).sort()) {
            const p = join(d, e), isDir = lstatSync(p).isDirectory();
            out[relative(dir, p)] = isDir ? 'dir' : createHash('sha256').update(readFileSync(p)).digest('hex');
            if (isDir) walk(p);
        }
    };
    walk(dir);
    return out;
}

const MC = '.claude/brewdoc/my-claude';
const doc = (fields, title = 'Guide') => `---\n${fields.join('\n')}\n---\n\n# ${title}\n`;
const row = (ts, mode, path, version = '1.0') => JSON.stringify({ ts, mode, path, title: `T ${path.split('/').pop()}`, version });

function project(name) {
    const root = join(base, name);
    const home = join(base, `${name}-home`);
    mkdirSync(join(root, MC, 'external'), { recursive: true });
    mkdirSync(home);
    const files = {
        '20260101_my-claude-internal.md': ['doc_type: user', 'version: "6.10.0"'],
        '20260501_my-claude-internal.md': ['doc_type: user', 'version: "6.7.1"'],
        '20260501_my-claude-external.md': ['doc_type: user', 'version: 6.9.5'],
        'external/20260501_context-schema.md': ['doc_type: user', 'version: "6.10.0"'],
        '20260501_research-alpha.md': ['doc_type: user', 'generated_by: "brewdoc:my-claude"'],
        '20260501_research-beta.md': ['doc_type: user', 'version: "{PLUGIN_VERSION}"'],
        '20260501_research-gamma.md': ['doc_type: user', 'version: "6.7.1"'],
        '20260501_research-epsilon.md': ['doc_type: skip', 'version: "6.7.1"'],
        '20260501_research-zeta.md': ['doc_type: user', 'version: "6.10.0+{BUILD}"'],
    };
    for (const [f, fields] of Object.entries(files)) writeFileSync(join(root, MC, f), doc(fields));
    const lines = [
        row('2026-01-01T00:00:00', 'internal', `${MC}/20260101_my-claude-internal.md`),
        row('2026-05-01T00:00:00', 'internal', `${MC}/20260501_my-claude-internal.md`),
        row('2026-05-01T00:00:00', 'external', `${MC}/20260501_my-claude-external.md`),
        row('2026-05-01T00:00:00', 'external', `${MC}/external/20260501_context-schema.md`),
        '{not json',
        row('2026-05-01T00:00:00', 'research', `${MC}/20260501_research-alpha.md`),
        row('2026-05-01T00:00:00', 'research', `${MC}/20260501_research-beta.md`),
        row('2026-05-01T00:00:00', 'research', `${MC}/20260501_research-gamma.md`),
        row('2026-05-01T00:00:00', 'research', `${MC}/20260501_research-delta.md`),
        row('2026-05-01T00:00:00', 'research', `${MC}/20260501_research-epsilon.md`),
        row('2026-05-01T00:00:00', 'research', `${MC}/20260501_research-zeta.md`),
        row('2026-05-01T00:00:00', 'pdf', '.claude/brewdoc/other.pdf'),
    ];
    writeFileSync(join(root, '.claude', 'brewdoc', 'INDEX.jsonl'), lines.join('\n') + '\n');
    return { root, home, lines };
}

const SCAN_PROMPT = 'refresh alpha, beta research-delta epsilon zeta';
const SCAN_OUT = [
    `STALE internal ${MC}/20260501_my-claude-internal.md doc=6.7.1 installed=6.10.0`,
    `STALE external ${MC}/20260501_my-claude-external.md doc=6.9.5 installed=6.10.0`,
    `CURRENT external/context-schema ${MC}/external/20260501_context-schema.md doc=6.10.0 installed=6.10.0`,
    `STALE research/alpha ${MC}/20260501_research-alpha.md doc=none installed=6.10.0`,
    `STALE research/beta ${MC}/20260501_research-beta.md doc=unsubstituted installed=6.10.0`,
    `SKIP research/gamma ${MC}/20260501_research-gamma.md doc=6.7.1 installed=6.10.0`,
    `MISSING research/delta ${MC}/20260501_research-delta.md doc=none installed=6.10.0`,
    `SKIP research/epsilon ${MC}/20260501_research-epsilon.md doc=6.7.1 installed=6.10.0`,
    `STALE research/zeta ${MC}/20260501_research-zeta.md doc=unsubstituted installed=6.10.0`,
    '✅ scan OK',
    '',
].join('\n');

// GIVEN an INDEX with an older internal duplicate, 6.7.1/6.9.5/6.10.0 docs, no-version, unsubstituted, unnamed, deleted and doc_type skip guides
// WHEN the REFRESH scan fence runs under bash and zsh THEN every newest key gets its exact verdict and nothing on disk changes.
{
    const zsh = spawnSync('zsh', ['-fc', 'true']);
    assert.equal(zsh.status, 0, 'GIVEN zsh is installed (CI shard plugins sets zsh: true)');
    const p = project('scan');
    const before = { project: tree(p.root), home: tree(p.home) };
    const runs = [['/bin/bash'], ['zsh', '-f']].map(shell => runFence(FENCES.scan[0], { project: p.root, home: p.home, subs: { $ARGUMENTS: SCAN_PROMPT }, shell }));
    assert.deepEqual({ runs, after: { project: tree(p.root), home: tree(p.home) } }, {
        runs: [{ rc: 0, stdout: SCAN_OUT, stderr: '' }, { rc: 0, stdout: SCAN_OUT, stderr: '' }],
        after: before,
    }, 'THEN both shells print the same verdict lines and the project and home trees are byte-identical');
}

// GIVEN a project with no INDEX WHEN the scan runs THEN it prints NONE and exits 0.
{
    const root = join(base, 'empty');
    mkdirSync(root);
    assert.deepEqual(runFence(FENCES.scan[0], { project: root, home: join(base, 'empty'), subs: { $ARGUMENTS: 'refresh' } }),
        { rc: 0, stdout: 'NONE\n✅ scan OK\n', stderr: '' }, 'THEN no INDEX means NONE, rc 0, no error');
}

const FRESH = doc(['doc_type: user', 'version: "6.10.0"', 'generated_by: "brewdoc:my-claude"', 'last_updated: "2026-10-16"'], 'Claude Code Internal Setup — 2026-10-16');
const saveSubs = (key, action, text) => ({ '<key>': key, '<action>': action, [DOC_LINE]: text });
const localTs = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d$/;

// GIVEN a STALE internal guide WHEN the save fence runs with action update THEN a new dated file is written, the newest internal row is edited in place, the old file stays and a re-scan says CURRENT.
{
    const p = project('save');
    const run = runFence(FENCES.save[0], { project: p.root, home: p.home, subs: saveSubs('internal', 'update', FRESH) });
    const index = readFileSync(join(p.root, '.claude', 'brewdoc', 'INDEX.jsonl'), 'utf8').split('\n');
    const edited = JSON.parse(index[1]);
    assert.equal(localTs.test(edited.ts) && Math.abs(Date.parse(edited.ts) - Date.now()) < 120000, true, `THEN the edited row ts ${edited.ts} is local now within 120 s`);
    const rescan = runFence(FENCES.scan[0], { project: p.root, home: p.home, subs: { $ARGUMENTS: 'refresh' } });
    assert.deepEqual({
        run,
        index: [index[0], { ...edited, ts: 'NOW' }, ...index.slice(2)],
        written: readFileSync(join(p.root, MC, '20261016_my-claude-internal.md'), 'utf8'),
        old: readFileSync(join(p.root, MC, '20260501_my-claude-internal.md'), 'utf8'),
        rescan: rescan.stdout.split('\n')[0],
    }, {
        run: { rc: 0, stdout: `saved ${MC}/20261016_my-claude-internal.md — INDEX row updated (v1.1)\n✅ save OK\n`, stderr: '' },
        index: [p.lines[0], { ts: 'NOW', mode: 'internal', path: `${MC}/20261016_my-claude-internal.md`, title: 'Claude Code Internal Setup — 2026-10-16', version: '1.1' }, ...p.lines.slice(2), ''],
        written: FRESH,
        old: doc(['doc_type: user', 'version: "6.7.1"']),
        rescan: `CURRENT internal ${MC}/20261016_my-claude-internal.md doc=6.10.0 installed=6.10.0`,
    }, 'THEN only the newest internal row changes (path, ts, title = the # heading, version 1.0 -> 1.1), the new file holds the document, the old file is kept and the guide is CURRENT');
}

// GIVEN a document whose version is still {PLUGIN_VERSION} WHEN the save fence runs THEN it refuses and writes nothing.
{
    const p = project('reject');
    const before = tree(p.root);
    const bad = FRESH.replace('version: "6.10.0"', 'version: "{PLUGIN_VERSION}"');
    assert.deepEqual({ run: runFence(FENCES.save[0], { project: p.root, home: p.home, subs: saveSubs('internal', 'update', bad) }), after: tree(p.root) }, {
        run: { rc: 0, stdout: '❌ provenance frontmatter: version={PLUGIN_VERSION} (installed 6.10.0) generated_by=brewdoc:my-claude last_updated=2026-10-16\n❌ save FAILED\n', stderr: '' },
        after: before,
    }, 'THEN an unsubstituted version is refused with the exact reason and the project tree is unchanged');
}

// GIVEN an empty project INDEX and a legacy ~/.claude/brewdoc/INDEX.jsonl WHEN the first save appends THEN the legacy rows are merged once and the legacy file is untouched.
{
    const root = join(base, 'legacy');
    const home = join(base, 'legacy-home');
    mkdirSync(join(home, '.claude', 'brewdoc'), { recursive: true });
    mkdirSync(root);
    const legacyRow = row('2026-03-09T19:15:00', 'research', '~/.claude/brewdoc/20260309_research-transcripts.md');
    writeFileSync(join(home, '.claude', 'brewdoc', 'INDEX.jsonl'), legacyRow + '\n');
    const text = FRESH.replace('Claude Code Internal Setup', 'Context schema');
    const run = runFence(FENCES.save[0], { project: root, home, subs: saveSubs('external/context-schema', 'append', text) });
    const index = readFileSync(join(root, '.claude', 'brewdoc', 'INDEX.jsonl'), 'utf8').split('\n');
    const added = JSON.parse(index[1]);
    assert.equal(localTs.test(added.ts), true, `THEN the appended row ts ${added.ts} is a local timestamp`);
    assert.deepEqual({ run, index: [index[0], { ...added, ts: 'NOW' }, index[2]], written: readFileSync(join(root, MC, 'external', '20261016_context-schema.md'), 'utf8'), legacy: readFileSync(join(home, '.claude', 'brewdoc', 'INDEX.jsonl'), 'utf8') }, {
        run: { rc: 0, stdout: `ℹ️ Migrated 1 entries from legacy ~/.claude/brewdoc/INDEX.jsonl (read-only; legacy file untouched)\nsaved ${MC}/external/20261016_context-schema.md — INDEX row appended (v1.0)\n✅ save OK\n`, stderr: '' },
        index: [legacyRow, { ts: 'NOW', mode: 'external', path: `${MC}/external/20261016_context-schema.md`, title: 'Context schema — 2026-10-16', version: '1.0' }, ''],
        written: text,
        legacy: legacyRow + '\n',
    }, 'THEN the project INDEX = legacy row + appended row, the file lands under external/ and the legacy INDEX is byte-identical');
}

// GIVEN a migrated INDEX with legacy ~/ rows for external and ~/.claude/brewdoc/external/ context-schema WHEN the scan runs, then external saves with update
// THEN context-schema is its own key read from the home dir and the external update leaves the context-schema row byte-identical.
{
    const root = join(base, 'legacy-keys');
    const home = join(base, 'legacy-keys-home');
    mkdirSync(join(home, '.claude', 'brewdoc', 'external'), { recursive: true });
    mkdirSync(join(root, '.claude', 'brewdoc'), { recursive: true });
    writeFileSync(join(home, '.claude', 'brewdoc', '20260301_my-claude-external.md'), '# Legacy external\n');
    writeFileSync(join(home, '.claude', 'brewdoc', 'external', '20260302_context-schema.md'), '# Legacy context schema\n');
    const lines = [
        row('2026-03-01T10:00:00', 'external', '~/.claude/brewdoc/20260301_my-claude-external.md'),
        row('2026-03-02T10:00:00', 'external', '~/.claude/brewdoc/external/20260302_context-schema.md'),
    ];
    writeFileSync(join(root, '.claude', 'brewdoc', 'INDEX.jsonl'), lines.join('\n') + '\n');
    const scan = runFence(FENCES.scan[0], { project: root, home, subs: { $ARGUMENTS: 'refresh' } });
    const text = FRESH.replace('Claude Code Internal Setup', 'External');
    const save = runFence(FENCES.save[0], { project: root, home, subs: saveSubs('external', 'update', text) });
    const index = readFileSync(join(root, '.claude', 'brewdoc', 'INDEX.jsonl'), 'utf8').split('\n');
    assert.deepEqual({ scan, save, index: [{ ...JSON.parse(index[0]), ts: 'NOW' }, ...index.slice(1)] }, {
        scan: { rc: 0, stderr: '', stdout: [
            'STALE external ~/.claude/brewdoc/20260301_my-claude-external.md doc=none installed=6.10.0',
            'STALE external/context-schema ~/.claude/brewdoc/external/20260302_context-schema.md doc=none installed=6.10.0',
            '✅ scan OK',
            '',
        ].join('\n') },
        save: { rc: 0, stderr: '', stdout: `saved ${MC}/20261016_my-claude-external.md — INDEX row updated (v1.1)\n✅ save OK\n` },
        index: [{ ts: 'NOW', mode: 'external', path: `${MC}/20261016_my-claude-external.md`, title: 'External — 2026-10-16', version: '1.1' }, lines[1], ''],
    }, 'THEN the scan prints two keys with ~/ expanded and the update edits only the legacy external row');
}

// GIVEN a heading holding $(...), backticks and quotes WHEN appended, then a headingless document with a # line in its frontmatter is saved with update
// THEN the title is the heading verbatim, no shell command ran, and the update keeps that title.
{
    const root = join(base, 'title');
    mkdirSync(root);
    const heading = 'Research: $(touch pwned) `touch pwned2` "q" \'s\'';
    const first = runFence(FENCES.save[0], { project: root, home: join(base, 'title-home'), subs: saveSubs('research/hooks', 'append', FRESH.replace('Claude Code Internal Setup — 2026-10-16', () => heading)) });
    const bare = '---\ndoc_type: user\n# yaml comment\nversion: "6.10.0"\ngenerated_by: "brewdoc:my-claude"\nlast_updated: "2026-10-16"\n---\n\nNo heading.\n## Sub\n';
    const second = runFence(FENCES.save[0], { project: root, home: join(base, 'title-home'), subs: saveSubs('research/hooks', 'update', bare) });
    const rows = readFileSync(join(root, '.claude', 'brewdoc', 'INDEX.jsonl'), 'utf8').split('\n').filter(Boolean).map(l => ({ ...JSON.parse(l), ts: 'NOW' }));
    assert.deepEqual({ first, second, rows, ran: ['pwned', 'pwned2'].map(f => existsSync(join(base, f))) }, {
        first: { rc: 0, stderr: '', stdout: `saved ${MC}/20261016_research-hooks.md — INDEX row appended (v1.0)\n✅ save OK\n` },
        second: { rc: 0, stderr: '', stdout: `saved ${MC}/20261016_research-hooks.md — INDEX row updated (v1.1)\n✅ save OK\n` },
        rows: [{ ts: 'NOW', mode: 'research', path: `${MC}/20261016_research-hooks.md`, title: heading, version: '1.1' }],
        ran: [false, false],
    }, 'THEN one research row holds the raw heading as title at v1.1 and neither touch target exists');
}

// Plugin inventory fixture: CLI order unsorted, other-project and session rows present, 4 mod installs (one sorts before placeholders).
const proj = join(base, 'plugins-proj');
const cache = join(base, 'cache');
const hooks = (name, mod) => {
    mkdirSync(join(cache, name, 'hooks'), { recursive: true });
    writeFileSync(join(cache, name, 'hooks', 'hooks.json'), JSON.stringify(mod ? { modules: ['./register.ts'], hooks: {} } : { hooks: {} }));
    return join(cache, name);
};
mkdirSync(proj);
const LIST = [
    { id: 'brewcode@claude-brewcode', version: '6.10.0', scope: 'user', enabled: true, installPath: hooks('brewcode', false) },
    { id: 'brewmod-plan-effort@claude-brewcode', version: '6.10.0', scope: 'user', enabled: true, installPath: hooks('plan-effort', true) },
    { id: 'brewdoc@claude-brewcode', version: '6.10.0', scope: 'project', enabled: true, installPath: hooks('brewdoc', false), projectPath: join(base, 'other') },
    { id: 'brewmod-placeholders@claude-brewcode', version: '6.10.0', scope: 'user', enabled: false, installPath: hooks('placeholders', true) },
    { id: 'brewtools@claude-brewcode', version: '6.10.0', scope: 'project', enabled: true, installPath: hooks('brewtools', false), projectPath: proj },
    { id: 'context7@claude-plugins-official', version: 'ea10b213686c', scope: 'local', enabled: true, installPath: join(cache, 'context7'), projectPath: proj },
    { id: 'corp@internal', version: '1.2.0', scope: 'managed', enabled: true, installPath: join(cache, 'absent') },
    { id: 'dev@inline', version: 'unknown', scope: 'session', enabled: true, installPath: join(cache, 'dev') },
    { id: 'brewmod-placeholders@claude-brewcode', version: '6.10.0', scope: 'project', enabled: true, installPath: join(cache, 'placeholders'), projectPath: proj },
    { id: 'acme-mod@thirdparty', version: '0.3.0', scope: 'user', enabled: true, installPath: hooks('acme', true) },
];
writeFileSync(join(base, 'list.json'), JSON.stringify(LIST));

// GIVEN a stub claude listing plugins and mods across scopes and projects WHEN the INTERNAL plugins fence runs with CLAUDECODE set
// THEN mods come first (placeholders first), other projects' and session rows are dropped, and CLAUDECODE is unset for the CLI.
{
    const log = join(base, 'stub-ok.log');
    const run = runFence(FENCES.plugins[0], { project: proj, home: base, env: { CLAUDECODE: '1', STUB_LOG: log, STUB_JSON: join(base, 'list.json') } });
    assert.deepEqual({ run, calls: readFileSync(log, 'utf8').trim().split('\n').map(l => JSON.parse(l)) }, {
        run: { rc: 0, stderr: '', stdout: [
            '| Plugin | Version | Scope | Enabled | Kind |',
            '|--------|---------|-------|---------|------|',
            '| brewmod-placeholders@claude-brewcode | 6.10.0 | user | no | mod |',
            '| brewmod-placeholders@claude-brewcode | 6.10.0 | project | yes | mod |',
            '| acme-mod@thirdparty | 0.3.0 | user | yes | mod |',
            '| brewmod-plan-effort@claude-brewcode | 6.10.0 | user | yes | mod |',
            '| brewcode@claude-brewcode | 6.10.0 | user | yes | plugin |',
            '| brewtools@claude-brewcode | 6.10.0 | project | yes | plugin |',
            '| context7@claude-plugins-official | ea10b213686c | local | yes | plugin |',
            '| corp@internal | 1.2.0 | managed | yes | plugin |',
            'SUMMARY | Plugins and mods | 8 (4 mods) | `claude plugin list --json` |',
            '✅ plugins OK',
            '',
        ].join('\n') },
        calls: [{ args: ['plugin', 'list', '--json'], claudecode: null }],
    }, 'THEN the table rows, their order, the Summary line and the single CLI call match exactly');
}

// GIVEN a stub claude that exits 1 WHEN the plugins fence runs THEN the section degrades to one unavailable line plus its Summary.
{
    const log = join(base, 'stub-fail.log');
    assert.deepEqual(runFence(FENCES.plugins[0], { project: proj, home: base, env: { STUB_MODE: 'fail', STUB_LOG: log, STUB_JSON: join(base, 'list.json') } }), {
        rc: 0, stderr: '',
        stdout: 'Plugin inventory unavailable: `claude plugin list --json` exited 1.\nSUMMARY | Plugins and mods | unavailable | `claude plugin list --json` |\n✅ plugins OK\n',
    }, 'THEN a failing CLI yields the one unavailable line, never a partial table');
    assert.equal(existsSync(log), true, 'THEN the stub was really called');
}
console.log('suite-refresh: PASS');
