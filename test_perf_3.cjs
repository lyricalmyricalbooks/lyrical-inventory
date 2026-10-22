const fs = require('fs');

const s = {
  artistPayouts: []
};

for (let i = 0; i < 10000; i++) {
  s.artistPayouts.push({
    voided: i % 2 === 0,
    settlement: i % 3 === 0 ? { balance: { amount: 10 }, cur: 'CAD' } : null,
    date: '2023-01-01'
  });
}

const fmtD = (d) => d;
const fmt = (a, b) => `${a} ${b}`;

console.time('original');
for (let j = 0; j < 1000; j++) {
const undone = (s.artistPayouts || []).filter(p => p.voided && p.settlement).map(p =>
    `<div class="ps-payout-row"><span class="ps-payout-row-main"><strong>Undone author settlement</strong><span class="ps-payout-row-meta">${fmtD(p.date)} · Original amount ${fmt(p.settlement.balance.amount, p.settlement.cur)} · balances recalculated</span></span></div>`
  ).join('');
}
console.timeEnd('original');


console.time('optimized');
for (let j = 0; j < 1000; j++) {
let undoneOpt = '';
if (s.artistPayouts) {
  for (const p of s.artistPayouts) {
    if (p.voided && p.settlement) {
      undoneOpt += `<div class="ps-payout-row"><span class="ps-payout-row-main"><strong>Undone author settlement</strong><span class="ps-payout-row-meta">${fmtD(p.date)} · Original amount ${fmt(p.settlement.balance.amount, p.settlement.cur)} · balances recalculated</span></span></div>`;
    }
  }
}
}
console.timeEnd('optimized');
