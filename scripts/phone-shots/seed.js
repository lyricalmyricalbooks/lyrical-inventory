// Demo data for the phone screenshot rig (scripts/phone-shots). Dev-only: the
// app never imports this file. shots-entry.js loads it into a fake cloud, so
// the real app boots with three books that have something on every screen.
//
// Shapes were copied from the write paths in src/main.js, not invented:
//   hist (direct sale)    recordOrder -> writeOrderToLedger         main.js:8974, 8990
//   hist (consign mirror) confirmSale (histRow)                     main.js:12669
//   hist (gratuity)       submitGratuity (s.hist.unshift)           main.js:12058
//   ledger Shipment       confirmSend                               main.js:12427
//   ledger Sale           confirmSale (ledger push)                 main.js:12671
//   ledger Return         confirmReturn                             main.js:12692
//   stores                addStore                                  main.js:12317
//   invoices              saveInvoice (payload)                     main.js:14228
//   expenses              submitGratuity (push)                     main.js:12140
//   bill-to fields        billToPayload                             src/lib/invoices.js:352
//
// Derived numbers (stock, sold, revenue, chStats, store counters, the running
// "after" balance) are computed from the rows below with the same rules as
// deriveOnHandRaw (src/lib/inventory.js:22), recalculateBookStatsFromHistory
// (src/lib/inventory.js:256) and reconcileStores (src/main.js:15789), so the
// seeded numbers agree with what the app would derive.
//
// All dates are relative to the fixed demo day 2026-10-10.
// Keep ids and titles clear of the sandbox word the app filters on (see the load-app helper).

const CUR = 'CAD';   // what the app stores in ledger/hist `cur` and expense codes
const SYM = 'CA$';   // book.currency symbol, which getBookCurrencyCode maps to CAD

const r2 = n => Math.round(n * 100) / 100;

// ── Catalog ───────────────────────────────────────────────────────────────
export const demoBooks = [
  {
    id: 'harbour', title: 'Harbour Lights', author: 'Ruth Calder', isbn: '978-1-7700-0101-4',
    maxPrint: 120, listPrice: 24, currency: SYM, threshold: 5, productionCost: 6.4,
    accent: '#2f6f9f', accentBg: 'rgba(47,111,159,.1)', urlParam: 'harbour',
  },
  {
    id: 'meadow', title: 'Meadow Hymns', author: 'Jonah Pell', isbn: '978-1-7700-0202-1',
    maxPrint: 150, listPrice: 22, currency: SYM, threshold: 5, productionCost: 5.1,
    accent: '#6b8f3a', accentBg: 'rgba(107,143,58,.1)', urlParam: 'meadow',
  },
  {
    id: 'ember', title: 'Ember Season', author: 'Iris Okafor', isbn: '978-1-7700-0303-8',
    maxPrint: 90, listPrice: 28, currency: SYM, threshold: 8, productionCost: 7.25,
    accent: '#c4502b', accentBg: 'rgba(196,80,43,.1)', urlParam: 'ember',
  },
];

// ── Row builders (field names as the app writes them) ─────────────────────

// Consignment stock leaving the publisher for a store. Ledger only; stock is
// taken out here, so the matching hist rows never touch stock again.
function shipment({ id, store, date, qty, notes, sheetsId }) {
  return { id, storeId: store.id, storeName: store.name, type: 'Shipment', date, qty, rate: store.rate, amountDue: 0, paid: 'n/a', notes, status: 'sent', sheetsId };
}

// A store sale. Returns the ledger row plus the hist "mirror" the History tab
// reads (chan 'Consignment', consignmentLink, store name in notes, same sheetsId).
// amountDue is the publisher's share after the store's commission.
function consignSale({ id, store, date, qty, unitPrice, paid, num, notes = '', sheetsId, invoice = null }) {
  const amountDue = r2(qty * unitPrice * (1 - store.rate / 100));
  const row = { id, storeId: store.id, storeName: store.name, type: 'Sale', date, qty, rate: store.rate, amountDue, paid, notes, status: paid, sheetsId, cur: CUR };
  if (invoice) { row.invoiceId = invoice.id; row.invoiceNum = invoice.num; }
  const mirror = { num, chan: 'Consignment', qty, price: r2(amountDue / qty), after: 0, notes: store.name, date, sheetsId, consignmentLink: true, cur: CUR };
  if (paid === 'paid') mirror.paidState = 'paid';
  return { row, mirror };
}

