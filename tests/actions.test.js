// Buttons that name an action (data-action) instead of carrying inline code.
// See src/lib/actions.js.
import { describe, it, expect, vi, afterEach, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerActions, registeredActions } from '../src/lib/actions.js';
import { loadApp } from './helpers/load-app.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('named actions', () => {
  afterEach(() => { document.body.innerHTML = ''; });

  it('runs the action named by the clicked element, even inside it and on markup drawn later', () => {
    const go = vi.fn();
    registerActions({ 'test.go': go });
    document.body.innerHTML = '<button data-action="test.go" data-id="it\'s &quot;7&quot;"><span>Go</span></button>';
    document.querySelector('span').click();
    expect(go).toHaveBeenCalledTimes(1);
    const [el, event] = go.mock.calls[0];
    expect(el.dataset.id).toBe('it\'s "7"');
    expect(event.type).toBe('click');
  });

  it('runs change and input actions on form fields', () => {
    const changed = vi.fn();
    const typed = vi.fn();
    registerActions({ 'test.changed': changed, 'test.typed': typed });
    document.body.innerHTML = '<input type="checkbox" data-on-change="test.changed"><input data-on-input="test.typed">';
    const [box, field] = document.querySelectorAll('input');
    box.click();
    field.value = 'x';
    field.dispatchEvent(new Event('input', { bubbles: true }));
    expect(changed).toHaveBeenCalledTimes(1);
    expect(typed).toHaveBeenCalledTimes(1);
  });

  it('refuses the same name twice, so two screens cannot quietly take over each other’s buttons', () => {
    registerActions({ 'test.once': () => {} });
    expect(() => registerActions({ 'test.once': () => {} })).toThrow(/already registered/);
    expect(registeredActions()).toContain('test.once');
  });

  it('reports an action that fails, sync or async, without breaking the next click', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const after = vi.fn();
    registerActions({
      'test.throws': () => { throw new Error('boom'); },
      'test.rejects': async () => { throw new Error('later'); },
      'test.after': after,
    });
    document.body.innerHTML = '<button data-action="test.throws"></button><button data-action="test.rejects"></button><button data-action="test.after"></button>';
    document.querySelectorAll('button').forEach(b => b.click());
    await Promise.resolve();
    await Promise.resolve();
    expect(after).toHaveBeenCalledTimes(1);
    expect(err).toHaveBeenCalledTimes(2);
    err.mockRestore();
  });
});

// ── Moving off inline handlers ──────────────────────────────────────────────
// The goal is a page with no on*= attributes, so the browser can be told to
// refuse inline script outright. Screens move one at a time; this keeps the
// count from growing in the meantime.
const INLINE = /\son[a-z]+\s*=\s*["']/gi;
const countIn = (file) => (fs.readFileSync(path.join(root, file), 'utf8').match(INLINE) || []).length;
const srcFiles = [];
(function walk(dir) {
  for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) walk(rel);
    else if (rel.endsWith('.js')) srcFiles.push(rel);
  }
})('src');

// Lower these as screens move over; never raise them.
// 1,382 when this started (766 in index.html, 616 + the 18 the assistant
// panel and the Big Cartel screen just dropped in src).
const MAX_IN_INDEX_HTML = 766;
const MAX_IN_SRC = 616;

// Screens already on named actions stay there.
const DONE = ['src/features/intel.js', 'src/features/bigcartel.js'];

describe('inline handlers', () => {
  it('do not grow in index.html', () => {
    expect(countIn('index.html')).toBeLessThanOrEqual(MAX_IN_INDEX_HTML);
  });

  it('do not grow in the app code', () => {
    const total = srcFiles.reduce((n, f) => n + countIn(f), 0);
    expect(total).toBeLessThanOrEqual(MAX_IN_SRC);
  });

  it('do not come back to a screen that has moved to named actions', () => {
    expect(DONE.filter(f => countIn(f) > 0)).toEqual([]);
  });
});

describe('in the running app', () => {
  let app;
  beforeAll(async () => { app = await loadApp({}); }, 30000);

  it('has every button the converted screens draw registered', async () => {
    const intel = await import('../src/features/intel.js');
    const bc = await import('../src/features/bigcartel.js');
    const names = registeredActions();
    expect(Object.keys(intel.intelActions).filter(n => !names.includes(n))).toEqual([]);
    expect(Object.keys(bc.bigCartelActions).filter(n => !names.includes(n))).toEqual([]);
    expect(app.window.dismissBigCartelGap).toBeUndefined();
  });

  it('names only registered actions in the markup those screens draw', () => {
    const names = new Set(registeredActions());
    const used = new Set();
    for (const f of DONE) {
      for (const m of fs.readFileSync(path.join(root, f), 'utf8').matchAll(/data-(?:action|on-change|on-input)="([\w.]+)"/g)) used.add(m[1]);
    }
    expect(used.size).toBeGreaterThan(10);
    expect([...used].filter(n => !names.has(n))).toEqual([]);
  });
});
