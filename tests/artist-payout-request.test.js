import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const mainJs = fs.readFileSync(path.resolve(__dirname, '../src/main.js'), 'utf8');
const codeGs = fs.readFileSync(path.resolve(__dirname, '../apps-script/Code.gs'), 'utf8');

describe('artist payout request', () => {
  it('seeds payoutRequests on a fresh book state so the first request has somewhere to land', () => {
    const defaultStateBody = mainJs.match(/function defaultState\(book\) \{[\s\S]*?\n\}/)[0];
    expect(defaultStateBody).toContain('payoutRequests: []');
  });

  it('only renders the artist CTA when there is profit actually available', () => {
    const fn = mainJs.match(/function getPayoutRequestHtml\([\s\S]*?\n\}/)[0];
    // Guard clause returns empty markup for a zero/negative balance, so an
    // artist who is square (or overpaid) never sees a "request" button.
    expect(fn).toMatch(/if \(!\(owed > 0\.01\)\) return '';/);
    expect(fn).toContain('requestArtistPayout');
  });

  it('refuses to send a request when nothing is owed', () => {
    const fn = mainJs.match(/async function requestArtistPayout\([\s\S]*?\r?\n\}\r?\n/)[0];
    expect(fn).toMatch(/if \(!\(owed > 0\.01\)\)/);
    // The request must be persisted before the email goes out, so an offline
    // artist keeps the record instead of losing it with the failed POST.
    expect(fn.indexOf('saveState')).toBeLessThan(fn.indexOf('notifyPublisherSubmission'));
  });

  it('notifies the publisher with a Payout Request kind', () => {
    expect(mainJs).toMatch(/notifyPublisherSubmission\(\s*'Payout Request',/);
  });

  it('exposes requestArtistPayout for the inline onclick handler', () => {
    expect(mainJs).toContain('window.requestArtistPayout = requestArtistPayout;');
  });

  it('Code.gs flags payout/reimbursement kinds as action-required', () => {
    const needsAction = codeGs.match(/const needsAction = (\/.*?\/i)\.test\(kind\)/)[1];
    const re = new RegExp(needsAction.slice(1, -2), 'i');
    expect(re.test('Payout Request')).toBe(true);
    expect(re.test('Reimbursement request')).toBe(true);
    expect(re.test('Artist Payment Approval')).toBe(true);
    // Informational submissions still skip the ACTION REQUIRED banner.
    expect(re.test('Expense')).toBe(false);
  });

  it('keeps the deployed script version in lockstep with the client expectation', () => {
    const deployed = codeGs.match(/scriptVersion: '(v\d+)'/)[1];
    const expected = mainJs.match(/EXPECTED_SCRIPT_VERSION = '(v\d+)'/)[1];
    expect(deployed).toBe(expected);
    expect(codeGs).toContain(`lyrical-sheets-webhook-${deployed}`);
  });
});
