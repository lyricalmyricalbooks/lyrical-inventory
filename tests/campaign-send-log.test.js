import { expect, test, vi } from 'vitest';

// customers.js imports main.js (and pos.js, which does too); stub both so the
// module loads on its own without booting the whole app.
vi.mock('../src/main.js', () => ({ $: (id) => document.getElementById(id) }));
vi.mock('../src/features/pos.js', () => ({ codeToSymbol: () => '' }));

const { cancelCampaignSending } = await import('../src/features/customers.js');

// The send log grows a line per recipient. Rebuilding it on each line was slow
// over a long send and swapped out the line a Retry was waiting to update.
test('a new send-log line is appended, leaving the earlier lines in place', () => {
  document.body.innerHTML = `
    <div id="c-send-log-console"><div class="campaign-log-fail" data-index="0">✕ Failed</div></div>
    <button id="c-send-cancel-btn"></button>`;
  const log = document.getElementById('c-send-log-console');
  const failLine = log.firstElementChild;

  cancelCampaignSending();

  expect(log.children).toHaveLength(2);
  expect(log.firstElementChild).toBe(failLine);
  expect(failLine.isConnected).toBe(true);
  expect(log.lastElementChild.textContent).toContain('[CANCELLED]');
});
