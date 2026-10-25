/**
 * check-bundle-size.mjs — fail the build before a file outgrows offline use.
 *
 * The service worker only precaches files up to `maximumFileSizeToCacheInBytes`
 * (vite.config.js). A file over that limit is silently left out, and if it is
 * the main script the installed app can no longer open without a connection —
 * at a fair, say — with nothing warning anyone beforehand. This check runs
 * after `vite build` and fails while there is still room: any built file over
 * 85% of the precache limit is an error.
 *
 * The fix when it trips is to load another rarely used screen on demand
 * (src/lib/lazy-feature.js), not to raise the limit.
 *
 * Usage: npm run build && node scripts/check-bundle-size.mjs
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const SHARE = 0.85;

// Read the limit from vite.config.js so the two can't drift apart.
const config = readFileSync(join(ROOT, 'vite.config.js'), 'utf8');
const expr = config.match(/maximumFileSizeToCacheInBytes:\s*([\d\s*]+)/);
if (!expr) {
  console.error('check-bundle-size: maximumFileSizeToCacheInBytes not found in vite.config.js');
  process.exit(1);
}
const PRECACHE_LIMIT = expr[1].split('*').reduce((n, part) => n * Number(part.trim()), 1);
const BUDGET = Math.floor(PRECACHE_LIMIT * SHARE);

if (!existsSync(DIST)) {
  console.error('check-bundle-size: no dist/ folder — run `npm run build` first');
  process.exit(1);
}

const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const stat = statSync(path);
    if (stat.isDirectory()) walk(path);
    else if (/\.(js|css|html)$/.test(name)) files.push({ path: relative(ROOT, path), bytes: stat.size });
  }
})(DIST);

files.sort((a, b) => b.bytes - a.bytes);
const kb = (n) => `${(n / 1024).toFixed(0)} KiB`;
const over = files.filter(f => f.bytes > BUDGET);

console.log(`Bundle size budget: ${kb(BUDGET)} per file (${SHARE * 100}% of the ${kb(PRECACHE_LIMIT)} precache limit)`);
for (const f of files.slice(0, 5)) {
  console.log(`  ${f.bytes > BUDGET ? '✗' : '✓'} ${kb(f.bytes).padStart(9)}  ${(100 * f.bytes / PRECACHE_LIMIT).toFixed(0).padStart(3)}%  ${f.path}`);
}

if (over.length) {
  console.error(`\n${over.length} file(s) over budget. Load a rarely used screen on demand (src/lib/lazy-feature.js) rather than raising the limit.`);
  process.exit(1);
}
