import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Sheets UX Enhancements (#4 & #7)', () => {
  const indexHtmlPath = path.resolve(__dirname, '../index.html');
  const styleCssPath = path.resolve(__dirname, '../src/style.css');
  const mainJsPath = path.resolve(__dirname, '../src/main.js');

  const indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');
  const styleCss = fs.readFileSync(styleCssPath, 'utf8');
  const mainJs = fs.readFileSync(mainJsPath, 'utf8');

  describe('Apps Script Code Box & Copy Button (#4)', () => {
    it('declares copy-gas-code-btn and gas-script-ver-tag in index.html', () => {
      expect(indexHtml).toContain('id="copy-gas-code-btn"');
      expect(indexHtml).toContain('class="btn sm copy-gas-btn"');
      expect(indexHtml).toContain('id="gas-script-ver-tag"');
      expect(indexHtml).toContain('onclick="copyGasCode()"');
    });

    it('styles .gas-code-container and .copy-gas-btn in style.css with surface-inverse and interactive feedback', () => {
      expect(styleCss).toContain('.gas-code-container');
      expect(styleCss).toContain('var(--surface-inverse');
      expect(styleCss).toContain('.copy-gas-btn');
      expect(styleCss).toContain('.copy-gas-btn.copied');
      expect(styleCss).toContain('.gas-version-tag');
    });

    it('main.js updates gas-script-ver-tag and applies copied feedback on copyGasCode()', () => {
      expect(mainJs).toContain('gas-script-ver-tag');
      expect(mainJs).toContain('copy-gas-code-btn');
      expect(mainJs).toContain("btn.classList.add('copied')");
    });
  });

  describe('Shimmer Sync Progress Bar (#7)', () => {
    it('declares sync-progress-bar and sync-progress-fill in index.html', () => {
      expect(indexHtml).toContain('id="sync-progress-bar"');
      expect(indexHtml).toContain('id="sync-progress-fill"');
    });

    it('styles .sync-progress-bar and .sync-progress-fill with track-bg and shimmer keyframes', () => {
      expect(styleCss).toContain('.sync-progress-bar');
      expect(styleCss).toContain('var(--track-bg');
      expect(styleCss).toContain('.sync-progress-fill::after');
      expect(styleCss).toContain('@keyframes syncProgressShimmer');
      expect(styleCss).toContain('prefers-reduced-motion');
    });

    it('formats sync-stats with DM Mono and tabular figures', () => {
      expect(styleCss).toContain('.sync-stats');
      expect(styleCss).toContain("font-family: 'DM Mono'");
      expect(styleCss).toContain('"tnum" 1');
    });
  });
});
