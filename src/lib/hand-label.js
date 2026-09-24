// The label printed for a parcel posted by hand (stamp or counter postage).
//
// It opens in its own print window, which cannot see the app's stylesheet, so
// every colour and font here is written out in full rather than read from the
// app's design variables — the old version used them and printed in the
// browser's fallback serif. Pure: returns a complete HTML document.
//
// Two layouts on the same 4×6 in label stock:
//   portrait  — 4in wide × 6in tall: return address across the top, the
//               destination filling the lower two-thirds.
//   landscape — 6in wide × 4in tall: return address top-left, destination in
//               the lower-right, the way an envelope is addressed.
// A toolbar (hidden when printing) switches between them and remembers the
// choice.

import { escapeHtml as esc } from './html.js';
import { countryName } from './countries.js';

export const HAND_LABEL_ORIENTATION_KEY = 'lm-hand-label-orientation';

/** Canadian postal codes as Canada Post prints them: "T1K 5V6". Others as typed. */
export function formatPostalCode(postal, country = '') {
  const raw = String(postal || '').trim().toUpperCase();
  const compact = raw.replace(/\s+/g, '');
  const isCanada = !country || /^(CA|CANADA)$/i.test(String(country).trim());
  if (isCanada && /^[A-Z]\d[A-Z]\d[A-Z]\d$/.test(compact)) return `${compact.slice(0, 3)} ${compact.slice(3)}`;
  return raw;
}

/**
 * The destination block's lines, in Canada Post's addressing order and in
 * capitals (what their sorting equipment reads best). The name keeps the case
 * it was typed in; everything under it is capitalised.
 */
export function addressLines({ addr1 = '', addr2 = '', city = '', province = '', postal = '', country = '' } = {}) {
  const up = v => String(v || '').trim().toUpperCase();
  const cityLine = [up(city), up(province)].filter(Boolean).join(' ');
  const last = [cityLine, formatPostalCode(postal, country)].filter(Boolean).join('  ');
  const lines = [up(addr1), up(addr2), last].filter(Boolean);
  // Always ends with the country on its own line, spelled out ("CA" becomes
  // CANADA). An order with no country saved is a Canadian one.
  lines.push(up(countryName(country) || 'Canada'));
  return lines;
}

/** The return-address lines, from the saved shipping origin when there is one. */
export function returnLines(origin = {}, fallback = []) {
  const o = origin || {};
  const cityLine = [o.city, o.state].filter(Boolean).join(' ');
  const last = [cityLine, formatPostalCode(o.zip, o.country)].filter(Boolean).join('  ');
  const lines = [o.company || o.name, o.company && o.name ? o.name : '', o.street1, o.street2, last]
    .map(v => String(v || '').trim()).filter(Boolean);
  if (lines.length < 3) return fallback;
  lines.push(countryName(o.country) || 'Canada');
  return lines;
}

