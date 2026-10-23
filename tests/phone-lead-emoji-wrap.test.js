// @vitest-environment jsdom
import { expect, test } from 'vitest';
import { wrapLeadEmoji, wrapLeadEmojiIn } from '../src/lib/phone-layout.js';

const el = (html) => { const d = document.createElement('div'); d.innerHTML = html; return d.firstElementChild; };

test('a leading emoji in a rendered button moves into the hidden lead-emoji span', () => {
  const b = el('<button class="btn sm">📒 Ledger</button>');
  expect(wrapLeadEmoji(b)).toBe(true);
  expect(b.innerHTML).toBe('<span class="lead-emoji" aria-hidden="true">📒 </span>Ledger');
  expect(b.textContent).toBe('📒 Ledger');
  expect(wrapLeadEmoji(b)).toBe(false);
});

test('emoji with a variation selector or joiner are taken whole', () => {
  const h = el('<h3>⚖️ Weight-band cost</h3>');
  wrapLeadEmoji(h);
  expect(h.querySelector('.lead-emoji').textContent).toBe('⚖️ ');
  expect(h.lastChild.nodeValue).toBe('Weight-band cost');
});

test('status marks, arrows and icon-only buttons are left alone', () => {
  for (const html of ['<button>✕ Close</button>', '<button>⚠ Check</button>', '<button>✓ Done</button>', '<button>→ Next</button>', '<button>📊</button>', '<button>Send 📦</button>']) {
    const b = el(html);
    expect(wrapLeadEmoji(b)).toBe(false);
    expect(b.querySelector('.lead-emoji')).toBeNull();
  }
});

test('only buttons, links, pills, badges, titles and headings are touched', () => {
  const root = el('<div><p>🎉 Party</p><span class="pill gray">📎 3</span><div class="oc-panel-title">📥 Replies</div><a class="btn">🧾 INV-1</a></div>');
  wrapLeadEmojiIn(root);
  expect(root.querySelector('p').innerHTML).toBe('🎉 Party');
  expect(root.querySelectorAll('.lead-emoji')).toHaveLength(3);
});

test('the one-line approval bar names the book under the count', async () => {
  const { readFileSync } = await import('node:fs');
  const main = readFileSync(`${process.cwd()}/src/main.js`, 'utf8');
  expect(main).toMatch(/<span class="pab-where">\$\{escapeHtml\(where\)\}<\/span>/);
  expect(main).toMatch(/booksWithPending\.length === 1 \? \(BOOKS\[booksWithPending\[0\]\.bookId\]\?\.title/);
});
