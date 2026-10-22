const fs = require('fs');

const s = {
  stores: []
};

for (let i = 0; i < 1000; i++) {
  s.stores.push({
    name: 'Store ' + i,
    sent: i,
    sold: i,
    returned: i,
    outstanding: i
  });
}

const escapeHtml = (s) => s;

console.time('original');
for (let j = 0; j < 1000; j++) {
const x = s.stores.length ? s.stores.map(st => `<tr><td style="font-weight:600;">${escapeHtml(st.name)}</td><td class="r">${st.sent}</td><td class="r">${st.sold}</td><td class="r">${st.returned}</td><td class="r">${st.outstanding}</td><td>${st.outstanding > 0 ? '<span class="pill amber">Active</span>' : '<span class="pill gray">Settled</span>'}</td></tr>`).join('') : '<tr><td colspan="6"><div class="empty-state" style="padding:1rem;">No consignment accounts.</div></td></tr>';
}
console.timeEnd('original');

console.time('optimized');
for (let j = 0; j < 1000; j++) {
let xOpt = '';
if (s.stores.length) {
  for (const st of s.stores) {
    xOpt += `<tr><td style="font-weight:600;">${escapeHtml(st.name)}</td><td class="r">${st.sent}</td><td class="r">${st.sold}</td><td class="r">${st.returned}</td><td class="r">${st.outstanding}</td><td>${st.outstanding > 0 ? '<span class="pill amber">Active</span>' : '<span class="pill gray">Settled</span>'}</td></tr>`;
  }
} else {
  xOpt = '<tr><td colspan="6"><div class="empty-state" style="padding:1rem;">No consignment accounts.</div></td></tr>';
}
}
console.timeEnd('optimized');