const STYLES = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { background: #e8e6e1; color: #111; }
  body { font-family: "Helvetica Neue", Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; }

  .toolbar {
    position: sticky; top: 0; z-index: 2;
    display: flex; align-items: center; justify-content: center; flex-wrap: wrap; gap: 8px;
    padding: 12px 16px; background: #1c1a17; color: #f4f1ea; font-size: 14px;
  }
  .toolbar .group { display: inline-flex; border: 1px solid #5a554c; border-radius: 8px; overflow: hidden; }
  .toolbar button {
    min-height: 44px; padding: 0 16px; border: 0; background: transparent; color: inherit;
    font: inherit; font-weight: 600; cursor: pointer;
  }
  .toolbar .group button[aria-pressed="true"] { background: #f4f1ea; color: #1c1a17; }
  .toolbar .print { background: #e8a33d; color: #1c1a17; border-radius: 8px; }
  .toolbar button:focus-visible { outline: 2px solid #e8a33d; outline-offset: 2px; }
  .stage { display: flex; justify-content: center; padding: 24px 16px 40px; }

  .label {
    position: relative; background: #fff; color: #111; overflow: hidden;
    box-shadow: 0 2px 12px rgba(0,0,0,.18);
    display: grid; padding: 0.25in; gap: 0.18in;
  }
  body.portrait .label  { width: 4in; height: 6in; grid-template-rows: auto 1fr; }
  body.landscape .label { width: 6in; height: 4in; grid-template-rows: auto 1fr; }

  .kicker { font-size: 7pt; font-weight: 700; letter-spacing: .18em; text-transform: uppercase; color: #555; margin-bottom: 4px; }

  .from { grid-column: 1; grid-row: 1; font-size: 8.5pt; line-height: 1.35; color: #222; overflow-wrap: anywhere; }
  .from-lines div:first-child { font-weight: 700; }

  .to {
    grid-column: 1 / -1; grid-row: 2; align-self: center;
    border: 2px solid #111; border-radius: 6px; padding: 0.16in 0.2in;
    overflow-wrap: anywhere;
  }
  body.landscape .to { justify-self: end; width: 68%; align-self: end; }
  .to-name { font-size: 18pt; font-weight: 800; line-height: 1.12; margin-bottom: 6px; }
  .to-lines { font-size: 13pt; font-weight: 600; line-height: 1.32; letter-spacing: .01em; }
  .to-lines .country { font-weight: 800; margin-top: 2px; }
  body.landscape .to-name { font-size: 17pt; }
  body.landscape .to-lines { font-size: 12.5pt; }

  @media print {
    html, body { background: #fff; }
    .toolbar { display: none; }
    .stage { padding: 0; display: block; }
    .label { box-shadow: none; }
  }
`;

/**
 * The whole print window. `orientation` is the starting layout; the toolbar can
 * switch it. The @page size is rewritten with the layout so the browser's print
 * dialog offers the matching paper orientation.
 */
export function buildHandLabelDocument({ to = {}, from = [], orderNum = '', orientation = 'portrait' } = {}) {
  const start = orientation === 'landscape' ? 'landscape' : 'portrait';
  const lines = addressLines(to);
  const toLines = lines.map((line, i) => `<div${i === lines.length - 1 ? ' class="country"' : ''}>${esc(line)}</div>`).join('');
  const fromLines = from.map(l => `<div>${esc(l)}</div>`).join('');
  const pageSize = o => (o === 'landscape' ? '6in 4in' : '4in 6in');

  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<title>Label${orderNum ? ` — ${esc(orderNum)}` : ''}</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>${STYLES}</style>
<style id="page-size">@page { margin: 0; size: ${pageSize(start)}; }</style>
</head><body class="${start}">
<div class="toolbar" role="toolbar" aria-label="Label layout">
  <div class="group" role="group" aria-label="Orientation">
    <button type="button" data-o="portrait" aria-pressed="${start === 'portrait'}">▯ Vertical</button>
    <button type="button" data-o="landscape" aria-pressed="${start === 'landscape'}">▭ Horizontal</button>
  </div>
  <button type="button" class="print" onclick="window.print()">🖨 Print label</button>
</div>
<div class="stage">
  <div class="label">
    <section class="from" aria-label="From">
      <div class="kicker">From</div>
      <div class="from-lines">${fromLines}</div>
    </section>
    <section class="to" aria-label="Ship to">
      <div class="kicker">Ship to</div>
      <div class="to-name">${esc(String(to.name || '').trim())}</div>
      <div class="to-lines">${toLines}</div>
    </section>
  </div>
</div>
<script>
  (function () {
    var KEY = ${JSON.stringify(HAND_LABEL_ORIENTATION_KEY)};
    function set(o) {
      document.body.className = o;
      document.getElementById('page-size').textContent = '@page { margin: 0; size: ' + (o === 'landscape' ? '6in 4in' : '4in 6in') + '; }';
      document.querySelectorAll('[data-o]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-o') === o)); });
      try { localStorage.setItem(KEY, o); } catch (e) {}
    }
    document.querySelectorAll('[data-o]').forEach(function (b) {
      b.addEventListener('click', function () { set(b.getAttribute('data-o')); });
    });
  })();
</script>
</body></html>`;
}
