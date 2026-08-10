/**
 * theme.js — appearance preference: storage, resolution, and application.
 *
 * Three preferences, two rendered themes:
 *
 *   'system' (default) — follow the OS. The <html> element carries NO
 *                        data-theme attribute, so the `prefers-color-scheme`
 *                        media query in src/styles/theme-dark.css decides.
 *   'light' / 'dark'   — explicit. data-theme pins the theme and the media
 *                        query is deliberately written to lose
 *                        (`:root:not([data-theme="light"])`), so a publisher
 *                        who wants the light UI under bright lighting keeps
 *                        it even on a device set to dark.
 *
 * A `.theme-dark` class is mirrored onto <html> alongside the attribute. CSS
 * cannot say "matches [data-theme=dark] OR (no attribute AND OS is dark)" in
 * one selector, and the component corrections in theme-dark.css need exactly
 * that — so JS resolves it once and the class carries the answer.
 *
 * Kept free of DOM lookups by id and of app imports so it is unit-testable and
 * so the pre-paint bootstrap in index.html can inline the same logic.
 */

export const THEME_STORAGE_KEY = 'lm-theme';

/** Preferences the app will accept. Anything else falls back to 'system'. */
export const THEME_PREFERENCES = ['system', 'light', 'dark'];

/** Rendered themes. */
export const RESOLVED_THEMES = ['light', 'dark'];

/** The <meta name="theme-color"> value per resolved theme — this paints the
 *  browser/PWA chrome, so it has to match the app header's --ink, not the
 *  page background, or the status bar and the header disagree. */
export const THEME_COLORS = { light: '#0e0c0a', dark: '#0a0806' };

/**
 * Narrows an arbitrary value (localStorage returns strings, null, or whatever
 * an older build wrote) to a valid preference.
 */
export function normalizeThemePreference(value) {
  return THEME_PREFERENCES.includes(value) ? value : 'system';
}

/**
 * Reads the stored preference. Storage access throws in Safari private mode
 * and when cookies are blocked, so this never propagates — appearance is not
 * worth breaking boot over.
 */
export function readThemePreference(storage = globalThis.localStorage) {
  try {
    return normalizeThemePreference(storage?.getItem(THEME_STORAGE_KEY));
  } catch (_) {
    return 'system';
  }
}

/**
 * Persists the preference. 'system' is written explicitly rather than removing
 * the key: "I chose to follow my OS" and "I have never touched this" behave
 * identically today, but only the stored value survives a future default flip.
 */
export function writeThemePreference(preference, storage = globalThis.localStorage) {
  try {
    storage?.setItem(THEME_STORAGE_KEY, normalizeThemePreference(preference));
    return true;
  } catch (_) {
    return false;
  }
}

/** preference + OS signal -> the theme actually rendered. */
export function resolveTheme(preference, prefersDark) {
  const pref = normalizeThemePreference(preference);
  if (pref === 'system') return prefersDark ? 'dark' : 'light';
  return pref;
}

/** True when the OS asks for dark. Safe on browsers without matchMedia. */
export function systemPrefersDark(win = globalThis) {
  try {
    return !!win?.matchMedia?.('(prefers-color-scheme: dark)')?.matches;
  } catch (_) {
    return false;
  }
}

/**
 * Writes the resolved theme onto the document.
 *
 * - data-theme is REMOVED for 'system' so the media query governs. Setting
 *   data-theme="light" instead would pin light and silently stop the app from
 *   following the OS.
 * - .theme-dark mirrors the resolved answer for the component corrections.
 * - <meta name="theme-color"> is updated so the PWA status bar tracks.
 *
 * Returns the resolved theme.
 */
export function applyThemeToDocument(preference, { document: doc = globalThis.document, prefersDark } = {}) {
  const pref = normalizeThemePreference(preference);
  const dark = prefersDark === undefined ? systemPrefersDark() : prefersDark;
  const resolved = resolveTheme(pref, dark);
  const root = doc?.documentElement;
  if (!root) return resolved;

  if (pref === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', pref);

  root.classList.toggle('theme-dark', resolved === 'dark');
  root.classList.toggle('theme-light', resolved === 'light');

  // The pre-paint bootstrap in index.html paints <html> inline to kill the
  // launch flash. By the time this runs the stylesheet owns the background, so
  // that inline value has to go — left in place it would pin the page dark
  // through a later switch to light.
  root.style?.removeProperty?.('background-color');

  const meta = doc.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', THEME_COLORS[resolved]);

  return resolved;
}

/** Human-readable labels for the appearance control and its toasts. */
export const THEME_LABELS = { system: 'Auto', light: 'Light', dark: 'Dark' };

/**
 * Order used by the three-way cycle: Auto → Light → Dark → Auto.
 */
export function nextThemePreference(preference) {
  const i = THEME_PREFERENCES.indexOf(normalizeThemePreference(preference));
  return THEME_PREFERENCES[(i + 1) % THEME_PREFERENCES.length];
}

/**
 * What the one-tap header button should set, given the theme currently ON
 * SCREEN (not the stored preference).
 *
 * Two decisions are baked in here rather than at the call site, because both
 * are easy to get wrong and neither is obvious from the outside:
 *
 *  - It reads the RESOLVED theme. Under a 'system' preference the stored value
 *    is 'system', which says nothing about what the user is looking at; a
 *    toggle keyed off the preference would flip to 'light' for someone already
 *    staring at a dark screen.
 *  - It always returns an EXPLICIT preference, never 'system'. Tapping a
 *    light/dark button IS a choice; handing control back to the OS would quietly
 *    undo it at sunset. 'Auto' stays reachable in the three-way control.
 */
export function oppositeThemePreference(resolvedTheme) {
  return resolvedTheme === 'dark' ? 'light' : 'dark';
}
