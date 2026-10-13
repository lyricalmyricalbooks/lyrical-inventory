import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

// An artist's sale waiting for approval shows Approve and Reject. On a phone
// they were wider than the order card's fixed right-hand column and pushed
// the whole History page sideways; they now get a full-width row.
const phone = readFileSync(`${process.cwd()}/src/styles/phone.css`, 'utf8');

test('approval buttons take their own full-width row on a phone', () => {
  expect(phone).toMatch(/#tab-history \.tbl tr\.hist-row > td:nth-child\(10\):has\(\.approval-actions\) \{ grid-area: auto \/ 1 \/ auto \/ -1 !important;/);
  expect(phone).toMatch(/#tab-history \.approval-actions \.appr-btn \{ min-height: var\(--target-min\); \}/);
});
