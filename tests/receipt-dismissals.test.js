import { describe, expect, it } from 'vitest';
import { dismissalKey, filterDismissedReceipts, rememberDismissedReceipt } from '../src/lib/receipt-dismissals.js';

function memoryStore() {
  const data = new Map();
  return {
    getItem: key => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
  };
}

describe('receipt discard decisions', () => {
  it('keeps one discarded row hidden after a later scan of the same email', () => {
    const storage = memoryStore();
    const first = { msgId: 'gmail-123', rowIndex: 0, ref: 'receipt-email:gmail-123:0' };
    const second = { msgId: 'gmail-123', rowIndex: 1, ref: 'receipt-email:gmail-123:1' };
    rememberDismissedReceipt(first, storage);
    expect(filterDismissedReceipts([first, second], storage)).toEqual([second]);
    expect(dismissalKey(first)).toBe('receipt-email:gmail-123:0');
  });

  it('keeps a discarded add-on inbox item hidden by its document ID', () => {
    const storage = memoryStore();
    const item = { _inboxId: 'inbox-456' };
    rememberDismissedReceipt(item, storage);
    expect(filterDismissedReceipts([item, { _inboxId: 'inbox-789' }], storage)).toEqual([{ _inboxId: 'inbox-789' }]);
  });
});