// Copies coming back from a store. Restocked copies return to shelf stock;
// written-off copies do not.
function returnRow({ id, store, date, qty, restock, notes, sheetsId }) {
  return { id, storeId: store.id, storeName: store.name, type: 'Return', date, qty, rate: store.rate, amountDue: 0, paid: 'n/a', notes, status: restock ? 'restocked' : 'written off', sheetsId };
}

// A direct sale typed at the register, from a fair, the website or in person.
// `payment` is only set for a sale taken in another currency (the app's
// paymentSummary reads currency, amount, rate and convertedTotal).
function directSale({ num, chan, qty, price, date, notes, payment = null, sheetsId }) {
  return { recordedAt: date + 'T12:00:00.000Z', num, chan, qty, price, after: 0, notes, date, payment, enteredBy: 'Publisher', sheetsId, cur: CUR };
}

// Free copies. They take stock but add no sales or revenue.
function gratuity({ num, qty, date, notes, sheetsId }) {
  return { num, chan: 'Gratuity', qty, price: 0, after: 0, notes, date, gratuity: true, gratSource: 'publisher', sheetsId };
}

function expense({ id, desc, cat, amount, date, ref }) {
  return { id, desc, cat, amount, currency: CUR, origAmount: amount, origCurrency: CUR, baseAmount: amount, date, ref, received: false, gratuity: false };
}

// An invoice billed to a store. Totals follow the app's rule: subtotal less
// discount plus tax, with no discount or tax in this demo.
function invoice({ id, num, store, book, date, dueDate, items, status, paidAt = null, paidMethod = null }) {
  const lines = items.map(it => ({ description: it.description, qty: it.qty, unitPrice: it.unitPrice, _ledgerId: it.ledgerId ?? null, bookId: book.id }));
  const subtotal = r2(lines.reduce((a, l) => a + l.qty * l.unitPrice, 0));
  const created = Date.parse(date + 'T09:00:00Z');
  return {
    id, num, billTo: 'store',
    storeId: store.id, storeName: store.name, storeEmail: store.email, storeCity: store.city,
    storeContact: store.contact, storePhone: store.phone, storeAddress: store.address,
    storeRegion: store.region, storePostal: store.postal, storeCountry: store.country,
    date, dueDate, items: lines,
    subtotal, discount: 0, discountType: 'flat', discountRate: 0, taxRate: 0, tax: 0, total: subtotal,
    currency: SYM, currencyCode: CUR, paymentLink: '', notes: '', terms: store.terms,
    status, paidAt, paidMethod, createdAt: created, updatedAt: paidAt || created,
    bookIds: [book.id],
  };
}

