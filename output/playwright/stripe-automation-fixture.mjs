import fs from 'node:fs';
import { extractDecl } from '../../tests/helpers/extract-decl.js';
const names = ['_reconBookOptions', '_reconAmountBadge', '_reconMeta', '_reconNeedCard', '_reconGroupCard',
  'reconUpdateDefaults', '_reconReadSaleInputs', '_reconApplyPaymentToBook', '_reconApplySaleToBook',
  'writeOrderToLedger', 'reconcileRecordSale', 'reconRecordGroup'];
const source = names.map(name => extractDecl(name)).join('\n');
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="/src/styles/system.css"><link rel="stylesheet" href="/src/style.css"><link rel="stylesheet" href="/src/styles/theme-dark.css">
<title>Stripe automation — local preview</title></head><body style="padding:var(--space-5);max-width:1600px;margin:auto;">
<h1>Stripe sales</h1><p>Local preview with simulated payments and rates. No Stripe or account changes.</p>
<div class="row" style="margin-bottom:var(--space-5)"><button class="btn tag" id="theme">Switch theme</button><button class="btn tag" id="group">Group payments</button></div>
<div id="cards"></div><p id="notice" role="status"></p><pre id="history"></pre>
<script type="module">
import { createStripeRateResolver, stripeOrderNumber } from '/src/lib/stripe-sale-defaults.js';
import { escapeHtml } from '/src/lib/html.js';
import { roundCents } from '/src/lib/money.js';
const BOOKS = { altrove:{id:'altrove',title:'Un Fantastico Altrove',currency:'CAD',listPrice:55}, other:{id:'other',title:'Another Book',currency:'USD',listPrice:25} };
const BOOK_LIST = Object.values(BOOKS);
const states = Object.fromEntries(BOOK_LIST.map(b => [b.id,{stock:10,sold:0,revenue:0,chStats:{},hist:[],invoices:[]}]));
const activeBook = 'altrove';
const mem = { recorded:{},dismissed:{} };
const _reconSession = { logged:0 };
const getBookCurrencyCode = b => b.currency;
const bookCurrencyCode = getBookCurrencyCode;
const normalizeCurrencyCode = (c, fb) => String(c || fb).toUpperCase();
const _stripeFmtMoney = (amount, currency) => new Intl.NumberFormat('en-CA',{style:'currency',currency}).format(amount);
const resolveStripeRate = createStripeRateResolver({storage:localStorage,fetchRate:async (from,to,date) => {
  await new Promise(done => setTimeout(done,150));
  return {rate:to==='CAD'?1.55:1.1,date};
}});
window._reconPayments = [
  {id:'ch_PreviewAbCd42',date:'2026-10-08',amount:40,currency:'EUR',customer:'Simone Costamagna',email:'customer@example.test',description:'Un Fantastico Altrove (EUR 40.00)'},
  {id:'ch_PreviewSecond42',date:'2026-10-08',amount:40,currency:'EUR',customer:'Another Customer',description:'Un Fantastico Altrove (EUR 40.00)'},
];
window._reconGroupMap = {0:window._reconPayments.map(p=>p.id)};
const _reconFindPayment = id => window._reconPayments.find(p=>p.id===id);
const _reconRecordedChargeIds = () => new Set(Object.values(states).flatMap(s=>s.hist.map(r=>r.payment.ref)));
const getReconMemory = () => mem;
const saveReconMemory = () => {};
const showToast = message => { document.getElementById('notice').textContent=message; };
const notesWithInvoiceDiscount = (_invoices,_num,notes) => notes;
const recomputeAfters = () => {};
const saveState = () => {};
const syncToSheets = () => {};
const updateDash = () => {};
const cadEquivalentForSale = ({totalNative}) => totalNative;
const today = () => '2026-10-08';
const makeEventId = () => 'fixture';
let grouped = false;
function renderReconcile(){
  const remaining=window._reconPayments.filter(p=>!mem.recorded[p.id]);
  const c={kind:'direct',bookId:'altrove'};
  document.getElementById('cards').innerHTML=grouped && remaining.length>1 ? _reconGroupCard(remaining.map(p=>({p,c})),0) : remaining.map(p=>_reconNeedCard(p,c)).join('');
  document.querySelectorAll('[data-recon-default]').forEach(input=>reconUpdateDefaults(input.dataset.reconDefault,input.dataset.grouped==='1'));
  document.getElementById('history').textContent=JSON.stringify(Object.values(states).flatMap(s=>s.hist),null,2);
}
${source}
Object.assign(window,{reconUpdateDefaults,reconcileRecordSale,reconRecordGroup,reconcileDismiss:()=>{},reconDismissGroup:()=>{}});
document.getElementById('theme').onclick=()=>{document.documentElement.dataset.theme=document.documentElement.dataset.theme==='dark'?'light':'dark';};
document.getElementById('group').onclick=()=>{grouped=!grouped;renderReconcile();};
renderReconcile();
</script></body></html>`;
fs.writeFileSync(new URL('./stripe-automation-preview.html',import.meta.url),html);
