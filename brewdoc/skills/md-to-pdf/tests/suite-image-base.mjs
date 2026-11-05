#!/usr/bin/env node
// suite-image-base.mjs - reportlab resolves a relative image against the doc dir first, cwd as fallback.
// MD_TO_PDF / PYTHON override the converter copy / interpreter under test.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync, realpathSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { deflateSync, crc32 } from 'node:zlib';

const HERE = dirname(fileURLToPath(import.meta.url));
const CONVERTER = process.env.MD_TO_PDF || join(HERE, '..', 'scripts', 'md_to_pdf.py');
const PYTHON = process.env.PYTHON || 'python3';
const BASE = realpathSync(mkdtempSync(join(tmpdir(), 'brewdoc-mdpdf-img-')));

let passed = 0;
let failed = 0;
const results = [];

function check(name, actual, expected, message) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  passed += ok ? 1 : 0;
  failed += ok ? 0 : 1;
  results.push(ok
    ? `  PASS  ${name}  (${message})`
    : `  FAIL  ${name}  (${message} | actual=${JSON.stringify(actual)} expected=${JSON.stringify(expected)})`);
}

/** Minimal 8-bit grayscale PNG of the given size. */
function png(width, height) {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  const raw = Buffer.alloc((width + 1) * height, 0x80);
  for (let y = 0; y < height; y++) raw[y * (width + 1)] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** [width, height] of every image XObject in the PDF, in file order. */
function imageSizes(pdfPath) {
  const text = readFileSync(pdfPath).toString('latin1');
  return [...text.matchAll(/<<([^>]*\/Subtype \/Image[^>]*)>>/g)].map((m) => [
    Number(/\/Width (\d+)/.exec(m[1])[1]), Number(/\/Height (\d+)/.exec(m[1])[1]),
  ]);
}

/** Converts doc/doc.md (`![pic](img.png)`) with cwd = cwd/; images = [[subdir, width, height]]. */
function convert(name, images) {
  const docDir = join(BASE, name, 'doc');
  const cwdDir = join(BASE, name, 'cwd');
  mkdirSync(docDir, { recursive: true });
  mkdirSync(cwdDir, { recursive: true });
  writeFileSync(join(docDir, 'doc.md'), '# Pic\n\n![pic](img.png)\n');
  images.forEach(([sub, w, h]) => writeFileSync(join(BASE, name, sub, 'img.png'), png(w, h)));
  const out = join(BASE, name, 'out.pdf');
  const run = spawnSync(PYTHON, [CONVERTER, join(docDir, 'doc.md'), out, '--engine', 'reportlab'], {
    cwd: cwdDir, encoding: 'utf8', timeout: 120000,
  });
  return { status: run.status, stderr: run.stderr, sizes: existsSync(out) ? imageSizes(out) : '(no pdf)' };
}

const docFirst = convert('doc-first', [['doc', 3, 2], ['cwd', 5, 4]]);
check('doc-first-status', [docFirst.status, docFirst.stderr], [0, ''], 'conversion with images in both dirs exits 0, no warning');
check('doc-first-image', docFirst.sizes, [[3, 2]],
  'GIVEN img.png in doc dir (3x2) and cwd (5x4) WHEN cwd is the other dir THEN the doc-dir image is embedded');

const cwdFallback = convert('cwd-fallback', [['cwd', 5, 4]]);
check('cwd-fallback-status', [cwdFallback.status, cwdFallback.stderr], [0, ''], 'conversion with the image only in cwd exits 0, no warning');
check('cwd-fallback-image', cwdFallback.sizes, [[5, 4]],
  'GIVEN img.png only in cwd (5x4) WHEN converting THEN the cwd image is embedded as a fallback');

rmSync(BASE, { recursive: true, force: true });

console.log(results.join('\n'));
console.log('\n| Result | Value |');
console.log('|--------|-------|');
console.log(`| passed | ${passed} |`);
console.log(`| failed | ${failed} |`);
process.exit(failed === 0 ? 0 : 1);
