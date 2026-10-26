import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const phone = readFileSync(path.join(__dirname, '../src/styles/phone.css'), 'utf8');

test('phone Intelligence notes are inked slabs, not a pale wash and a hairline', () => {
  const both = phone.match(/#tab-intel \.intel-notice,\s*#tab-intel \.intel-disclosure\s*\{([\s\S]*?)\n  \}/);
  const notice = phone.match(/#tab-intel \.intel-notice\s*\{([\s\S]*?)\n  \}/);
  expect(both).not.toBeNull();
  expect(both[1]).toMatch(/border:\s*var\(--stroke\)\s+solid\s+var\(--rule-ink\)/);
  expect(both[1]).toMatch(/box-shadow:\s*var\(--elev-1\)/);
  expect(both[1]).toMatch(/background:\s*var\(--surface-card\)/);
  expect(notice[1]).toMatch(/inset 4px 0 0 var\(--status-info\)/);
  expect(notice[1]).toMatch(/line-height:\s*var\(--leading-normal\)/);
});

test('phone Intelligence quick asks are inked, fingertip-tall slabs', () => {
  const rule = phone.match(/#tab-intel \.intel-rail-btn:not\(\.intel-rail-recent\)\s*\{([\s\S]*?)\n  \}/);
  expect(rule).not.toBeNull();
  expect(rule[1]).toMatch(/border:\s*var\(--stroke\)\s+solid\s+var\(--rule-ink\)/);
  expect(rule[1]).toMatch(/min-height:\s*var\(--target-min\)/);
  expect(phone).toMatch(/prefers-reduced-motion: reduce\) \{\s*#tab-intel \.intel-rail-btn/);
});
