const fs = require('fs');
let code = fs.readFileSync('src/main.js', 'utf8');
const newFunc = fs.readFileSync('newFunc.js', 'utf8');

const startIdx = code.indexOf('async function fetchOrders() {');
const endIdx = code.indexOf('// ── MANUAL', startIdx);

if (startIdx > -1 && endIdx > -1) {
  code = code.substring(0, startIdx) + newFunc + '\n' + code.substring(endIdx);
  fs.writeFileSync('src/main.js', code);
  console.log('Replaced successfully');
} else {
  console.log('Indices not found', startIdx, endIdx);
}
