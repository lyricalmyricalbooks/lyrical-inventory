import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildHarness, appSource } from './helpers/extract-decl.js';
import { escapeHtml } from '../src/lib/html.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const INDEX_HTML = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

// ── What the model writes is untrusted text ─────────────────────────────────

describe('rendering an answer', () => {
  const intelText = buildHarness({ names: ['intelText'], deps: { escapeHtml }, returns: 'intelText' });

  it('cannot be talked into emitting markup', () => {
    const out = intelText('<script>steal()</script>');
    expect(out).not.toContain('<script');
    expect(out).toContain('&lt;script&gt;');
  });

  it('does not restore styled tags the way the email editor does', () => {
    // parseMarkdownToHtml() in main.js deliberately un-escapes <span style> and
    // <mark style> from its input. That is right for the Open Call template
    // editor, where the publisher wrote the text, and wrong here, where a
    // remote service did. Reusing it would be the bug this test exists to stop.
    const out = intelText('<span style="position:fixed">x</span><mark style="x">y</mark>');
    expect(out).not.toContain('<span');
    expect(out).not.toContain('<mark');
  });

  it('keeps an image payload inert', () => {
    expect(intelText('<img src=x onerror=alert(1)>')).not.toContain('<img');
  });

  it('still renders the light formatting it wrote itself', () => {
    expect(intelText('**$120** at the *fair*')).toBe('<strong>$120</strong> at the <em>fair</em>');
    expect(intelText('one\ntwo')).toBe('one<br>two');
  });

  it('handles nothing at all without printing "undefined"', () => {
    expect(intelText(null)).toBe('');
    expect(intelText(undefined)).toBe('');
  });
});

describe('saying what an answer was worked out from', () => {
  const TOOL_LABELS = {
    queryLedger: 'the money ledger', querySales: 'sales history',
    queryExpenses: 'expenses', queryEvents: 'fairs and trips',
    queryCatalog: 'the catalogue and stock', findAnomalies: 'record checks',
    proposeCorrection: 'a suggested fix',
  };
  const toolTrace = buildHarness({ names: ['toolTrace'], deps: { escapeHtml, TOOL_LABELS }, returns: 'toolTrace' });

  it('names the sources in the publisher own words, not tool names', () => {
    const out = toolTrace(['queryEvents', 'queryExpenses']);
    expect(out).toContain('fairs and trips');
    expect(out).toContain('expenses');
    expect(out).not.toContain('queryEvents');
  });

  it('does not repeat a source that was consulted twice', () => {
    expect(toolTrace(['querySales', 'querySales']).match(/sales history/g)).toHaveLength(1);
  });

  it('says nothing when nothing was looked up', () => {
    expect(toolTrace([])).toBe('');
  });
});

// ── The approve-or-dismiss card ─────────────────────────────────────────────

describe('a staged correction on screen', () => {
  const intelProposalHtml = buildHarness({
    names: ['intelProposalHtml'], deps: { escapeHtml }, returns: 'intelProposalHtml',
  });
  const proposal = (over = {}) => ({
    id: 'p1', kind: 'recategorizeExpense', field: 'cat', scope: 'business',
    expenseId: 'b1', description: 'Train to Toronto', date: '2026-06-13',
    amount: 120, currency: 'CAD', before: 'travel', after: 'Travel & Meals',
    reason: 'Same category under an older name.', status: 'open', ...over,
  });

  it('shows what it is now and what it would become', () => {
    const html = intelProposalHtml(proposal());
    expect(html).toContain('travel');
    expect(html).toContain('Travel &amp; Meals');
    expect(html).toContain('Needs your OK');
  });

  it('offers both a yes and a no while it is still open', () => {
    const html = intelProposalHtml(proposal());
    expect(html).toContain('applyIntelProposal');
    expect(html).toContain('dismissIntelProposal');
  });

  it('stops offering either once it has been settled', () => {
    for (const status of ['applied', 'dismissed']) {
      const html = intelProposalHtml(proposal({ status }));
      expect(html).not.toContain('applyIntelProposal');
      expect(html).not.toContain('dismissIntelProposal');
    }
  });

  it('escapes a description that came back from the model', () => {
    const html = intelProposalHtml(proposal({ description: '<img src=x onerror=1>' }));
    expect(html).not.toContain('<img');
  });

  it('sets money in tabular figures so a column of them lines up', () => {
    expect(intelProposalHtml(proposal())).toContain('intel-fig');
    expect(fs.readFileSync(path.join(root, 'src/style.css'), 'utf8'))
      .toMatch(/\.intel-fig\s*\{[^}]*tnum/);
  });
});

