// @vitest-environment jsdom
// Text the owner or a sync typed (book titles, store names, payment links,
// pasted web addresses) is shown on several screens. Each must come out as
// plain text or a safe web link, never as markup or a javascript: link.
import { beforeAll, describe, expect, it } from 'vitest';
import { loadApp, makeBook } from './helpers/load-app.js';
import { generateCanadaPostLabelSvg } from '../src/lib/carriers/canadapost.js';

const EVIL = '<img src=x onerror="window.__pwned=1">';

let app;
beforeAll(async () => {
  app = await loadApp({
    books: [makeBook({ id: 'harbour' })],
    storage: {
      'lm-sheets-spreadsheet-url': 'javascript:window.__pwned=1',
      'lm-analytics-url': 'javascript:window.__pwned=1',
    },
  });
}, 30000);

describe('sheet sync log', () => {
  it('shows a book title with markup in it as plain text', () => {
    app.window.addSheetsLog(EVIL, 'Order', `Sold 1 × ${EVIL}`, 'ok');
    app.window.renderSheetsLog();
    const body = document.getElementById('sheets-log-body');
    expect(body.querySelector('img')).toBeNull();
    expect(body.querySelector('.sheets-book').textContent).toBe(EVIL);
    expect(body.querySelector('.sheets-summary').textContent).toBe(`Sold 1 × ${EVIL}`);
  });
});

describe('payment link settings', () => {
  it('keeps a payment link with quotes in the box instead of breaking out of it', () => {
    const book = app.main.BOOK_LIST.find(b => b.id === 'harbour');
    const link = `https://pay.example/"><img src=x>`;
    book.paymentLink = link;
    const box = document.createElement('div');
    box.id = 'payment-link-fields';
    document.body.appendChild(box);
    app.window._renderPaymentLinkFields();
    expect(document.getElementById('pl-harbour').value).toBe(link);
    expect(box.querySelector('img')).toBeNull();
    box.remove();
  });
});

describe('links built from saved web addresses', () => {
  it('never turns a javascript: spreadsheet address into the "Open sheet" link', () => {
    app.window.updateSheetsBadge();
    for (const id of ['sheets-open-link', 'open-sheet-link', 'side-sheets-open']) {
      const a = document.getElementById(id);
      expect(a.getAttribute('href') || '').not.toMatch(/^javascript:/i);
      expect(a.style.display).toBe('none');
    }
  });

  it('never loads a javascript: analytics address into the dashboard frame or link', () => {
    app.window.renderWebAnalytics();
    const iframe = document.getElementById('webanalytics-iframe');
    const link = document.getElementById('webanalytics-external-link');
    expect(iframe.getAttribute('src') || '').not.toMatch(/^javascript:/i);
    expect(link.getAttribute('href') || '').not.toMatch(/^javascript:/i);
    expect(app.window.__pwned).toBeUndefined();
  });
});

describe('shipping label customs box', () => {
  it('prints the copy count as a number, whatever was typed', () => {
    const svg = generateCanadaPostLabelSvg({
      destination: { countryCode: 'US' },
      customs: { quantity: '3<tspan>', declaredValue: 10 },
    });
    expect(svg).toContain('QTY: <tspan font-weight="800">3</tspan>');
    expect(svg).not.toContain('3<tspan>');
  });
});
