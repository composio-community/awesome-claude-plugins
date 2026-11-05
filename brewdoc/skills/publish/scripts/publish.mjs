#!/usr/bin/env node
/** Offline SITE bundle build/verify: `pack --dir <abs-dir> --out <abs.zip> [--entry <name>]` | `inspect --zip <abs.zip> [--entry <name>]`; caller curls only on exit 0.
 * Exit 0 verified, manifest printed -> upload | 2 verified, flagged entries -> ask user | 1 failure, partial archive removed -> never upload. */
import { spawn, spawnSync } from 'node:child_process';
import { readdirSync, statSync, lstatSync, existsSync, rmSync, accessSync, constants, readFileSync, realpathSync, mkdtempSync, chmodSync } from 'node:fs';
import { join, relative, extname, basename, delimiter } from 'node:path';
import { tmpdir } from 'node:os';

/** Publishable web assets. Allowlist by design: an unknown extension is dropped, never shipped. */
const ALLOWED_EXT = new Set([
  '.html', '.htm', '.css', '.js', '.mjs', '.cjs', '.json', '.xml', '.webmanifest',
  '.svg', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.ico', '.bmp',
  '.woff', '.woff2', '.ttf', '.otf',
  '.txt', '.md', '.pdf',
  '.mp4', '.webm', '.mp3', '.wav',
]);

/** Names that stay out even when the extension is allowed. */
const EXCLUDED_DIRS = new Set(['node_modules', 'vendor', '__pycache__', 'dist-cache', '__MACOSX']);

/** The one dot-folder a site keeps, at the root only (brewpage.app publishes it, drops other hidden entries). */
const TRUSTED_DOT_DIR = '.well-known';

/** System entries brewpage.app drops on its own: never counted, never flagged. */
const SYSTEM_RE = /^(__MACOSX|\.Spotlight-V100|\.Trashes|\.fseventsd)\/|(^|\/)(\.DS_Store|Thumbs\.db|desktop\.ini)$/i;

/** True when a dot-named segment, outside the root `.well-known/`, keeps the path out of a site. */
const isHidden = (rel) => rel.split('/').some((s, i) => s.startsWith('.') && !(i === 0 && s === TRUSTED_DOT_DIR));

/** Extension-less files ship only inside the root `.well-known/` (e.g. `apple-app-site-association`). */
const isWellKnownBare = (rel) => rel.startsWith(`${TRUSTED_DOT_DIR}/`) && extname(rel) === '';

/** Entries that still need a human OK if they survive the allowlist. */
const SENSITIVE_RE = /(^|\/)(\.env|id_rsa|id_ed25519)|secret|credential|password|token|\.(pem|key|p12|pfx|crt|map)$/i;

const ENTRY_RE = /^[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)*$/;

/** `unzip` stdout cap: Node's 1 MB default kills `-Z1` on a valid site with >1 MB of names (ENOBUFS). */
const LIST_MAX_BUFFER = 1024 * 1024;
const CHECK_TIMEOUT_MS = 10000;

// Bind reads to directory descriptors: a source rename must never redirect ZIP reads outside the selected tree.
const SNAPSHOT = String.raw`
import json, os, stat, sys
try:
    os.umask(0o077)
    data = json.load(sys.stdin)
    flags = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW
    root = os.open('/', flags)
    try:
        for part in data['root'].split('/'):
            if not part:
                continue
            next_fd = os.open(part, flags, dir_fd=root)
            os.close(root)
            root = next_fd
        info = os.fstat(root)
        if [str(info.st_dev), str(info.st_ino)] != [data['dev'], data['ino']]:
            raise ValueError('source root changed')
        total = 0
        if len(data['kept']) > 200:
            raise ValueError('file limit')
        for name in data['kept']:
            parts = name.split('/')
            if any(part in ('', '.', '..') for part in parts) or len(name.encode('utf-8')) > 900:
                raise ValueError('invalid member')
            parent = os.dup(root)
            try:
                for part in parts[:-1]:
                    next_fd = os.open(part, flags, dir_fd=parent)
                    os.close(parent)
                    parent = next_fd
                fd = os.open(parts[-1], os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=parent)
                with os.fdopen(fd, 'rb') as source:
                    info = os.fstat(source.fileno())
                    if not stat.S_ISREG(info.st_mode) or info.st_size > 5 * 1024 * 1024:
                        raise ValueError('invalid source file')
                    target = os.path.join(sys.argv[1], *parts)
                    os.makedirs(os.path.dirname(target), mode=0o700, exist_ok=True)
                    output = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
                    with os.fdopen(output, 'wb') as dest:
                        size = 0
                        while True:
                            chunk = source.read(65536)
                            if not chunk:
                                break
                            size += len(chunk)
                            total += len(chunk)
                            if size > 5 * 1024 * 1024 or total > 40 * 1024 * 1024:
                                raise ValueError('byte limit')
                            dest.write(chunk)
                        dest.flush()
                        os.utime(dest.fileno(), ns=(info.st_atime_ns, info.st_mtime_ns))
            finally:
                os.close(parent)
    finally:
        os.close(root)
except (OSError, ValueError, KeyError, AttributeError):
    sys.exit(1)
`;

