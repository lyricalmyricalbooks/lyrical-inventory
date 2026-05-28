import { describe, it, expect } from 'vitest';
import { escapeHtml } from '../src/lib/html.js';

describe('escapeHtml', () => {
  it('escapes the five HTML-significant characters', () => {
    expect(escapeHtml('&')).toBe('&amp;');
    expect(escapeHtml('<')).toBe('&lt;');
    expect(escapeHtml('>')).toBe('&gt;');
    expect(escapeHtml('"')).toBe('&quot;');
    expect(escapeHtml("'")).toBe('&#39;');
  });

  it('neutralizes a script-injection payload', () => {
    expect(escapeHtml('<img src=x onerror=alert(1)>')).toBe(
      '&lt;img src=x onerror=alert(1)&gt;'
    );
    expect(escapeHtml('<script>alert(1)</script>')).toBe(
      '&lt;script&gt;alert(1)&lt;/script&gt;'
    );
  });

  it('neutralizes an attribute-breakout payload', () => {
    // A store name that tries to close the attribute and add a handler.
    const evil = '" onmouseover="alert(1)';
    expect(escapeHtml(evil)).toBe('&quot; onmouseover=&quot;alert(1)');
  });

  it('returns empty string for null/undefined', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
  });

  it('coerces non-string values to their string form', () => {
    expect(escapeHtml(42)).toBe('42');
    expect(escapeHtml(0)).toBe('0');
    expect(escapeHtml(false)).toBe('false');
  });

  it('leaves ordinary text untouched', () => {
    expect(escapeHtml('The Hound')).toBe('The Hound');
    expect(escapeHtml('Café Müller — Berlin')).toBe('Café Müller — Berlin');
  });

  it('escapes every occurrence, not just the first', () => {
    expect(escapeHtml('<<>>')).toBe('&lt;&lt;&gt;&gt;');
    expect(escapeHtml('a & b & c')).toBe('a &amp; b &amp; c');
  });
});
