import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Umami Analytics API Helper Functions', () => {
  const mainJsPath = path.resolve(__dirname, '../src/main.js');
  let parseUmamiShareUrl;
  let formatUmamiDuration;
  let calculateUmamiTimeframe;
  let computeMetricChange;

  beforeEach(() => {
    const mainContent = fs.readFileSync(mainJsPath, 'utf8');

    const parseMatch = mainContent.match(/function parseUmamiShareUrl\(url\) \{([\s\S]+?)\n\}/);
    const durationMatch = mainContent.match(/function formatUmamiDuration\(seconds\) \{([\s\S]+?)\n\}/);
    const timeframeMatch = mainContent.match(/function calculateUmamiTimeframe\(hours\s*=\s*24\) \{([\s\S]+?)\n\}/);
    const changeMatch = mainContent.match(/function computeMetricChange\(currentVal,\s*prevVal\) \{([\s\S]+?)\n\}/);

    expect(parseMatch).not.toBeNull();
    expect(durationMatch).not.toBeNull();
    expect(timeframeMatch).not.toBeNull();
    expect(changeMatch).not.toBeNull();

    parseUmamiShareUrl = new Function('url', parseMatch[0] + '\nreturn parseUmamiShareUrl(url);');
    formatUmamiDuration = new Function('seconds', durationMatch[0] + '\nreturn formatUmamiDuration(seconds);');
    calculateUmamiTimeframe = new Function('hours', timeframeMatch[0] + '\nreturn calculateUmamiTimeframe(hours);');
    computeMetricChange = new Function('currentVal', 'prevVal', changeMatch[0] + '\nreturn computeMetricChange(currentVal, prevVal);');
  });

  describe('parseUmamiShareUrl', () => {
    it('correctly extracts origin and shareId from Umami Cloud share URL', () => {
      const result = parseUmamiShareUrl('https://cloud.umami.is/share/1a2b3c4d-5e6f-7a8b-9c0d/lyricalmyricalbooks.com');
      expect(result).toEqual({
        origin: 'https://cloud.umami.is',
        shareId: '1a2b3c4d-5e6f-7a8b-9c0d'
      });
    });

    it('correctly extracts origin and shareId from self-hosted Umami URL', () => {
      const result = parseUmamiShareUrl('https://analytics.mybookstore.com/share/abc123token');
      expect(result).toEqual({
        origin: 'https://analytics.mybookstore.com',
        shareId: 'abc123token'
      });
    });

    it('returns null for non-umami or invalid share URLs', () => {
      expect(parseUmamiShareUrl('https://google.com')).toBeNull();
      expect(parseUmamiShareUrl('not-a-url')).toBeNull();
    });
  });

  describe('formatUmamiDuration', () => {
    it('formats seconds into clean human-readable strings', () => {
      expect(formatUmamiDuration(0)).toBe('0s');
      expect(formatUmamiDuration(2)).toBe('2s');
      expect(formatUmamiDuration(45)).toBe('45s');
      expect(formatUmamiDuration(125)).toBe('2m 5s');
      expect(formatUmamiDuration(3665)).toBe('1h 1m');
    });
  });

  describe('calculateUmamiTimeframe', () => {
    it('generates startAt, endAt, prevStartAt, and prevEndAt timestamps', () => {
      const tf = calculateUmamiTimeframe(24);
      expect(tf.endAt).toBeGreaterThan(0);
      expect(tf.startAt).toBe(tf.endAt - 24 * 3600 * 1000);
      expect(tf.prevStartAt).toBe(tf.startAt - 24 * 3600 * 1000);
      expect(tf.prevEndAt).toBe(tf.startAt);
    });
  });

  describe('computeMetricChange', () => {
    it('calculates percentage changes correctly', () => {
      expect(computeMetricChange(20, 10)).toEqual({ percent: 100, formatted: '↑ 100%', isIncrease: true });
      expect(computeMetricChange(15, 20)).toEqual({ percent: -25, formatted: '↓ 25%', isIncrease: false });
      expect(computeMetricChange(10, 10)).toEqual({ percent: 0, formatted: '0%', isIncrease: false });
    });
  });
});
