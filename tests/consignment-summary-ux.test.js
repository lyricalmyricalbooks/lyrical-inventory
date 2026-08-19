import { describe, it, expect, beforeEach } from 'vitest';
import { buildHarness } from './helpers/extract-decl.js';
import { escapeHtml } from '../src/lib/html.js';

function makeConsignmentHarness() {
  return buildHarness({
    names: [
      'conAccountRowHtml',
      'renderConsignmentTable',
      'toggleConGroup',
      'toggleConGrouping',
      'toggleAllConGroups',
      'setConStatusFilter',
      'onConSearchInput',
      'clearConSearch',
      'clearConSearchAndFilter',
    ],
    deps: {
      $: (id) => document.getElementById(id),
      escapeHtml,
      window: globalThis.window,
      switchBook: () => {},
      switchTab: () => {},
    },
    returns: `{
      conAccountRowHtml,
      renderConsignmentTable,
      toggleConGroup,
      toggleConGrouping,
      toggleAllConGroups,
      setConStatusFilter,
      onConSearchInput,
      clearConSearch,
      clearConSearchAndFilter,
    }`,
  });
}

describe('Combined Consignment Summary UX/UI enhancements', () => {
  let harness;
  const mockBooks = [
    {
      id: 'book-1',
      title: 'Un Fantastico Altrove',
      accent: '#e5a93f',
      rows: [
        { store: 'Art Metropole', sent: 2, sold: 1, outstanding: 1, isActive: true, pct: 50 },
        { store: 'Glad Day books', sent: 2, sold: 2, outstanding: 0, isActive: false, pct: 100 },
      ],
      totals: { sent: 4, sold: 3, outstanding: 1, active: 1 },
    },
    {
      id: 'book-2',
      title: 'The Hound',
      accent: '#3a7cc8',
      rows: [
        { store: 'Rooneys', sent: 10, sold: 6, outstanding: 4, isActive: true, pct: 60 },
        { store: 'Leica Store', sent: 6, sold: 6, outstanding: 0, isActive: false, pct: 100 },
      ],
      totals: { sent: 16, sold: 12, outstanding: 4, active: 1 },
    },
  ];

  beforeEach(() => {
    document.body.innerHTML = `
      <div class="consignment-summary-panel sys-container" id="all-consignment-summary-panel">
        <div id="all-con-status-chip"></div>
        <div id="all-con-stats"></div>
        <input type="search" id="all-con-search-input" />
        <button id="all-con-search-clear" style="display:none;"></button>
        <button id="con-filter-all" class="con-filter-btn active"></button>
        <button id="con-filter-active" class="con-filter-btn"></button>
        <button id="con-filter-settled" class="con-filter-btn"></button>
        <button id="all-con-expand-toggle" style="display:none;">
          <span id="all-con-expand-icon">⊞</span>
          <span id="all-con-expand-text">Expand all</span>
        </button>
        <button id="all-con-group-toggle"></button>
        <table><tbody id="all-con-body"></tbody></table>
      </div>
    `;

    window._allConBooks = JSON.parse(JSON.stringify(mockBooks));
    window._allConGrouped = true;
    window._allConCollapsed = new Set();
    window._allConStatusFilter = 'all';
    window._allConSearchQuery = '';

    harness = makeConsignmentHarness();
  });

  it('renders grouped consignment accounts with collapsible headers and nested items', () => {
    harness.renderConsignmentTable();
    const body = document.getElementById('all-con-body');

    expect(body.innerHTML).toContain('Un Fantastico Altrove');
    expect(body.innerHTML).toContain('The Hound');
    expect(body.innerHTML).toContain('Art Metropole');
    expect(body.innerHTML).toContain('Rooneys');
    expect(body.querySelectorAll('.con-group-row').length).toBe(2);
    expect(body.querySelectorAll('.con-nested-row').length).toBe(4);
  });

  it('toggles collapse for a single book group', () => {
    harness.renderConsignmentTable();
    expect(document.getElementById('all-con-body').querySelectorAll('.con-nested-row').length).toBe(4);

    // Collapse book-1
    harness.toggleConGroup('book-1');
    expect(document.getElementById('all-con-body').querySelectorAll('.con-nested-row').length).toBe(2);

    // Expand book-1 back
    harness.toggleConGroup('book-1');
    expect(document.getElementById('all-con-body').querySelectorAll('.con-nested-row').length).toBe(4);
  });

  it('toggles expand all and collapse all across all groups', () => {
    harness.renderConsignmentTable();
    expect(window._allConCollapsed.size).toBe(0);

    // Collapse all
    harness.toggleAllConGroups();
    expect(window._allConCollapsed.size).toBe(2);
    expect(document.getElementById('all-con-body').querySelectorAll('.con-nested-row').length).toBe(0);

    // Expand all
    harness.toggleAllConGroups();
    expect(window._allConCollapsed.size).toBe(0);
    expect(document.getElementById('all-con-body').querySelectorAll('.con-nested-row').length).toBe(4);
  });

  it('filters by status: active accounts only', () => {
    harness.setConStatusFilter('active');
    const body = document.getElementById('all-con-body');

    // Only active accounts should be shown in child rows
    expect(body.innerHTML).toContain('Art Metropole');
    expect(body.innerHTML).toContain('Rooneys');
    expect(body.innerHTML).not.toContain('Glad Day books');
    expect(body.innerHTML).not.toContain('Leica Store');
  });

  it('filters by status: settled accounts only', () => {
    harness.setConStatusFilter('settled');
    const body = document.getElementById('all-con-body');

    expect(body.innerHTML).not.toContain('Art Metropole');
    expect(body.innerHTML).not.toContain('Rooneys');
    expect(body.innerHTML).toContain('Glad Day books');
    expect(body.innerHTML).toContain('Leica Store');
  });

  it('filters by live search query across books and stores', () => {
    harness.onConSearchInput('Metropole');
    const body = document.getElementById('all-con-body');

    expect(body.innerHTML).toContain('Art Metropole');
    expect(body.innerHTML).not.toContain('Rooneys');

    // Search for book title
    harness.onConSearchInput('Hound');
    expect(body.innerHTML).toContain('Rooneys');
    expect(body.innerHTML).not.toContain('Art Metropole');
  });

  it('renders friendly empty state when no accounts match filters', () => {
    harness.onConSearchInput('NonexistentStore');
    const body = document.getElementById('all-con-body');

    expect(body.innerHTML).toContain('No consignment accounts matching filters.');
    expect(body.innerHTML).toContain('Reset filters');

    // Clicking reset clears search and filter
    harness.clearConSearchAndFilter();
    expect(body.innerHTML).toContain('Art Metropole');
    expect(body.innerHTML).toContain('Rooneys');
  });

  it('renders flat list correctly when group by book is toggled off', () => {
    harness.toggleConGrouping();
    const body = document.getElementById('all-con-body');

    expect(body.querySelectorAll('.con-group-row').length).toBe(0);
    expect(body.querySelectorAll('tr').length).toBe(4);
    expect(body.innerHTML).toContain('Art Metropole');
    expect(body.innerHTML).toContain('Rooneys');
  });
});
