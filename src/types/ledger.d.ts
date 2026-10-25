// Shapes of the records a book's state is made of, for the type checker only.
//
// Nothing here reaches the app: a .d.ts file has no runtime code, Vite never
// bundles it, and the JS files refer to it from JSDoc comments
// (`@param {import('../types/ledger').BookState} s`). `npm run typecheck`
// (tsc --noEmit, run in CI) uses it to check the files listed in
// tsconfig.json.
//
// Records saved by older versions of the app can lack any field, and some
// numbers arrive as text from forms and Sheets, so most fields are optional
// and money/quantity fields allow strings. The code coerces with Number(); the
// types say so rather than pretending the data is cleaner than it is.

/** A number as it may be stored: a real number, or text from a form or Sheet. */
export type NumberLike = number | string;

/** How a sale was paid when the currency differs, frozen at the moment of sale. */
export interface Payment {
  currency?: string;
  amount?: NumberLike;
  /** Exchange rate used, or null when none applied. */
  rate?: NumberLike | null;
  /** Total in the entry's own currency (its `cur` stamp), not today's book currency. */
  convertedTotal?: NumberLike;
  type?: string;
}

/** One row of a book's sales history (state.hist). */
export interface HistRow {
  num?: string;
  chan?: string;
  qty?: NumberLike;
  price?: NumberLike;
  /** Running copies on hand after this row. */
  after?: number;
  notes?: string;
  date?: string;
  payment?: Payment | null;
  enteredBy?: string;
  sheetsId?: string;
  /** Currency the row's amounts are in, stamped when it was entered. */
  cur?: string;
  recordedAt?: string;
  voided?: boolean;
  voidedAt?: string | number;
  gratuity?: NumberLike;
  invoiceNum?: string;
  invoiceId?: string;
  artistPending?: boolean;
  /** True on a consignment sale's History copy (its stock already left as a Shipment). */
  consignmentLink?: boolean;
  directToArtist?: boolean;
  paymentType?: string;
  [key: string]: unknown;
}

/** One row of a book's consignment ledger (state.ledger). */
export interface LedgerRow {
  type?: string;
  storeName?: string;
  qty?: NumberLike;
  amountDue?: NumberLike;
  rate?: NumberLike;
  status?: string;
  date?: string;
  notes?: string;
  reason?: string;
  invoiceNum?: string;
  invoiceId?: string;
  sheetsId?: string;
  cur?: string;
  voided?: boolean;
  [key: string]: unknown;
}

/** A store a book is consigned to (state.stores), with its running counts. */
export interface Store {
  id?: string;
  name?: string;
  contact?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  region?: string;
  postal?: string;
  country?: string;
  website?: string;
  terms?: string;
  /** Store's cut, percent. */
  rate?: NumberLike;
  notes?: string;
  sent?: NumberLike;
  sold?: NumberLike;
  returned?: NumberLike;
  outstanding?: NumberLike;
  amountOwed?: NumberLike;
  [key: string]: unknown;
}

/** A hand-off of copies between the publisher and the author. */
export interface StockTransfer {
  id: string;
  date: string;
  /** Positive: to the author. Negative: back from the author. */
  delta: number;
  direction: 'to_author' | 'from_author';
  /** Copies moved, always positive. */
  qty: number;
  note: string;
  /** Publisher- and author-held counts right after the transfer. */
  publisherOnHand: number;
  authorHeld: number;
}

/** A book's whole saved state (states[bookId]). */
export interface BookState {
  stock?: number;
  authorStock?: number;
  stockTransfers?: StockTransfer[];
  sold?: number;
  revenue?: number;
  /** Per sales channel: number of sales, copies and revenue. Derived from hist. */
  chStats?: Record<string, { txns: number; units: number; revenue: number }>;
  hist?: HistRow[];
  stores?: Store[];
  ledger?: LedgerRow[];
  doneIds?: string[];
  invoices?: Array<Record<string, unknown>>;
  invoiceSeq?: number;
  [key: string]: unknown;
}

/** A book's catalog entry (BOOKS[bookId]). */
export interface Book {
  id: string;
  title?: string;
  /** A currency code or symbol, e.g. 'CAD' or 'CA$'. */
  currency?: string;
  maxPrint?: number;
  listPrice?: NumberLike;
  [key: string]: unknown;
}
