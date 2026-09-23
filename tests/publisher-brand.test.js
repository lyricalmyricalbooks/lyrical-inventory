import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexContent = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

describe('publisher app branding', () => {
  it('identifies the sidebar as the Lyricalmyrical Books inventory', () => {
    const sidebarBrand = indexContent.match(/<div class="pub-brand"[\s\S]*?<\/div>\s*<\/div>/)?.[0];

    expect(sidebarBrand).toContain('<div class="pub-wordmark">Lyricalmyrical Books</div>');
    expect(sidebarBrand).toContain('<div class="pub-tag">Inventory</div>');
  });
});
