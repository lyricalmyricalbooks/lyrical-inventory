const fs = require('fs');
let content = fs.readFileSync('src/main.js', 'utf8');

const targetStr = "async function insertStripeFeesIntoLedger() {";
const missingComments = `// Insert Stripe processing fees on sales into the master ledger, one entry per
// year+currency, categorized as "Sales Processing Fees" and converted to CAD at
// the year-end rate. Idempotent: re-running upserts by ref "stripe-fees:<yr>:<cur>"
// so the current year's running total is refreshed without duplicating.
`;

if (!content.includes(missingComments)) {
  content = content.replace(targetStr, missingComments + targetStr);
  fs.writeFileSync('src/main.js', content);
  console.log('Restored deleted comments.');
} else {
  console.log('Comments already exist.');
}
