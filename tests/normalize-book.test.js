import { describe, it, expect, beforeAll } from 'vitest';

let normalizeBook;

beforeAll(async () => {
  // Set required environment variables before importing the server module
  process.env.ADMIN_PASSWORD = 'test_admin_password';
  process.env.TOKEN_SECRET = 'test_token_secret';

  // Dynamically import the module to ensure env vars are picked up during initialization
  const serverModule = await import('../backend/server.js');
  normalizeBook = serverModule.normalizeBook;
});

describe('normalizeBook', () => {
  it('should normalize a complete book object correctly (happy path)', () => {
    const rawBook = {
      id: 'b1',
      title: '  The Great Gatsby  ', // spaces should be trimmed
      subtitle: 'A novel',
      isbn: '978-0743273565',
      sku: 'TGG-01',
      publicationDate: '1925-04-10',
      format: 'Hardcover',
      status: 'published',
      language: 'en',
      pageCount: 218,
      listPrice: 15.99,
      salePrice: 10.99,
      currency: 'USD',
      inventoryCount: 50,
      lowStockThreshold: 5,
      shippingProfileId: 'sp1',
      authorIds: ['a1', 'a2'],
      genres: ['Fiction', 'Classic'],
      tags: ['1920s', 'Jazz Age'],
      seoTitle: 'The Great Gatsby Book',
      seoDescription: 'A classic novel by F. Scott Fitzgerald.',
      featured: true,
      photos: ['photo1.jpg', 'photo2.jpg'],
      createdAt: '2023-01-01T00:00:00Z',
      updatedAt: '2023-01-02T00:00:00Z'
    };

    const normalized = normalizeBook(rawBook);

    expect(normalized).toMatchObject({
      id: 'b1',
      title: 'The Great Gatsby',
      subtitle: 'A novel',
      isbn: '978-0743273565',
      sku: 'TGG-01',
      publicationDate: '1925-04-10',
      format: 'Hardcover',
      status: 'published',
      language: 'en',
      pageCount: 218,
      listPrice: 15.99,
      salePrice: 10.99,
      currency: 'USD',
      inventoryCount: 50,
      lowStockThreshold: 5,
      shippingProfileId: 'sp1',
      authorIds: ['a1', 'a2'],
      genres: ['Fiction', 'Classic'],
      tags: ['1920s', 'Jazz Age'],
      seoTitle: 'The Great Gatsby Book',
      seoDescription: 'A classic novel by F. Scott Fitzgerald.',
      featured: true,
      photos: ['photo1.jpg', 'photo2.jpg'],
      createdAt: '2023-01-01T00:00:00Z'
    });

    // updatedAt should be overwritten with a new timestamp
    expect(normalized.updatedAt).not.toBe('2023-01-02T00:00:00Z');
    expect(new Date(normalized.updatedAt).toISOString()).toBe(normalized.updatedAt);
  });

  it('should provide correct defaults for missing values', () => {
    const rawBook = { id: 'b2' };
    const normalized = normalizeBook(rawBook);

    expect(normalized).toMatchObject({
      id: 'b2',
      title: '',
      subtitle: '',
      isbn: '',
      sku: '',
      publicationDate: '',
      format: '',
      status: 'draft',
      language: 'en',
      pageCount: 0,
      listPrice: 0,
      salePrice: 0,
      currency: 'USD',
      inventoryCount: 0,
      lowStockThreshold: 0,
      shippingProfileId: '',
      authorIds: [],
      genres: [],
      tags: [],
      seoTitle: '',
      seoDescription: '',
      featured: false,
      photos: []
    });

    // createdAt and updatedAt should be generated
    expect(new Date(normalized.createdAt).toISOString()).toBe(normalized.createdAt);
    expect(new Date(normalized.updatedAt).toISOString()).toBe(normalized.updatedAt);
  });

  it('should handle type coercion correctly', () => {
    const rawBook = {
      id: 'b3',
      title: 12345, // should be stringified
      pageCount: '300.5', // should be truncated integer
      listPrice: '19.99', // should be number
      inventoryCount: 'NaN', // should be 0
      featured: 'true', // string 'true' becomes true boolean
    };
    const normalized = normalizeBook(rawBook);

    expect(normalized.title).toBe('12345');
    expect(normalized.pageCount).toBe(300);
    expect(normalized.listPrice).toBe(19.99);
    expect(normalized.inventoryCount).toBe(0);
    expect(normalized.featured).toBe(true);
  });

  it('should correctly slice photos array to max 10 elements', () => {
    const rawBook = {
      id: 'b4',
      photos: ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9', 'p10', 'p11', 'p12']
    };
    const normalized = normalizeBook(rawBook);

    expect(normalized.photos).toHaveLength(10);
    expect(normalized.photos).toEqual(['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9', 'p10']);
  });

  it('should ensure arrays are strictly arrays', () => {
    const rawBook = {
      id: 'b5',
      authorIds: 'not-an-array',
      genres: null,
      tags: { foo: 'bar' },
      photos: 'single-photo.jpg'
    };
    const normalized = normalizeBook(rawBook);

    expect(normalized.authorIds).toEqual([]);
    expect(normalized.genres).toEqual([]);
    expect(normalized.tags).toEqual([]);
    expect(normalized.photos).toEqual([]);
  });
});
