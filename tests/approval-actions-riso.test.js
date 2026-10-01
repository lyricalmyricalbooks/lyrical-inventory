import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

// The Approve / Reject pair on a pending artist submission (Order History and
// Expenses) and the row it sits in. Pins the decisions that would silently undo
// the restyle: the .btn chassis, a hover that lifts rather than darkening to a
// raw hex, and a pending row that is flagged rather than faded.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(path.join(__dirname, '..', p), 'utf8');
const styles = read('src/style.css');
const phone = read('src/styles/phone.css');
const rule = (css, selector) => {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = css.match(new RegExp(`(?:^|\\n)\\s*${esc}\\s*\\{([\\s\\S]*?)\\}`));
  return m ? m[1] : null;
};

test('approval buttons share the .btn chassis: ink outline, caps, offset and press-in', () => {
  const base = rule(styles, '.appr-btn');
  expect(base).not.toBeNull();
  expect(base).toMatch(/border:var\(--stroke\) solid var\(--rule-ink\)/);
  expect(base).toMatch(/box-shadow:var\(--elev-1\)/);
  expect(base).toMatch(/text-transform:uppercase/);
  expect(base).toMatch(/letter-spacing:var\(--tracking-caps\)/);
  expect(base).not.toMatch(/transition:all/);
  expect(rule(styles, '.appr-btn:active')).toMatch(/transform:translate\(1px,1px\);box-shadow:none/);
  expect(rule(styles, '.appr-btn:disabled')).toMatch(/cursor:not-allowed/);
});

test('approve hover lifts instead of swapping to a raw dark green', () => {
  expect(rule(styles, '.appr-btn:hover')).toMatch(/box-shadow:var\(--elev-hover\)/);
  expect(styles).not.toMatch(/\.appr-btn\.approve:hover/);
  expect(styles).not.toMatch(/#21513a/i);
  expect(rule(styles, '.appr-btn.reject')).toMatch(/color:var\(--status-critical\)/);
});

test('a row awaiting approval is flagged with the amber bar, not faded', () => {
  expect(rule(styles, '.tbl tbody tr.is-awaiting > td:first-child'))
    .toMatch(/box-shadow:inset 3px 0 0 var\(--status-active\)/);
  for (const file of ['src/main.js', 'src/features/receipts.js']) {
    const src = read(file);
    expect(src).toMatch(/<tr class="(?:hist-row )?is-awaiting">/);
    expect(src).not.toMatch(/opacity:0\.8;background:var\(--amber-bg\)/);
  }
});

test('on a phone the flag moves to the card and both buttons get a full target', () => {
  expect(rule(phone, '.tab-panel .phone-records tr.phone-record.is-awaiting'))
    .toMatch(/inset 3px 0 0 var\(--status-active\), var\(--elev-1\)/);
  expect(rule(phone, '.tab-panel .phone-records .appr-btn')).toMatch(/height: var\(--target-min\)/);
});
