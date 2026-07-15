import assert from 'node:assert/strict';
import fs from 'fs';
import { describe, it } from 'node:test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const source = fs.readFileSync(path.resolve(__dirname, '../src/main.js'), 'utf8');

function functionSource(name) {
  const start = source.indexOf(`async function ${name}(`);
  assert.ok(start >= 0, `${name} should exist`);
  const nextFunction = source.indexOf('\nasync function ', start + 1);
  return source.slice(start, nextFunction === -1 ? source.length : nextFunction);
}

describe('Big Cartel Apps Script proxy requests', () => {
  it('does not label product requests as probes that Apps Script short-circuits', () => {
    const fetchSource = functionSource('fetchBigCartel');

    assert.doesNotMatch(fetchSource, /eventId: 'probe-' \+ Date\.now\(\)/);
  });

  it('does not label connection tests as probes that Apps Script short-circuits', () => {
    const testSource = functionSource('testBigCartelConnection');

    assert.doesNotMatch(testSource, /eventId: 'probe-' \+ Date\.now\(\)/);
  });
});
