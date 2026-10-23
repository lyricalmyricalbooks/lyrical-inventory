import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const main = readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');
const src = main.slice(main.indexOf('function consignPaymentOwedLine'), main.indexOf('function updateConsignPaymentPreview'));
const roundCents = (n) => Math.round(n * 100) / 100;
const fmt = (n, c) => `${c} ${n.toFixed(2)}`;
const owedLine = new Function('roundCents', 'fmt', `${src}; return consignPaymentOwedLine;`)(roundCents, fmt);

const store = { id: 7, name: 'Harbour Lights', amountOwed: 60 };
const target = (rows) => ({ s: { stores: [store] }, bookCode: 'CAD', rows });

test('the payment pop-up shows what the store will owe once these sales are paid', () => {
  expect(owedLine(target([{ storeId: 7, status: 'pending', amountDue: 24 }, { storeId: 7, status: 'pending', amountDue: 16 }])))
    .toBe('Harbour Lights owes CAD 60.00 → CAD 20.00.');
});

test('sales already paid or voided do not count, and Owed never goes below zero', () => {
  expect(owedLine(target([{ storeId: 7, status: 'paid', amountDue: 24 }, { storeId: 7, status: 'pending', voided: true, amountDue: 5 }, { storeId: 7, status: 'pending', amountDue: 90 }])))
    .toBe('Harbour Lights owes CAD 60.00 → CAD 0.00.');
});

test('no line when nothing is left to settle or the sales span more than one store', () => {
  expect(owedLine(target([]))).toBe('');
  expect(owedLine(target([{ storeId: 7, status: 'pending', amountDue: 5 }, { storeId: 8, status: 'pending', amountDue: 5 }]))).toBe('');
});
