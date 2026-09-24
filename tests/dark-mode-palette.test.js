import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { paletteFor, parseRootVars, makeColorResolver, contrastRatio } from '../scripts/check-contrast.mjs';

// Night mode follows the Claude app's model: every SURFACE is a dark warm
// grey that gets lighter as it rises, and every TEXT token is light. Keeping
// those two sets strictly apart is what makes a dark-on-dark screen
// impossible by construction — the bug class the retired light-tile ("Press
// Proof") dark mode kept producing.

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const vars = new Map([
  ...parseRootVars(read('src/styles/system.css')),
  ...paletteFor('dark', read('src/style.css'), read('src/styles/theme-dark.css')),
]);
const resolve = makeColorResolver(vars);
const rgb = (t) => { const c = resolve(`var(${t})`); expect(c, t).toBeTruthy(); return c; };
const lum = ({ r, g, b }) => {
  const ch = (c) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
};

const SURFACES = ['--cream', '--cream2', '--cream3', '--cream4', '--surface-card', '--surface-raised',
  '--surface-page', '--card-bg', '--input-bg', '--ink', '--ink2', '--ink3', '--paper', '--paper2', '--paper3'];
const TEXT = ['--text', '--text2', '--text3', '--content-primary', '--content-secondary', '--content-muted',
  '--gold-text', '--green', '--red', '--amber', '--blue', '--on-paper', '--on-paper2', '--on-paper3'];
// Where text actually sits: the page, a card, and a raised control on a card.
const READING_SURFACES = ['--cream', '--surface-card', '--cream3'];

describe('night-mode palette', () => {
  it('every surface is darker than every text colour', () => {
    const brightestSurface = Math.max(...SURFACES.map((t) => lum(rgb(t))));
    const dimmestText = Math.min(...TEXT.map((t) => lum(rgb(t))));
    expect(brightestSurface).toBeLessThan(dimmestText);
  });

  it('surfaces get lighter as they rise: page → card → raised control', () => {
    expect(lum(rgb('--cream'))).toBeLessThan(lum(rgb('--surface-card')));
    expect(lum(rgb('--surface-card'))).toBeLessThan(lum(rgb('--cream3')));
    expect(lum(rgb('--input-bg'))).toBeLessThan(lum(rgb('--cream')));
  });

  it.each(['--text', '--text2', '--text3', '--gold-text', '--green', '--red', '--amber', '--blue'])(
    '%s reads at AA on the page, a card and a raised control',
    (text) => {
      for (const surface of READING_SURFACES) {
        expect(contrastRatio(rgb(text), rgb(surface)), `${text} on ${surface}`).toBeGreaterThanOrEqual(4.5);
      }
    },
  );

  it('a solid accent fill carries a dark label', () => {
    expect(contrastRatio(rgb('--ink'), rgb('--gold'))).toBeGreaterThanOrEqual(4.5);
  });
});
