// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { buildHarness } from './helpers/extract-decl.js';

function refresh(year, dates = []) {
  const fn = buildHarness({
    names: ['_tcRefreshYearOptions'],
    deps: { $: id => document.getElementById(id),
      _tcBuildLedger: () => ({ allLedger: dates.map(date => ({ date })) }) },
    returns: '_tcRefreshYearOptions',
  });
  fn(year);
}

describe('Tax Centre year menus', () => {
  it('restores a saved upcoming year after populating the menus', () => {
    document.body.innerHTML = '<select id="tc-year"><option value="all">All Time</option></select><select id="tc-year-ledger"><option value="all">All Time</option></select>';
    refresh(2026);
    localStorage.setItem('year-test', JSON.stringify({ year: '2027' }));
    const restore = buildHarness({
      names: ['_tcRestoreLedgerPrefs'],
      deps: { $: id => document.getElementById(id), localStorage,
        TC_LEDGER_PREFS_KEY: 'year-test', _tcPrefsRestored: false },
      returns: '_tcRestoreLedgerPrefs',
    });
    restore();
    expect([...document.querySelectorAll('select')].map(el => el.value)).toEqual(['2027', '2027']);
    localStorage.removeItem('year-test');
  });

  it('offers next year before any transactions exist and keeps both menus aligned', () => {
    document.body.innerHTML = '<select id="tc-year"><option value="all">All Time</option><option selected>2026</option></select><select id="tc-year-ledger"><option value="all">All Time</option></select>';
    refresh(2026);
    const selects = [...document.querySelectorAll('select')];
    expect([...selects[0].options].map(o => o.value)).toEqual(['all', '2027', '2026', '2025', '2024', '2023']);
    expect(selects.map(el => el.value)).toEqual(['2026', '2026']);
    expect(selects[1].innerHTML).toBe(selects[0].innerHTML);
  });

  it('rolls forward and includes older and future records without losing the selection', () => {
    document.body.innerHTML = '<select id="tc-year"><option value="all">All Time</option><option selected>2027</option></select><select id="tc-year-ledger"></select>';
    refresh(2027, ['2019-03-01', '2030-01-02', 'bad', '']);
    const el = document.getElementById('tc-year');
    expect([...el.options].map(o => o.value)).toEqual(['all', '2030', '2028', '2027', '2026', '2025', '2024', '2023', '2019']);
    expect(el.value).toBe('2027');
    refresh(2028);
    expect([...el.options].map(o => o.value)).toContain('2029');
    expect(el.value).toBe('2027');
  });
});
