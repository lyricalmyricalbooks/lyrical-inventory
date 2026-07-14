import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);
const mainContent = fs.readFileSync(path.resolve(dirname, '../src/main.js'), 'utf8');
const styleContent = fs.readFileSync(path.resolve(dirname, '../src/style.css'), 'utf8');

describe('Shipping P&L dashboard redesign', () => {
  it('uses an operational dashboard structure instead of inline card styling', () => {
    expect(mainContent).toContain('class="shipping-pnl-dashboard"');
    expect(mainContent).toContain('class="shipping-pnl-attention"');
    expect(mainContent).toContain('class="shipping-pnl-ledger"');
    expect(mainContent).toContain('Postage not linked');
    expect(styleContent).toContain('#ship-analysis-hub .shipping-pnl-dashboard');
  });
});
