// @vitest-environment jsdom
// "Verify URL" on the Google Sheet settings only asks the script who it is.
// It used to queue a fake "VERIFY-1234" order with 0 copies into the
// publisher's sheet every time it was pressed. "Test connection" is the one
// button that sends a (clearly labelled) test row.
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { loadApp } from './helpers/load-app.js';

const URL = 'https://script.google.com/macros/s/abc/exec';
let app;
let bridge;
beforeAll(async () => {
  app = await loadApp({ storage: { 'lm-sheets-url': URL } });
  bridge = await import('../src/features/sheets-bridge.js');
}, 30000);

function press(fetchImpl) {
  const fetchMock = vi.fn(fetchImpl);
  vi.stubGlobal('fetch', fetchMock);
  const before = bridge._sheetsQueue.length;
  return app.window.verifyUrl().then(() => ({ fetchMock, added: bridge._sheetsQueue.length - before }));
}

describe('Verify URL', () => {
  it('checks the script without adding a row when it answers', async () => {
    const { fetchMock, added } = await press(async () => new Response(JSON.stringify({ service: 'lyrical-sheets-webhook', sheetName: 'Books' }), { status: 200 }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1]?.method || 'GET').toBe('GET');
    expect(added).toBe(0);
  });

  it('adds no row when the link returns a web page instead of the script', async () => {
    const { added } = await press(async () => new Response('<html>Sign in</html>', { status: 200 }));
    expect(added).toBe(0);
  });

  it('adds no row when the script cannot be reached', async () => {
    const { added } = await press(async () => { throw new Error('offline'); });
    expect(added).toBe(0);
  });
});
