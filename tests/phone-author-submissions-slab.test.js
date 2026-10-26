import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const phone = readFileSync('src/styles/phone.css', 'utf8');
const rule = (sel) => phone.match(new RegExp(`\\n\\s*${sel.replace(/[.]/g, '\\.')}\\s*\\{([^}]*)\\}`))?.[1] ?? '';

describe('phone Author Submissions notice', () => {
  it('is an inked slab with the amber edge', () => {
    const r = rule('.author-subs-card');
    expect(r).toContain('var(--rule-ink)');
    expect(r).toContain('var(--elev-1)');
    expect(r).toContain('var(--status-active)');
  });
  it('stacks the review buttons at one full width', () => {
    expect(rule('.author-subs-actions')).toContain('grid-template-columns: minmax(0, 1fr)');
    expect(rule('.author-subs-btn')).toContain('width: 100%');
  });
});

describe('phone approval banner ("1 sale to approve")', () => {
  const riso = readFileSync('src/styles/phone-riso.css', 'utf8');
  const banner = riso.match(/\.pub-shell \.publisher-action-banner\s*\{([^}]*)\}/)?.[1] ?? '';
  it('is an inked slab with an amber edge stripe', () => {
    expect(banner).toMatch(/border:\s*var\(--stroke\)\s+solid\s+var\(--rule-ink\)/);
    expect(banner).toMatch(/border-left:\s*6px\s+solid\s+var\(--status-active\)/);
    expect(banner).toContain('box-shadow: var(--elev-1)');
    expect(banner).not.toContain('stroke-hair');
  });
});
