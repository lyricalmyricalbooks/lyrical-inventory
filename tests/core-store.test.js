// src/core/store.js: the one home of the books and their numbers.
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as store from '../src/core/store.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STORE_NAMES = ['BOOKS', 'BOOK_LIST', 'states', 'activeBook', 'defaultState', 'getState', 'getBook', 'withActiveBook'];

describe('the shared book data', () => {
  beforeEach(() => {
    store.setBooks({ a: { id: 'a', title: 'A', maxPrint: 50 }, b: { id: 'b', title: 'B', maxPrint: 10 } });
    for (const k of Object.keys(store.states)) delete store.states[k];
    store.setActiveBook('a');
  });

  it('keeps the book list in step with the catalog', () => {
    expect(store.BOOK_LIST.map(b => b.id)).toEqual(['a', 'b']);
    store.BOOKS.c = { id: 'c', maxPrint: 5 };
    store.refreshBookList();
    expect(store.BOOK_LIST.map(b => b.id)).toEqual(['a', 'b', 'c']);
  });

  it('gives the on-screen book an empty state the first time it is read', () => {
    const s = store.getState();
    expect(s).toBe(store.states.a);
    expect(s.stock).toBe(50);
    expect(s.hist).toEqual([]);
    expect(store.getBook().id).toBe('a');
  });

  it('points at another book for one step, and back even if that step fails', () => {
    let seen = null;
    store.withActiveBook('b', () => { seen = store.activeBook; });
    expect(seen).toBe('b');
    expect(store.activeBook).toBe('a');
    expect(() => store.withActiveBook('b', () => { throw new Error('boom'); })).toThrow('boom');
    expect(store.activeBook).toBe('a');
  });

  it('imports nothing, so reading a book never drags in the rest of the app', () => {
    const src = fs.readFileSync(path.join(root, 'src/core/store.js'), 'utf8');
    expect(src).not.toMatch(/^\s*import\s[^;]*from\s/m);
  });

  it('is where the screens take it from, not main.js', () => {
    const dir = path.join(root, 'src/features');
    const offenders = [];
    for (const f of fs.readdirSync(dir).filter(n => n.endsWith('.js'))) {
      const m = fs.readFileSync(path.join(dir, f), 'utf8').match(/import\s*\{([^}]*)\}\s*from\s*'\.\.\/main\.js'/);
      const names = m ? m[1].split(',').map(s => s.trim()).filter(Boolean) : [];
      names.filter(n => STORE_NAMES.includes(n)).forEach(n => offenders.push(`${f}: ${n}`));
    }
    expect(offenders).toEqual([]);
  });
});
