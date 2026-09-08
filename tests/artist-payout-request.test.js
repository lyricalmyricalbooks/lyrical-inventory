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

  it('stamps the paid-to-date baseline the request is measured against', () => {
    const fn = mainJs.match(/async function requestArtistPayout\([\s\S]*?\r?\n\}\r?\n/)[0];
    expect(fn).toContain('paidAtRequest: roundCents(stats.totalPaidToArtist || 0)');
    // A stable id keeps payoutRequests row-mergeable in the metadata document
    // (mergeMetadata only merges row-wise when every entry carries an id).
    expect(fn).toContain('id: makeEventId()');
  });

  it('closes a request once payouts cover it, and reopens it if they stop', () => {
    // Nothing wrote `settled` before, so the `!r.settled` filters in
    // attention-signals.js and activity-feed.js kept every request alive as a
    // blocking alert forever — including ones paid in full.
    const fn = mainJs.match(/function settlePayoutRequests\([\s\S]*?\n\}/)[0];
    expect(fn).toContain('r.settled = true');
    expect(fn).toContain('r.settled = false');
    expect(fn).toContain('payoutRequestCovered(r, stats)');
  });

  it('re-evaluates the lifecycle on every payout write and delete', () => {
    for (const handler of ['saveArtistPayout', 'deleteArtistPayout']) {
      const fn = mainJs.match(new RegExp(`async function ${handler}\\([\\s\\S]*?\\n\\}`))[0];
      expect(fn).toContain('settlePayoutRequests(bookId)');
    }
  });

  it('reads the live figures rather than a payout-date heuristic', () => {
    const fn = mainJs.match(/function pendingPayoutRequest\([\s\S]*?\n\}/)[0];
    expect(fn).toContain('payoutRequestCovered(latest, stats)');
    // The old date comparison settled a request the moment it was made if a
    // payout had already been recorded earlier the same day.
    expect(fn).not.toContain("requestedAt.slice(0, 10)");
  });

  it('keeps the deployed script version in lockstep with the client expectation', () => {
    const deployed = codeGs.match(/scriptVersion: '(v\d+)'/)[1];
    const expected = mainJs.match(/EXPECTED_SCRIPT_VERSION = '(v\d+)'/)[1];
    expect(deployed).toBe(expected);
    expect(codeGs).toContain(`lyrical-sheets-webhook-${deployed}`);
  });
});