// Central-directory budgets run before any decompression; ZIP64 and split archives fail closed.
function archiveBudget(zipPath) {
  if (statSync(zipPath).size > 25 * 1024 * 1024) return 'archive exceeds local inspection limits';
  const data = readFileSync(zipPath);
  let end = data.length - 22;
  const floor = Math.max(0, end - 65535);
  while (end >= floor && !(data.readUInt32LE(end) === 0x06054b50 && end + 22 + data.readUInt16LE(end + 20) === data.length)) end--;
  if (end < floor) return 'archive has no valid central directory';
  const count = data.readUInt16LE(end + 10);
  const size = data.readUInt32LE(end + 12);
  let position = data.readUInt32LE(end + 16);
  if (data.readUInt16LE(end + 4) || data.readUInt16LE(end + 6) || data.readUInt16LE(end + 8) !== count || count === 65535 || position + size !== end) return 'unsupported ZIP64 or split archive';
  if (count > 400 || size > LIST_MAX_BUFFER) return 'archive exceeds local inspection limits';
  let expanded = 0; let files = 0;
  for (let i = 0; i < count; i++) {
    if (position + 46 > end || data.readUInt32LE(position) !== 0x02014b50) return 'archive central directory is malformed';
    const bytes = data.readUInt32LE(position + 24);
    const length = data.readUInt16LE(position + 28);
    const next = position + 46 + length + data.readUInt16LE(position + 30) + data.readUInt16LE(position + 32);
    if (next > end || data.readUInt32LE(position + 20) === 0xffffffff || data.readUInt32LE(position + 42) >= end || data.readUInt16LE(position + 34)) return 'archive central directory is malformed';
    const name = data.subarray(position + 46, position + 46 + length).toString('utf8');
    expanded += bytes;
    if (!name.endsWith('/')) files++;
    if (bytes > 5 * 1024 * 1024 || expanded > 40 * 1024 * 1024 || files > 200 || length > 900) return 'archive exceeds local inspection limits';
    position = next;
  }
  return position === end ? '' : 'archive central directory is malformed';
}

function die(msg) {
  console.log(`FAILED: ${msg}`);
  console.log('RESULT: fail');
  process.exit(1);
}

function parseArgs(argv) {
  const out = { mode: argv[0] };
  for (let i = 1; i < argv.length; i += 2) {
    const k = argv[i];
    const v = argv[i + 1];
    if (!k.startsWith('--') || v === undefined) die(`bad argument near "${k}"`);
    out[k.slice(2)] = v;
  }
  return out;
}

function validateEntry(entry) {
  if (entry === undefined) return undefined;
  if (!ENTRY_RE.test(entry) || entry.split('/').includes('..')) {
    die(`entry "${entry}" is not a plain relative file name`);
  }
  return entry;
}

/** Recursively collect allowlisted regular files, relative to root, sorted. */
function collect(root) {
  const kept = [];
  const skipped = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir).sort()) {
      const abs = join(dir, name);
      const rel = relative(root, abs);
      const st = lstatSync(abs);
      const trusted = dir === root && name === TRUSTED_DOT_DIR && st.isDirectory();
      if ((name.startsWith('.') && !trusted) || EXCLUDED_DIRS.has(name)) { skipped.push(rel); continue; }
      if (st.isSymbolicLink()) { skipped.push(rel); continue; }
      if (st.isDirectory()) { walk(abs); continue; }
      if (!st.isFile()) { skipped.push(rel); continue; }
      if (!ALLOWED_EXT.has(extname(name).toLowerCase()) && !isWellKnownBare(rel)) { skipped.push(rel); continue; }
      if (/[\r\n]/.test(rel)) { skipped.push(rel); continue; }
      kept.push(rel);
    }
  };
  walk(root);
  return { kept: kept.sort(), skipped: skipped.sort() };
}

function resolveEntry(names, requested) {
  if (requested !== undefined) {
    if (!names.includes(requested)) die(`entry "${requested}" is not in the archive`);
    return requested;
  }
  // Server rule: root index.html, else the shallowest HTML file (ties: name order).
  const html = names.filter((n) => !SYSTEM_RE.test(n) && !isHidden(n) && /\.html?$/i.test(n));
  const index = html.find((n) => n.toLowerCase() === 'index.html');
  if (index !== undefined) return index;
  if (html.length === 0) die('no .html file in the bundle — refusing to guess an entry file');
  const depth = (n) => n.split('/').length;
  return [...html].sort((a, b) => depth(a) - depth(b) || (a < b ? -1 : a > b ? 1 : 0))[0];
}

