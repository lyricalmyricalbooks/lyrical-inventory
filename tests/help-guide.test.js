import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { PUBLISHER_ONLY_TABS, AUTHOR_ONLY_TABS, helpTabOpenFor, helpQueryWords, helpMatches } from '../src/lib/help-guide.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const html = readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const doc = new DOMParser().parseFromString(html, 'text/html');
const page = doc.querySelector('#tab-help .help-page');
const audienceOf = (el) => el.dataset.audience || 'both';

describe('which tabs a Help answer may send someone to', () => {
  test('authors (and Author view) cannot open publisher tabs', () => {
    for (const tab of PUBLISHER_ONLY_TABS) expect(helpTabOpenFor(tab, { author: true })).toBe(false);
    expect(helpTabOpenFor('manual', { author: true })).toBe(true);
    expect(helpTabOpenFor('myqr', { author: true })).toBe(true);
  });

  test('the publisher cannot open the author-only QR page but can open everything else', () => {
    for (const tab of AUTHOR_ONLY_TABS) expect(helpTabOpenFor(tab, { author: false })).toBe(false);
    for (const tab of PUBLISHER_ONLY_TABS) expect(helpTabOpenFor(tab, { author: false })).toBe(true);
  });

  test('switchTab uses the same lists to send people away', () => {
    const main = readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');
    expect(main).toMatch(/if \(isAuthor\(\) && PUBLISHER_ONLY_TABS\.has\(name\)\) name = 'dashboard';/);
    expect(main).toMatch(/if \(!isAuthor\(\) && AUTHOR_ONLY_TABS\.has\(name\)\) name = 'dashboard';/);
  });
});

describe('help search', () => {
  test('ignores case, accents and curly quotes', () => {
    expect(helpMatches('Book Fair at the Café', helpQueryWords('  FAIR cafe '))).toBe(true);
    expect(helpMatches('Which “Payment type” do I pick?', helpQueryWords('"payment type"'))).toBe(true);
    expect(helpMatches('artist’s sale', helpQueryWords("artist's"))).toBe(true);
  });

  test('every word has to appear, and an empty search matches everything', () => {
    expect(helpMatches('Record a sale', helpQueryWords('sale expense'))).toBe(false);
    expect(helpMatches('anything', helpQueryWords('   '))).toBe(true);
  });
});

describe('Help page content', () => {
  const sections = [...page.querySelectorAll('.help-sec')];
  const goButtons = [...page.querySelectorAll('[data-go]')];

  test('every section has an id and a title, so it gets a topic button', () => {
    expect(sections.length).toBeGreaterThan(0);
    for (const sec of sections) {
      expect(sec.id).toMatch(/^help-/);
      expect(sec.querySelector('.help-sec-title')?.textContent.trim()).toBeTruthy();
    }
    expect(new Set(sections.map((s) => s.id)).size).toBe(sections.length);
  });

  test('"Open …" buttons point at real tabs and sit in their own row', () => {
    expect(goButtons.length).toBeGreaterThan(0);
    for (const btn of goButtons) {
      expect(html).toContain(`switchTab('${btn.dataset.go}')`);
      expect(btn.parentElement.classList.contains('help-go-row')).toBe(true);
      expect(btn.textContent).toMatch(/^Open .+ →$/);
    }
  });

  test('the artist guide never links to a publisher-only tab, and the publisher guide never to My QR Code', () => {
    for (const btn of goButtons) {
      const sec = btn.closest('.help-sec');
      const q = btn.closest('.help-q');
      const aud = audienceOf(sec) === 'both' ? audienceOf(q) : audienceOf(sec);
      if (aud === 'artist' || aud === 'both') expect(PUBLISHER_ONLY_TABS.has(btn.dataset.go)).toBe(false);
      if (aud === 'publisher' || aud === 'both') expect(AUTHOR_ONLY_TABS.has(btn.dataset.go)).toBe(false);
    }
  });

  test('the shared Trouble section comes last, after both guides', () => {
    expect(sections.at(-1).id).toBe('help-trouble');
    expect(audienceOf(sections.at(-1))).toBe('both');
  });

  test('the publisher is never told to "tell the publisher"', () => {
    const publisherText = [...page.querySelectorAll('.help-q')]
      .filter((q) => audienceOf(q.closest('.help-sec')) !== 'artist' && audienceOf(q) !== 'artist')
      .map((q) => q.textContent.toLowerCase());
    for (const text of publisherText) expect(text).not.toContain('tell the publisher');
  });
});