// ── Why the composer might be unavailable ───────────────────────────────────

describe('when a question cannot be asked', () => {
  const blocker = (TAX_CENTER, onLine = true) => buildHarness({
    names: ['intelBlocker'], deps: { TAX_CENTER, navigator: { onLine } }, returns: 'intelBlocker',
  })();

  it('points at the Tax Centre when no key is set', () => {
    expect(blocker({ settings: {} })).toMatch(/Tax Centre/);
  });

  it('explains the offline case without losing the thread', () => {
    const msg = blocker({ settings: { geminiKey: 'k' } }, false);
    expect(msg).toMatch(/offline/i);
    expect(msg).toMatch(/still here/i);
  });

  it('gets out of the way once a key is set and there is a connection', () => {
    expect(blocker({ settings: { geminiKey: 'k' } })).toBe('');
  });
});

// ── Approving a change actually writes, and writes the right way ────────────

describe('approving a correction', () => {
  function harness({ confirm = true, author = false } = {}) {
    const TAX_CENTER = { businessExpenses: [{ id: 'b1', desc: 'Train', cat: 'travel', amount: 120, currency: 'CAD' }] };
    const states = { hound: { expenses: [{ id: 'e1', desc: 'Table fee', cat: 'Events', amount: 150, currency: 'CAD' }] } };
    const saveTaxCenter = vi.fn().mockResolvedValue(undefined);
    const saveState = vi.fn().mockResolvedValue(undefined);
    const showToast = vi.fn();
    const INTEL_PROPOSALS = new Map();
    const deps = {
      INTEL_PROPOSALS, TAX_CENTER, states, saveTaxCenter, saveState, showToast,
      isAuthor: () => author,
      confirmDialog: vi.fn().mockResolvedValue(confirm),
      setIntelStatus: vi.fn(), saveIntelThread: vi.fn(), renderIntel: vi.fn(),
      console: { error: vi.fn() },
    };
    const applyIntelProposal = buildHarness({
      names: ['applyIntelProposal'], deps, returns: 'applyIntelProposal',
    });
    return { applyIntelProposal, ...deps };
  }

  const businessProposal = {
    id: 'p1', field: 'cat', scope: 'business', expenseId: 'b1',
    description: 'Train', date: '2026-06-13', amount: 120, currency: 'CAD',
    before: 'travel', after: 'Travel & Meals', status: 'open',
  };

  it('asks first, then writes through the app own save path', async () => {
    const h = harness();
    h.INTEL_PROPOSALS.set('p1', { ...businessProposal });
    await h.applyIntelProposal('p1');

    expect(h.confirmDialog).toHaveBeenCalled();
    expect(h.TAX_CENTER.businessExpenses[0].cat).toBe('Travel & Meals');
    // saveTaxCenter carries the offline queue and the three-way merge. Writing
    // to Firestore directly would skip both.
    expect(h.saveTaxCenter).toHaveBeenCalledWith({ rethrow: true });
    expect(h.INTEL_PROPOSALS.get('p1').status).toBe('applied');
  });

  it('changes nothing when the publisher says no', async () => {
    const h = harness({ confirm: false });
    h.INTEL_PROPOSALS.set('p1', { ...businessProposal });
    await h.applyIntelProposal('p1');

    expect(h.TAX_CENTER.businessExpenses[0].cat).toBe('travel');
    expect(h.saveTaxCenter).not.toHaveBeenCalled();
    expect(h.INTEL_PROPOSALS.get('p1').status).toBe('open');
  });

  it('saves a book expense against its own book', async () => {
    const h = harness();
    h.INTEL_PROPOSALS.set('p2', {
      ...businessProposal, id: 'p2', scope: 'book', bookId: 'hound', expenseId: 'e1',
      before: 'Events', after: 'Events & Exhibitions',
    });
    await h.applyIntelProposal('p2');

    expect(h.states.hound.expenses[0].cat).toBe('Events & Exhibitions');
    expect(h.saveState).toHaveBeenCalledWith('hound');
    expect(h.saveTaxCenter).not.toHaveBeenCalled();
  });

  it('re-finds the row now rather than trusting where it was', async () => {
    // The thread survives a reload, so a staged change can outlive the record
    // it describes. Applying one against a row that has gone must not throw.
    const h = harness();
    h.INTEL_PROPOSALS.set('p1', { ...businessProposal, expenseId: 'vanished' });
    await h.applyIntelProposal('p1');

    expect(h.saveTaxCenter).not.toHaveBeenCalled();
    expect(h.showToast).toHaveBeenCalledWith(expect.stringMatching(/no longer there/i), 'warn', expect.any(Number));
    expect(h.INTEL_PROPOSALS.get('p1').status).toBe('dismissed');
  });

  it('refuses outright in an author session', async () => {
    const h = harness({ author: true });
    h.INTEL_PROPOSALS.set('p1', { ...businessProposal });
    await h.applyIntelProposal('p1');

    expect(h.confirmDialog).not.toHaveBeenCalled();
    expect(h.TAX_CENTER.businessExpenses[0].cat).toBe('travel');
  });

  it('cannot be applied twice', async () => {
    const h = harness();
    h.INTEL_PROPOSALS.set('p1', { ...businessProposal, status: 'applied' });
    await h.applyIntelProposal('p1');
    expect(h.confirmDialog).not.toHaveBeenCalled();
  });

  it('leaves the card open when the save fails, so nothing is silently lost', async () => {
    const h = harness();
    h.saveTaxCenter.mockRejectedValueOnce(new Error('offline'));
    h.INTEL_PROPOSALS.set('p1', { ...businessProposal });
    await h.applyIntelProposal('p1');

    expect(h.INTEL_PROPOSALS.get('p1').status).toBe('open');
    expect(h.showToast).toHaveBeenCalledWith(expect.stringMatching(/could not save/i), 'err', expect.any(Number));
  });
});

