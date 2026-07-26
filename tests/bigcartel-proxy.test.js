import fs from 'fs';
import { describe, expect, it } from 'vitest';
import { appSource } from './helpers/extract-decl.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Big Cartel moved to src/features/bigcartel.js; appSource spans main.js and
// every feature module, so this keeps checking the same code wherever it lives.
const source = appSource;

function functionSource(name) {
  const start = source.indexOf(`async function ${name}(`);
  expect(start).toBeGreaterThanOrEqual(0);
  const nextFunction = source.indexOf('\nasync function ', start + 1);
  return source.slice(start, nextFunction === -1 ? source.length : nextFunction);
}

describe('Big Cartel Apps Script proxy requests', () => {
  it('does not label product requests as probes that Apps Script short-circuits', () => {
    const fetchSource = functionSource('fetchBigCartel');

    expect(fetchSource).not.toMatch(/eventId: 'probe-' \+ Date\.now\(\)/);
  });

  it('does not label connection tests as probes that Apps Script short-circuits', () => {
    const testSource = functionSource('testBigCartelConnection');

    expect(testSource).not.toMatch(/eventId: 'probe-' \+ Date\.now\(\)/);
  });

  it('builds account resource URLs from the resolved Big Cartel account id', () => {
    const fetchSource = functionSource('fetchBigCartel');
    const loadSource = functionSource('loadBigCartelData');

    expect(fetchSource).toMatch(/async function fetchBigCartel\(endpoint, accountId(?: = '')?\)/);
    expect(fetchSource).toMatch(/accounts\/\$\{encodeURIComponent\(accountId\)\}/);
    expect(loadSource).toMatch(/fetchAllBigCartelOrders\(bigCartelData\.store\.id\)/);
    expect(loadSource).toMatch(/fetchBigCartel\('products', bigCartelData\.store\.id\)/);
  });

  it('guards account resource requests when Big Cartel did not return an account id', () => {
    const fetchSource = functionSource('fetchBigCartel');

    expect(fetchSource).toMatch(/if \(endpoint && !accountId\)/);
    expect(fetchSource).toMatch(/Big Cartel account ID is unavailable/);
  });

  it('includes the API error detail alongside the HTTP status', () => {
    const fetchSource = functionSource('fetchBigCartel');

    expect(fetchSource).toMatch(/Big Cartel API returned status \$\{data\.code\}\$\{apiError/);
    expect(fetchSource).toMatch(/parsed\.errors/);
  });

  it('includes items plus the contact relationships that carry the recipient phone', () => {
    expect(source).toContain("const BIG_CARTEL_ORDER_INCLUDES = 'items,customer,shipping_address';");
    expect(source).toMatch(/orders\?include=\$\{includes\}&page/);
    expect(source).toMatch(/let includes = BIG_CARTEL_ORDER_INCLUDES;/);
  });

  it('falls back to an items-only include when the extended list is rejected', () => {
    const fetchOrdersSource = functionSource('fetchAllBigCartelOrders');

    expect(fetchOrdersSource).toMatch(/if \(includes !== 'items'\)/);
    expect(fetchOrdersSource).toMatch(/includes = 'items';/);
    expect(fetchOrdersSource).toMatch(/throw e;/);
  });

  it('can pull a single order with its contact resources to recover a phone', () => {
    const contactSource = functionSource('fetchBigCartelOrderContact');

    expect(contactSource).toMatch(/orders\/\$\{encodeURIComponent\(rawId\)\}\?include=customer,shipping_address/);
    expect(contactSource).toMatch(/replace\(\/\^#\/, ''\)/);
  });

  it('declares extractBigCartelCustomerName and extractBigCartelOrderItems helpers', () => {
    expect(source).toContain('function extractBigCartelCustomerName(');
    expect(source).toContain('function extractBigCartelOrderItems(');
  });
});

