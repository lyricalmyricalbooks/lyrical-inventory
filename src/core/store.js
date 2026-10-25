// The books and their numbers: one home for the state every screen reads.
//
// Before this module, these lived in main.js, so every screen that needed a
// book had to import main.js — and main.js imports every screen. Screens now
// read them from here, a module that imports nothing, so the shared data no
// longer drags the whole app along with it.
//
// The bindings are `export let`, so importers always see the current value;
// only this module can reassign them, through the setters below. That is
// also where the one invariant lives: BOOK_LIST is always Object.values(BOOKS).

/** @typedef {import('../types/ledger').Book} Book */
/** @typedef {import('../types/ledger').BookState} BookState */

/** The catalog, by book id. @type {Record<string, Book>} */
export let BOOKS = {};
/** Object.values(BOOKS), kept in step by setBooks / refreshBookList. @type {Book[]} */
export let BOOK_LIST = [];
/** Each book's saved state, by book id. @type {Record<string, BookState>} */
export let states = {};
/** The book on screen: a book id, 'all', or null before start-up picks one. @type {string | null} */
export let activeBook = null;

/** Replace the catalog. @param {Record<string, Book>} next */
export function setBooks(next) {
  BOOKS = next;
  BOOK_LIST = Object.values(BOOKS);
}

/** After adding, removing or editing entries of BOOKS in place. */
export function refreshBookList() {
  BOOK_LIST = Object.values(BOOKS);
}

/** @param {string | null} bookId */
export function setActiveBook(bookId) {
  activeBook = bookId;
}

/** A new book's empty state. @param {Book} book @returns {BookState} */
export function defaultState(book) {
  return { stock: book.maxPrint, authorStock: 0, stockTransfers: [], sold: 0, revenue: 0, chStats: {}, hist: [], stores: [], ledger: [], doneIds: [], artistTransfers: [], artistPayouts: [], artistReceivables: [], payoutRequests: [], expenses: [], artistPaymentLink: '', invoices: [], invoiceSeq: 0, openCall: [] };
}

/** The on-screen book's state, created empty the first time. @returns {BookState} */
export function getState() {
  if (!states[activeBook]) {
    states[activeBook] = defaultState(BOOKS[activeBook] || BOOK_LIST[0]);
  }
  return states[activeBook];
}

/** The on-screen book, or the first book when none is chosen. @returns {Book} */
export function getBook() { return BOOKS[activeBook] || BOOK_LIST[0]; }

/**
 * Run `fn` as if `bookId` were on screen. The void/unvoid Sheets sync names
 * the on-screen book, so a sale on another book points it there first.
 * @param {string} bookId @param {() => void} fn
 */
export function withActiveBook(bookId, fn) {
  const prev = activeBook;
  activeBook = bookId;
  try { fn(); } finally { activeBook = prev; }
}