/** True when `p` is an executable regular file. */
function isExecutable(p) {
  try { accessSync(p, constants.X_OK); return statSync(p).isFile(); } catch { return false; }
}

/** PATH lookup only, nothing is run: an exec probe reads as shell execution to skill scanners. */
function requireTool(bin) {
  const exts = process.platform === 'win32' ? ['', ...(process.env.PATHEXT || '.EXE;.CMD;.BAT').split(';')] : [''];
  const dirs = (process.env.PATH || '').split(delimiter).filter(Boolean);
  if (!dirs.some((dir) => exts.some((ext) => isExecutable(join(dir, bin + ext))))) die(`${bin} required`);
}

/** Why a spawnSync child failed, '' on success; its own non-zero exit wins over the EPIPE it causes. */
function failure(bin, r) {
  if (r.status !== 0 && r.status !== null) return `${bin} exited ${r.status}`;
  if (r.error) return `${bin} failed (${r.error.code || r.error.message})`;
  return r.signal ? `${bin} killed by ${r.signal}` : '';
}

/** One `unzip` run: { out }, or { why } telling a bad archive (non-zero exit) from a check that never finished. */
function unzip(flag, zipPath) {
  const r = spawnSync('unzip', [flag, zipPath], { encoding: 'utf8', maxBuffer: LIST_MAX_BUFFER, timeout: CHECK_TIMEOUT_MS, killSignal: 'SIGKILL' });
  if (r.status !== 0 && r.status !== null) return { why: 'archive failed its integrity check' };
  const why = failure('unzip', r);
  return why ? { why: `archive could not be checked: ${why}` } : { out: r.stdout || '' };
}

/** `unzip -tq` then `unzip -Z1`: { names } sorted, directory entries dropped, or { why }. */
function listArchive(zipPath) {
  const budget = archiveBudget(zipPath);
  if (budget) return { why: budget };
  const t = unzip('-tq', zipPath);
  if (t.why) return t;
  const z = unzip('-Z1', zipPath);
  if (z.why) return z;
  return { names: z.out.split('\n').map((s) => s.trim()).filter((s) => s !== '' && !s.endsWith('/')).sort() };
}

/** The one manifest format, and the only place the exit code is decided; always the caller's last call.
 * exitCode, never process.exit(): exit drops stdout still queued for a slow pipe reader (manifest > 64 KB). */
function report(names, bytes, entry, skipped, zipPath, unexpected = []) {
  console.log(`ARCHIVE MANIFEST — ${basename(zipPath)}`);
  for (const n of names) console.log(`  ${n}`);
  console.log(`FILES: ${names.length}`);
  console.log(`BYTES: ${bytes}`);
  console.log(`ENTRY: ${entry}`);
  console.log(`SKIPPED: ${skipped.length}${skipped.length ? ` (${skipped.join(', ')})` : ''}`);
  if (unexpected.length) console.log(`UNEXPECTED: ${unexpected.join(', ')}`);
  const flagged = names.filter((n) => SENSITIVE_RE.test(n));
  if (flagged.length) console.log(`SENSITIVE: ${flagged.join(', ')}`);
  const confirm = unexpected.length > 0 || flagged.length > 0;
  console.log(`RESULT: ${confirm ? 'confirm' : 'ok'}`);
  process.exitCode = confirm ? 2 : 0;
}

