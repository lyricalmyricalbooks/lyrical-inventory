import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Custom Searchable Destination Picker UX/UI Suite', () => {
  const mainJsPath = path.resolve(__dirname, '../src/main.js');
  const indexHtmlPath = path.resolve(__dirname, '../index.html');
  const styleCssPath = path.resolve(__dirname, '../src/style.css');

  const mainContent = fs.readFileSync(mainJsPath, 'utf8');
  const indexContent = fs.readFileSync(indexHtmlPath, 'utf8');
  const styleContent = fs.readFileSync(styleCssPath, 'utf8');

  it('contains the custom destination combobox structure in index.html', () => {
    expect(indexContent).toContain('id="custom-ship-dest-wrapper"');
    expect(indexContent).toContain('id="custom-ship-dest-trigger"');
    expect(indexContent).toContain('id="custom-ship-dest-menu"');
    expect(indexContent).toContain('id="custom-ship-dest-search"');
    expect(indexContent).toContain('id="custom-ship-dest-chips"');
    expect(indexContent).toContain('id="custom-ship-dest-list"');
  });

  it('maintains the hidden native select for backward compatibility & tests', () => {
    expect(indexContent).toContain('id="ship-prefill-dest"');
    expect(indexContent).toContain('style="display:none;"');
  });

  it('defines custom destination picker handlers in main.js', () => {
    expect(mainContent).toContain('function renderCustomShippoDestPicker()');
    expect(mainContent).toContain('function toggleShippoDestDropdown(');
    expect(mainContent).toContain('function setShippoDestCategoryFilter(');
    expect(mainContent).toContain('function filterShippoDestMenu()');
    expect(mainContent).toContain('function selectShippoDestCustomItem(');
    expect(mainContent).toContain('function clearShippoDestSelection(');
  });

  it('includes styling tokens and keyframes for the custom combobox in style.css', () => {
    expect(styleContent).toContain('.custom-dest-wrapper');
    expect(styleContent).toContain('.custom-dest-trigger');
    expect(styleContent).toContain('.custom-dest-menu');
    expect(styleContent).toContain('.custom-dest-chips');
    expect(styleContent).toContain('.custom-dest-item-badge');
  });

  it('returns clean recipient phone via getFallbackShippingPhone without injecting sender phone', () => {
    expect(mainContent).toContain('function getFallbackShippingPhone(');
    expect(mainContent).toContain('getFallbackShippingPhone(addr.phone)');

    const fallbackFunc = new Function('preferredPhone', `
      return (preferredPhone || '').toString().trim();
    `);

    expect(fallbackFunc('+1 555 123 4567')).toBe('+1 555 123 4567');
    expect(fallbackFunc('')).toBe('');
    expect(fallbackFunc(null)).toBe('');
  });

  it('elevates card z-index and ensures overflow:visible when dropdown is open', () => {
    expect(styleContent).toContain('.ship-prefills-card');
    expect(styleContent).toContain('overflow: visible !important;');
    expect(styleContent).toContain('z-index: 99999 !important;');
    expect(mainContent).toContain('function setShippoDestMenuOpenState(');
    expect(mainContent).toContain('card.style.zIndex = \'9999\'');
  });
});
