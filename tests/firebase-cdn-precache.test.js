import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { extractFirebaseCdnUrls, firebaseCdnPrecacheEntries } from '../scripts/firebase-cdn-precache.mjs';

// The app can only start with no signal if the service worker has precached
// every Firebase SDK module src/firebase.js imports from www.gstatic.com.
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const firebaseJsPath = path.join(root, 'src/firebase.js');
const firebaseSource = readFileSync(firebaseJsPath, 'utf8');

describe('Firebase SDK precache list', () => {
  test('covers every www.gstatic.com URL that src/firebase.js mentions', () => {
    // Deliberately broader than the helper's import-specifier pattern: any
    // gstatic Firebase URL in the file, however it is imported, must be
    // precached, or the app will fail to start offline.
    const mentioned = new Set(
      firebaseSource.match(/https:\/\/www\.gstatic\.com\/firebasejs\/[^"'`\s)]+/g) || []
    );
    expect(mentioned.size).toBeGreaterThan(0);

    const precached = new Set(firebaseCdnPrecacheEntries(firebaseJsPath).map((e) => e.url));
    for (const url of mentioned) expect(precached).toContain(url);
  });

  test('includes the core app module and the lazily imported storage module', () => {
    const urls = extractFirebaseCdnUrls(firebaseSource);
    expect(urls.some((u) => u.endsWith('/firebase-app.js'))).toBe(true);
    expect(urls.some((u) => u.endsWith('/firebase-storage.js'))).toBe(true);
  });

  test('uses a single SDK version for every module', () => {
    // Mixed versions would load two copies of firebase-app and break
    // component registration (getAuth/getFirestore can't find the app).
    const versions = new Set(
      extractFirebaseCdnUrls(firebaseSource).map((u) => u.match(/\/firebasejs\/([^/]+)\//)[1])
    );
    expect(versions.size).toBe(1);
  });

  test('entries are versioned URLs with no revision hash', () => {
    for (const entry of firebaseCdnPrecacheEntries(firebaseJsPath)) {
      expect(entry).toEqual({ url: expect.stringMatching(/^https:\/\/www\.gstatic\.com\/firebasejs\/\d+\.\d+\.\d+\//), revision: null });
    }
  });

  test('finds static, side-effect and dynamic imports, de-duplicated and sorted', () => {
    const src = [
      'import { a } from "https://www.gstatic.com/firebasejs/1.2.3/firebase-b.js";',
      "import 'https://www.gstatic.com/firebasejs/1.2.3/firebase-a.js';",
      'const m = await import( "https://www.gstatic.com/firebasejs/1.2.3/firebase-c.js");',
      'import { a2 } from "https://www.gstatic.com/firebasejs/1.2.3/firebase-b.js";',
      'import { x } from "./local.js";',
      'const img = "https://www.gstatic.com/images/logo.png";',
    ].join('\n');
    expect(extractFirebaseCdnUrls(src)).toEqual([
      'https://www.gstatic.com/firebasejs/1.2.3/firebase-a.js',
      'https://www.gstatic.com/firebasejs/1.2.3/firebase-b.js',
      'https://www.gstatic.com/firebasejs/1.2.3/firebase-c.js',
    ]);
  });

  test('fails loudly instead of producing an empty precache', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'fb-precache-'));
    const file = path.join(dir, 'firebase.js');
    writeFileSync(file, 'import { x } from "./local.js";\n');
    expect(() => firebaseCdnPrecacheEntries(file)).toThrow(/Found no https:\/\/www\.gstatic\.com\/firebasejs\//);
  });
});
