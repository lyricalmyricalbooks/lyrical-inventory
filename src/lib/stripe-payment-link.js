// The two Stripe calls behind every Payment Link the app mints: a Price (with
// inline product_data, so Stripe creates the product on the fly), then the
// Payment Link that sells one of it. Each caller decides what goes on the
// price and the link; this owns the requests and how their failures read.

const STRIPE_API = 'https://api.stripe.com/v1';

// A restricted key missing the Prices write scope is the most common failure,
// so point at the exact fix.
const PERMISSION_HINT = ' — your restricted key needs Write on Prices, Products and Payment Links.';

async function stripePost(key, path, params, label, { permissionHint = false } = {}) {
  const res = await fetch(`${STRIPE_API}/${path}`, {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const msg = err.error?.message || ('HTTP ' + res.status);
    const hint = permissionHint && /permission|rak_/i.test(msg) ? PERMISSION_HINT : '';
    throw new Error(`${label}: ${msg}${hint}`);
  }
  return res.json();
}

/**
 * Creates the Price, points `linkParams` at it and creates the Payment Link.
 *
 * @param {string} key - Stripe restricted or secret key.
 * @param {URLSearchParams} priceParams - Everything for the Price.
 * @param {URLSearchParams} linkParams - Everything for the link except the price id.
 * @param {{ permissionHint?: boolean }} [opts] - Add the key-scope hint to a failed Price.
 * @returns {Promise<{ price: object, link: object }>}
 */
export async function createStripePriceAndLink(key, priceParams, linkParams, opts = {}) {
  const price = await stripePost(key, 'prices', priceParams, 'Stripe price', opts);
  linkParams.set('line_items[0][price]', price.id);
  const link = await stripePost(key, 'payment_links', linkParams, 'Stripe payment link');
  return { price, link };
}
