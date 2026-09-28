import { describe, expect, it } from 'vitest';
import { normalizeLetterhead, renderLetterhead } from '../src/lib/letterhead.js';

describe('letterhead document', () => {
  it('uses publisher identity as a starting point without requiring invoice changes', () => {
    const letter = normalizeLetterhead({}, { name: 'Publisher House', email: 'hello@example.com' });
    expect(letter.name).toBe('Publisher House');
    expect(letter.email).toBe('hello@example.com');
    expect(letter.body).toBe('');
  });

  it('escapes filled letter text and keeps line breaks in the preview', () => {
    const html = renderLetterhead(normalizeLetterhead({
      name: '<script>alert(1)</script>',
      recipient: 'Sam & Co',
      body: 'Hello <b>Sam</b>\nSecond line',
      accent: '#aabbcc',
    }));
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('Sam &amp; Co');
    expect(html).toContain('Hello &lt;b&gt;Sam&lt;/b&gt;<br>Second line');
    expect(html).not.toContain('<script>');
  });

  it('rejects unsafe style and image values', () => {
    const letter = normalizeLetterhead({ accent: 'red;position:fixed', logo: 'javascript:alert(1)' });
    expect(letter.accent).toBe('#a87042');
    expect(renderLetterhead(letter)).not.toContain('javascript:');
  });
});
