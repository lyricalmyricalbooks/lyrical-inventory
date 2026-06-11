import { describe, it, expect, beforeAll } from 'vitest';

let slug;

beforeAll(async () => {
  // Set required environment variables before importing the server module
  process.env.ADMIN_PASSWORD = 'test_admin_password';
  process.env.TOKEN_SECRET = 'test_token_secret';

  // Dynamically import the module to ensure env vars are picked up during initialization
  const serverModule = await import('../backend/server.js');
  slug = serverModule.slug;
});

describe('slug', () => {
  it('should transform a simple string to lowercase and replace spaces with dashes', () => {
    expect(slug('Hello World')).toBe('hello-world');
  });

  it('should trim leading and trailing whitespace', () => {
    expect(slug('  Some String  ')).toBe('some-string');
  });

  it('should remove non-alphanumeric characters', () => {
    expect(slug('Hello! @World#$')).toBe('hello-world');
  });

  it('should handle strings with consecutive special characters becoming single dashes', () => {
    expect(slug('Hello -- World')).toBe('hello-world');
    expect(slug('Hello...World')).toBe('hello-world');
  });

  it('should strip leading and trailing dashes after replacement', () => {
    expect(slug('---Hello World---')).toBe('hello-world');
    expect(slug('!Hello World!')).toBe('hello-world');
  });

  it('should return a valid UUID for empty string', () => {
    const result = slug('');
    expect(result).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  it('should return a valid UUID for undefined or null', () => {
    const resultUndefined = slug(undefined);
    expect(resultUndefined).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);

    const resultNull = slug(null);
    expect(resultNull).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  it('should return a valid UUID for strings that become empty after stripping characters', () => {
    const result = slug('!@#$%^&*()');
    expect(result).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });
});
