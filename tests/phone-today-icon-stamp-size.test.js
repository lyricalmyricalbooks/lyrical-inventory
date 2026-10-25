import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const css = fs.readFileSync(path.join(__dirname, '../src/styles/phone-riso.css'), 'utf8');

describe('phone Today icon stamps', () => {
  it.each(['.today-card .today-card-ic', '.today-row-ic'])('%s letters are on the type scale, not 10px', (sel) => {
    const at = css.indexOf(`#tab-today ${sel}`);
    expect(at).toBeGreaterThan(-1);
    const block = css.slice(at, css.indexOf('}', at));
    expect(block).toContain('font: 500 var(--text-xs) / 1 var(--font-mono)');
    expect(block).not.toMatch(/font:[^;]*\b10px/);
  });
});
