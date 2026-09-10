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

describe('a staged batch on screen', () => {
  const intelBatchHtml = buildHarness({
    names: ['intelBatchHtml'], deps: { escapeHtml }, returns: 'intelBatchHtml',
  });
  const batch = (over = {}) => ({
    id: 'b1', summary: 'Add ISBNs to two books', status: 'open', skipped: [],
    rejected: [], warnings: [], moneyEditCount: 0,
    items: [
      { ref: 'e1', target: 'book', id: 'hound', record: 'The Hound', fieldLabel: 'ISBN',
        risk: 'descriptive', beforeText: '—', afterText: '978-0-306-40615-7', reason: 'from the printer' },
      { ref: 'e2', target: 'book', id: 'altrove', record: 'Un Fantastico Altrove', fieldLabel: 'List price',
        risk: 'money', beforeText: '40', afterText: '45' },
    ],
    ...over,
  });

  it('shows every row with what it is now and what it becomes', () => {
    const html = intelBatchHtml(batch());
    expect(html).toContain('The Hound');
    expect(html).toContain('978-0-306-40615-7');
    expect(html).toContain('Un Fantastico Altrove');
    expect(html).toContain('2 changes need your OK');
  });

  it('lets a single row be unticked without losing the rest', () => {
    const html = intelBatchHtml(batch());
    expect(html).toContain("toggleIntelEdit('b1','e1')");
    const one = intelBatchHtml(batch({ skipped: ['e1'] }));
    expect(one).toContain('1 change needs your OK');
    expect(one).toContain('Make this change');
  });

  it('cannot be approved once every row is unticked', () => {
    expect(intelBatchHtml(batch({ skipped: ['e1', 'e2'] }))).toContain('disabled');
  });

  it('calls out the changes that move money', () => {
    const html = intelBatchHtml(batch());
    expect(html).toMatch(/affects money/i);
    expect(html).toContain('intel-money-flag');
  });

  it('surfaces a warning the tool raised rather than burying it', () => {
    const html = intelBatchHtml(batch({ warnings: ['Shares would add up to 110%, not 100%.'] }));
    expect(html).toContain('110%');
  });

  it('shows what could not be prepared, and why', () => {
    const html = intelBatchHtml(batch({ rejected: [{ at: 'change 3', reason: 'its check digit does not match' }] }));
    expect(html).toContain('1 could not be prepared');
    expect(html).toContain('check digit');
  });

  it('stops offering the buttons once it is settled', () => {
    for (const status of ['applied', 'dismissed']) {
      const html = intelBatchHtml(batch({ status }));
      expect(html).not.toContain('applyIntelProposal');
      expect(html).not.toContain('toggleIntelEdit');
    }
  });

  it('escapes anything that came back from the model', () => {
    const html = intelBatchHtml(batch({
      summary: '<img src=x onerror=1>',
      items: [{ ref: 'e1', target: 'book', id: 'h', record: '<script>bad()</script>', fieldLabel: 'ISBN',
        risk: 'descriptive', beforeText: '—', afterText: '<b>x</b>' }],
    }));
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('<b>x</b>');
  });

  it('sets values in tabular figures so a column of them lines up', () => {
    expect(intelBatchHtml(batch())).toContain('intel-fig');
    expect(fs.readFileSync(path.join(root, 'src/style.css'), 'utf8'))
      .toMatch(/\.intel-fig\s*\{[^}]*tnum/);
  });
});

// ── Why the composer might be unavailable ───────────────────────────────────