// Derive every computed field from the raw rows, in the app's own rules.
// `hist` must hold every hist row for the book: direct sales, gratuities and
// consignment mirrors. Returns a partial state; defaultState fills the rest.
function finish(book, { stores, ledger, hist, invoices, expenses, invoiceSeq }) {
  // Store counters, as reconcileStores() rebuilds them from the ledger.
  for (const st of stores) {
    const mine = ledger.filter(e => e.storeId === st.id);
    const total = type => mine.filter(e => e.type === type).reduce((a, e) => a + e.qty, 0);
    st.sent = total('Shipment');
    st.sold = total('Sale');
    st.returned = total('Return');
    st.outstanding = Math.max(0, st.sent - st.sold - st.returned);
    st.amountOwed = r2(mine.filter(e => e.type === 'Sale' && e.paid === 'pending').reduce((a, e) => a + e.amountDue, 0));
  }

  // Running "Stock After" column and on-hand stock, walked in date order.
  // Direct sales and gratuities leave the shelf; consignment mirrors do not
  // (their copies left with the shipment); shipments leave; restocked returns
  // come back.
  const events = [];
  hist.forEach((h, i) => events.push({ date: h.date, seq: i, delta: h.consignmentLink ? 0 : -h.qty, row: h }));
  ledger.forEach((e, i) => {
    if (e.type === 'Shipment') events.push({ date: e.date, seq: 1000 + i, delta: -e.qty });
    else if (e.type === 'Return' && e.status === 'restocked') events.push({ date: e.date, seq: 1000 + i, delta: e.qty });
  });
  events.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.seq - b.seq));
  let balance = book.maxPrint;
  for (const ev of events) {
    balance += ev.delta;
    if (ev.row) ev.row.after = balance;
  }

  // Channel and headline stats, as recalculateBookStatsFromHistory() builds them.
  let sold = 0;
  let revenue = 0;
  const chStats = {};
  for (const h of hist) {
    const chan = h.chan || 'Manual';
    if (!chStats[chan]) chStats[chan] = { txns: 0, units: 0, revenue: 0 };
    chStats[chan].txns++;
    chStats[chan].units += h.qty;
    chStats[chan].revenue = r2(chStats[chan].revenue + h.qty * h.price);
    if (h.gratuity) continue;
    sold += h.qty;
    revenue = r2(revenue + h.qty * h.price);
  }

  const byDateAsc = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
  const byDateDesc = (a, b) => byDateAsc(b, a);

  return {
    stock: balance,
    sold,
    revenue,
    chStats,
    hist: [...hist].sort(byDateDesc),
    stores,
    ledger: [...ledger].sort(byDateAsc),
    invoices,
    invoiceSeq,
    expenses: [...expenses].sort(byDateDesc),
  };
}