async function pack(args) {
  let dir = args.dir;
  const out = args.out;
  if (!dir || !out) die('pack needs --dir and --out');
  if (!out.endsWith('.zip')) die('--out must end with .zip');
  if (!existsSync(dir) || !statSync(dir).isDirectory()) die(`not a directory: ${dir}`);
  const entryArg = validateEntry(args.entry);
  requireTool('zip');
  requireTool('unzip');
  requireTool('python3');

  dir = realpathSync(dir);
  const rootInfo = statSync(dir, { bigint: true });

  const { kept, skipped } = collect(dir);
  if (kept.length === 0) die(`no publishable files under ${dir} after the allowlist filter`);
  const entry = resolveEntry(kept, entryArg);

  // BD-N03: `mktemp` leaves a 0-byte file that Info-ZIP reads as a corrupt
  // archive and exits 3. Start from no file at all, every time.
  rmSync(out, { force: true });

  let snapshot;
  let active;
  let interrupted;
  const cancel = (signal) => { interrupted ||= signal; active?.stop(signal); };
  const onInt = () => cancel('SIGINT');
  const onTerm = () => cancel('SIGTERM');
  const onHup = () => cancel('SIGHUP');
  process.on('SIGINT', onInt);
  process.on('SIGTERM', onTerm);
  process.on('SIGHUP', onHup);
  // Keep the event loop available for ordinary cancellation; child output is discarded, never retained or printed.
  const run = (bin, argv, options) => new Promise((resolve) => {
    if (interrupted) { resolve({ status: null, signal: interrupted }); return; }
    const child = spawn(bin, argv, { cwd: options.cwd, stdio: ['pipe', 'ignore', 'ignore'] });
    const result = { status: null, signal: null };
    let escalation;
    const stop = (signal) => {
      child.kill(signal);
      escalation ||= setTimeout(() => child.kill('SIGKILL'), 1000);
    };
    active = { stop };
    const timeout = setTimeout(() => { result.error = { code: 'ETIMEDOUT' }; stop('SIGTERM'); }, CHECK_TIMEOUT_MS);
    child.on('error', (error) => { result.error = error; });
    child.stdin.on('error', (error) => { result.error ||= error; });
    child.on('close', (status, signal) => {
      clearTimeout(timeout);
      clearTimeout(escalation);
      active = undefined;
      result.status = status < 0 ? null : status;
      result.signal = signal;
      resolve(result);
    });
    child.stdin.end(options.input);
  });
  let z;
  let snapshotWhy;
  try {
    snapshot = mkdtempSync(join(tmpdir(), 'brewpage-pack-'));
    chmodSync(snapshot, 0o700);
    const copied = await run('python3', ['-I', '-S', '-c', SNAPSHOT, snapshot], {
      input: JSON.stringify({ root: dir, dev: String(rootInfo.dev), ino: String(rootInfo.ino), kept }), encoding: 'utf8',
    });
    snapshotWhy = failure('python3', copied);
    if (!snapshotWhy) z = await run('zip', ['-q', '-X', '-@', out], {
      cwd: snapshot, input: `${kept.join('\n')}\n`, encoding: 'utf8',
    });
  } finally {
    if (snapshot) rmSync(snapshot, { recursive: true, force: true });
    if (interrupted) rmSync(out, { force: true });
    process.removeListener('SIGINT', onInt);
    process.removeListener('SIGTERM', onTerm);
    process.removeListener('SIGHUP', onHup);
  }
  if (interrupted) die(`pack interrupted (${interrupted})`);
  if (snapshotWhy) { rmSync(out, { force: true }); die('source could not be snapshotted safely'); }
  // zip exiting 0 without reading the list still fails: EPIPE (z.error) with status 0.
  const zipWhy = failure('zip', z);
  if (zipWhy) {
    rmSync(out, { force: true });
    die(`${zipWhy} — no archive produced`);
  }

  if (!existsSync(out) || statSync(out).size === 0) {
    rmSync(out, { force: true });
    die('zip produced no usable archive');
  }
  const bytes = statSync(out).size;
  const { names: listed, why } = listArchive(out);
  if (why) { rmSync(out, { force: true }); die(why); }
  if (listed.join('\n') !== kept.join('\n')) {
    rmSync(out, { force: true });
    die(`archive contents differ from the selected file set (in archive: ${listed.length}, selected: ${kept.length})`);
  }
  report(listed, bytes, entry, skipped, out);
}

function inspect(args) {
  const zipPath = args.zip;
  if (!zipPath) die('inspect needs --zip');
  if (!existsSync(zipPath) || !statSync(zipPath).isFile()) die(`not a file: ${zipPath}`);
  const entryArg = validateEntry(args.entry);
  requireTool('unzip');

  const bytes = statSync(zipPath).size;
  if (bytes === 0) die('archive is 0 bytes');
  const { names: listed, why } = listArchive(zipPath);
  if (why) die(why);
  if (listed.length === 0) die('archive contains no files');
  const entry = resolveEntry(listed, entryArg);

  // A supplied ZIP is not rewritten: entries outside the allowlist or hidden go to a human decision;
  // system entries the server drops itself are left alone.
  const unexpected = listed.filter((n) => !SYSTEM_RE.test(n) && ((!ALLOWED_EXT.has(extname(n).toLowerCase()) && !isWellKnownBare(n)) || isHidden(n)));
  report(listed, bytes, entry, [], zipPath, unexpected);
}

const args = parseArgs(process.argv.slice(2));
if (args.mode === 'pack') await pack(args);
else if (args.mode === 'inspect') inspect(args);
else die('usage: publish.mjs pack --dir <dir> --out <zip> [--entry <name>] | inspect --zip <zip> [--entry <name>]');
