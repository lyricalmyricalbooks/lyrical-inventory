import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import vm from 'vm';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read and evaluate Code.gs to extract normalizeCcy_
const codeGsPath = path.resolve(__dirname, '../apps-script/Code.gs');
const codeContent = fs.readFileSync(codeGsPath, 'utf8');

const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(codeContent, sandbox);

const normalizeCcy_ = sandbox.normalizeCcy_;

describe('normalizeCcy_', () => {
  it('is extracted correctly as a function', () => {
    expect(typeof normalizeCcy_).toBe('function');
  });

  describe('handles edge cases gracefully', () => {
    it('returns empty string for null', () => {
      expect(normalizeCcy_(null)).toBe('');
    });

    it('returns empty string for undefined', () => {
      expect(normalizeCcy_(undefined)).toBe('');
    });

    it('returns empty string for empty string', () => {
      expect(normalizeCcy_('')).toBe('');
    });

    it('returns empty string for whitespace-only string', () => {
      expect(normalizeCcy_('   ')).toBe('');
    });
  });

  describe('maps predefined exact symbols accurately', () => {
    it('maps CAD variants', () => {
      expect(normalizeCcy_('CA$')).toBe('CAD');
      expect(normalizeCcy_('C$')).toBe('CAD');
      expect(normalizeCcy_('CDN$')).toBe('CAD');
      expect(normalizeCcy_('$CAD')).toBe('CAD');
      expect(normalizeCcy_('$')).toBe('CAD');
    });

    it('maps USD variants', () => {
      expect(normalizeCcy_('US$')).toBe('USD');
      expect(normalizeCcy_('USD$')).toBe('USD');
      expect(normalizeCcy_('$US')).toBe('USD');
    });

    it('maps EUR variants', () => {
      expect(normalizeCcy_('€')).toBe('EUR');
      expect(normalizeCcy_('EUR€')).toBe('EUR');
    });

    it('maps GBP variants', () => {
      expect(normalizeCcy_('£')).toBe('GBP');
    });

    it('maps JPY variants', () => {
      expect(normalizeCcy_('¥')).toBe('JPY');
    });

    it('maps AUD variants', () => {
      expect(normalizeCcy_('A$')).toBe('AUD');
      expect(normalizeCcy_('AU$')).toBe('AUD');
    });

    it('maps CHF variants', () => {
      expect(normalizeCcy_('CHF')).toBe('CHF');
    });
  });

  describe('handles whitespace and case insensitivity', () => {
    it('maps mixed-case CAD variants with whitespace', () => {
      expect(normalizeCcy_('  ca$  ')).toBe('CAD');
      expect(normalizeCcy_(' cdn$')).toBe('CAD');
    });

    it('maps mixed-case USD variants with whitespace', () => {
      expect(normalizeCcy_('us$ ')).toBe('USD');
      expect(normalizeCcy_(' $us ')).toBe('USD');
    });
  });

  describe('handles 3-letter currency codes', () => {
    it('returns uppercase 3-letter code if valid unmapped format', () => {
      expect(normalizeCcy_('MXN')).toBe('MXN');
      expect(normalizeCcy_('mxn')).toBe('MXN');
      expect(normalizeCcy_(' JMD ')).toBe('JMD');
    });
  });

  describe('handles non-standard unmatched string lengths', () => {
    it('returns uppercase string if neither mapped nor 3 letters', () => {
      expect(normalizeCcy_('BITCOIN')).toBe('BITCOIN');
      expect(normalizeCcy_(' peso ')).toBe('PESO');
      expect(normalizeCcy_('r')).toBe('R');
      expect(normalizeCcy_('1234')).toBe('1234');
    });
  });
});