// ── Harbour Lights: three stores, a fair, a website order, a gratuity ─────
function harbourState(book) {
  const driftwood = { id: 201, name: 'Driftwood Books', contact: 'Priya Nair', email: 'orders@driftwood-books.example', phone: '902-555-0142', address: '18 Pier Lane', city: 'Halifax', region: 'NS', postal: 'B3J 1A1', country: 'Canada', website: 'driftwoodbooks.example', terms: 'Net 30', rate: 40, notes: 'Main shop partner. Front window display.', sent: 0, sold: 0, returned: 0, outstanding: 0, amountOwed: 0 };
  const blueHeron = { id: 202, name: 'Blue Heron Gifts', contact: 'Tom Whitley', email: 'hello@blueheron.example', phone: '902-555-0177', address: '4 Fishermen Rd', city: 'Lunenburg', region: 'NS', postal: 'B0J 2C0', country: 'Canada', website: '', terms: 'Net 30', rate: 35, notes: 'Gift shop. Pays by e-transfer.', sent: 0, sold: 0, returned: 0, outstanding: 0, amountOwed: 0 };
  const cornerShelf = { id: 203, name: 'Corner Shelf Café', contact: 'Dana Keller', email: 'dana@cornershelf.example', phone: '902-555-0118', address: '77 Prince St', city: 'Truro', region: 'NS', postal: 'B2N 1E1', country: 'Canada', website: '', terms: 'Net 14', rate: 45, notes: 'Counter display, small run.', sent: 0, sold: 0, returned: 0, outstanding: 0, amountOwed: 0 };

  const inv1 = { id: 'inv-harbour-001', num: 'INV-HARBOU-2026-001' };
  const inv2 = { id: 'inv-harbour-002', num: 'INV-HARBOU-2026-002' };

  const s1 = consignSale({ id: 2104, store: driftwood, date: '2026-08-29', qty: 3, unitPrice: 24, paid: 'paid', num: 'CON-DRIFT-8291', sheetsId: 'harbour-sale-1' });
  const s2 = consignSale({ id: 2105, store: driftwood, date: '2026-09-14', qty: 4, unitPrice: 24, paid: 'paid', num: 'CON-DRIFT-7733', sheetsId: 'harbour-sale-2' });
  const s3 = consignSale({ id: 2106, store: driftwood, date: '2026-10-02', qty: 2, unitPrice: 24, paid: 'pending', num: 'CON-DRIFT-1028', sheetsId: 'harbour-sale-3' });
  const s4 = consignSale({ id: 2107, store: blueHeron, date: '2026-09-05', qty: 2, unitPrice: 24, paid: 'paid', num: 'CON-BLUEH-5510', sheetsId: 'harbour-sale-4', invoice: inv1 });
  const s5 = consignSale({ id: 2108, store: blueHeron, date: '2026-10-06', qty: 3, unitPrice: 24, paid: 'pending', num: 'CON-BLUEH-6042', sheetsId: 'harbour-sale-5' });
  const s6 = consignSale({ id: 2110, store: cornerShelf, date: '2026-09-27', qty: 2, unitPrice: 24, paid: 'pending', num: 'CON-CORNE-2219', sheetsId: 'harbour-sale-6' });

  const ledger = [
    shipment({ id: 2101, store: driftwood, date: '2026-08-12', qty: 15, notes: 'Spring window restock', sheetsId: 'harbour-ship-1' }),
    shipment({ id: 2102, store: blueHeron, date: '2026-08-20', qty: 10, notes: 'Gift shelf starter order', sheetsId: 'harbour-ship-2' }),
    shipment({ id: 2103, store: cornerShelf, date: '2026-09-18', qty: 8, notes: 'Counter display', sheetsId: 'harbour-ship-3' }),
    s1.row, s2.row, s3.row, s4.row, s5.row, s6.row,
    returnRow({ id: 2109, store: blueHeron, date: '2026-09-22', qty: 1, restock: true, notes: 'Shelf-worn, cleaned and put back out', sheetsId: 'harbour-ret-1' }),
  ];

  const hist = [
    directSale({ num: 'POS-410021', chan: 'Book Fair', qty: 3, price: 24, date: '2026-08-14', notes: 'Card', sheetsId: 'harbour-d-1' }),
    directSale({ num: 'POS-410034', chan: 'In Person', qty: 1, price: 24, date: '2026-08-16', notes: 'Cash', sheetsId: 'harbour-d-2' }),
    directSale({ num: '#1038', chan: 'Website', qty: 2, price: 24, date: '2026-08-23', notes: 'Big Cartel', sheetsId: 'harbour-d-3' }),
    directSale({ num: 'POS-410098', chan: 'Book Fair', qty: 4, price: 24, date: '2026-08-31', notes: 'Stripe QR', sheetsId: 'harbour-d-4' }),
    directSale({ num: '#1046', chan: 'Website', qty: 1, price: 24, date: '2026-09-08', notes: 'Big Cartel', payment: { currency: 'USD', amount: 17.52, rate: 1.37, convertedTotal: 24 }, sheetsId: 'harbour-d-5' }),
    directSale({ num: 'POS-410177', chan: 'In Person', qty: 2, price: 24, date: '2026-09-19', notes: 'Bank Transfer', sheetsId: 'harbour-d-6' }),
    directSale({ num: 'DIR-0931', chan: 'Direct', qty: 2, price: 24, date: '2026-09-26', notes: 'Bank Transfer', sheetsId: 'harbour-d-7' }),
    directSale({ num: 'POS-410312', chan: 'Book Fair', qty: 3, price: 24, date: '2026-10-04', notes: 'Card', sheetsId: 'harbour-d-8' }),
    gratuity({ num: 'GRT-0910', qty: 2, date: '2026-09-10', notes: 'Two copies to local reviewers', sheetsId: 'harbour-g-1' }),
    s1.mirror, s2.mirror, s3.mirror, s4.mirror, s5.mirror, s6.mirror,
  ];

  const invoices = [
    invoice({ id: inv1.id, num: inv1.num, store: blueHeron, book, date: '2026-09-05', dueDate: '2026-10-05', status: 'paid', paidAt: Date.parse('2026-09-30T16:20:00Z'), paidMethod: 'Bank Transfer',
      items: [{ description: 'Harbour Lights, copies sold 5 Sep', qty: 2, unitPrice: 15.6, ledgerId: 2107 }] }),
    invoice({ id: inv2.id, num: inv2.num, store: cornerShelf, book, date: '2026-09-18', dueDate: '2026-10-02', status: 'sent',
      items: [{ description: 'Harbour Lights, counter display copies (Sept delivery)', qty: 2, unitPrice: 13.2 }] }),
  ];

  const expenses = [
    expense({ id: 9001, desc: 'Proof copies and print run deposit', cat: 'Printing & Production', amount: 412.5, date: '2026-08-03', ref: 'PR-2208' }),
    expense({ id: 9002, desc: 'Window poster printing', cat: 'Marketing & Advertising', amount: 86.4, date: '2026-08-10', ref: 'RCPT-1147' }),
    expense({ id: 9003, desc: 'Postage for store restock parcels', cat: 'Shipping & Postage', amount: 57.9, date: '2026-09-19', ref: 'RCPT-1206' }),
    expense({ id: 9004, desc: 'Book fair booth fee', cat: 'Events & Exhibitions', amount: 150, date: '2026-09-02', ref: 'INV-FAIR-88' }),
  ];

  return finish(book, { stores: [driftwood, blueHeron, cornerShelf], ledger, hist, invoices, expenses, invoiceSeq: 2 });
}

