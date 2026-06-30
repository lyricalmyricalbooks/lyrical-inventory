import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { findLowContrastText, INDEX_HTML } from '../scripts/check-contrast.mjs';

describe('check-contrast', () => {
  it('flags light text that sits on a light (no dark ancestor) background', () => {
    const html = `
      <body>
        <div>plain dark text — fine</div>
        <div style="color:var(--cream);">washed out on cream body</div>
        <div style="background:var(--ink2);">
          <span style="color:var(--cream);">light on dark — fine</span>
        </div>
        <div style="color:rgba(255,255,255,.5);/* contrast-ok */">reviewed exception</div>
      </body>`;
    const findings = findLowContrastText(html);
    expect(findings).toHaveLength(1);
    expect(findings[0].color).toContain('--cream');
  });

  it('keeps index.html free of light-on-light text', () => {
    const html = readFileSync(INDEX_HTML, 'utf8');
    const findings = findLowContrastText(html);
    const detail = findings
      .map(f => `index.html:${f.line} <${f.tag}> color:${f.color}`)
      .join('\n');
    expect(findings, `Low-contrast text found:\n${detail}`).toHaveLength(0);
  });
});
