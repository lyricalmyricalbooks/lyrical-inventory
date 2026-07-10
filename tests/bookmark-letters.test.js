import fs from 'fs';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const mainJsPath = path.resolve(__dirname, '../src/main.js');

describe('All Books cover marks', () => {
  it('renders coloured covers without a letter label', () => {
    const mainContent = fs.readFileSync(mainJsPath, 'utf8');
    const overviewStart = mainContent.indexOf('function updateAllOverview()');
    const overviewEnd = mainContent.indexOf('// Combined channel analytics', overviewStart);
    const overviewMarkup = mainContent.slice(overviewStart, overviewEnd);

    assert.equal(overviewMarkup.includes('book-cover-logo'), false);
  });
});
