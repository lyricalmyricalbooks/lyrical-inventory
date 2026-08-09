import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { appSource, extractDecl } from './helpers/extract-decl.js';

const html = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(process.cwd(), 'src/style.css'), 'utf8');

describe('Pending / to-confirm expenses — wiring', () => {
  it('exposes the panel, its entry points and the note modal in the markup', () => {
    expect(html).toContain('id="tc-pending-list"');
    expect(html).toContain('id="tc-pending-count"');
    expect(html).toContain('onclick="openPendingExpense()"');
    // Reachable from a trip too, pre-filled with that trip's name.
    expect(html).toContain("onclick=\"openPendingExpense(null, _tcOpenTripName)\"");
    expect(html).toContain('id="m-tc-pending"');
    ['desc', 'cat', 'amount', 'cur', 'date', 'remind', 'trip', 'note'].forEach(f => {
      expect(html).toContain(`id="tc-pending-${f}"`);
    });
    expect(html).toContain('onclick="savePendingExpense()"');
    expect(html).toContain('onclick="deletePendingExpense()"');
  });

  it('styles the pending panel and its due-state badges', () => {
    expect(css).toContain('.tc-pending-card');
    expect(css).toContain('.tc-pending-row');
    expect(css).toContain('.tc-due-badge');
    expect(css).toContain('.tc-due-overdue');
    expect(css).toContain('.tc-pending-empty');
  });

  it('declares the full pending lifecycle', () => {
    [
      'function openPendingExpense',
      'function savePendingExpense',
      'function deletePendingExpense',
      'function snoozePendingExpense',
      'function confirmPendingExpense',
      'function _tcClearConfirmedPending',
      'function _tcRenderPendingPanel',
      'function tcPendingValidate',
      'function tcPendingRemindIn',
    ].forEach(sig => expect(appSource).toContain(sig));
  });

  it('renders the pending panel every time the Tax Centre renders', () => {
    const fn = extractDecl('renderTaxCenter');
    expect(fn).toContain('_tcRenderPendingPanel();');
  });

  it('never lets a pending note reach the ledger, category totals or a tax export', () => {
    // The whole point of a separate array is that nothing which sums the
    // ledger for money purposes ever iterates it.
    expect(extractDecl('_tcBuildLedger')).not.toContain('pendingExpenses');
    expect(extractDecl('downloadTaxReport')).not.toContain('pendingExpenses');
  });

  it('clears the source pending note on a successful confirmed submit, not before', () => {
    const fn = extractDecl('submitTaxExpense');
    expect(fn).toContain('_tcClearConfirmedPending()');
    // Called after the expense is pushed onto businessExpenses, not instead of it.
    expect(fn.indexOf('TAX_CENTER.businessExpenses.unshift'))
      .toBeLessThan(fn.indexOf('_tcClearConfirmedPending()'));
  });

  it('resets a stale confirm-link when the trip shortcut reuses the same form', () => {
    // Regression guard: without this, confirming pending note A, abandoning the
    // form, then using "Log expense to this trip" and submitting would delete
    // note A even though the user never touched it again.
    expect(extractDecl('logExpenseForTrip')).toContain('_tcConfirmingPendingId = null');
  });
});

describe('_tcPendingList / _tcFindPending', () => {
  const TAX_CENTER = {};
  const { _tcPendingList, _tcFindPending } = new Function(
    'TAX_CENTER',
    `${extractDecl('_tcPendingList')}\n${extractDecl('_tcFindPending')}\n` +
    'return { _tcPendingList, _tcFindPending };',
  )(TAX_CENTER);

  it('initialises pendingExpenses lazily and repairs a non-array value', () => {
    expect(_tcPendingList()).toEqual([]);
    expect(Array.isArray(TAX_CENTER.pendingExpenses)).toBe(true);
    TAX_CENTER.pendingExpenses = 'nope';
    expect(_tcPendingList()).toEqual([]);
  });

  it('finds a note by id regardless of string/number mismatch', () => {
    TAX_CENTER.pendingExpenses = [{ id: 123, desc: 'Hotel' }];
    expect(_tcFindPending('123')?.desc).toBe('Hotel');
    expect(_tcFindPending(123)?.desc).toBe('Hotel');
    expect(_tcFindPending(999)).toBe(null);
  });
});

describe('_tcDaysUntil / _tcPendingDue', () => {
  const { _tcDaysUntil, _tcPendingDue } = new Function(
    `${extractDecl('_tcDaysUntil')}\n${extractDecl('_tcPendingDue')}\n` +
    'return { _tcDaysUntil, _tcPendingDue };',
  )();

  it('computes whole-day distance, signed', () => {
    expect(_tcDaysUntil('2026-08-16', '2026-08-09')).toBe(7);
    expect(_tcDaysUntil('2026-08-02', '2026-08-09')).toBe(-7);
    expect(_tcDaysUntil('2026-08-09', '2026-08-09')).toBe(0);
  });

  it('returns null for a missing or unparseable date', () => {
    expect(_tcDaysUntil('', '2026-08-09')).toBe(null);
    expect(_tcDaysUntil(undefined, '2026-08-09')).toBe(null);
    expect(_tcDaysUntil('not-a-date', '2026-08-09')).toBe(null);
  });

  it('classifies a note with no reminder as "none"', () => {
    expect(_tcPendingDue({}, '2026-08-09').state).toBe('none');
    expect(_tcPendingDue({ remindOn: '' }, '2026-08-09').state).toBe('none');
  });

  it('classifies overdue, today, soon (<=7d) and later', () => {
    expect(_tcPendingDue({ remindOn: '2026-08-01' }, '2026-08-09').state).toBe('overdue');
    expect(_tcPendingDue({ remindOn: '2026-08-09' }, '2026-08-09').state).toBe('today');
    expect(_tcPendingDue({ remindOn: '2026-08-16' }, '2026-08-09').state).toBe('soon');
    expect(_tcPendingDue({ remindOn: '2026-08-17' }, '2026-08-09').state).toBe('later');
  });
});

describe('_tcSortedPending', () => {
  const TAX_CENTER = {};
  const { _tcSortedPending } = new Function(
    'TAX_CENTER',
    `${extractDecl('_tcPendingList')}\n${extractDecl('_tcDaysUntil')}\n` +
    `${extractDecl('_tcPendingDue')}\n${extractDecl('_TC_DUE_ORDER')}\n` +
    `${extractDecl('_tcSortedPending')}\nreturn { _tcSortedPending };`,
  )(TAX_CENTER);

  it('orders overdue, then today, then soon, then later, then undated — each bucket by nearest date', () => {
    TAX_CENTER.pendingExpenses = [
      { id: 1, desc: 'later', remindOn: '2026-09-01' },
      { id: 2, desc: 'no-reminder' },
      { id: 3, desc: 'overdue-far', remindOn: '2026-08-01' },
      { id: 4, desc: 'today', remindOn: '2026-08-09' },
      { id: 5, desc: 'overdue-near', remindOn: '2026-08-07' },
      { id: 6, desc: 'soon', remindOn: '2026-08-12' },
    ];
    const order = _tcSortedPending('2026-08-09').map(r => r.item.desc);
    expect(order).toEqual(['overdue-far', 'overdue-near', 'today', 'soon', 'later', 'no-reminder']);
  });
});
