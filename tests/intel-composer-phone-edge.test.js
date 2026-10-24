import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';

const css = readFileSync(path.resolve(__dirname, '../src/style.css'), 'utf8');

describe('Intelligence question box on a narrow screen', () => {
  const block = css.match(/@container \(max-width: 34rem\) \{\s*\.intel-thread[\s\S]*?\n\}/)?.[0] ?? '';

  it('shares the thread side padding so one left edge runs down the panel', () => {
    expect(block).toMatch(/\.intel-thread \{[^}]*padding: var\(--space-4\)/);
    expect(block).toMatch(/\.intel-composer \{ margin: 0 var\(--space-4\)/);
    expect(block).toMatch(/\.intel-foot \{ margin-inline: var\(--space-4\)/);
  });
});
