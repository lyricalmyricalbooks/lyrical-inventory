// Usage: STRIPE_SECRET_KEY=sk_live_... node scripts/stripe-fees-by-year.js
// Lists Stripe fees grouped by calendar year and currency.
// Requires: npm i stripe

const Stripe = require('stripe');

const key = process.env.STRIPE_SECRET_KEY;
if (!key) {
  console.error('Missing STRIPE_SECRET_KEY env var.');
  process.exit(1);
}
const stripe = Stripe(key);

const ZERO_DECIMAL = new Set(['BIF','CLP','DJF','GNF','JPY','KMF','KRW','MGA','PYG','RWF','UGX','VND','VUV','XAF','XOF','XPF']);
const minorToMajor = (amount, cur) => ZERO_DECIMAL.has(cur.toUpperCase()) ? amount : amount / 100;

async function main() {
  const byYear = {};
  let total = 0;

  for await (const tx of stripe.balanceTransactions.list({ limit: 100 })) {
    const year = new Date(tx.created * 1000).getUTCFullYear();
    const cur = tx.currency.toUpperCase();
    const slot = (byYear[year] ??= {});
    const row = (slot[cur] ??= { gross: 0, fee: 0, net: 0, count: 0, types: {} });
    row.gross += tx.amount;
    row.fee   += tx.fee;
    row.net   += tx.net;
    row.count += 1;
    row.types[tx.type] = (row.types[tx.type] || 0) + 1;
    total++;
    if (total % 500 === 0) process.stderr.write(`...fetched ${total}\n`);
  }

  console.log(`Fetched ${total} balance transactions.\n`);
  for (const year of Object.keys(byYear).sort()) {
    console.log(`=== ${year} ===`);
    for (const [cur, r] of Object.entries(byYear[year])) {
      const gross = minorToMajor(r.gross, cur);
      const fee   = minorToMajor(r.fee,   cur);
      const net   = minorToMajor(r.net,   cur);
      const pct   = r.gross ? (r.fee / r.gross) * 100 : 0;
      console.log(
        `  ${cur}  txns=${r.count}  gross=${gross.toFixed(2)}  ` +
        `fee=${fee.toFixed(2)} (${pct.toFixed(2)}%)  net=${net.toFixed(2)}`
      );
      const typeSummary = Object.entries(r.types).map(([t,n]) => `${t}:${n}`).join(', ');
      console.log(`    types: ${typeSummary}`);
    }
    console.log('');
  }
}

main().catch(e => { console.error(e); process.exit(1); });
