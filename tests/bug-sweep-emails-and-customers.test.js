// Regression tests for the 2026-11-04 bug sweep: emails, the confirm dialog,
// the buyer list and its search, and the mailing-list export button.
import { describe, it, expect } from 'vitest';
import { beforeAll } from 'vitest';
import { loadApp, makeBook } from './helpers/load-app.js';
import { withCampaignFooter } from '../src/lib/campaign-footer.js';
import { parseMarkdownToHtml } from '../src/lib/markdown.js';
import { hasHtmlTag } from '../src/lib/html.js';
import { htmlToPlainText } from '../src/lib/modal.js';
import { historySearchTerms, historyRowMatches } from '../src/lib/order-history-search.js';

describe('a stray "<" in an email is text, not markup', () => {
  it('hasHtmlTag only sees real tags', () => {
    expect(hasHtmlTag('<p>Hi</p>')).toBe(true);
    expect(hasHtmlTag('line<br/>break')).toBe(true);
    expect(hasHtmlTag('<a href="https://x.y">x</a>')).toBe(true);
    expect(hasHtmlTag('Copies for <$20 this week')).toBe(false);
    expect(hasHtmlTag('I <3 your work')).toBe(false);
    expect(hasHtmlTag('Jane <jane@example.com>')).toBe(false);
  });

  it('a markdown campaign body with "<$20" keeps every word and its formatting', () => {
    const body = 'Hi Sam,\n\nCopies for <$20 this week!\n\n**Pre-order** at [the shop](https://ex.com/shop)\n\nLove,\nMira';
    const out = withCampaignFooter(body, 'me@example.com', parseMarkdownToHtml);
    expect(out.body).toContain('Copies for <$20 this week!');
    expect(out.body).toContain('Love,\nMira');
    expect(out.htmlBody).toContain('<strong>Pre-order</strong>');
    expect(out.htmlBody).toContain('<a href="https://ex.com/shop"');
    expect(out.htmlBody).toContain('&lt;$20');
  });

  it('the plain-text part of an HTML body keeps an unclosed "<" and decodes entities', () => {
    const out = withCampaignFooter('<p>Under <$20 &amp; more &lt;3</p>', '', (x) => x);
    expect(out.body.startsWith('Under <$20 & more <3\n')).toBe(true);
  });
});

describe('markdown links survive underscores in the address', () => {
  it('does not italicise inside a URL', () => {
    const html = parseMarkdownToHtml('[the form](https://example.com/open_call_form_2027)');
    expect(html).toContain('href="https://example.com/open_call_form_2027"');
    expect(html).not.toContain('<em>');
  });

  it('leaves snake_case words alone but still italicises _words_', () => {
    expect(parseMarkdownToHtml('snake_case_name')).toBe('snake_case_name');
    expect(parseMarkdownToHtml('an _italic_ word and __bold__'))
      .toBe('an <em>italic</em> word and <strong>bold</strong>');
    expect(parseMarkdownToHtml('**bold** and *it*')).toBe('<strong>bold</strong> and <em>it</em>');
  });

  it('still formats a link label', () => {
    expect(parseMarkdownToHtml('[**x**](https://a.b/c_d)')).toContain('><strong>x</strong></a>');
  });
});

describe('the confirm dialog keeps the recipient address', () => {
  it('does not strip <email> or "<3" as if they were tags', () => {
    expect(htmlToPlainText('Send this message to Jane Doe <jane@example.com> now?'))
      .toBe('Send this message to Jane Doe <jane@example.com> now?');
    expect(htmlToPlainText('I <3 your work, see you > soon')).toBe('I <3 your work, see you > soon');
  });

  it('still strips real tags and decodes &amp; last', () => {
    expect(htmlToPlainText('<strong>$12.32</strong><br>next')).toBe('$12.32\nnext');
    expect(htmlToPlainText('a &amp;lt; b')).toBe('a &lt; b');
  });
});

describe('order history search ignores accents', () => {
  it('"montreal" finds Montréal and "helene" finds Hélène', () => {
    const row = { type: 'hist', h: { num: 'W-1', chan: 'Website', notes: 'Hélène Tremblay, Montréal' } };
    expect(historyRowMatches(row, historySearchTerms('montreal'))).toBe(true);
    expect(historyRowMatches(row, historySearchTerms('HELENE'))).toBe(true);
    expect(historyRowMatches(row, historySearchTerms('toronto'))).toBe(false);
  });
});

describe('Customers screen (real app)', () => {
  let app;
  const sale = (over) => ({ chan: 'Website', qty: 1, price: 30, date: '2026-10-01', cur: 'CAD', ...over });
  beforeAll(async () => {
    app = await loadApp({
      books: [
        makeBook({ id: 'bka', title: 'Book A', listPrice: 30 }),
        makeBook({ id: 'bkb', title: 'Book B', listPrice: 30 }),
      ],
    });
    // Hélène bought both books in one checkout; Sam came back twice.
    await app.resetBook('bka', { hist: [
      sale({ num: 'W-1001', email: 'helene@example.com', shipName: 'Hélène Tremblay', sheetsId: 'a1' }),
      sale({ num: 'W-2001', email: 'sam@example.com', shipName: 'Sam Lee', sheetsId: 'a2' }),
    ] });
    await app.resetBook('bkb', { hist: [
      sale({ num: 'W-1001', email: 'helene@example.com', shipName: 'Hélène Tremblay', sheetsId: 'b1' }),
      sale({ num: 'W-2002', email: 'sam@example.com', shipName: 'Sam Lee', sheetsId: 'b2' }),
    ] });
  }, 30000);

  const byEmail = (list, email) => list.find((r) => r.email === email);

  it('counts one checkout of two books as one order, not a repeat buyer', () => {
    const list = app.window.buildCustomerList();
    expect(byEmail(list, 'helene@example.com').orders).toBe(1);
    expect(byEmail(list, 'helene@example.com').units).toBe(2);
    expect(byEmail(list, 'sam@example.com').orders).toBe(2);
    app.window.setCustomerOrdersFilter('repeat');
    const repeat = app.window._custApplyFilter(app.window.buildCustomerList()).map((r) => r.email);
    app.window.setCustomerOrdersFilter('');
    expect(repeat).toEqual(['sam@example.com']);
  });

  it('finds Hélène when you type "helene"', () => {
    app.window.filterCustomers('helene');
    const found = app.window._custApplyFilter(app.window.buildCustomerList()).map((r) => r.email);
    app.window.filterCustomers('');
    expect(found).toEqual(['helene@example.com']);
  });
});
