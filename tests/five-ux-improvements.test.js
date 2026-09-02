import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const styleCss = readFileSync(path.join(__dirname, '../src/style.css'), 'utf8');
const indexHtml = readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const bigcartelJs = readFileSync(path.join(__dirname, '../src/features/bigcartel.js'), 'utf8');
const taxcentreJs = readFileSync(path.join(__dirname, '../src/features/taxcentre.js'), 'utf8');

describe('5 High-Impact UX Improvements Suite', () => {
  describe('1. Big Cartel Zero Blank State & Skeleton Loaders', () => {
    it('defines .bc-empty-state and .bc-skeleton-row in style.css', () => {
      expect(styleCss).toContain('.bc-empty-state');
      expect(styleCss).toContain('.bc-skeleton-row');
      expect(styleCss).toContain('.bc-empty-title');
      expect(styleCss).toContain('.bc-empty-msg');
    });

    it('renders semantic empty-state and skeleton rows in bigcartel.js', () => {
      expect(bigcartelJs).toContain('bc-empty-state');
      expect(bigcartelJs).toContain('bc-skeleton-row');
      expect(bigcartelJs).toContain('No Big Cartel Orders Found');
      expect(bigcartelJs).not.toContain('<tr><td colspan="9" style="text-align:center; padding:3rem; color:var(--text3);">No orders found.</td></tr>');
    });
  });

  describe('2. Profit Tier 44px Touch Targets & OKLCH Rose Color', () => {
    it('enforces var(--target-min) on .tier-remove-btn with OKLCH rose tokens', () => {
      expect(styleCss).toMatch(/\.tier-remove-btn\s*\{[^}]*min-height:\s*var\(--target-min\);/);
      expect(styleCss).toMatch(/\.tier-remove-btn\s*\{[^}]*min-width:\s*var\(--target-min\);/);
      expect(styleCss).toMatch(/\.tier-remove-btn:hover\s*\{[^}]*oklch\(0\.65 0\.22 25/);
    });

    it('provides spring active scaling and focus visible styling', () => {
      expect(styleCss).toMatch(/\.tier-remove-btn:active\s*\{[^}]*transform:\s*scale\(0\.95\);/);
      expect(styleCss).toMatch(/\.tier-remove-btn:focus-visible\s*\{/);
    });
  });

  describe('3. Tax Centre Trips Container Queries & Fluid Cards', () => {
    it('declares container-type on .tc-trip-grid and defines @container breakpoint', () => {
      expect(styleCss).toMatch(/\.tc-trip-grid\s*\{[^}]*container-type:\s*inline-size;/);
      expect(styleCss).toMatch(/\.tc-trip-grid\s*\{[^}]*container-name:\s*tc-trips;/);
      expect(styleCss).toMatch(/@container\s+tc-trips\s*\(\s*max-width:\s*480px\s*\)/);
    });

    it('uses canonical surface tokens and tabular figures on trip cards', () => {
      expect(styleCss).toMatch(/\.tc-trip-card\s*\{[^}]*background:\s*var\(--surface-card\)/);
      expect(styleCss).toMatch(/\.tc-trip-card-total\s*\{[^}]*font-family:\s*'DM Mono'/);
      expect(styleCss).toContain('.tc-trip-empty-state');
    });

    it('renders semantic empty trip card and table rows in taxcentre.js', () => {
      expect(taxcentreJs).toContain('tc-trip-empty-state');
      expect(taxcentreJs).toContain('No Business Trips Logged Yet');
      expect(taxcentreJs).not.toContain('background:rgba(28,25,23,0.82)');
    });
  });

  describe('4. Address Verification 44px Touch Targets & Tabular Figures', () => {
    it('enforces var(--target-min) on .addr-verify-corrections-head .btn', () => {
      expect(styleCss).toMatch(/\.addr-verify-corrections-head \.btn\s*\{[^}]*min-height:\s*var\(--target-min\);/);
      expect(styleCss).toMatch(/\.addr-verify-corrections-head \.btn:hover\s*\{[^}]*transform:\s*translateY\(-1\.5px\);/);
    });

    it('enforces tabular monospace figures on address comparison lines', () => {
      expect(styleCss).toMatch(/\.addr-verify-from\s*\{[^}]*font-family:\s*'DM Mono'/);
      expect(styleCss).toMatch(/\.addr-verify-to\s*\{[^}]*font-family:\s*'DM Mono'/);
    });
  });

  describe('5. Tax Centre Ergonomic Search Inputs', () => {
    it('defines .tc-search-bar and .tc-search-input classes with 44px target min', () => {
      expect(styleCss).toContain('.tc-search-bar');
      expect(styleCss).toMatch(/\.tc-search-input\s*\{[^}]*min-height:\s*var\(--target-min\);/);
      expect(styleCss).toContain('.tc-search-kbd');
      expect(styleCss).toContain('.tc-filter-select');
    });

    it('index.html uses tc-search-bar component for ledger and gallery search', () => {
      expect(indexHtml).toContain('id="tc-ledger-search" class="tc-search-input"');
      expect(indexHtml).toContain('id="tc-gallery-search" class="tc-search-input"');
      expect(indexHtml).toContain('class="tc-search-kbd"');
    });

    it('main.js binds keyboard shortcuts for "/" to focus ledger search', () => {
      const mainJs = readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');
      expect(mainJs).toContain("e.key === '/'");
      expect(mainJs).toContain('tc-ledger-search');
    });
  });
});
