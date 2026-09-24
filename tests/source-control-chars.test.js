import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// A raw NUL or other control byte pasted into a source file makes git and grep
// treat the whole file as binary: reviews show "Binary files differ" and code
// searches skip it. Write such characters as escapes ('\u0000') instead.
const CONTROL = /[\x00-\x08\x0b\x0c\x0e-\x1f]/;

function jsFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name);
    if (d.isDirectory()) return jsFiles(p);
    return /\.(js|mjs|css)$/.test(d.name) ? [p] : [];
  });
}

describe('source files stay plain text', () => {
  const files = jsFiles(path.join(process.cwd(), 'src'));

  it('finds the source files to check', () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it('carry no raw control characters', () => {
    const offenders = files.filter((f) => CONTROL.test(fs.readFileSync(f, 'utf8')));
    expect(offenders.map((f) => path.relative(process.cwd(), f))).toEqual([]);
  });
});
