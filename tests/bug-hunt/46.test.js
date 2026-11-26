import { test, expect } from 'vitest';
import { ocTrimQuotedReply } from '../../src/lib/opencall.js';
test('keeps On-line before header', () => {
  expect(ocTrimQuotedReply("On it, thanks!\nOn Tue, Sep 30, 2025 Bob wrote:\n> x")).toBe('On it, thanks!');
});