// ── Wiring the panel into the shell ─────────────────────────────────────────

describe('the panel in the app shell', () => {
  it('is a destination like every other tab', () => {
    expect(INDEX_HTML).toContain('id="tab-intel"');
    expect(INDEX_HTML).toContain("switchTab('intel')");
    expect(appSource).toMatch(/intel: 'Intelligence'/);
    expect(appSource).toMatch(/if \(name === 'intel'\) renderIntel\(\);/);
  });

  it('sends an author back to the dashboard', () => {
    // The boundary that matters is firestore.rules, which already denies an
    // author settings/taxCenter. This stops them landing on a screen that
    // could only ever error.
    const gate = appSource.match(/if \(isAuthor\(\) && \([^)]*\)\) name = 'dashboard';/);
    expect(gate[0]).toContain("name === 'intel'");
  });

  it('keeps the composer out of the rebuilt thread', () => {
    // A textarea rebuilt by innerHTML on every render drops the caret
    // mid-word. The composer is permanent markup and is only enabled/disabled.
    expect(INDEX_HTML).toMatch(/<div class="intel-composer"[\s\S]*?<textarea id="intel-input"/);
    const render = appSource.slice(appSource.indexOf('function renderIntel()'));
    const body = render.slice(0, render.indexOf('\n}'));
    expect(body).toContain("innerHTML");
    expect(body).not.toContain('intel-input"');   // never re-rendered, only referenced by id
  });

  it('announces through a live region that outlives the render', () => {
    expect(INDEX_HTML).toMatch(/id="intel-status"[^>]*aria-live="polite"/);
    expect(INDEX_HTML.indexOf('id="intel-status"')).toBeLessThan(INDEX_HTML.indexOf('id="intel-thread"'));
  });

  it('can actually hide the controls it toggles', () => {
    // `hidden` is a UA rule and loses to any component that sets its own
    // display. .btn is inline-flex and .intel-disclosure is flex, so without
    // these the Stop button never goes away and the privacy note reappears on
    // every visit after it has been accepted.
    const css = fs.readFileSync(path.join(root, 'src/style.css'), 'utf8');
    for (const sel of ['#intel-clear[hidden]', '#intel-stop[hidden]', '#intel-disclosure[hidden]']) {
      expect(css).toContain(sel);
    }
  });

  it('tells the publisher where their figures go before the first question', () => {
    expect(INDEX_HTML).toContain('id="intel-disclosure"');
    expect(INDEX_HTML).toMatch(/Gemini/);
    expect(appSource).toMatch(/function disclosureAccepted\(\)/);
  });
});
