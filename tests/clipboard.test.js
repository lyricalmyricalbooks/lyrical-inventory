// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from 'vitest';
import { legacyCopy } from '../src/lib/clipboard.js';

describe('legacyCopy', () => {
  afterEach(() => { delete document.execCommand; });

  test('copies through a hidden textarea and removes it afterwards', () => {
    const seen = [];
    document.execCommand = vi.fn(cmd => {
      const ta = document.querySelector('textarea');
      seen.push({ cmd, value: ta.value, selected: ta.value.slice(ta.selectionStart, ta.selectionEnd), position: ta.style.position, opacity: ta.style.opacity });
      return true;
    });
    legacyCopy('a@b.ca, c@d.ca');
    expect(seen).toEqual([{ cmd: 'copy', value: 'a@b.ca, c@d.ca', selected: 'a@b.ca, c@d.ca', position: 'fixed', opacity: '0' }]);
    expect(document.querySelector('textarea')).toBeNull();
  });

  test('still cleans up when the copy command throws', () => {
    document.execCommand = vi.fn(() => { throw new Error('blocked'); });
    expect(() => legacyCopy('x')).not.toThrow();
    expect(document.querySelector('textarea')).toBeNull();
  });
});
