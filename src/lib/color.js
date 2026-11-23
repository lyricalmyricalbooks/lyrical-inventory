// Pure colour helpers for a book's accent colour: tints, and text or fills
// that stay readable on the app's surfaces. They used to live in money.js,
// which is about currency. Dependency-free so they unit-test without a DOM.

export function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export function getContrastColor(hex) {
  if (!hex) return 'var(--ink)';
  const color = hex.charAt(0) === '#' ? hex.substring(1) : hex;
  if (color.length !== 6) return 'var(--ink)';
  const r = parseInt(color.substring(0, 2), 16);
  const g = parseInt(color.substring(2, 4), 16);
  const b = parseInt(color.substring(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? 'var(--ink)' : '#ffffff';
}

export function lightenColor(hex, percent) {
  if (!hex) return 'var(--gold3)';
  const color = hex.charAt(0) === '#' ? hex.substring(1) : hex;
  if (color.length !== 6) return 'var(--gold3)';
  let r = parseInt(color.substring(0, 2), 16);
  let g = parseInt(color.substring(2, 4), 16);
  let b = parseInt(color.substring(4, 6), 16);

  r = Math.min(255, Math.floor(r + (255 - r) * percent));
  g = Math.min(255, Math.floor(g + (255 - g) * percent));
  b = Math.min(255, Math.floor(b + (255 - b) * percent));

  const rHex = r.toString(16).padStart(2, '0');
  const gHex = g.toString(16).padStart(2, '0');
  const bHex = b.toString(16).padStart(2, '0');
  return `#${rHex}${gHex}${bHex}`;
}

export function darkenColor(hex, percent) {
  if (!hex) return 'var(--ink)';
  const color = hex.charAt(0) === '#' ? hex.substring(1) : hex;
  if (color.length !== 6) return 'var(--ink)';
  let r = parseInt(color.substring(0, 2), 16);
  let g = parseInt(color.substring(2, 4), 16);
  let b = parseInt(color.substring(4, 6), 16);

  r = Math.max(0, Math.floor(r * (1 - percent)));
  g = Math.max(0, Math.floor(g * (1 - percent)));
  b = Math.max(0, Math.floor(b * (1 - percent)));

  const rHex = r.toString(16).padStart(2, '0');
  const gHex = g.toString(16).padStart(2, '0');
  const bHex = b.toString(16).padStart(2, '0');
  return `#${rHex}${gHex}${bHex}`;
}

/**
 * A book's accent colour, adjusted so it stays readable as TEXT on the app's
 * page/card surface.
 *
 * `onDark` is which surface it will sit on, and it inverts the whole rule.
 * The light-mode job is "a pale accent would wash out, so darken it"; the
 * dark-mode job is the exact opposite — a deep navy or maroon cover accent
 * disappears against a near-black card and has to be LIGHTENED instead.
 * Getting this wrong is silent: the text renders, it just cannot be read.
 *
 * Callers pass the resolved theme (see --book-accent-text in src/main.js),
 * and must recompute when the theme changes — the value is baked into a custom
 * property, so it does not follow the cascade on its own.
 */
export function getContrastSafeText(hex, onDark = false) {
  if (!hex) return onDark ? 'var(--on-inverse)' : 'var(--ink)';
  const color = hex.charAt(0) === '#' ? hex.substring(1) : hex;
  if (color.length !== 6) return onDark ? 'var(--on-inverse)' : 'var(--ink)';
  const r = parseInt(color.substring(0, 2), 16);
  const g = parseInt(color.substring(2, 4), 16);
  const b = parseInt(color.substring(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

  if (onDark) {
    // Lift anything that isn't already bright enough to read on charcoal. The
    // threshold is higher than the light-mode one because mid-tones fail
    // against near-black long before they fail against cream.
    return luminance < 0.62 ? lightenColor(hex, 0.55) : hex;
  }
  if (luminance > 0.5) {
    return darkenColor(hex, 0.35);
  }
  return hex;
}

/** WCAG relative luminance of a `#rrggbb` colour, or null if it isn't one. */
function relativeLuminance(hex) {
  const color = typeof hex === 'string' && hex.charAt(0) === '#' ? hex.substring(1) : hex;
  if (typeof color !== 'string' || !/^[0-9a-f]{6}$/i.test(color)) return null;
  const channel = (i) => {
    const v = parseInt(color.substring(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
}

/**
 * The darkest step of night mode's paper (--paper3). A card is --paper, but the
 * accent text also sits in recessed trays and on the cover's own 10% tint
 * (a `.pill.gold`, the "stock is healthy" note), both darker than --paper —
 * measuring against the darkest step keeps it clear of AA on all of them.
 */
export const PAPER_SURFACE = '#DED4BA';

/**
 * A book's accent colour as TEXT on night mode's paper objects.
 *
 * getContrastSafeText(hex, false) answers the same question for the light
 * theme, but it only darkens covers brighter than 50% luminance — a mid-tone
 * blue passes straight through and lands at 3.6:1 on paper. This measures the
 * real WCAG ratio against the surface and darkens in small steps until the
 * text clears AA, so it keeps as much of the cover's colour as it can.
 * Invalid input (not `#rrggbb`) falls back to the ink.
 */
export function getPaperSafeText(hex, surface = PAPER_SURFACE) {
  const bg = relativeLuminance(surface);
  if (relativeLuminance(hex) === null || bg === null) return 'var(--ink)';
  let text = hex.charAt(0) === '#' ? hex : `#${hex}`;
  for (let i = 0; i < 20; i++) {
    const fg = relativeLuminance(text);
    if ((bg + 0.05) / (fg + 0.05) >= 4.5) return text;
    text = darkenColor(text, 0.08);
  }
  return 'var(--ink)';
}

// The ink and white the app actually puts on a solid accent fill. --ink is
// #100F0D in the light :root; white is --on-accent.
const LABEL_INK = '#100F0D';
const LABEL_WHITE = '#FFFFFF';
const ratioOf = (a, b) => {
  const x = relativeLuminance(a), y = relativeLuminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

/**
 * A book's accent colour as a SOLID FILL with a label on it — the gold
 * buttons, the dashboard's lead KPI tile — and the label that goes with it.
 *
 * getContrastColor() picks ink or white by a perceived-brightness guess
 * (luminance > 0.5), which is not the WCAG ratio and does not check the
 * result. A mid-tone cover sits where NEITHER label clears AA: The Hound's
 * #3a7cc8 measures 4.29:1 with white and 4.33:1 with ink, so every gold button
 * in the app read below 4.5:1 whenever that book was open.
 *
 * This measures both labels for real. If one already clears 4.5:1 the cover
 * colour is returned untouched. If neither does, the fill moves the least it
 * can — darkened a few percent under a white label, or lightened under an ink
 * one, whichever needs fewer steps — so the button still reads as the book's
 * colour. Ties keep getContrastColor()'s historical label, so a cover that was
 * already fine renders exactly as before.
 *
 * Returns { fill, label } where label is 'var(--ink)' or '#ffffff' — the same
 * two values getContrastColor() hands out, so every consumer keeps working.
 * Invalid input falls back to the flare fill with its ink.
 */
export function getAccentFillPair(hex) {
  const fallback = { fill: 'var(--gold2)', label: 'var(--ink)' };
  if (relativeLuminance(hex) === null) return fallback;
  const base = hex.charAt(0) === '#' ? hex : `#${hex}`;
  const toLabel = (c) => (c === LABEL_INK ? 'var(--ink)' : '#ffffff');
  const historical = getContrastColor(base) === '#ffffff' ? LABEL_WHITE : LABEL_INK;

  const passing = [LABEL_WHITE, LABEL_INK].filter(l => ratioOf(base, l) >= 4.5);
  if (passing.length) {
    const label = passing.includes(historical) ? historical : passing[0];
    return { fill: base, label: toLabel(label) };
  }

  // Neither passes: walk each direction and keep the shorter walk.
  const walk = (label, step) => {
    let c = base;
    for (let i = 1; i <= 30; i++) {
      c = step(c);
      if (ratioOf(c, label) >= 4.5) return { fill: c, label, steps: i };
    }
    return null;
  };
  const dark = walk(LABEL_WHITE, c => darkenColor(c, 0.04));
  const light = walk(LABEL_INK, c => lightenColor(c, 0.06));
  const options = [dark, light].filter(Boolean);
  if (!options.length) return fallback;
  options.sort((a, b) => a.steps - b.steps || (a.label === historical ? -1 : 1));
  return { fill: options[0].fill, label: toLabel(options[0].label) };
}


