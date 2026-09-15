import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const rules = fs.readFileSync(path.resolve('storage.rules'), 'utf8');

describe('receipt finder Storage isolation', () => {
  it('keeps the reserved email-import namespace publisher-only across overlapping matches', () => {
    expect(rules).toMatch(/match \/receipts\/email-imports\/\{allPaths=\*\*\} \{[\s\S]*?allow read, delete: if isPublisher\(\);[\s\S]*?allow write: if isPublisher\(\)/);
    expect(rules).toMatch(/match \/receipts\/\{bookId\}\/\{allPaths=\*\*\} \{[\s\S]*?allow read: if bookId != 'email-imports'[\s\S]*?allow write: if bookId != 'email-imports'[\s\S]*?allow delete: if bookId != 'email-imports'/);
  });
});
