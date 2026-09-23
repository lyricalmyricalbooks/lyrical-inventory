import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'src/style.css'), 'utf8');

describe('screen-adaptive shell', () => {
  it('allows browser zoom while opting into safe-area viewport coverage', () => {
    const viewport = html.match(/<meta name="viewport" content="([^"]+)">/)?.[1] || '';
    expect(viewport).toContain('width=device-width');
    expect(viewport).toContain('viewport-fit=cover');
    expect(viewport).not.toMatch(/user-scalable\s*=\s*no/);
    expect(viewport).not.toMatch(/maximum-scale\s*=\s*1/);
  });

  it('uses the dynamic viewport and all four safe-area insets', () => {
    expect(css).toMatch(/min-height:\s*100dvh/);
    for (const edge of ['top', 'right', 'bottom', 'left']) {
      expect(css).toContain(`env(safe-area-inset-${edge})`);
    }
  });

  it('adapts short landscape screens and narrow-screen dialogs', () => {
    expect(css).toMatch(/@media\s*\(max-height:\s*560px\)\s*and\s*\(orientation:\s*landscape\)/);
    expect(css).toMatch(/@media\s*\(max-width:\s*600px\)[\s\S]*?\.overlay\s*\{[^}]*align-items:\s*flex-end/);
    expect(css).toMatch(/max-height:\s*min\(92dvh/);
  });

  it('gives panels a fluid gutter and component-query context', () => {
    const panelRule = css.match(/\.tab-panel\{([^}]*)\}/)?.[1] || '';
    expect(panelRule).toContain('clamp(1rem,2.5vw,2rem)');
    expect(panelRule).toContain('container-type:inline-size');
  });
});