// ── Meadow Hymns: two stores, one written-off return, a foreign-currency web sale
function meadowState(book) {
  const paperLantern = { id: 301, name: 'The Paper Lantern', contact: 'Aiko Mensah', email: 'hello@paperlantern.example', phone: '506-555-0163', address: '210 King St', city: 'Moncton', region: 'NB', postal: 'E1C 4K1', country: 'Canada', website: 'paperlanternbooks.example', terms: 'Net 30', rate: 40, notes: 'Independent bookshop. Poetry table.', sent: 0, sold: 0, returned: 0, outstanding: 0, amountOwed: 0 };
  const hollowOak = { id: 302, name: 'Hollow Oak Market', contact: 'Ben Ostrowski', email: 'orders@hollowoak.example', phone: '506-555-0190', address: '5 Mill Rd', city: 'Sackville', region: 'NB', postal: 'E4L 1A3', country: 'Canada', website: '', terms: 'Net 30', rate: 30, notes: 'Farmers market stall. Takes cash and card.', sent: 0, sold: 0, returned: 0, outstanding: 0, amountOwed: 0 };

  const inv1 = { id: 'inv-meadow-001', num: 'INV-MEADOW-2026-001' };
  const inv2 = { id: 'inv-meadow-002', num: 'INV-MEADOW-2026-002' };

  const s1 = consignSale({ id: 2204, store: paperLantern, date: '2026-08-27', qty: 4, unitPrice: 22, paid: 'paid', num: 'CON-PAPER-3301', sheetsId: 'meadow-sale-1' });
  const s2 = consignSale({ id: 2205, store: paperLantern, date: '2026-09-16', qty: 5, unitPrice: 22, paid: 'paid', num: 'CON-PAPER-4120', sheetsId: 'meadow-sale-2' });
  const s3 = consignSale({ id: 2206, store: paperLantern, date: '2026-10-03', qty: 3, unitPrice: 22, paid: 'pending', num: 'CON-PAPER-5588', sheetsId: 'meadow-sale-3' });
  const s4 = consignSale({ id: 2207, store: hollowOak, date: '2026-09-09', qty: 4, unitPrice: 22, paid: 'pending', num: 'CON-HOLLO-7712', sheetsId: 'meadow-sale-4' });
  const s5 = consignSale({ id: 2208, store: hollowOak, date: '2026-09-30', qty: 2, unitPrice: 22, paid: 'pending', num: 'CON-HOLLO-8034', sheetsId: 'meadow-sale-5', invoice: inv2 });

  const ledger = [
    shipment({ id: 2201, store: paperLantern, date: '2026-08-15', qty: 20, notes: 'Spring poetry table', sheetsId: 'meadow-ship-1' }),
    shipment({ id: 2202, store: hollowOak, date: '2026-08-25', qty: 12, notes: 'Market stall starter', sheetsId: 'meadow-ship-2' }),
    shipment({ id: 2203, store: hollowOak, date: '2026-09-29', qty: 6, notes: 'Autumn market restock', sheetsId: 'meadow-ship-3' }),
    s1.row, s2.row, s3.row, s4.row, s5.row,
    returnRow({ id: 2209, store: hollowOak, date: '2026-10-01', qty: 2, restock: false, notes: 'Water-damaged, not resaleable', sheetsId: 'meadow-ret-1' }),
  ];

  const hist = [
    directSale({ num: 'POS-520114', chan: 'Book Fair', qty: 5, price: 22, date: '2026-08-13', notes: 'Card', sheetsId: 'meadow-d-1' }),
    directSale({ num: 'POS-520160', chan: 'In Person', qty: 2, price: 22, date: '2026-08-22', notes: 'Cash', sheetsId: 'meadow-d-2' }),
    directSale({ num: '#1044', chan: 'Website', qty: 3, price: 22, date: '2026-08-30', notes: 'Big Cartel', sheetsId: 'meadow-d-3' }),
    directSale({ num: 'POS-520230', chan: 'Book Fair', qty: 4, price: 22, date: '2026-09-06', notes: 'Stripe QR', sheetsId: 'meadow-d-4' }),
    directSale({ num: '#1051', chan: 'Website', qty: 1, price: 22, date: '2026-09-13', notes: 'Big Cartel', payment: { currency: 'EUR', amount: 14.2, rate: 1.55, convertedTotal: 22 }, sheetsId: 'meadow-d-5' }),
    directSale({ num: 'POS-520301', chan: 'In Person', qty: 2, price: 22, date: '2026-09-21', notes: 'Bank Transfer', sheetsId: 'meadow-d-6' }),
    directSale({ num: 'DIR-0998', chan: 'Direct', qty: 1, price: 22, date: '2026-10-08', notes: 'Card', sheetsId: 'meadow-d-7' }),
    gratuity({ num: 'GRT-0818', qty: 3, date: '2026-08-18', notes: 'Review copies for the local paper', sheetsId: 'meadow-g-1' }),
    s1.mirror, s2.mirror, s3.mirror, s4.mirror, s5.mirror,
  ];

  const invoices = [
    invoice({ id: inv1.id, num: inv1.num, store: paperLantern, book, date: '2026-08-20', dueDate: '2026-09-19', status: 'paid', paidAt: Date.parse('2026-09-02T14:00:00Z'), paidMethod: 'Bank Transfer',
      items: [{ description: 'Meadow Hymns, paperback, wholesale order', qty: 6, unitPrice: 13 }] }),
    invoice({ id: inv2.id, num: inv2.num, store: hollowOak, book, date: '2026-09-30', dueDate: '2026-10-15', status: 'sent',
      items: [{ description: 'Meadow Hymns, 2 copies sold at the market 30 Sep', qty: 2, unitPrice: 15.4, ledgerId: 2208 }] }),
  ];

  const expenses = [
    expense({ id: 9101, desc: 'Cover proof and colour check', cat: 'Printing & Production', amount: 220, date: '2026-08-02', ref: 'PR-2219' }),
    expense({ id: 9102, desc: 'Bookmark insert print run', cat: 'Printing & Production', amount: 64.2, date: '2026-08-11', ref: 'RCPT-1152' }),
    expense({ id: 9103, desc: 'Newsletter sponsorship', cat: 'Marketing & Advertising', amount: 45, date: '2026-09-04', ref: 'RCPT-1180' }),
    expense({ id: 9104, desc: 'Mailer boxes for market orders', cat: 'Packaging Materials', amount: 38.75, date: '2026-09-24', ref: 'RCPT-1219' }),
  ];

  return finish(book, { stores: [paperLantern, hollowOak], ledger, hist, invoices, expenses, invoiceSeq: 2 });
}

