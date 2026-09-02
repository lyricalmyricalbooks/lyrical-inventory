import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  LABEL_CACHE_DB,
  LABEL_CACHE_STORE,
  openLabelCacheDb,
  storeCachedLabelPdf,
  getCachedLabelPdf,
  deleteCachedLabelPdf,
  clearLabelCache
} from '../src/lib/label-cache.js';

describe('Label PDF Cache (IndexedDB)', () => {
  let mockStoreData;
  let mockDb;

  beforeEach(() => {
    mockStoreData = new Map();
    mockDb = {
      objectStoreNames: { contains: () => true },
      createObjectStore: vi.fn(),
      transaction: vi.fn(() => ({
        objectStore: () => ({
          put: vi.fn((record) => {
            mockStoreData.set(record.pin, record);
            const req = {};
            setTimeout(() => req.onsuccess && req.onsuccess(), 0);
            return req;
          }),
          get: vi.fn((key) => {
            const req = { result: mockStoreData.get(key) || null };
            setTimeout(() => req.onsuccess && req.onsuccess(), 0);
            return req;
          }),
          delete: vi.fn((key) => {
            mockStoreData.delete(key);
            const req = {};
            setTimeout(() => req.onsuccess && req.onsuccess(), 0);
            return req;
          }),
          clear: vi.fn(() => {
            mockStoreData.clear();
            const req = {};
            setTimeout(() => req.onsuccess && req.onsuccess(), 0);
            return req;
          })
        }),
        oncomplete: null,
        onerror: null
      })),
      close: vi.fn()
    };

    global.indexedDB = {
      open: vi.fn(() => {
        const req = { result: mockDb };
        setTimeout(() => req.onsuccess && req.onsuccess(), 0);
        return req;
      })
    };
  });

  afterEach(() => {
    delete global.indexedDB;
  });

  it('stores and retrieves a PDF blob by tracking PIN', async () => {
    const fakeBlob = new Blob(['%PDF-1.4 mock content'], { type: 'application/pdf' });
    const pin = '7012 3456 7890 1234';

    const stored = await storeCachedLabelPdf(pin, fakeBlob, { shipmentId: '123' });
    expect(stored).toBe(true);

    const retrieved = await getCachedLabelPdf('7012345678901234');
    expect(retrieved).not.toBeNull();
    expect(retrieved.pin).toBe('7012345678901234');
    expect(retrieved.blob).toBe(fakeBlob);
    expect(retrieved.shipmentId).toBe('123');
  });

  it('deletes a cached PDF blob by tracking PIN', async () => {
    const fakeBlob = new Blob(['%PDF-1.4 mock content'], { type: 'application/pdf' });
    await storeCachedLabelPdf('7012345678901234', fakeBlob);

    const deleted = await deleteCachedLabelPdf('7012 3456 7890 1234');
    expect(deleted).toBe(true);

    const retrieved = await getCachedLabelPdf('7012345678901234');
    expect(retrieved).toBeNull();
  });

  it('clears all cached PDF labels', async () => {
    const blob1 = new Blob(['1'], { type: 'application/pdf' });
    const blob2 = new Blob(['2'], { type: 'application/pdf' });
    await storeCachedLabelPdf('PIN1', blob1);
    await storeCachedLabelPdf('PIN2', blob2);

    await clearLabelCache();
    expect(await getCachedLabelPdf('PIN1')).toBeNull();
    expect(await getCachedLabelPdf('PIN2')).toBeNull();
  });

  it('returns null gracefully when indexedDB is undefined', async () => {
    delete global.indexedDB;
    const res = await getCachedLabelPdf('123');
    expect(res).toBeNull();
    const saveRes = await storeCachedLabelPdf('123', new Blob(['']));
    expect(saveRes).toBe(false);
  });
});