describe('when a question cannot be asked', () => {
  const blocker = (TAX_CENTER, onLine = true) => buildHarness({
    // intelBlocker now consults backupProvider(), so it has to come across too.
    names: ['backupProvider', 'intelBlocker'],
    deps: { TAX_CENTER, navigator: { onLine } },
    returns: 'intelBlocker',
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

describe('approving a batch of changes', () => {
  function harness({ confirm = true, author = false, failSave = null } = {}) {
    const BOOKS = { hound: { title: 'The Hound', isbn: '—', listPrice: 65 }, other: { title: 'Other', isbn: '—' } };
    const TAX_CENTER = {
      businessExpenses: [{ id: 'b1', desc: 'Train', cat: 'travel', amount: 120, currency: 'CAD', baseAmount: 120 }],
      tripBudgets: { 'Toronto Word Fair': 400 },
    };
    const states = {
      hound: { expenses: [{ id: 'e1', desc: 'Table fee', cat: 'Events' }], stores: [{ id: 's1', name: 'Bookshop', rate: 40 }] },
    };
    const mk = (name) => {
      const fn = vi.fn().mockResolvedValue(undefined);
      if (failSave === name) fn.mockRejectedValue(new Error('offline'));
      return fn;
    };
    const deps = {
      INTEL_PROPOSALS: new Map(), BOOKS, TAX_CENTER, states,
      saveCatalogWithDeletions: mk('catalog'),
      saveTaxCenter: mk('taxCenter'),
      saveState: mk('bookState'),
      showToast: vi.fn(),
      isAuthor: () => author,
      confirmDialog: vi.fn().mockResolvedValue(confirm),
      setIntelStatus: vi.fn(), saveIntelThread: vi.fn(), renderIntel: vi.fn(),
      console: { error: vi.fn() },
      window: {},
    };
    const api = buildHarness({
      names: ['saveGroupFor', 'liveRecordFor', 'applyIntelProposal', 'toggleIntelEdit'],
      deps,
      returns: '({ apply: applyIntelProposal, toggle: toggleIntelEdit })',
    });
    return { ...api, ...deps };
  }

  const item = (over = {}) => ({
    ref: 'e1', target: 'book', id: 'hound', bookId: 'hound', record: 'The Hound',
    field: 'isbn', fieldLabel: 'ISBN', risk: 'descriptive',
    beforeText: '—', afterText: '9780306406157', after: '9780306406157', ...over,
  });
  const batch = (items) => ({ id: 'b1', summary: 's', status: 'open', skipped: [], items, rejected: [], warnings: [] });

  it('asks first, then writes through the app own save path', async () => {
    const h = harness();
    h.INTEL_PROPOSALS.set('b1', batch([item()]));
    await h.apply('b1');

    expect(h.confirmDialog).toHaveBeenCalled();
    expect(h.BOOKS.hound.isbn).toBe('9780306406157');
    // The catalogue save is what carries the ownership map and the merge.
    expect(h.saveCatalogWithDeletions).toHaveBeenCalledTimes(1);
    expect(h.INTEL_PROPOSALS.get('b1').status).toBe('applied');
  });

  it('saves once per kind of record, not once per change', async () => {
    // Twenty ISBNs is one catalogue write. Doing it twenty times is twenty
    // round trips and twenty chances to half-finish.
    const h = harness();
    h.INTEL_PROPOSALS.set('b1', batch([
      item({ ref: 'e1', id: 'hound' }),
      item({ ref: 'e2', id: 'other', record: 'Other', after: '0306406152' }),
      item({ ref: 'e3', target: 'businessExpense', id: 'b1', field: 'cat', after: 'Travel & Meals' }),
      item({ ref: 'e4', target: 'bookExpense', id: 'e1', bookId: 'hound', field: 'cat', after: 'Events & Exhibitions' }),
      item({ ref: 'e5', target: 'store', id: 's1', bookId: 'hound', field: 'rate', after: 45 }),
    ]));
    await h.apply('b1');

    expect(h.saveCatalogWithDeletions).toHaveBeenCalledTimes(1);
    expect(h.saveTaxCenter).toHaveBeenCalledTimes(1);
    // Both the book expense and the shop live on the same book's state.
    expect(h.saveState).toHaveBeenCalledTimes(1);
    expect(h.saveState).toHaveBeenCalledWith('hound');
    expect(h.states.hound.stores[0].rate).toBe(45);
  });

  it('writes a trip budget onto the map rather than into a record', async () => {
    const h = harness();
    h.INTEL_PROPOSALS.set('b1', batch([
      item({ target: 'tripBudget', id: 'Toronto Word Fair', mapKey: 'Toronto Word Fair', field: null, after: 500 }),
    ]));
    await h.apply('b1');
    expect(h.TAX_CENTER.tripBudgets['Toronto Word Fair']).toBe(500);
    expect(h.saveTaxCenter).toHaveBeenCalledTimes(1);
  });

  it('applies the side effect alongside the change it belongs to', async () => {
    const h = harness();
    h.INTEL_PROPOSALS.set('b1', batch([
      item({ target: 'businessExpense', id: 'b1', field: 'currency', after: 'USD',
        sidePatch: { baseAmount: null, fxMissing: true } }),
    ]));
    await h.apply('b1');
    const e = h.TAX_CENTER.businessExpenses[0];
    expect(e.currency).toBe('USD');
    // A stale Canadian figure would look applied on screen and be wrong in
    // every total, so it is cleared and flagged instead.
    expect(e.baseAmount).toBeNull();
    expect(e.fxMissing).toBe(true);
  });

  it('leaves out a row the publisher unticked', async () => {
    const h = harness();
    h.INTEL_PROPOSALS.set('b1', batch([item({ ref: 'e1' }), item({ ref: 'e2', id: 'other', record: 'Other' })]));
    h.toggle('b1', 'e2');
    await h.apply('b1');

    expect(h.BOOKS.hound.isbn).toBe('9780306406157');
    expect(h.BOOKS.other.isbn).toBe('—');
  });

  it('changes nothing when the publisher says no', async () => {
    const h = harness({ confirm: false });
    h.INTEL_PROPOSALS.set('b1', batch([item()]));
    await h.apply('b1');

    expect(h.BOOKS.hound.isbn).toBe('—');
    expect(h.saveCatalogWithDeletions).not.toHaveBeenCalled();
    expect(h.INTEL_PROPOSALS.get('b1').status).toBe('open');
  });

  it('skips a record that has gone rather than recreating it', async () => {
    // The thread survives a reload, so a staged change can outlive its record.
    const h = harness();
    h.INTEL_PROPOSALS.set('b1', batch([item({ id: 'vanished' })]));
    await h.apply('b1');

    expect(h.saveCatalogWithDeletions).not.toHaveBeenCalled();
    expect(h.showToast).toHaveBeenCalledWith(expect.stringMatching(/no longer there/i), 'warn', expect.any(Number));
  });

  it('reports a failed save instead of claiming it worked', async () => {
    const h = harness({ failSave: 'catalog' });
    h.INTEL_PROPOSALS.set('b1', batch([item()]));
    await h.apply('b1');

    expect(h.showToast).toHaveBeenCalledWith(expect.stringMatching(/could not be saved/i), 'warn', expect.any(Number));
    expect(h.showToast).not.toHaveBeenCalledWith(expect.stringMatching(/saved$/), 'ok', expect.any(Number));
  });

  it('refuses outright in an author session', async () => {
    const h = harness({ author: true });
    h.INTEL_PROPOSALS.set('b1', batch([item()]));
    await h.apply('b1');
    expect(h.confirmDialog).not.toHaveBeenCalled();
    expect(h.BOOKS.hound.isbn).toBe('—');
  });

  it('cannot be applied twice', async () => {
    const h = harness();
    h.INTEL_PROPOSALS.set('b1', { ...batch([item()]), status: 'applied' });
    await h.apply('b1');
    expect(h.confirmDialog).not.toHaveBeenCalled();
  });
});

// ── Falling back to the second provider ─────────────────────────────────────

describe('when Google will not answer', () => {
  function harness({ gemini = null, backup = null, geminiKey = 'g', backupKey = 'b', backupModel = 'vendor/m:free' } = {}) {
    const TAX_CENTER = { settings: { geminiKey, openRouterKey: backupKey, openRouterModel: backupModel } };
    const runIntelTurn = vi.fn(gemini || (async () => ({ text: 'from google', via: undefined, toolCalls: [], proposals: [], history: [] })));
    const runOpenRouterTurn = vi.fn(backup || (async () => ({ text: 'from backup', via: 'openrouter', model: backupModel, toolCalls: [], proposals: [], history: [] })));
    const deps = {
      TAX_CENTER, runIntelTurn, runOpenRouterTurn,
      INTEL_HISTORY: [], INTEL_TOOL_SCHEMAS: [],
      intelContext: () => ({}), systemInstruction: () => 'sys',
      intelAbort: { signal: undefined },
      setIntelStatus: vi.fn(),
      friendlyChatError: (e) => `google: ${e.message}`,
      friendlyOpenRouterError: (e) => `backup: ${e.message}`,
      console: { warn: vi.fn() },
    };
    const ask = buildHarness({
      names: ['backupProvider', 'askWithFallback'], deps, returns: 'askWithFallback',
    });
    return { ask, ...deps };
  }

  it('uses Google when Google works, and does not touch the backup', async () => {
    const h = harness();
    expect((await h.ask('q')).text).toBe('from google');
    expect(h.runOpenRouterTurn).not.toHaveBeenCalled();
  });

  it.each([
    ['the allowance is used up', 'quota exceeded'],
    ['the key was rotated', 'Request had invalid authentication credentials'],
    ['the service is down', 'HTTP 503'],
    ['the project is misconfigured', 'SERVICE_DISABLED'],
  ])('falls back when %s', async (_label, message) => {
    // A backup that only covers an exhausted allowance is a backup that is
    // missing whenever it is actually needed.
    const h = harness({ gemini: async () => { throw new Error(message); } });
    expect((await h.ask('q')).text).toBe('from backup');
    expect(h.runOpenRouterTurn).toHaveBeenCalledTimes(1);
  });

  it('passes the same conversation and tools to whichever answers', async () => {
    const h = harness({ gemini: async () => { throw new Error('down'); } });
    await h.ask('what did I sell?');
    const [geminiArgs] = h.runIntelTurn.mock.calls[0];
    const [backupArgs] = h.runOpenRouterTurn.mock.calls[0];
    expect(backupArgs.userText).toBe(geminiArgs.userText);
    expect(backupArgs.systemInstruction).toBe(geminiArgs.systemInstruction);
    expect(backupArgs.model).toBe('vendor/m:free');
  });

  it('never falls back on a cancel', async () => {
    // The publisher pressed stop. Quietly asking somebody else instead is the
    // opposite of what that means.
    const abort = Object.assign(new Error('Aborted'), { name: 'AbortError' });
    const h = harness({ gemini: async () => { throw abort; } });
    await expect(h.ask('q')).rejects.toThrow(/Abort/);
    expect(h.runOpenRouterTurn).not.toHaveBeenCalled();
  });

  it('reports both failures when neither can answer', async () => {
    const h = harness({
      gemini: async () => { throw new Error('quota exceeded'); },
      backup: async () => { throw new Error('out of credits'); },
    });
    await expect(h.ask('q')).rejects.toThrow(/google: quota exceeded.*backup: out of credits/);
  });

  it('re-raises Google own error when no backup is configured', async () => {
    const h = harness({ gemini: async () => { throw new Error('quota exceeded'); }, backupKey: '' });
    await expect(h.ask('q')).rejects.toThrow(/quota exceeded/);
    expect(h.runOpenRouterTurn).not.toHaveBeenCalled();
  });

  it('needs both the key and the model before it will use the backup', async () => {
    for (const missing of [{ backupKey: '' }, { backupModel: '' }]) {
      const h = harness({ gemini: async () => { throw new Error('down'); }, ...missing });
      await expect(h.ask('q')).rejects.toThrow(/down/);
      expect(h.runOpenRouterTurn).not.toHaveBeenCalled();
    }
  });

  it('goes straight to the backup when there is no Google key at all', async () => {
    const h = harness({ geminiKey: '' });
    expect((await h.ask('q')).text).toBe('from backup');
    expect(h.runIntelTurn).not.toHaveBeenCalled();
  });

  it('says it is switching, rather than looking stuck', async () => {
    const h = harness({ gemini: async () => { throw new Error('down'); } });
    await h.ask('q');
    expect(h.setIntelStatus).toHaveBeenCalledWith(expect.stringMatching(/backup/i));
  });
});

describe('the composer with only a backup key', () => {
  const blocker = (settings, onLine = true) => buildHarness({
    names: ['backupProvider', 'intelBlocker'],
    deps: { TAX_CENTER: { settings }, navigator: { onLine } },
    returns: 'intelBlocker',
  })();

  it('lets the panel work on the backup alone', () => {
    // Requiring Google would lock the publisher out in exactly the situation
    // the backup exists for.
    expect(blocker({ openRouterKey: 'b', openRouterModel: 'm' })).toBe('');
  });

  it('still asks for a key when neither is set up', () => {
    expect(blocker({})).toMatch(/Add your AI key/i);
    expect(blocker({ openRouterKey: 'b' })).toMatch(/Add your AI key/i);
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
