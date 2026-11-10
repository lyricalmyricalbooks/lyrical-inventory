import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const css = fs.readFileSync(path.join(__dirname, '../src/styles/phone-riso.css'), 'utf8');

// The Today stamps are line icons now; they size by font-size (the icon is
// 1em square), so each holder pins a square box and one icon size.
describe('phone Today icons', () => {
  it.each([['.today-card .today-card-ic', '22px'], ['.today-row-ic', '20px']])('%s is a fixed square icon box', (sel, size) => {
    const at = css.indexOf(`#tab-today ${sel}`);
    expect(at).toBeGreaterThan(-1);
    const block = css.slice(at, css.indexOf('}', at));
    expect(block).toContain(`width: ${size}; height: ${size};`);
    expect(block).toMatch(/font-size: \d+px;/);
    expect(block).not.toMatch(/font:[^;]*\b10px/);
  });
});
