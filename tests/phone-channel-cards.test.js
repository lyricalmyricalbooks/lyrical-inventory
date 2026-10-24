import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// String path, not new URL(): jsdom's URL is rejected by node:fs.
const css = readFileSync(path.join(__dirname, '../src/styles/phone.css'), 'utf8');
const block = css.slice(css.indexOf('DASHBOARD: sales by channel cards (phone)'));
const rule = (sel) => block.split('\n').filter(l => l.includes(sel)).join('\n');

describe('phone dashboard sales-by-channel cards', () => {
  it('lays Units, Revenue and Share on one three-column row', () => {
    expect(block).toMatch(/#ch-body > tr\.phone-record \{\s*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
  });
  it('puts Details beside the channel name instead of a full-width bar', () => {
    expect(rule('> .phone-record-toggle')).toMatch(/grid-column: 3 !important; grid-row: 1 !important/);
    expect(rule(':not(.phone-record-toggle)')).toMatch(/grid-column: 1 \/ 3/);
  });
  it('keeps Details a full-size tap target', () => {
    expect(rule('> .phone-record-toggle')).toMatch(/min-height: var\(--target-min\)/);
  });
});
