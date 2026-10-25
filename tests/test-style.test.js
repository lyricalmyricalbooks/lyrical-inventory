// Behaviour tests by default.
//
// Most of this suite was written by reading app files as text and matching
// patterns in them: "the save function contains this line". Those tests break
// when code is reworded and stay green when it is wrong. A behaviour test
// runs the code instead: call the function, or boot the app with
// tests/helpers/load-app.js and tap the button, then check what changed.
//
// New tests should be behaviour tests. A test that must read the source (a
// guard on imports, a check that two copies of a file match) is fine, but it
// takes the place of one that went away. This keeps the count from growing;
// lower it when a source-reading test is rewritten or removed.
//
// For a whole flow in a real browser, see scripts/e2e/fair-day.mjs.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TESTS = path.dirname(fileURLToPath(import.meta.url));

// 337 of 507 test files when this started.
const MAX_SOURCE_READING_FILES = 337;

// Reads a file as text, and that file is app code or the page.
const READS_TEXT = /readFileSync|appSource|extract-decl/;
const NAMES_APP_FILE = /['"`/]src\/|index\.html|appSource|extract-decl/;

const testFiles = fs.readdirSync(TESTS).filter(f => f.endsWith('.test.js') && f !== 'test-style.test.js');
const sourceReading = testFiles.filter(f => {
  const text = fs.readFileSync(path.join(TESTS, f), 'utf8');
  return READS_TEXT.test(text) && NAMES_APP_FILE.test(text);
});

describe('test style', () => {
  it('does not add tests that read the app as text', () => {
    expect(sourceReading.length, 'A new test file reads app code as text. Test the behaviour instead (call the code, or loadApp and use the screen); if it has to read source, add it to an existing test file for the same screen.')
      .toBeLessThanOrEqual(MAX_SOURCE_READING_FILES);
  });

  it('counts what it says it counts', () => {
    // A known reader and a known behaviour test, so a broken pattern can't
    // quietly report zero.
    expect(sourceReading).toContain('handler-wiring.test.js');
    expect(sourceReading).not.toContain('book-events.test.js');
  });
});
