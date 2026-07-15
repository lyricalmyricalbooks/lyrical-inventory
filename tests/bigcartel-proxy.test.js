import fs from 'fs';
import { describe, expect, it } from 'vitest';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const source = fs.readFileSync(path.resolve(__dirname, '../src/main.js'), 'utf8');

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
    expect(loadSource).toMatch(/fetchBigCartel\('orders', bigCartelData\.store\.id\)/);
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
});
