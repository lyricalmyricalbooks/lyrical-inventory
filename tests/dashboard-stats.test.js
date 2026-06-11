import { describe, it, expect, beforeAll, beforeEach } from 'vitest';

let buildDashboardStats;
let store;
let defaultStore;

beforeAll(async () => {
  process.env.ADMIN_PASSWORD = 'test_admin_password';
  process.env.TOKEN_SECRET = 'test_token_secret';

  const serverModule = await import('../backend/server.js');
  buildDashboardStats = serverModule.buildDashboardStats;
  store = serverModule.store;
  defaultStore = serverModule.defaultStore;
});

beforeEach(() => {
  // Reset the store before each test to ensure isolation
  const initial = defaultStore();
  for (const key in store) {
    delete store[key];
  }
  Object.assign(store, initial);
});

describe('buildDashboardStats', () => {
  it('should calculate stats correctly for empty store', () => {
    const stats = buildDashboardStats();
    expect(stats).toMatchObject({
      books: 0,
      authors: 0,
      shippingProfiles: 0,
      totalInventory: 0,
      lowStockBooks: 0,
      featuredBooks: 0,
    });
    expect(new Date(stats.updatedAt).toISOString()).toBe(stats.updatedAt);
  });

  it('should calculate stats correctly with data', () => {
    store.books = {
      b1: { inventoryCount: 10, lowStockThreshold: 5, featured: true },
      b2: { inventoryCount: 3, lowStockThreshold: 5, featured: false },
      b3: { inventoryCount: '5', lowStockThreshold: '5', featured: false },
      b4: { inventoryCount: 0, lowStockThreshold: 0, featured: true },
    };
    store.authors = { a1: {}, a2: {} };
    store.shippingProfiles = { sp1: {} };

    const stats = buildDashboardStats();

    expect(stats.books).toBe(4);
    expect(stats.authors).toBe(2);
    expect(stats.shippingProfiles).toBe(1);
    // 10 + 3 + 5 + 0 = 18
    expect(stats.totalInventory).toBe(18);
    // b2 (3 <= 5), b3 (5 <= 5), b4 (0 <= 0) -> 3
    expect(stats.lowStockBooks).toBe(3);
    // b1, b4 -> 2
    expect(stats.featuredBooks).toBe(2);
  });

  it('should handle missing or invalid data gracefully', () => {
     store.books = {
       b1: { }, // missing inventory
       b2: { inventoryCount: 'invalid', lowStockThreshold: 'invalid' },
       b3: { inventoryCount: NaN, lowStockThreshold: null },
     };

     const stats = buildDashboardStats();

     expect(stats.totalInventory).toBe(0);
     expect(stats.lowStockBooks).toBe(3); // 0 <= 0 is true
     expect(stats.featuredBooks).toBe(0);
  });
});
