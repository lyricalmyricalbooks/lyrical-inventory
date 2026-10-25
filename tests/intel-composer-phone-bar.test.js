import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';

const css = readFileSync(path.resolve(__dirname, '../src/style.css'), 'utf8');

describe('Intelligence question box on a phone', () => {
  const rule = css.match(/#tab-intel \.intel-composer\{([^}]*)\}/)?.[1] ?? '';

  it('puts the field and Send together on one row inside one box', () => {
    expect(rule).toMatch(/grid-template-columns:minmax\(0,1fr\) auto/);
    expect(rule).not.toMatch(/border:0/);
    expect(css).toMatch(/#tab-intel \.intel-composer-actions\{grid-column:2;\}/);
  });
});