// ── Ember Season: two stores, a launch week, a USD web sale ───────────────
function emberState(book) {
  const kestrel = { id: 401, name: 'Kestrel Coffee House', contact: 'Sam Ardent', email: 'sam@kestrelcoffee.example', phone: '506-555-0129', address: '31 Main St', city: 'Fredericton', region: 'NB', postal: 'E3B 1C8', country: 'Canada', website: 'kestrelcoffee.example', terms: 'Net 30', rate: 40, notes: 'Coffee house. Reading corner.', sent: 0, sold: 0, returned: 0, outstanding: 0, amountOwed: 0 };
  const ashgrove = { id: 402, name: 'Ashgrove Stationers', contact: 'Lena Park', email: 'lena@ashgrove.example', phone: '506-555-0144', address: '12 Queen St', city: 'Saint John', region: 'NB', postal: 'E2L 1G1', country: 'Canada', website: '', terms: 'Net 30', rate: 30, notes: 'Stationery and cards. Small consignment run.', sent: 0, sold: 0, returned: 0, outstanding: 0, amountOwed: 0 };

  const inv1 = { id: 'inv-ember-001', num: 'INV-EMBER-2026-001' };

  const s1 = consignSale({ id: 2304, store: kestrel, date: '2026-08-26', qty: 3, unitPrice: 28, paid: 'paid', num: 'CON-KESTR-1190', sheetsId: 'ember-sale-1' });
  const s2 = consignSale({ id: 2305, store: kestrel, date: '2026-09-12', qty: 4, unitPrice: 28, paid: 'paid', num: 'CON-KESTR-2456', sheetsId: 'ember-sale-2' });
  const s3 = consignSale({ id: 2306, store: kestrel, date: '2026-10-05', qty: 2, unitPrice: 28, paid: 'pending', num: 'CON-KESTR-3307', sheetsId: 'ember-sale-3' });
  const s4 = consignSale({ id: 2307, store: ashgrove, date: '2026-09-03', qty: 3, unitPrice: 28, paid: 'paid', num: 'CON-ASHGR-4081', sheetsId: 'ember-sale-4' });
  const s5 = consignSale({ id: 2308, store: ashgrove, date: '2026-09-28', qty: 2, unitPrice: 28, paid: 'pending', num: 'CON-ASHGR-4924', sheetsId: 'ember-sale-5' });

  const ledger = [
    shipment({ id: 2301, store: kestrel, date: '2026-08-10', qty: 12, notes: 'Launch display', sheetsId: 'ember-ship-1' }),
    shipment({ id: 2302, store: ashgrove, date: '2026-08-19', qty: 10, notes: 'Stationery counter', sheetsId: 'ember-ship-2' }),
    shipment({ id: 2303, store: kestrel, date: '2026-09-25', qty: 6, notes: 'Restock after launch week', sheetsId: 'ember-ship-3' }),
    s1.row, s2.row, s3.row, s4.row, s5.row,
    returnRow({ id: 2309, store: ashgrove, date: '2026-10-07', qty: 1, restock: true, notes: 'Shelf-worn card, cleaned and put back out', sheetsId: 'ember-ret-1' }),
  ];

  const hist = [
    directSale({ num: 'POS-630044', chan: 'Book Fair', qty: 4, price: 28, date: '2026-08-12', notes: 'Card', sheetsId: 'ember-d-1' }),
    directSale({ num: 'POS-630071', chan: 'In Person', qty: 1, price: 28, date: '2026-08-17', notes: 'Cash', sheetsId: 'ember-d-2' }),
    directSale({ num: '#1039', chan: 'Website', qty: 2, price: 28, date: '2026-08-29', notes: 'Big Cartel', sheetsId: 'ember-d-3' }),
    directSale({ num: '#1057', chan: 'Website', qty: 1, price: 28, date: '2026-09-10', notes: 'Big Cartel', payment: { currency: 'USD', amount: 20.44, rate: 1.37, convertedTotal: 28 }, sheetsId: 'ember-d-4' }),
    directSale({ num: 'POS-630260', chan: 'Book Fair', qty: 3, price: 28, date: '2026-09-20', notes: 'Stripe QR', sheetsId: 'ember-d-5' }),
    directSale({ num: 'DIR-1004', chan: 'Direct', qty: 2, price: 28, date: '2026-10-01', notes: 'Bank Transfer', sheetsId: 'ember-d-6' }),
    directSale({ num: '#1063', chan: 'Website', qty: 1, price: 28, date: '2026-10-09', notes: 'Big Cartel', sheetsId: 'ember-d-7' }),
    gratuity({ num: 'GRT-0822', qty: 2, date: '2026-08-22', notes: 'Gifted to a local bookseller', sheetsId: 'ember-g-1' }),
    s1.mirror, s2.mirror, s3.mirror, s4.mirror, s5.mirror,
  ];

  const invoices = [
    invoice({ id: inv1.id, num: inv1.num, store: kestrel, book, date: '2026-08-24', dueDate: '2026-09-23', status: 'paid', paidAt: Date.parse('2026-09-15T10:30:00Z'), paidMethod: 'Bank Transfer',
      items: [{ description: 'Ember Season, 4 copies for the reading corner', qty: 4, unitPrice: 16 }] }),
    invoice({ id: 'inv-ember-002', num: 'INV-EMBER-2026-002', store: ashgrove, book, date: '2026-10-02', dueDate: '2026-11-01', status: 'sent',
      items: [{ description: 'Ember Season, 3 copies for the autumn card table', qty: 3, unitPrice: 18 }] }),
  ];

  const expenses = [
    expense({ id: 9201, desc: 'Print run deposit', cat: 'Printing & Production', amount: 540, date: '2026-08-04', ref: 'PR-2231' }),
    expense({ id: 9202, desc: 'Launch poster run', cat: 'Marketing & Advertising', amount: 96, date: '2026-08-11', ref: 'RCPT-1160' }),
    expense({ id: 9203, desc: 'Inventory sync add-on, monthly', cat: 'Software & Subscriptions', amount: 19.99, date: '2026-09-01', ref: 'RCPT-1191' }),
  ];

  return finish(book, { stores: [kestrel, ashgrove], ledger, hist, invoices, expenses, invoiceSeq: 2 });
}

