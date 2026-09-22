// Build-time helper: which Firebase SDK files must the service worker precache?
//
// src/firebase.js imports the Firebase SDK straight from www.gstatic.com, and
// src/main.js imports src/firebase.js statically. If those gstatic modules
// can't be fetched, no app code runs at all — the app opens to a blank shell.
// Precaching them is what lets the app start with no signal.
//
// The list is read from src/firebase.js itself rather than written out by
// hand, so bumping the SDK version there can't leave the precache pointing at
// the old files (the app would then boot online but not offline, and nothing
// would say so).

import fs from 'node:fs';

// Matches the specifier of a static import (`from "…"`, `import "…"`) or a
// dynamic import (`import("…")`) that points at the Firebase CDN.
const FIREBASE_CDN_IMPORT_RE =
  /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(["'])(https:\/\/www\.gstatic\.com\/firebasejs\/[^"']+)\1/g;

/** Unique Firebase CDN URLs imported (statically or dynamically) by `source`, sorted. */
export function extractFirebaseCdnUrls(source) {
  const urls = new Set();
  for (const match of source.matchAll(FIREBASE_CDN_IMPORT_RE)) urls.add(match[2]);
  return [...urls].sort();
}

/**
 * Workbox `additionalManifestEntries` for every Firebase CDN module imported by
 * the file at `firebaseJsPath`. The URLs carry the SDK version, so they never
 * change content and need no revision hash.
 *
 * Throws when nothing is found: an empty list would produce a service worker
 * that silently can't start the app offline.
 */
export function firebaseCdnPrecacheEntries(firebaseJsPath) {
  const urls = extractFirebaseCdnUrls(fs.readFileSync(firebaseJsPath, 'utf8'));
  if (urls.length === 0) {
    throw new Error(
      `[firebase-cdn-precache] Found no https://www.gstatic.com/firebasejs/ imports in ${firebaseJsPath}. ` +
      'The service worker would not be able to start the app offline — update the pattern in scripts/firebase-cdn-precache.mjs.'
    );
  }
  return urls.map((url) => ({ url, revision: null }));
}
