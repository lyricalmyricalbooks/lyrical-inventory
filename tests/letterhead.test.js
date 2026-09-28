import { describe, expect, it } from 'vitest';
import { normalizeLetterhead, renderLetterhead, sanitizeLetterheadBody } from '../src/lib/letterhead.js';

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

  it('keeps supported formatting while stripping pasted scripts and attributes', () => {
    const clean = sanitizeLetterheadBody('<p onclick="alert(1)">Hello <strong>bold</strong> and <em>italic</em></p><ul><li>One</li></ul><img src=x onerror=alert(1)><script>alert(2)</script>');
    expect(clean).toContain('<strong>bold</strong>');
    expect(clean).toContain('<em>italic</em>');
    expect(clean).toContain('<ul><li>One</li></ul>');
    expect(clean).not.toMatch(/onclick|onerror|<img|<script|alert/);
    expect(sanitizeLetterheadBody('<div style="text-align: center; color: red">Centered</div>'))
      .toBe('<p style="text-align:center">Centered</p>');
  });

  it('renders a legacy plain-text letter and a formatted letter', () => {
    const legacy = normalizeLetterhead({ body: 'First\nSecond' });
    expect(renderLetterhead(legacy)).toContain('First<br>Second');
    const formatted = normalizeLetterhead({ bodyHtml: '<p>First <u>underlined</u></p>' });
    expect(renderLetterhead(formatted)).toContain('<p>First <u>underlined</u></p>');
  });

  it('formats a saved ISO date for the printed letter', () => {
    expect(renderLetterhead(normalizeLetterhead({ date: '2026-09-28' }))).toContain('September 28, 2026');
  });
});