// ── Exports ───────────────────────────────────────────────────────────────
export const demoStates = {
  harbour: harbourState(demoBooks[0]),
  meadow: meadowState(demoBooks[1]),
  ember: emberState(demoBooks[2]),
};

// Per-viewer browser storage the rig sets before boot. Empty on purpose:
// the Payments/Stripe reconcile screen (renderReconcile, main.js ~24900) reads
// window._reconPayments, which only reconcileSync() fills from a live Stripe
// fetch (fetchStripePaymentsForReconcile, main.js ~24395). Its localStorage
// key 'lm-stripe-reconcile' holds only the logged/dismissed memory for those
// charges, not the payments, so it cannot light up the screen on its own.
// Website orders are likewise not cheap to seed: the Big Cartel orders cache
// ('lm-bigcartel-orders-cache', src/features/bigcartel.js:935) is a JSON:API
// shaped payload with included relationships, so it is skipped here.
export const demoLocalStorage = {};

// Stripe payments as reconcileSync() leaves them in window._reconPayments
// (only a live Stripe fetch fills it, so the rig sets it after boot): three
// still to review (one direct sale, one in another currency, one invoice) and
// one already marked "not inventory" via demoReconMemory.
const at = (iso) => Date.parse(iso + 'T15:00:00Z') / 1000;
export const demoReconPayments = [
  { id: 'pi_demo_direct1', amount: 40, currency: 'CAD', created: at('2026-10-09'), date: '2026-10-09', customer: 'Rosa Lind', email: 'rosa@example.com', description: 'Card reader sale', metadata: {} },
  { id: 'pi_demo_direct2', amount: 40, currency: 'CAD', created: at('2026-10-09'), date: '2026-10-09', customer: '', email: '', description: 'Card reader sale', metadata: {} },
  { id: 'pi_demo_usd', amount: 32, currency: 'USD', created: at('2026-10-07'), date: '2026-10-07', customer: 'Jun Park', email: 'jun@example.com', description: 'meadow', metadata: {} },
  { id: 'pi_demo_inv', amount: 180, currency: 'CAD', created: at('2026-10-05'), date: '2026-10-05', customer: 'Tidewater Books', email: 'orders@example.com', description: 'Payment for INV-2026-002', metadata: {} },
  { id: 'pi_demo_donation', amount: 15, currency: 'CAD', created: at('2026-10-03'), date: '2026-10-03', customer: 'A friend', email: '', description: 'Donation', metadata: {} },
];
export const demoLocalStorageExtra = {
  // The register remembers the currency it last charged in; a shop in Canada.
  'lm-pos-currency': 'CAD',
  'lm-stripe-reconcile': JSON.stringify({ recorded: {}, dismissed: { pi_demo_donation: { at: '2026-10-04T12:00:00Z' } }, lastSync: '2026-10-10T14:00:00Z' }),
};
