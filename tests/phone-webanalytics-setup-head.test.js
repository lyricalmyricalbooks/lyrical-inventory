import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const phone = readFileSync('src/styles/phone.css', 'utf8');
const html = readFileSync('index.html', 'utf8');
const rule = (sel) => phone.match(new RegExp(sel.replace(/[.*+?^${}()|[\]\\>]/g, '\\$&') + '\\s*\\{([^}]*)\\}'))?.[1] ?? '';

describe('phone Web Analytics setup heading', () => {
  it('carries the title class in the markup', () => {
    expect(html).toMatch(/<h2 class="wa-setup-title"/);
  });
  it('stops faking Anton bold and sets it in capitals', () => {
    const r = rule('#tab-webanalytics .wa-setup-title');
    expect(r).toMatch(/font-weight:\s*400/);
    expect(r).toMatch(/text-transform:\s*uppercase/);
  });
  it('keeps the title and the connection tag on one row', () => {
    const r = rule('#tab-webanalytics > .row-between');
    expect(r).toMatch(/flex-direction:\s*row/);
    expect(r).toMatch(/flex-wrap:\s*nowrap/);
  });
});
