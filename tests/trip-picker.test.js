import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Trip Combobox & Visualizer Unit Tests', () => {
  it('verifies HTML elements for trip picker combobox and visual cards exist', () => {
    const htmlPath = path.join(process.cwd(), 'index.html');
    const html = fs.readFileSync(htmlPath, 'utf8');

    expect(html).toContain('id="tc-exp-trip"');
    expect(html).toContain('id="tc-trip-quick-chips"');
    expect(html).toContain('id="tc-exp-trip-menu"');
    expect(html).toContain('id="tc-trip-selected-preview"');
    expect(html).toContain('id="tc-trips-btn-cards"');
    expect(html).toContain('id="tc-trips-btn-table"');
    expect(html).toContain('id="tc-trip-stats-bar"');
    expect(html).toContain('id="tc-trip-cards-grid"');
  });

  it('verifies CSS rules for trip picker and visual cards exist in style.css', () => {
    const cssPath = path.join(process.cwd(), 'src/style.css');
    const css = fs.readFileSync(cssPath, 'utf8');

    expect(css).toContain('.tc-trip-picker-wrapper');
    expect(css).toContain('.tc-trip-quick-chips');
    expect(css).toContain('.tc-trip-chip');
    expect(css).toContain('.tc-trip-dropdown-menu');
    expect(css).toContain('.tc-trip-option');
    expect(css).toContain('.tc-trips-header');
    expect(css).toContain('.tc-trips-view-toggle');
    expect(css).toContain('.tc-trip-grid');
    expect(css).toContain('.tc-trip-card');
  });

  it('verifies trip functions are declared and exposed in main.js', () => {
    const jsPath = path.join(process.cwd(), 'src/main.js');
    const js = fs.readFileSync(jsPath, 'utf8');

    expect(js).toContain('function tcSetTripsView');
    expect(js).toContain('function _tcGetTripsSummaryAll');
    expect(js).toContain('function tcRenderQuickTripChips');
    expect(js).toContain('function tcUpdateTripSelectedPreview');
    expect(js).toContain('function tcOpenTripDropdown');
    expect(js).toContain('function tcFilterTripDropdown');
    expect(js).toContain('function tcSelectTripOption');
  });
});
