import './style.css';
import './firebase.js';
import { registerSW } from 'virtual:pwa-register';

const updateSW = registerSW({ onNeedRefresh() {} });

// ═══════════════════════════════════════════════════════
//  BOOK CATALOGUE
//  Add/edit books here. Each book gets its own Firebase
//  node, its own tab, and its own shareable URL.
// ═══════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════
//  BOOK CATALOGUE (Dynamicly loaded from Firebase)
// ═══════════════════════════════════════════════════════
let BOOKS = {};
let editingBookId = null;
const DEFAULT_BOOKS = {
  altrove: { id: 'altrove', title: 'Un Fantastico Altrove', author: 'Silvia Clo Di Gregorio', isbn: '978-88-XXXXXX', maxPrint: 120, listPrice: 40, currency: '€', threshold: 15, productionCost: 0, paymentLink: 'https://paypal.me/lyricalmyricalbooks', accent: '#c8913a', accentBg: 'rgba(200,145,58,.1)', urlParam: 'altrove', authorPassword: 'silvia2025' },
  hound: { id: 'hound', title: 'The Hound', author: '', isbn: '—', maxPrint: 300, listPrice: 65, currency: 'CA$', threshold: 30, productionCost: 15000, paymentLink: 'https://paypal.me/lyricalmyricalbooks', accent: '#3a7cc8', accentBg: 'rgba(58,124,200,.1)', urlParam: 'hound', authorPassword: 'hound2025' },
  archaeology: { id: 'archaeology', title: 'Archaeology of Presence', author: 'Ilaria di Benedetto', isbn: '—', maxPrint: 80, listPrice: 40, currency: '€', threshold: 10, productionCost: 0, paymentLink: 'https://paypal.me/lyricalmyricalbooks', accent: '#7a5c3a', accentBg: 'rgba(122,92,58,.1)', urlParam: 'archaeology', authorPassword: 'ilaria2025' },
  sistema: { id: 'sistema', title: 'Sistema_non_autorizzato', author: 'Maria Luna Tucci', isbn: '—', maxPrint: 60, listPrice: 40, currency: '€', threshold: 8, productionCost: 0, paymentLink: 'https://paypal.me/lyricalmyricalbooks', accent: '#2a7a5c', accentBg: 'rgba(42,122,92,.1)', urlParam: 'sistema', authorPassword: 'marialuna2025' },
  nobody: { id: 'nobody', title: 'As if Nobody is Watching', author: 'Chiara Pirovano', isbn: '—', maxPrint: 100, listPrice: 40, currency: '€', threshold: 10, productionCost: 0, paymentLink: 'https://paypal.me/lyricalmyricalbooks', accent: '#8a3a7a', accentBg: 'rgba(138,58,122,.1)', urlParam: 'nobody', authorPassword: 'chiara2025' },
  collective: { id: 'collective', title: 'Collective Photobook', author: 'Lyricalmyrical Books', isbn: '—', maxPrint: 100, listPrice: 40, currency: '€', threshold: 10, productionCost: 0, paymentLink: 'https://paypal.me/lyricalmyricalbooks', accent: '#c8913a', accentBg: 'rgba(200,145,58,.1)', urlParam: 'collective', authorPassword: 'collective2025' }
};

async function loadCatalog() {
  try {
    const stored = await window._fbLoadCatalog();
    if (stored) {
      // Merge: Keep everything from Firebase, but ensure defaults are present
      BOOKS = { ...DEFAULT_BOOKS, ...stored };
      // If we added missing defaults, save back to Firebase
      if (Object.keys(BOOKS).length > Object.keys(stored).length) {
        await window._fbSaveCatalog(BOOKS);
      }
    } else {
      BOOKS = DEFAULT_BOOKS;
      await window._fbSaveCatalog(BOOKS);
    }
  } catch (e) {
    BOOKS = DEFAULT_BOOKS;
  }
}

function resetBookForm() {
  editingBookId = null;
  $('add-book-modal-title').textContent = 'Add new book';
  $('add-book-save-btn').textContent = 'Save Book';
  $('nb-id').disabled = false;
  $('nb-id').value = '';
  $('nb-title').value = '';
  $('nb-author').value = '';
  $('nb-isbn').value = '';
  $('nb-max').value = '100';
  $('nb-price').value = '40';
  $('nb-cur').value = '€';
  $('nb-thresh').value = '10';
  $('nb-accent').value = '#c8913a';
  $('nb-pw').value = '';
  $('nb-prod').value = '0';
}

function openAddBookModal() {
  resetBookForm();
  openM('add-book');
}

function openEditBookModal(id) {
  const book = BOOKS[id];
  if (!book) return;
  editingBookId = id;
  $('add-book-modal-title').textContent = `Edit book · ${book.title}`;
  $('add-book-save-btn').textContent = 'Save Changes';
  $('nb-id').disabled = true;
  $('nb-id').value = book.id || '';
  $('nb-title').value = book.title || '';
  $('nb-author').value = book.author || '';
  $('nb-isbn').value = book.isbn || '—';
  $('nb-max').value = book.maxPrint ?? 100;
  $('nb-price').value = book.listPrice ?? 40;
  $('nb-cur').value = book.currency || '€';
  $('nb-thresh').value = book.threshold ?? 10;
  $('nb-accent').value = book.accent || '#c8913a';
  $('nb-pw').value = book.authorPassword || '';
  $('nb-prod').value = book.productionCost ?? 0;
  openM('add-book');
}

function closeAddBookModal() {
  closeM('add-book');
  resetBookForm();
}

async function saveBookFromModal() {
  const id = $('nb-id').value.trim();
  const title = $('nb-title').value.trim();
  if (!id || !title) { showToast('ID and Title are required', 'warn'); return; }
  
  const currentBook = BOOKS[editingBookId] || BOOKS[id] || {};
  const book = {
    id,
    title,
    author: $('nb-author').value.trim(),
    isbn: $('nb-isbn').value.trim() || '—',
    maxPrint: parseInt($('nb-max').value) || 100,
    listPrice: parseFloat($('nb-price').value) || 40,
    currency: $('nb-cur').value || '€',
    threshold: parseInt($('nb-thresh').value) || 10,
    productionCost: parseFloat($('nb-prod').value) || 0,
    paymentLink: currentBook.paymentLink || 'https://paypal.me/lyricalmyricalbooks',
    accent: $('nb-accent').value,
    accentBg: hexToRgba($('nb-accent').value, 0.1),
    urlParam: currentBook.urlParam || id,
    authorPassword: $('nb-pw').value.trim() || currentBook.authorPassword || (id + '2025'),
    profitTiers: currentBook.profitTiers || []
  };
  
  if (editingBookId && editingBookId !== id) {
    delete BOOKS[editingBookId];
    if (states[editingBookId]) {
      states[id] = states[editingBookId];
      delete states[editingBookId];
    }
  }
  BOOKS[id] = book;
  if (!states[id]) states[id] = defaultState(book);
  await window._fbSaveCatalog(BOOKS);
  showToast(editingBookId ? '✓ Book updated' : '✓ Book added to catalog');
  closeAddBookModal();
  buildBookSwitcher();
  renderCatalogList();
  renderProfitSettings();
  renderCurrent();
}

function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function renderCatalogList() {
  const container = $('catalog-list');
  if (!container) return;
  container.innerHTML = Object.values(BOOKS).map(b => `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:10px;background:var(--ink);border-radius:var(--r2);border:1px solid rgba(255,255,255,0.05);">
       <div style="display:flex;align-items:center;gap:10px;">
         <div style="width:12px;height:12px;border-radius:50%;background:${b.accent}"></div>
         <div>
           <div style="font-size:13px;font-weight:600;color:var(--cream);">${b.title}</div>
           <div style="font-size:11px;color:rgba(255,255,255,.55);">${b.id} · ${b.currency}${b.listPrice}</div>
         </div>
       </div>
       <div style="display:flex;gap:8px;">
         <button class="btn sm" onclick="openEditBookModal('${b.id}')">Edit</button>
         <button class="btn sm danger-btn" onclick="deleteBook('${b.id}')">Remove</button>
       </div>
    </div>`).join('');
}

async function deleteBook(id) {
  if (!confirm(`Permanently remove "${BOOKS[id].title}" and all its inventory records?`)) return;
  delete BOOKS[id];
  delete states[id];
  await window._fbSaveCatalog(BOOKS);
  buildBookSwitcher();
  renderCatalogList();
  if (psActiveBookId === id) psActiveBookId = null;
  renderProfitSettings();
  renderCurrent();
  showToast('Book removed');
}

window.saveBookFromModal = saveBookFromModal;
window.openAddBookModal = openAddBookModal;
window.openEditBookModal = openEditBookModal;
window.closeAddBookModal = closeAddBookModal;
window.deleteBook = deleteBook;


// ═══════════════════════════════════════════════════════
//  ACCESS CONTROL
//  URL params:
//    ?book=hound            → author view, prompts author password
//    ?book=hound&dev=1      → skip password (dev/testing)
//    (no param)             → publisher gate, sees all books
// ═══════════════════════════════════════════════════════
const urlParams = new URLSearchParams(location.search);
const URL_BOOK = urlParams.get('book');    // e.g. 'hound'
let IS_AUTHOR_MODE = false;
let ACTIVE_BOOK_FORCED = null;
let AUTHOR_VIEW_BY_BOOK = {};

function loadAuthorViewOverrides() {
  try {
    AUTHOR_VIEW_BY_BOOK = JSON.parse(sessionStorage.getItem('lm-author-view-overrides') || '{}') || {};
  } catch (e) {
    AUTHOR_VIEW_BY_BOOK = {};
  }
}

function saveAuthorViewOverrides() {
  sessionStorage.setItem('lm-author-view-overrides', JSON.stringify(AUTHOR_VIEW_BY_BOOK));
}

function isPublisherSession() {
  return sessionStorage.getItem('lm-unlocked') === 'publisher';
}

// Runtime role check — works for both URL-based AND password-based author login
function isAuthor() {
  if (IS_AUTHOR_MODE) return true;
  const s = sessionStorage.getItem('lm-unlocked') || '';
  if (s.startsWith('author:')) return true;
  return !!(isPublisherSession() && activeBook && activeBook !== 'all' && AUTHOR_VIEW_BY_BOOK[activeBook]);
}

// ── UTILITIES
const $ = id => document.getElementById(id);
const fmt = (n, cur='€') => cur + Number(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const fmtD = d => d ? new Date(d+'T12:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}) : '—';
const today = () => new Date().toISOString().split('T')[0];

// ── PER-BOOK STATE
// states[bookId] = { stock, sold, revenue, chStats, hist, stores, ledger, doneIds }
let states = {};
let activeBook = null;   // currently viewed bookId, or 'all'
let orders = [], activeId = null;
let fbReady = false, lastSavedHashes = {};
let syncQueue = JSON.parse(localStorage.getItem('lm-sync-queue') || '[]');
let systemBackups = [];
const SYSTEM_BACKUP_KEY = 'systemBackups';
const SYSTEM_BACKUP_LIMIT = 30;

function queueSync(bookId, state) {
  syncQueue.push({ bookId, state, ts: Date.now() });
  localStorage.setItem('lm-sync-queue', JSON.stringify(syncQueue));
  processSyncQueue();
}

async function processSyncQueue() {
  if (!navigator.onLine || !fbReady || !syncQueue.length) return;
  const item = syncQueue[0];
  try {
    await window._fbSave(item.bookId, JSON.stringify(item.state));
    syncQueue.shift();
    localStorage.setItem('lm-sync-queue', JSON.stringify(syncQueue));
    if (syncQueue.length) processSyncQueue();
    else showToast('✓ All offline changes synced to Firebase');
  } catch (e) {
    console.error('Queue sync failed', e);
  }
}

window.addEventListener('online', processSyncQueue);
let sheetsUrl = localStorage.getItem('lm-sheets-url') || '';
let sheetsSpreadsheetUrl = localStorage.getItem('lm-sheets-spreadsheet-url') || '';
if (sheetsUrl) {
  const normalizedSavedUrl = normalizeAppsScriptUrl(sheetsUrl);
  if (normalizedSavedUrl && normalizedSavedUrl !== sheetsUrl) {
    sheetsUrl = normalizedSavedUrl;
    localStorage.setItem('lm-sheets-url', normalizedSavedUrl);
  }
}

function defaultState(book) {
  return { stock: book.maxPrint, sold: 0, revenue: 0, chStats: {}, hist: [], stores: [], ledger: [], doneIds: [], artistTransfers: [], expenses: [], artistPaymentLink: '' };
}

function getState() { return states[activeBook] || defaultState(BOOKS[activeBook] || Object.values(BOOKS)[0]); }
function getBook()  { return BOOKS[activeBook] || Object.values(BOOKS)[0]; }

// ── TOAST
function showToast(msg, type='ok', dur=2800) {
  const t=$('toast'); t.textContent=msg;
  t.className='toast show'+(type==='warn'?' warn':type==='err'?' err':'');
  clearTimeout(t._t); t._t=setTimeout(()=>t.classList.remove('show'),dur);
}

// ── SYNC UI
function setSyncState(status, msg) {
  const dot=$('sync-dot'), label=$('sync-label'), time=$('sync-time');
  dot.className='sync-dot'+(status==='syncing'?' syncing':status==='error'?' error':'');
  label.innerHTML=msg; time.textContent=new Date().toLocaleTimeString();
}

// ── FIREBASE (per-book)
async function saveState(bookId) {
  const json = JSON.stringify(states[bookId]);
  if (json === lastSavedHashes[bookId]) return;
  setSyncState('syncing', '<b>Firebase</b> · saving…');
  try {
    if (!fbReady || !navigator.onLine) {
      queueSync(bookId, states[bookId]);
      setSyncState('ok', '<b>Firebase</b> · changes queued (offline)');
      return;
    }
    await window._fbSave(bookId, json);
    lastSavedHashes[bookId] = json;
    setSyncState('ok', '<b>Firebase</b> · saved · live sync on');
    const ind=$('save-ind'); if(ind){ind.classList.add('show');setTimeout(()=>ind.classList.remove('show'),2000);}
  } catch(e) { setSyncState('error','<b>Firebase</b> · save failed'); console.error(e); }
}

async function loadBook(bookId) {
  setSyncState('syncing', '<b>Firebase</b> · loading…');
  try {
    if (!fbReady) throw new Error('not ready');
    const json = await window._fbLoad(bookId);
    const book = BOOKS[bookId];
    if (json) {
      const loaded = JSON.parse(json);
      states[bookId] = { ...defaultState(book), ...loaded };
    } else {
      states[bookId] = defaultState(book);
    }
    if (!states[bookId].doneIds) states[bookId].doneIds = [];
    if (!states[bookId].artistTransfers) states[bookId].artistTransfers = [];
    if (!states[bookId].expenses) states[bookId].expenses = [];
    // Sync artist payment link to book object so publisher can read it in reimbursements
    if (states[bookId].artistPaymentLink) BOOKS[bookId].artistPaymentLink = states[bookId].artistPaymentLink;
    lastSavedHashes[bookId] = JSON.stringify(states[bookId]);
    // Watch for live updates
    window._fbWatch(bookId, json2 => {
      if (json2 === lastSavedHashes[bookId]) return;
      const loaded = JSON.parse(json2);
      states[bookId] = { ...defaultState(book), ...loaded };
      if (!states[bookId].doneIds) states[bookId].doneIds = [];
      if (!states[bookId].artistTransfers) states[bookId].artistTransfers = [];
      lastSavedHashes[bookId] = json2;
      if (activeBook === bookId || activeBook === 'all') renderCurrent();
      showToast('↺ '+book.title+' updated from Firebase');
    });
  } catch(e) {
    states[bookId] = defaultState(BOOKS[bookId]);
    setSyncState('error','<b>Firebase</b> · connection failed');
  }
}

async function loadAllBooks() {
  setSyncState('syncing','<b>Firebase</b> · loading all books…');
  await Promise.all(Object.keys(BOOKS).map(id => loadBook(id)));
  setSyncState('ok','<b>Firebase</b> · connected · live sync on');
  $('hdr-sub').textContent = 'Inventory App · Synced '+new Date().toLocaleTimeString();
  renderCurrent();
}

async function forceSync() {
  if (isAuthor() && activeBook) { await loadBook(activeBook); renderCurrent(); }
  else await loadAllBooks();
}

// ── BOOK SWITCHER (build custom dropdown)
function buildBookSwitcher() {
  const menu = $('book-dropdown-menu');
  if (!menu) return;
  // All books option
  menu.innerHTML = `<div class="book-dd-item active" data-id="all" onclick="switchBook('all');closeBookDropdown();" style="display:flex;align-items:center;gap:10px;padding:9px 14px;cursor:pointer;font-family:'Syne',sans-serif;font-size:12px;font-weight:600;color:var(--gold3);background:rgba(255,255,255,.04);border-bottom:1px solid rgba(255,255,255,.06);">
    <div style="width:8px;height:8px;border-radius:50%;background:rgba(255,255,255,.25);flex-shrink:0;"></div>All books
  </div>`;
  Object.values(BOOKS).forEach(book => {
    const item = document.createElement('div');
    item.className = 'book-dd-item';
    item.dataset.id = book.id;
    item.onclick = () => { switchBook(book.id); closeBookDropdown(); };
    item.style.cssText = 'display:flex;align-items:center;gap:10px;padding:9px 14px;cursor:pointer;font-family:\'Syne\',sans-serif;font-size:12px;font-weight:600;color:rgba(255,255,255,.7);transition:background .12s;border-bottom:1px solid rgba(255,255,255,.04);';
    item.onmouseover = () => item.style.background = 'rgba(255,255,255,.06)';
    item.onmouseout  = () => item.style.background = '';
    item.innerHTML = `<div style="width:8px;height:8px;border-radius:50%;background:${book.accent};flex-shrink:0;"></div>${book.title}`;
    menu.appendChild(item);
  });
}

function toggleBookDropdown() {
  const menu = $('book-dropdown-menu');
  if (!menu) return;
  const isOpen = menu.style.display !== 'none';
  if (isOpen) {
    menu.style.display = 'none';
  } else {
    menu.style.display = 'block';
    // Defer outside-click listener so it doesn't fire on this same click
    setTimeout(() => {
      function outsideClick(e) {
        if (!$('book-dropdown')?.contains(e.target)) {
          menu.style.display = 'none';
          document.removeEventListener('click', outsideClick);
        }
      }
      document.addEventListener('click', outsideClick);
    }, 0);
  }
}
function closeBookDropdown() {
  const menu = $('book-dropdown-menu');
  if (menu) menu.style.display = 'none';
}

function updateRoleToggleButton() {
  const btn = $('role-toggle-btn');
  if (!btn) return;
  const canToggle = isPublisherSession() && !!activeBook && activeBook !== 'all';
  if (!canToggle) {
    btn.style.display = 'none';
    return;
  }
  btn.style.display = '';
  const inAuthorPreview = !!AUTHOR_VIEW_BY_BOOK[activeBook];
  btn.textContent = inAuthorPreview ? 'Publisher view' : 'Author view';
}

function syncRoleUI() {
  const authorNow = isAuthor();
  const websiteTabBtn = $('website-tab-btn');
  const financialsTabBtn = $('financials-tab-btn');
  const sheetsTabBtn = $('sheets-tab-btn');
  const backupsTabBtn = $('backups-tab-btn');
  if (websiteTabBtn) websiteTabBtn.style.display = authorNow ? 'none' : '';
  if (financialsTabBtn) financialsTabBtn.style.display = authorNow ? 'none' : '';
  if (sheetsTabBtn) sheetsTabBtn.style.display = authorNow ? 'none' : '';
  if (backupsTabBtn) backupsTabBtn.style.display = authorNow ? 'none' : '';

  const wm = $('author-watermark');
  if (wm && isPublisherSession() && activeBook && activeBook !== 'all' && AUTHOR_VIEW_BY_BOOK[activeBook]) {
    wm.textContent = `${BOOKS[activeBook].title} · Author view preview`;
    wm.style.display = '';
  } else if (wm && !IS_AUTHOR_MODE && !(sessionStorage.getItem('lm-unlocked') || '').startsWith('author:')) {
    wm.style.display = 'none';
  }

  if (authorNow && ($('tab-website')?.classList.contains('active') || $('tab-financials')?.classList.contains('active') || $('tab-sheets')?.classList.contains('active') || $('tab-backups')?.classList.contains('active'))) {
    switchTab('dashboard');
  }
}

function toggleCurrentBookView() {
  if (!isPublisherSession() || !activeBook || activeBook === 'all') return;
  AUTHOR_VIEW_BY_BOOK[activeBook] = !AUTHOR_VIEW_BY_BOOK[activeBook];
  saveAuthorViewOverrides();
  updateRoleToggleButton();
  syncRoleUI();
  renderAll();
  showToast(
    AUTHOR_VIEW_BY_BOOK[activeBook]
      ? `Author view enabled for ${BOOKS[activeBook].title}`
      : `Publisher view restored for ${BOOKS[activeBook].title}`
  );
}

function switchBook(bookId) {
  activeBook = bookId;
  // Update custom dropdown label + dot
  const label = $('book-dropdown-label');
  const dot   = $('book-dropdown-dot');
  if (bookId === 'all') {
    if (label) label.textContent = 'All books';
    if (dot)   dot.style.background = 'rgba(255,255,255,.25)';
  } else {
    const book = BOOKS[bookId];
    if (label) label.textContent = book.title;
    if (dot)   dot.style.background = book.accent;
  }
  // Highlight active item in menu
  document.querySelectorAll('.book-dd-item').forEach(el => {
    const isActive = el.dataset.id === bookId;
    el.style.color = isActive ? 'var(--gold3)' : 'rgba(255,255,255,.7)';
    el.style.background = isActive ? 'rgba(255,255,255,.04)' : '';
  });

  if (bookId === 'all') {
    // Show combined overview, hide per-book tabs
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    $('tab-all-overview').classList.add('active');
    $('tab-bar').style.display = 'none';
    updateAllOverview();
    updateHeader();
  } else {
    $('tab-bar').style.display = '';
    const book = BOOKS[bookId];
    // Set CSS accent
    document.documentElement.style.setProperty('--book-accent', book.accent);
    document.documentElement.style.setProperty('--book-accent-bg', book.accentBg);
    switchTab('dashboard');
    updateHeader();
  }
  updateRoleToggleButton();
  syncRoleUI();
}

// ── TABS
function switchTab(name) {
  if (isAuthor() && (name === 'website' || name === 'backups' || name === 'financials' || name === 'sheets')) name = 'dashboard';
  const names = ['dashboard','website','manual','consignment','history','expenses','financials','sheets','backups'];
  document.querySelectorAll('.tab-btn').forEach((b,i) => b.classList.toggle('active', names[i]===name));
  names.forEach(n => {
    const p = $('tab-'+n);
    if(p) { p.classList.remove('active'); p.style.display='none'; }
  });
  $('tab-all-overview').classList.remove('active');
  $('tab-all-overview').style.display='none';
  const panel = $('tab-'+name);
  if(panel){ panel.style.display='block'; panel.classList.add('active'); }
  if(name==='dashboard') { updateDash(); renderArtistReimburseBanner(); renderPendingExpenses(); }
  if(name==='history') renderHist();
  if(name==='manual') updateManualForm();
  if(name==='consignment'){ renderStores(); renderLedger(); }
  if(name==='expenses'){ renderExpenses(); updateExpenseForm(); }
  if(name==='financials') renderFinancials();
  if(name==='sheets'){ renderSheetsLog(); renderPaymentLinkFields(); renderProductionCostFields(); renderProfitSettings(); }
}

function updateHeader() {
  if (activeBook === 'all') {
    // Sum all books
    const totalStock = Object.values(states).reduce((a,s)=>a+(s.stock||0),0);
    const totalRev = Object.values(states).reduce((a,s)=>a+(s.revenue||0),0);
    const totalCon = Object.values(states).reduce((a,s)=>a+s.stores.reduce((b,st)=>b+st.outstanding,0),0);
    $('h-stock').textContent = totalStock;
    $('h-revenue').textContent = '~'+totalRev.toFixed(0);
    $('h-consigned').textContent = totalCon;
  } else {
    const s = getState(), book = getBook();
    const cur = book.currency;
    $('h-stock').textContent = s.stock;
    $('h-revenue').textContent = fmt(s.revenue, cur);
    $('h-consigned').textContent = s.stores.reduce((a,st)=>a+st.outstanding,0);
  }
}

// ── ALL BOOKS OVERVIEW
function updateAllOverview() {
  // Book strips
  const list = $('all-books-list');
  list.innerHTML = Object.values(BOOKS).map(book => {
    const s = states[book.id] || defaultState(book);
    const consigned = s.stores.reduce((a,st)=>a+st.outstanding,0);
    const owed = s.stores.reduce((a,st)=>a+st.amountOwed,0);
    const pct = Math.max(0,s.stock/book.maxPrint*100);
    const stockClass = s.stock<=book.threshold?'danger':s.stock<=book.threshold*2?'warn':'gold';
    const cost = book.productionCost || 0;
    const broken = cost > 0 && s.revenue >= cost;
    const bePct = cost > 0 ? Math.min(100, s.revenue/cost*100) : null;
    const beBar = (!isAuthor() && bePct !== null) ? `<div style="margin-top:6px;display:flex;align-items:center;gap:8px;"><div style="flex:1;"><div style="font-size:9px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--text3);margin-bottom:3px;">Break-even</div><div class="bar-track" style="background:rgba(0,0,0,.08);margin-bottom:0;"><div class="bar-fill" style="width:${bePct}%;background:${broken?'#4ade80':'var(--gold2)'};"></div></div></div><span style="font-size:10px;font-family:'DM Mono',monospace;white-space:nowrap;color:${broken?'var(--green)':'var(--text3)'};">${broken?'✓ Broken even':bePct.toFixed(0)+'%'}</span></div>` : '';
    const expTotal = (s.expenses||[]).reduce((a,e)=>a+(e.amount||0),0);
    return `<div class="book-strip">
      <div class="book-strip-accent" style="background:${book.accent}"></div>
      <div class="book-strip-info">
        <div class="book-strip-title">${book.title}</div>
        <div class="book-strip-meta">${book.author||'—'} &nbsp;·&nbsp; ${book.currency}${book.listPrice} &nbsp;·&nbsp; ${book.maxPrint} printed</div>
        <div style="margin-top:8px;"><div class="bar-track" style="background:rgba(0,0,0,.08);margin-bottom:0;"><div class="bar-fill" style="width:${pct}%;background:${book.accent};"></div></div></div>
        ${beBar}
      </div>
      <div class="book-strip-kpis">
        <div class="bsk"><div class="bsk-val ${stockClass}">${s.stock}</div><div class="bsk-label">On hand</div></div>
        <div class="bsk"><div class="bsk-val">${s.sold}</div><div class="bsk-label">Sold</div></div>
        <div class="bsk"><div class="bsk-val">${owed>0?fmt(owed,book.currency):'—'}</div><div class="bsk-label">Owed</div></div>
        <div class="bsk"><div class="bsk-val${expTotal>0?' warn':''}">${expTotal>0?fmt(expTotal,book.currency):'—'}</div><div class="bsk-label">Expenses</div></div>
      </div>
      <div class="book-strip-actions">
        <button class="btn sm gold" onclick="switchBook('${book.id}')">Manage →</button>
      </div>
    </div>`;
  }).join('');

  // Combined channel table
  const rows = [];
  Object.values(BOOKS).forEach(book => {
    const s = states[book.id] || defaultState(book);
    Object.entries(s.chStats||{}).forEach(([chan,cs]) => {
      rows.push(`<tr><td style="font-weight:600;">${book.title}</td><td>${chan}</td><td class="r">${cs.txns}</td><td class="r">${cs.units}</td><td class="r">${fmt(cs.revenue,book.currency)}</td></tr>`);
    });
  });
  $('all-ch-body').innerHTML = rows.length ? rows.join('') : '<tr><td colspan="5"><div class="empty-state" style="padding:1rem;">No sales yet.</div></td></tr>';

  // Combined consignment table
  const conRows = [];
  Object.values(BOOKS).forEach(book => {
    const s = states[book.id] || defaultState(book);
    s.stores.forEach(st => {
      conRows.push(`<tr><td style="font-weight:600;">${book.title}</td><td>${st.name}</td><td class="r">${st.sent}</td><td class="r">${st.sold}</td><td class="r">${st.outstanding}</td><td>${st.outstanding>0?'<span class="pill amber">Active</span>':'<span class="pill gray">Settled</span>'}</td></tr>`);
    });
  });
  $('all-con-body').innerHTML = conRows.length ? conRows.join('') : '<tr><td colspan="6"><div class="empty-state" style="padding:1rem;">No consignment accounts.</div></td></tr>';
}

// ── BOOK CONTEXT BANNERS
function updateContextBanners() {
  if (!activeBook || activeBook === 'all') return;
  const book = getBook();
  ['dash','web','man','con','hist','exp'].forEach(sfx => {
    const t = $('bc-title-'+sfx);
    if(t) t.textContent = book.title;
  });
  const dashMeta = $('bc-meta-dash');
  if (dashMeta) dashMeta.textContent = book.author || '—';
}

// ── DASHBOARD (per book)
function updateDash() {
  if (!activeBook || activeBook === 'all') return;
  const s = getState(), book = getBook();
  const cur = book.currency;
  updateContextBanners();
  $('d-book-title').textContent = book.title;
  $('d-book-author').textContent = (book.author||'—') + ' · List price '+cur+book.listPrice;
  $('d-book-isbn').textContent = book.isbn || '—';
  $('d-stock-sub').textContent = 'of '+book.maxPrint+' printed';
  $('d-thresh-sub').textContent = 'threshold: '+book.threshold+' units';
  $('d-thresh-label').textContent = 'Alert at '+book.threshold+' units';
  $('d-stock').textContent=s.stock; $('h-stock').textContent=s.stock;
  $('d-sold').textContent=s.sold;
  $('d-revenue').textContent=fmt(s.revenue,cur); $('h-revenue').textContent=fmt(s.revenue,cur);
  $('d-avg-sub').textContent='avg '+(s.sold>0?fmt(s.revenue/s.sold,cur):'—');
  const consigned=s.stores.reduce((a,st)=>a+st.outstanding,0);
  $('d-consigned').textContent=consigned; $('h-consigned').textContent=consigned;
  $('d-stores').textContent=s.stores.length;
  const owed=s.stores.reduce((a,st)=>a+st.amountOwed,0);
  $('d-owed').textContent=fmt(owed,cur); $('d-owed').className='kpi-value'+(owed>0?' warn':'');
  const pendingTransfers=s.artistTransfers||[];
  const pendingTotal=pendingTransfers.reduce((a,t)=>a+t.total,0);
  $('d-artist-pending').textContent=pendingTransfers.length>0?fmt(pendingTotal,cur):'—';
  $('d-artist-pending').className='kpi-value'+(pendingTransfers.length>0?' warn':'');
  $('d-artist-pending-sub').textContent=pendingTransfers.length>0?`${pendingTransfers.length} order${pendingTransfers.length>1?'s':''} awaiting forwarding`:'no pending transfers';
  renderArtistTransfers();
  $('d-low').textContent=s.stock<=book.threshold?'⚠ Low':'OK';
  $('d-low').className='kpi-value'+(s.stock<=book.threshold?' danger':'');
  const pct=Math.max(0,s.stock/book.maxPrint*100);
  $('d-bar').style.width=pct+'%';
  $('d-bar').style.background=s.stock<=book.threshold?'#f87171':s.stock<=book.threshold*2?'#fb923c':book.accent;
  $('d-bar-label').textContent=s.stock+' / '+book.maxPrint+' units on hand';
  const al=$('d-alert');
  if(s.stock<=book.threshold){al.className='stock-alert danger';al.textContent='⚠ Below threshold ('+book.threshold+') — reorder now.';}
  else if(s.stock<=book.threshold*2){al.className='stock-alert warn';al.textContent='Getting low — '+s.stock+' units remaining.';}
  else{al.className='stock-alert ok';al.textContent='Stock is healthy.';}
  const ckeys=Object.keys(s.chStats||{});
  $('ch-body').innerHTML=ckeys.length?ckeys.map(k=>{const cs=s.chStats[k];return`<tr><td style="font-weight:600;">${k}</td><td class="r">${cs.txns}</td><td class="r">${cs.units}</td><td class="r">${fmt(cs.revenue,cur)}</td></tr>`;}).join(''):'<tr><td colspan="4"><div class="empty-state" style="padding:1rem;">No sales yet.</div></td></tr>';
  $('dash-con-body').innerHTML=s.stores.length?s.stores.map(st=>`<tr><td style="font-weight:600;">${st.name}</td><td class="r">${st.sent}</td><td class="r">${st.sold}</td><td class="r">${st.returned}</td><td class="r">${st.outstanding}</td><td>${st.outstanding>0?'<span class="pill amber">Active</span>':'<span class="pill gray">Settled</span>'}</td></tr>`).join(''):'<tr><td colspan="6"><div class="empty-state" style="padding:1rem;">No consignment accounts.</div></td></tr>';
  // Show danger zone only for publisher
  if (!isAuthor()) {
    $('danger-zone-sect').style.display='';
    $('danger-zone-block').style.display='flex';
  }
  // ── EXPENSES SUMMARY (publisher only)
  if(!isAuthor()){
   
    renderPendingExpenses();
    const expenses = s.expenses||[];
    const unreceivedExp = expenses.filter(e=>!e.received);
    const expKpi = $('d-expenses-kpi');
    const expSect = $('d-expenses-sect');
    if(unreceivedExp.length){
      const expTotal = unreceivedExp.reduce((a,e)=>a+(e.amount||0),0);
      // KPI tile
      if(expKpi){ expKpi.style.display=''; }
      $('d-expenses-owed').textContent = fmt(expTotal,cur);
      $('d-expenses-owed-sub').textContent = `${unreceivedExp.length} expense${unreceivedExp.length!==1?'s':''} outstanding`;
      // Detail table — dark banner style
      if(expSect){
        expSect.style.display='';
        $('d-exp-total').textContent = fmt(expTotal,cur);
        $('d-exp-count').textContent = `${expenses.length} expense${expenses.length!==1?'s':''} logged`;
        $('d-exp-body').innerHTML = unreceivedExp.map(e=>`
          <tr>
            <td style="padding:6px 0;color:rgba(255,255,255,.35);white-space:nowrap;">${fmtD(e.date)}</td>
            <td style="padding:6px 8px;color:rgba(255,255,255,.7);font-weight:500;">${e.desc}</td>
            <td style="padding:6px 8px;"><span style="font-size:10px;background:rgba(255,255,255,.08);color:rgba(255,255,255,.4);padding:2px 8px;border-radius:100px;">${e.cat}</span></td>
            <td style="padding:6px 8px;color:rgba(255,255,255,.25);">${e.ref||'—'}</td>
            <td style="padding:6px 0;text-align:right;color:#f87171;font-weight:500;">${fmt(e.amount,cur)}</td>
          </tr>`).join('');
        // Payment button
        const artistLink = (s.artistPaymentLink||'').trim();
        const payBtn = $('d-exp-pay-btn');
        const payHint = $('d-exp-pay-hint');
        if(payBtn){
          if(artistLink){
            payBtn.href = artistLink.startsWith('http') ? artistLink : 'https://'+artistLink;
            payBtn.style.display='';
            if(payHint) payHint.textContent='Opens payment link in a new tab';
          } else {
            payBtn.style.display='none';
            if(payHint) payHint.textContent='Artist has not set a payment link yet';
          }
        }
      }
    } else {
      if(expKpi) expKpi.style.display='none';
      if(expSect) expSect.style.display='none';
    }
  }

  // ── BREAK-EVEN (publisher only)
  const cost = book.productionCost || 0;
  if(!isAuthor() && cost > 0){
    $('d-breakeven-kpi').style.display='';
    $('d-breakeven-block').style.display='';
    const pctBe = Math.min(100, s.revenue / cost * 100);
    const remaining = Math.max(0, cost - s.revenue);
    const broken = s.revenue >= cost;
    $('d-breakeven-val').textContent = broken ? '✓ Done' : fmt(remaining,cur)+' to go';
    $('d-breakeven-val').className = 'kpi-value' + (broken ? ' gold' : '');
    $('d-breakeven-sub').textContent = `of ${fmt(cost,cur)} production cost`;
    $('d-be-title').textContent = broken ? 'Project has broken even' : 'Not yet broken even';
    $('d-be-sub').textContent = `Production cost: ${fmt(cost,cur)} · Revenue to date: ${fmt(s.revenue,cur)}`;
    $('d-be-bar').style.width = pctBe+'%';
    $('d-be-bar').style.background = broken ? '#4ade80' : pctBe>=70 ? '#fb923c' : 'var(--gold2)';
    $('d-be-bar-label').textContent = `${fmt(s.revenue,cur)} recovered (${pctBe.toFixed(1)}%)`;
    $('d-be-bar-right').textContent = broken ? 'Break-even reached ✓' : `${fmt(remaining,cur)} remaining`;
    const al=$('d-be-alert');
    if(broken){al.className='stock-alert ok';al.textContent='✓ Production costs fully recovered — everything earned from here is profit.';}
    else if(pctBe>=70){al.className='stock-alert warn';al.textContent=`Almost there — ${fmt(remaining,cur)} more to recover production costs.`;}
    else{al.className='stock-alert warn';al.style.borderLeftColor='rgba(200,145,58,.5)';al.style.background='rgba(200,145,58,.08)';al.style.color='var(--gold2)';al.textContent=`${pctBe.toFixed(1)}% of production costs recovered. ${fmt(remaining,cur)} still to go.`;}
    const unitsNeeded = remaining > 0 ? Math.ceil(remaining / (book.listPrice || 1)) : 0;
    if(!broken) al.textContent += ` (~${unitsNeeded} more unit${unitsNeeded!==1?'s':''} at list price)`;
  } else {
    $('d-breakeven-kpi').style.display='none';
    $('d-breakeven-block').style.display='none';
  }

  // ── PROFIT SHARING BREAKDOWN
  renderProfitSharingBreakdown(activeBook);
}

function renderProfitSharingBreakdown(bookId) {
  const block = $('d-profit-sharing-block');
  const content = $('ps-dash-content');
  if (!block || !content) return;

  const book = BOOKS[bookId];
  if (!book || !book.profitTiers || book.profitTiers.length === 0) {
    block.style.display = 'none';
    return;
  }

  block.style.display = '';
  const stats = calculateArtistEarnings(bookId);
  if (!stats) {
    content.innerHTML = '<div class="empty-state">No earnings data yet.</div>';
    return;
  }

  const cur = book.currency;
  const tiers = [...book.profitTiers].sort((a,b) => (a.revenueUpTo || Infinity) - (b.revenueUpTo || Infinity));

  // Find which tier is currently active based on cumulative revenue
  const currentTier = tiers.find(t => t.revenueUpTo !== null && stats.cumulativeRevenue < t.revenueUpTo) || tiers[tiers.length - 1];
  const nextTier    = tiers.find(t => t.revenueUpTo !== null && stats.cumulativeRevenue < t.revenueUpTo);

  const tierHtml = tiers.map(t => {
    const isActive    = t === currentTier;
    const isCompleted = t.revenueUpTo !== null && stats.cumulativeRevenue >= t.revenueUpTo;
    const threshold   = t.revenueUpTo !== null ? `Up to ${fmt(t.revenueUpTo, cur)}` : '∞ Unlimited';
    return `
      <div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:6px;
        opacity:${isCompleted ? '.45' : '1'}; font-weight:${isActive ? '700' : '400'};
        padding:6px 10px; border-radius:var(--r2);
        background:${isActive ? 'rgba(255,255,255,.05)' : 'transparent'};
        border-left:2px solid ${isCompleted ? 'rgba(255,255,255,.1)' : isActive ? 'var(--gold2)' : 'transparent'};">
        <span>${t.label} &nbsp;<span style="font-size:10px;opacity:.5;">${threshold}</span></span>
        <span style="color:${isActive ? 'var(--gold2)' : 'var(--text3)'}">${t.artistPct}% Artist</span>
      </div>
    `;
  }).join('');

  let progressHtml = '';
  if (nextTier && nextTier.revenueUpTo !== null) {
    const revenueLeft = nextTier.revenueUpTo - stats.cumulativeRevenue;
    const pct = Math.min(100, (stats.cumulativeRevenue / nextTier.revenueUpTo) * 100);
    const label = nextTier.label.toLowerCase().includes('break') ? 'to break-even' : `until ${nextTier.label}`;
    progressHtml = `
      <div style="margin-top:1rem; padding:12px; background:var(--ink); border-radius:var(--r2); border:1px solid rgba(255,255,255,.05);">
        <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
          <span style="font-size:10px; text-transform:uppercase; color:rgba(255,255,255,.58); letter-spacing:.1em;">Revenue Progress</span>
          <span style="font-size:11px; color:var(--gold2); font-family:'DM Mono',monospace;">${fmt(revenueLeft, cur)} ${label}</span>
        </div>
        <div class="bar-track" style="height:5px; margin-bottom:0;">
          <div class="bar-fill" style="width:${pct}%; background:var(--gold2); height:5px; border-radius:100px;"></div>
        </div>
        <div style="font-size:10px;color:rgba(255,255,255,.62);margin-top:6px;">${fmt(stats.cumulativeRevenue, cur)} collected of ${fmt(nextTier.revenueUpTo, cur)} threshold</div>
      </div>
    `;
  } else {
    // Already in the final (unlimited) tier
    progressHtml = `
      <div style="margin-top:1rem; padding:10px 14px; background:rgba(74,222,128,.08); border-radius:var(--r2); border:1px solid rgba(74,222,128,.2); font-size:12px; color:var(--green);">
        ✓ Production costs recovered — now in post break-even tier
      </div>
    `;
  }

  content.innerHTML = `
    <div class="g2" style="margin-bottom:1.5rem;">
      <div class="card" style="margin:0; background:var(--cream2); border:none;">
        <div class="hs-label" style="color:var(--text3);">Artist Payout (lifetime)</div>
        <div class="hs-val" style="color:var(--green); font-size:24px;">${fmt(stats.totalArtistEarned, cur)}</div>
      </div>
      <div class="card" style="margin:0; background:var(--cream2); border:none;">
        <div class="hs-label" style="color:var(--text3);">Net to Publisher</div>
        <div class="hs-val" style="color:var(--text); font-size:24px;">${fmt(stats.netPublisher, cur)}</div>
      </div>
    </div>
    <div style="margin-bottom:1rem;">
       <div class="sect" style="font-size:8px; margin-bottom:0.75rem;">Payout Tiers</div>
       ${tierHtml}
    </div>
    ${progressHtml}
  `;
}

function renderAll() {
  if (activeBook === 'all') { updateAllOverview(); updateHeader(); return; }
  updateDash(); renderStores(); renderLedger(); renderHist(); renderExpenses(); renderArtistReimburseBanner(); renderPendingExpenses();
}

function renderCurrent() {
  if (activeBook === 'all') { updateAllOverview(); updateHeader(); }
  else renderAll();
}

// ── ORDER RECORDING
function recordOrder(num, chan, qty, price, notes) {
  const s = getState(), book = getBook();
  s.stock = Math.max(0, s.stock - qty);
  s.sold += qty; s.revenue += qty * price;
  if (!s.chStats[chan]) s.chStats[chan]={txns:0,units:0,revenue:0};
  s.chStats[chan].txns++; s.chStats[chan].units+=qty; s.chStats[chan].revenue+=qty*price;
  s.hist.unshift({num,chan,qty,price,after:s.stock,notes:notes||'',date:today()});
  renderHist(); updateDash(); saveState(activeBook);
  syncToSheets({type:'order',book:book.title,date:today(),num,chan,qty,price,total:qty*price,stockAfter:s.stock,notes:notes||''});
}

function renderHist() {
  const s = getState(), book = getBook(), cur = book.currency;
  $('hist-body').innerHTML = s.hist.length
    ? s.hist.map((h,i)=>{
        const voided = h.voided ? ' voided' : '';
        const voidPill = h.voided ? '<span class="void-badge">Void</span>' : '';
        const editBtn = isAuthor() ? '' : `<button class="edit-btn" onclick="openEditHist(${i})" title="Edit entry">✎</button>`;
        const isGrat = h.gratuity || h.chan === 'Gratuity';
        const isPending = h.artistPending;
        const chanCell = isGrat ? `<span class="pill gray" style="font-size:10px;">🎁 Gratuity</span>` : isPending ? `${h.chan} <span class="pill amber" style="font-size:10px;">⏳ pending</span>` : h.chan;
        const priceCell = isGrat ? '<span style="color:var(--text4);font-size:11px;">gifted</span>' : fmt(h.price,cur);
        const totalCell = isGrat ? '—' : isPending ? `<span style="color:var(--amber);">${fmt(h.qty*h.price,cur)}</span>` : fmt(h.qty*h.price,cur);
        const rowStyle = isGrat ? ' style="background:var(--cream2);font-style:italic;"' : isPending ? ' style="background:#fef9ec;"' : '';
        const isWebsite = (h.chan === 'Website') && !isGrat && !h.voided;
        const labelBtn = isWebsite ? `<button class="edit-btn" onclick="openLabelModal(${i})" title="Print shipping label" style="opacity:1;color:var(--gold);border-color:var(--gold-line);background:var(--gold-bg);">📦</button>` : '';
        return `<tr class="${voided}"${rowStyle}><td class="mono">${h.num}${editBtn}</td><td>${chanCell}</td><td class="r">${h.voided?'':'-'}${h.qty}</td><td class="r">${priceCell}</td><td class="r" style="font-weight:600;">${totalCell}</td><td class="r">${h.after}</td><td style="font-size:12px;color:var(--text3);">${h.notes||'—'}</td><td style="font-size:12px;color:var(--text3);">${fmtD(h.date)} ${voidPill}</td><td>${labelBtn}</td></tr>`;
      }).join('')
    : '<tr><td colspan="8"><div class="empty-state" style="padding:1.5rem;">No orders yet.</div></td></tr>';
}

// ── WEBSITE ORDERS — persistent scan memory
const SCAN_MEMORY_KEY = 'lm-scan-memory';
function getScanMemory() {
  try { return JSON.parse(localStorage.getItem(SCAN_MEMORY_KEY) || '{}'); } catch(e) { return {}; }
}
function saveScanMemory(mem) {
  localStorage.setItem(SCAN_MEMORY_KEY, JSON.stringify(mem));
}

// Build a cross-book set of all order IDs already applied across any session
function getAllAppliedIds() {
  const ids = new Set();
  Object.values(states).forEach(s => (s.doneIds || []).forEach(id => ids.add(id)));
  // Also include any order nums already in any book's history
  Object.values(states).forEach(s => (s.hist || []).forEach(h => { if (h.num) ids.add(h.num); }));
  return ids;
}

function renderOrders() {
  const s = getState(), book = getBook(), cur = book.currency;
  const list = $('orders-list');
  // Filter to current book; show all if bookId not set
  const rel = orders.filter(o => o.hasBook && (!o.bookId || o.bookId === activeBook));
  const appliedIds = getAllAppliedIds();

  // Smart filter: hide orders whose order number already exists in history
  const visible = rel.filter(o => !appliedIds.has(o.orderNum));
  const hiddenCount = rel.length - visible.length;

  if (!visible.length) {
    const msg = hiddenCount > 0
      ? `<div class="empty-state"><div class="e-icon">✅</div>All ${hiddenCount} found order(s) already applied.<br><span style="font-size:11px;color:var(--text3);">Scan again to check for newer orders.</span></div>`
      : `<div class="empty-state"><div class="e-icon">📬</div>No orders found for this book.<br><span style="font-size:11px;color:var(--text3);">Make sure your Google Sheets is connected.</span></div>`;
    list.innerHTML = msg;
    $('apply-all-btn').disabled = true;
    return;
  }

  list.innerHTML = visible.map(o => {
    const done = appliedIds.has(o.id) || appliedIds.has(o.orderNum);
    const addrParts = [o.shipAddr1, o.shipCity, o.shipProvince, o.shipCountry].filter(Boolean);
    const addrLine = addrParts.length
      ? `<div style="font-size:11px;color:var(--text3);margin-top:4px;">📦 ${addrParts.join(', ')}</div>`
      : '';
    const listPrice = BOOKS[o.bookId]?.listPrice || book.listPrice;
    const listCur   = BOOKS[o.bookId]?.currency   || cur;
    const priceMismatch = !done && o.price && Math.abs(o.price - listPrice) > 0.5;
    const priceWarn = priceMismatch
      ? `<span style="font-size:10px;color:var(--amber);margin-left:6px;">⚠ paid ${listCur}${o.price} (list ${listCur}${listPrice})</span>`
      : '';
    const bookLabel = o.bookId && BOOKS[o.bookId]
      ? `<span style="font-size:10px;background:${BOOKS[o.bookId].accent}22;color:${BOOKS[o.bookId].accent};border-radius:100px;padding:2px 8px;margin-right:6px;">${BOOKS[o.bookId].title}</span>`
      : '';
    const viewEmailBtn = o.id
      ? `<a href="https://mail.google.com/mail/u/0/#all/${o.id}" target="_blank" class="btn sm" style="font-size:10px;opacity:.7;">📧 View</a>`
      : '';
    return `<div class="order-card${done ? ' done' : ''}">
      <div class="order-row">
        <div>
          <div class="order-num">${o.orderNum}</div>
          <div class="order-meta">${o.date} · ${o.customer || '—'} · <span style="opacity:.6;">${o.email || ''}</span></div>
          ${addrLine}
        </div>
        <span class="pill ${done ? 'gray' : 'gold'}">${done ? 'Applied' : 'New'}</span>
      </div>
      <div class="order-row" style="margin-top:8px;gap:6px;">
        <span style="font-size:12px;color:var(--text3);">${bookLabel}qty ${o.qty} · ${fmt(o.price || listPrice, listCur)}${priceWarn}</span>
        <div style="display:flex;gap:6px;align-items:center;">
          ${viewEmailBtn}
          ${!done ? `<button class="btn sm gold" onclick="applyOne('${o.id}')">Apply</button>` : '<span style="font-size:11px;color:var(--text3);">Done</span>'}
        </div>
      </div>
    </div>`;
  }).join('');

  if (hiddenCount > 0) {
    list.innerHTML += `<div style="text-align:center;font-size:11px;color:var(--text3);padding:10px 0;">${hiddenCount} already-applied order(s) hidden.</div>`;
  }

  $('apply-all-btn').disabled = !visible.some(o => !appliedIds.has(o.id) && !appliedIds.has(o.orderNum));
}

function applyOne(id) {
  const s = getState(), book = getBook();
  const o = orders.find(x => x.id === id);
  if (!o) return;
  const alreadyDone = getAllAppliedIds().has(id) || getAllAppliedIds().has(o.orderNum);
  if (alreadyDone) { showToast('Order already applied', 'warn'); return; }
  // Use the matched book if it differs from active
  const targetBook = o.bookId && BOOKS[o.bookId] ? o.bookId : activeBook;
  const targetState = states[targetBook];
  const targetBk    = BOOKS[targetBook];
  if (!targetState || !targetBk) { showToast('Cannot find book for this order', 'err'); return; }
  // Use target book's price if not on order
  const price = o.price || targetBk.listPrice;
  targetState.stock = Math.max(0, targetState.stock - o.qty);
  targetState.sold  += o.qty;
  targetState.revenue += o.qty * price;
  if (!targetState.chStats['Website']) targetState.chStats['Website'] = { txns: 0, units: 0, revenue: 0 };
  targetState.chStats['Website'].txns++;
  targetState.chStats['Website'].units += o.qty;
  targetState.chStats['Website'].revenue += o.qty * price;
  const entry = { num: o.orderNum, chan: 'Website', qty: o.qty, price, after: targetState.stock,
    notes: 'Big Cartel', date: o.date || today(),
    shipName: o.shipName || o.customer || '', shipEmail: o.email || '',
    shipAddr1: o.shipAddr1 || '', shipAddr2: o.shipAddr2 || '',
    shipCity: o.shipCity || '', shipProvince: o.shipProvince || '',
    shipPostal: o.shipPostal || '', shipCountry: o.shipCountry || 'Canada'
  };
  targetState.hist.unshift(entry);
  if (!targetState.doneIds) targetState.doneIds = [];
  targetState.doneIds.push(id);
  // Save scan memory — record this order num as seen
  const mem = getScanMemory();
  if (!mem.appliedNums) mem.appliedNums = [];
  if (!mem.appliedNums.includes(o.orderNum)) mem.appliedNums.push(o.orderNum);
  mem.lastScan = new Date().toISOString();
  saveScanMemory(mem);
  syncToSheets({ type: 'order', book: targetBk.title, date: entry.date, num: o.orderNum, chan: 'Website', qty: o.qty, price, total: o.qty * price, stockAfter: targetState.stock, notes: 'Big Cartel' });
  addLog('log-web', `✓ ${o.orderNum} (${targetBk.title}): -${o.qty} → ${targetState.stock} remaining`, 'ok');
  if (targetState.stock <= targetBk.threshold) addLog('log-web', `⚠ ${targetBk.title} below threshold!`, 'warn');
  saveState(targetBook);
  renderOrders();
  if (targetBook === activeBook) updateDash();
}

function applyAll() {
  const applied = getAllAppliedIds();
  orders.filter(o => o.hasBook && !applied.has(o.id) && !applied.has(o.orderNum)).forEach(o => applyOne(o.id));
}

async function fetchOrders() {
  const book = getBook();
  const btn  = $('scan-btn');
  const log  = 'log-web';
  let attempt = 0;
  const MAX_RETRIES = 3;

  const setStatus = (msg) => { btn.innerHTML = `<span class="spinner"></span>${msg}`; btn.disabled = true; };

  // Read scan memory for smarter queries
  const mem = getScanMemory();
  const lastScanDate = mem.lastScan ? new Date(mem.lastScan) : null;
  const appliedNums  = new Set(mem.appliedNums || []);
  const daysBack     = parseInt(localStorage.getItem('lm-scan-days') || '30');
  const sinceDate    = new Date(Date.now() - daysBack * 86400000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

  // Book catalog context
  const bookList = Object.values(BOOKS)
    .map(b => `"${b.title}" (id:${b.id}, price:${b.currency}${b.listPrice})`)
    .join(', ');

  // Known order nums to skip (already applied at any point)
  const allApplied = [...getAllAppliedIds(), ...appliedNums];
  const skipHint   = allApplied.length ? `Skip any orders with these order numbers, they are already recorded: ${allApplied.join(', ')}.` : '';

  const systemPrompt = `You are a Gmail assistant for Lyricalmyrical Books.
Search Gmail for Big Cartel order confirmation emails dated on or after ${sinceDate}.
Catalog: ${bookList}.
${skipHint}
Rules:
- Respond ONLY with raw JSON: {"orders":[{"id":"gmail_msg_id","bookId":"catalog_id","orderNum":"#1234","date":"Mar 14 2026","customer":"Name","email":"email","qty":1,"price":40.00,"hasBook":true,"shipName":"Name","shipAddr1":"Addr","shipAddr2":"","shipCity":"City","shipProvince":"ON","shipPostal":"M5V","shipCountry":"Canada"}]}
- Only include confirmed orders.
- Default to qty 1 if not explicit.`;

  async function attemptScan() {
    attempt++;
    setStatus(`Searching Gmail… (attempt ${attempt}/${MAX_RETRIES})`);
    const r = await fetch('/api/claude', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4000,
        system: systemPrompt,
        messages: [{ role: 'user', content: `Search Gmail for all Big Cartel order confirmation emails from Lyricalmyrical Books since ${sinceDate}. Return every order for every book.` }],
        mcp_servers: [{ type: 'url', url: 'https://gmail.mcp.claude.com/mcp', name: 'gmail' }]
      })
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const d = await r.json();
    if (!d || !d.content) throw new Error('Empty AI response');
    return d;
  }

  function parseResponse(d) {
    const text = d.content.filter(c => c.type === 'text').map(c => c.text).join('');
    let parsed;
    const attempts = [
      () => JSON.parse(text.trim()),
      () => JSON.parse(text.replace(/^```json|```$/gm, '').trim()),
      () => { const m = text.match(/\{[\s\S]*\}/); if (m) return JSON.parse(m[0]); throw new Error('no match'); }
    ];
    for (const fn of attempts) {
      try { parsed = fn(); break; } catch (_) {}
    }
    return parsed || { orders: [] };
  }

  setStatus('Connecting to Gmail Agent…');
  let lastError;
  while (attempt < MAX_RETRIES) {
    try {
      const d = await attemptScan();
      setStatus('Parsing results…');
      const parsed = parseResponse(d);

      // Normalise and enrich
      orders = (parsed.orders || []).map(o => ({
        ...o,
        hasBook: true,
        bookId: o.bookId && BOOKS[o.bookId] ? o.bookId : Object.keys(BOOKS)[0],
        price:  o.price || BOOKS[o.bookId]?.listPrice || book.listPrice
      }));

      // Cross-session deduplication
      const allDone = getAllAppliedIds();
      [...appliedNums].forEach(n => allDone.add(n));
      const fresh = orders.filter(o => !allDone.has(o.id) && !allDone.has(o.orderNum));
      const already = orders.length - fresh.length;

      mem.lastScan = new Date().toISOString();
      saveScanMemory(mem);

      if (orders.length === 0) {
        addLog(log, `📭 No orders found in Gmail since ${sinceDate}.`, 'warn');
      } else {
        const byBook = orders.reduce((acc, o) => { acc[o.bookId] = (acc[o.bookId] || 0) + 1; return acc; }, {});
        const summary = Object.entries(byBook).map(([id, n]) => `${BOOKS[id]?.title || id} ×${n}`).join(', ');
        addLog(log, `✓ Found ${orders.length} order(s): ${summary}`, 'ok');
        if (already > 0) addLog(log, `↩ ${already} already recorded (skipped)`, 'warn');
        if (fresh.length > 0) addLog(log, `→ ${fresh.length} new order(s) ready`, 'ok');
      }
      if (lastScanDate) addLog(log, `🕐 Previous scan: ${lastScanDate.toLocaleString()}`, 'ok');

      renderOrders();
      btn.textContent = 'Scan Gmail'; btn.disabled = false;
      return;
    } catch(e) {
      lastError = e;
      console.warn(`Scan attempt ${attempt} failed:`, e);
      if (attempt < MAX_RETRIES) {
        setStatus(`Retrying… (${attempt}/${MAX_RETRIES})`);
        await new Promise(res => setTimeout(res, 1200 * attempt));
      }
    }
  }

  addLog(log, `❌ AI Scan failed: ${lastError?.message || 'Unknown error'}. Try again in a moment.`, 'err');
  orders = [];
  renderOrders();
  btn.textContent = 'Scan Gmail'; btn.disabled = false;
}

// ── MANUAL
function toggleFx(){
  const on=$('m-fx-toggle').checked;
  $('m-fx-panel').style.display=on?'':'none';
  if(on){
    $('m-fx-native-sym').textContent=getBook().currency;
    // Pre-select a sensible foreign currency (not the same as book's)
    const bookCur=getBook().currency.replace(/[^A-Z]/g,'').slice(0,3);
    const sel=$('m-fx-cur');
    if([...sel.options].some(o=>o.value===bookCur)){
      // pick first option that isn't the book currency
      const alt=[...sel.options].find(o=>o.value!==bookCur);
      if(alt)sel.value=alt.value;
    }
    calcFx();
  }
}
function calcFx(){
  const amt=parseFloat($('m-fx-amount').value)||0;
  const rate=parseFloat($('m-fx-rate').value)||0;
  const book=getBook();
  const converted=amt*rate;
  $('m-fx-result').textContent=converted>0?fmt(converted,book.currency):'—';
  // Push converted value into the main price field
  if(converted>0){$('m-price').value=converted.toFixed(2);phint();}
}
function toggleShippingPanel(){}  // no-op, kept for safety

let _labelOrderIndex = null;

function openLabelModal(histIndex) {
  _labelOrderIndex = histIndex;
  const h = getState().hist[histIndex];
  const book = getBook();
  $('shipping-label-order-info').textContent = `${h.num} · ${book.title} × ${h.qty} · ${fmtD(h.date)}`;
  $('sl-name').value     = h.shipName     || '';
  $('sl-email').value    = h.shipEmail    || '';
  $('sl-addr1').value    = h.shipAddr1    || '';
  $('sl-addr2').value    = h.shipAddr2    || '';
  $('sl-city').value     = h.shipCity     || '';
  $('sl-province').value = h.shipProvince || '';
  $('sl-postal').value   = h.shipPostal   || '';
  $('sl-country').value  = h.shipCountry  || 'Canada';
  openM('shipping-label');
}

function getShippingData(){}   // no-op
function clearShippingFields(){}  // no-op
function openShippingLabel(){}  // no-op

function printShippingLabel() {
  const h = getState().hist[_labelOrderIndex];
  const book = getBook();

  // Save address to history entry so it's remembered next time
  h.shipName     = $('sl-name').value.trim();
  h.shipEmail    = $('sl-email').value.trim();
  h.shipAddr1    = $('sl-addr1').value.trim();
  h.shipAddr2    = $('sl-addr2').value.trim();
  h.shipCity     = $('sl-city').value.trim();
  h.shipProvince = $('sl-province').value.trim();
  h.shipPostal   = $('sl-postal').value.trim();
  h.shipCountry  = $('sl-country').value.trim();
  saveState(activeBook);

  const ship = { name:h.shipName, email:h.shipEmail, addr1:h.shipAddr1, addr2:h.shipAddr2,
                 city:h.shipCity, province:h.shipProvince, postal:h.shipPostal, country:h.shipCountry };

  const fromLines = ['Lyricalmyrical Books', '456 Montrose Ave', 'Toronto, ON  M6G 3H1', 'Canada'];

  const toLines = [ship.name, ship.addr1, ship.addr2,
    [ship.city, ship.province].filter(Boolean).join(ship.province ? ', ' : ''),
    ship.postal, ship.country].filter(Boolean);

  const labelHTML = `<div style="font-family:'Courier New',monospace;padding:28px;background:white;color:#000;">
    <div style="display:flex;gap:20px;margin-bottom:20px;align-items:flex-start;">
      <div style="flex:1;">
        <div style="font-size:8px;font-weight:700;letter-spacing:.2em;text-transform:uppercase;color:#666;margin-bottom:5px;">From</div>
        ${fromLines.map(l=>`<div style="font-size:12px;line-height:1.7;">${l}</div>`).join('')}
      </div>
      <div style="text-align:right;font-size:10px;color:#888;">
        <div>${book.title}</div>
        <div>Qty: ${h.qty}</div>
        <div>${fmtD(h.date)}</div>
      </div>
    </div>
    <div style="border-top:2px solid #000;margin-bottom:18px;"></div>
    <div style="font-size:8px;font-weight:700;letter-spacing:.2em;text-transform:uppercase;color:#666;margin-bottom:8px;">Ship to</div>
    ${toLines.map((l,i)=>`<div style="font-size:${i===0?'20px':'15px'};font-weight:${i===0?'700':'400'};line-height:1.6;">${l}</div>`).join('')}
    ${ship.email?`<div style="margin-top:14px;padding-top:12px;border-top:1px dashed #ccc;font-size:11px;color:#666;">✉ ${ship.email}</div>`:''}
  </div>`;

  const win = window.open('','_blank','width=620,height=500');
  win.document.write(`<!DOCTYPE html><html><head><title>Label — ${h.num}</title>
    <style>@page{margin:0;size:4in 6in;}*{box-sizing:border-box;margin:0;padding:0;}body{background:white;}@media print{body{padding:0;}}</style>
    </head><body>${labelHTML}</body></html>`);
  win.document.close();
  win.focus();
  setTimeout(()=>{ win.print(); }, 350);
  closeM('shipping-label');
}


// ── ARTIST PAYMENT LINK
function saveArtistPaymentLink(){
  const val=($('artist-pay-link-input').value||'').trim();
  const s=getState();
  s.artistPaymentLink=val;
  // Also store on book object so publisher can read it
  getBook().artistPaymentLink=val;
  saveState(activeBook);
  showToast('✓ Payment link saved');
}

function renderArtistReimburseBanner(){
  const s=getState(),book=getBook(),cur=book.currency;
  // Show payment link card for authors
  const linkCard=$('artist-payment-link-card');
  if(linkCard){
    if(isAuthor()){
      linkCard.style.display='';
      const inp=$('artist-pay-link-input');
      if(inp && !inp.value) inp.value=s.artistPaymentLink||'';
    } else {
      linkCard.style.display='none';
    }
  }
  // Show received expenses banner for authors
  const banner=$('artist-reimburse-banner');
  if(!banner) return;
  if(!isAuthor()){ banner.style.display='none'; return; }
  const received=(s.expenses||[]).filter(e=>e.received);
  if(!received.length){ banner.style.display='none'; return; }
  const total=received.reduce((a,e)=>a+(e.amount||0),0);
  banner.style.display='';
  $('arb-amount').textContent=fmt(total,cur);
  $('arb-detail').textContent=`${received.length} expense${received.length!==1?'s':''} marked as received by publisher`;
  $('arb-hint').textContent='These expenses have been settled';
  $('arb-items').innerHTML=received.map(e=>`
    <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;">
      <div style="font-family:'DM Mono',monospace;font-size:11px;color:rgba(255,255,255,.35);">
        ${e.desc} · ${fmtD(e.date)} · <span style="font-size:9px;background:rgba(255,255,255,.08);padding:1px 6px;border-radius:100px;">${e.cat}</span>
      </div>
      <div style="font-family:'DM Mono',monospace;font-size:13px;color:#6ee7a8;font-weight:500;">${fmt(e.amount,cur)}</div>
    </div>`).join('');
}

function updateExpenseForm(){
  const book=getBook();
  $('exp-sym').textContent=book.currency;
  $('exp-date').value=today();
}

function submitExpense(){
  const desc=($('exp-desc').value||'').trim();
  const cat=$('exp-cat').value;
  const amount=parseFloat($('exp-amount').value)||0;
  const date=$('exp-date').value||today();
  const ref=($('exp-ref').value||'').trim();
  const book=getBook();
  if(!desc){ showToast('⚠ Please enter a description','warn'); $('exp-desc').focus(); return; }
  if(!amount){ showToast('⚠ Please enter an amount','warn'); $('exp-amount').focus(); return; }
  const s=getState();
  if(!s.expenses) s.expenses=[];
  s.expenses.unshift({id:Date.now(),desc,cat,amount,date,ref});
  renderExpenses();
  updateDash();
  saveState(activeBook);
  addLog('log-expenses',`${cat}: ${desc} — ${fmt(amount,book.currency)}`,'ok');
  showToast('✓ Expense logged');
  $('exp-desc').value='';$('exp-amount').value='';$('exp-ref').value='';$('exp-date').value=today();
}

function voidExpense(id){
  const s=getState();
  s.expenses=(s.expenses||[]).filter(e=>e.id!==id);
  renderExpenses();
  updateDash();
  saveState(activeBook);
  showToast('Expense removed','warn');
}

function renderExpenses(){
  const s=getState(),book=getBook(),cur=book.currency;
  const expenses=s.expenses||[];
  const body=$('exp-body');
  if(!body)return;
  if(!expenses.length){
    body.innerHTML='<tr><td colspan="6"><div class="empty-state" style="padding:1.5rem;">No expenses logged yet.</div></td></tr>';
    return;
  }
  const unreceived=expenses.filter(e=>!e.received);
  const total=unreceived.reduce((a,e)=>a+(e.amount||0),0);
  body.innerHTML=expenses.map(e=>{
    const statusCell=e.received
      ?'<span class="pill green" style="font-size:10px;">✓ Received</span>'
      :'<span style="font-size:11px;color:var(--text4);">Pending</span>';
    const actionCell=(!e.received && !isAuthor())
      ?`<button class="edit-btn" onclick="voidExpense(${e.id})" title="Remove" style="opacity:1;color:var(--red);">✕</button>`:'';
    return `<tr style="${e.received?'opacity:.5;':''}">
      <td style="font-size:12px;color:var(--text3);">${fmtD(e.date)}</td>
      <td style="font-weight:600;">${e.desc}</td>
      <td><span class="pill gray" style="font-size:10px;">${e.cat}</span></td>
      <td style="font-size:11px;color:var(--text3);">${e.ref||'—'}</td>
      <td class="r" style="color:${e.received?'var(--text4)':'var(--red)'};font-family:'DM Mono',monospace;">${fmt(e.amount,cur)}</td>
      <td>${statusCell}</td>
      <td>${actionCell}</td>
    </tr>`;
  }).join('')
  +`<tr style="background:var(--cream2);">
      <td colspan="4" style="font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--text3);text-align:right;padding-right:16px;">Outstanding</td>
      <td class="r" style="font-weight:700;color:var(--red);font-family:'DM Mono',monospace;">${fmt(total,cur)}</td>
      <td colspan="2"></td>
    </tr>`;
}

// ── SPREADSHEET IMPORT
let _importRows = [];

function handleImportFile(event) {
  const file = event.target.files[0];
  if (!file) return;
  event.target.value = ''; // reset so same file can be re-selected
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = new Uint8Array(e.target.result);
      const wb = XLSX.read(data, { type: 'array', cellDates: true });
      const book = getBook();

      const SHORT = {'Un Fantastico Altrove':'Altrove','The Hound':'Hound','Archaeology of Presence':'Archaeology','Sistema_non_autorizzato':'Sistema','As if Nobody is Watching':'Nobody','Collective Photobook':'Collective'};
      const shortName = SHORT[book.title] || book.title;
      // Try short name first, then full name, then first sheet
      let sheetName = wb.SheetNames.find(n => n === shortName + ' — Orders')
                   || wb.SheetNames.find(n => n === book.title + ' — Orders')
                   || wb.SheetNames.find(n => n.toLowerCase().includes(shortName.toLowerCase()))
                   || wb.SheetNames.find(n => n.toLowerCase().includes(book.title.toLowerCase().slice(0,6)))
                   || wb.SheetNames[0];
      const ws = wb.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });

      if (!rows.length) { showToast('No data found in spreadsheet', 'warn'); return; }

      // Flexible column mapping — handles variations in header names
      const colMap = (row) => {
        const k = (name) => {
          const keys = Object.keys(row);
          return keys.find(k => k.toLowerCase().replace(/[\s_#]/g,'').includes(name)) || '';
        };
        const num   = row[k('order')] || row[k('num')] || '';
        const date  = row[k('date')] || '';
        const chan   = row[k('channel')] || row[k('chan')] || 'Website';
        const qty   = parseFloat(row[k('qty')] || row[k('quantity')] || 1) || 1;
        const price = parseFloat(row[k('unit')] || row[k('price')] || 0) || 0;
        const notes = row[k('note')] || '';
        // Parse date — handle Excel date objects, strings, etc.
        let parsedDate = today();
        if (date instanceof Date) parsedDate = date.toISOString().split('T')[0];
        else if (typeof date === 'string' && date.trim()) {
          const d = new Date(date);
          if (!isNaN(d)) parsedDate = d.toISOString().split('T')[0];
        } else if (typeof date === 'number') {
          const d = XLSX.SSF.parse_date_code(date);
          parsedDate = `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`;
        }
        return { num: String(num||'IMP-'+Date.now()), date: parsedDate, chan: String(chan), qty: Math.abs(Math.round(qty)), price, notes: String(notes) };
      };

      _importRows = rows.map(colMap).filter(r => r.qty > 0);

      if (!_importRows.length) { showToast('Could not parse any valid rows', 'warn'); return; }

      // Build preview
      $('import-summary').innerHTML = `Found <strong>${_importRows.length} orders</strong> in sheet <em>"${sheetName}"</em> — review below then confirm.`;
      $('import-count').textContent = _importRows.length;
      $('import-preview-body').innerHTML = _importRows.map(r => `
        <tr>
          <td class="mono">${r.num}</td>
          <td style="font-size:12px;color:var(--text3);">${fmtD(r.date)}</td>
          <td>${r.chan}</td>
          <td class="r">${r.qty}</td>
          <td class="r">${book.currency}${r.price.toFixed(2)}</td>
          <td class="r" style="font-weight:600;">${book.currency}${(r.qty*r.price).toFixed(2)}</td>
          <td style="font-size:11px;color:var(--text3);">${r.notes||'—'}</td>
          <td><span class="pill blue" style="font-size:10px;">New</span></td>
        </tr>`).join('');
      openM('import');
    } catch(err) {
      showToast('Could not read file: ' + err.message, 'err');
    }
  };
  reader.readAsArrayBuffer(file);
}

function confirmImport() {
  if (!_importRows.length) return;
  const s = getState(), book = getBook();
  const existingNums = new Set(s.hist.map(h => h.num));
  let imported = 0, skipped = 0;

  // Add in reverse so newest ends up at top after unshift
  [..._importRows].reverse().forEach(r => {
    if (existingNums.has(r.num)) { skipped++; return; } // skip duplicates
    s.stock = Math.max(0, s.stock - r.qty);
    s.sold += r.qty;
    s.revenue += r.qty * r.price;
    if (!s.chStats[r.chan]) s.chStats[r.chan] = { txns:0, units:0, revenue:0 };
    s.chStats[r.chan].txns++;
    s.chStats[r.chan].units += r.qty;
    s.chStats[r.chan].revenue += r.qty * r.price;
    s.hist.unshift({ num:r.num, chan:r.chan, qty:r.qty, price:r.price, after:s.stock, notes:r.notes, date:r.date });
    imported++;
  });

  saveState(activeBook);
  renderHist();
  updateDash();
  closeM('import');
  _importRows = [];
  const msg = skipped > 0
    ? `✓ Imported ${imported} orders (${skipped} duplicates skipped)`
    : `✓ Imported ${imported} orders`;
  showToast(msg);
}

function phint(){
  const book=getBook(),p=parseFloat($('m-price').value)||0,q=parseInt($('m-qty').value)||1,h=$('m-hint'),t=p*q;
  $('m-sym').textContent=book.currency;
  if($('m-fx-toggle').checked){
    h.className='hint-text';h.textContent=t>0?`Converted total ${fmt(t,book.currency)}`:'';
  } else if(p<book.listPrice){h.className='hint-text amber';h.textContent=`Discounted from ${book.currency}${book.listPrice} — total ${fmt(t,book.currency)}`;}
  else{h.className='hint-text';h.textContent=q>1?`Total ${fmt(t,book.currency)}`:'';};
}
function submitManual(){
  const book=getBook(),qty=parseInt($('m-qty').value)||1,price=parseFloat($('m-price').value)||book.listPrice;
  const num=$('m-num').value.trim()||'MAN-'+Date.now(),chan=$('m-chan').value,notes=$('m-notes').value.trim();
  const paymentType=$('m-payment-type').value;
  if(!paymentType){
    $('m-payment-type').style.borderColor='var(--red)';
    $('m-payment-type').focus();
    showToast('⚠ Please select a payment type','warn');
    return;
  }
  $('m-payment-type').style.borderColor='';
  // Build FX note if applicable
  let fxNote='';
  if($('m-fx-toggle').checked){
    const fxAmt=parseFloat($('m-fx-amount').value)||0;
    const fxCur=$('m-fx-cur').value;
    const fxRate=parseFloat($('m-fx-rate').value)||0;
    if(fxAmt>0&&fxRate>0) fxNote=`Paid ${fxCur} ${fxAmt.toFixed(2)} @ ${fxRate} rate`;
  }
  const fullNotes=[notes,fxNote,paymentType].filter(Boolean).join(' · ');

  if(paymentType==='Payment directly to artist'){
    // Stock & sold count update, but revenue is HELD until artist forwards to publisher
    recordOrderPendingTransfer(num,chan,qty,price,fullNotes);
    addLog('log-manual',`${num}: -${qty} @ ${fmt(price,book.currency)} — ⏳ awaiting artist transfer`,'warn');
    showToast('⏳ Order logged — awaiting artist transfer to publisher');
  } else {
    recordOrder(num,chan,qty,price,fullNotes);
    addLog('log-manual',`${num}: -${qty} @ ${fmt(price,book.currency)}${fxNote?' ('+fxNote+')':''} → ${getState().stock} remaining`,'ok');
    if(getState().stock<=book.threshold)addLog('log-manual','⚠ Below threshold!','warn');
    showToast('✓ Order saved · syncing to Sheets…');
  }
  $('m-num').value='';$('m-qty').value='1';$('m-price').value=book.listPrice.toFixed(2);$('m-notes').value='';$('m-payment-type').value='';$('m-hint').textContent='';
  $('m-fx-toggle').checked=false;$('m-fx-panel').style.display='none';$('m-fx-amount').value='';$('m-fx-rate').value='';$('m-fx-result').textContent='—';
}

function recordOrderPendingTransfer(num,chan,qty,price,notes){
  const s=getState(),book=getBook();
  // Reduce stock and count as sold, but do NOT add to revenue yet
  s.stock=Math.max(0,s.stock-qty);
  s.sold+=qty;
  if(!s.chStats[chan])s.chStats[chan]={txns:0,units:0,revenue:0};
  s.chStats[chan].txns++;s.chStats[chan].units+=qty;
  // Add to history with pending flag
  s.hist.unshift({num,chan,qty,price,after:s.stock,notes:notes||'',date:today(),artistPending:true});
  // Add to artistTransfers queue
  s.artistTransfers.push({id:Date.now(),num,chan,qty,price,total:qty*price,notes:notes||'',date:today()});
  renderHist();updateDash();saveState(activeBook);
  syncToSheets({type:'order',book:book.title,date:today(),num,chan,qty,price,total:qty*price,stockAfter:s.stock,notes:(notes||'')+' [PENDING ARTIST TRANSFER]'});
}

function markArtistTransferReceived(transferId){
  const s=getState(),book=getBook();
  const t=s.artistTransfers.find(x=>x.id===transferId);
  if(!t)return;
  // Now credit the revenue
  s.revenue+=t.total;
  if(!s.chStats[t.chan])s.chStats[t.chan]={txns:0,units:0,revenue:0};
  s.chStats[t.chan].revenue+=t.total;
  // Mark history entry as resolved
  const h=s.hist.find(x=>x.num===t.num&&x.artistPending);
  if(h){h.artistPending=false;h.notes=(h.notes?h.notes+' · ':'')+'Transfer received';}
  // Remove from pending queue
  s.artistTransfers=s.artistTransfers.filter(x=>x.id!==transferId);
  renderHist();updateDash();renderArtistTransfers();saveState(activeBook);
  syncToSheets({type:'order',book:book.title,date:today(),num:t.num,chan:t.chan,qty:t.qty,price:t.price,total:t.total,stockAfter:s.stock,notes:(t.notes||'')+' [ARTIST TRANSFER RECEIVED]'});
  showToast(`✓ Transfer received — ${fmt(t.total,book.currency)} added to revenue`);
}

function renderArtistTransfers(){
  const s=getState(),book=getBook(),cur=book.currency;
  const transfers=s.artistTransfers||[];
  const payLink=book.paymentLink||'';

  // ── AUTHOR BANNER
  const banner=$('author-payment-banner');
  if(banner){
    if(isAuthor() && transfers.length>0){
      const totalOwed=transfers.reduce((a,t)=>a+t.total,0);
      banner.style.display='';
      $('apb-amount').textContent=fmt(totalOwed,cur);
      $('apb-detail').textContent=`${transfers.length} pending transfer${transfers.length>1?'s':''} from sales collected on your end`;
      const btn=$('apb-pay-btn');
      if(payLink){
        const fullLink = payLink.startsWith('http') ? payLink : 'https://'+payLink;
        btn.href=fullLink;
        btn.textContent='Send payment →';
        $('apb-link-hint').textContent='Opens payment link in a new tab';
      } else {
        btn.href='#';
        btn.onclick=e=>{e.preventDefault();};
        btn.textContent='Contact publisher';
        $('apb-link-hint').textContent='Payment link not set — contact your publisher';
      }
      $('apb-transfers').innerHTML=transfers.map(t=>`
        <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;">
          <div style="font-family:'DM Mono',monospace;font-size:11px;color:rgba(255,255,255,.35);">
            ${t.num} · ${fmtD(t.date)} · ${t.qty}×
          </div>
          <div style="font-family:'DM Mono',monospace;font-size:13px;color:var(--gold2);font-weight:500;">${fmt(t.total,cur)}</div>
        </div>`).join('');
    } else {
      banner.style.display='none';
    }
  }

  // ── PUBLISHER PANEL
  const sect=$('artist-transfers-sect'),list=$('artist-transfers-list');
  if(!sect)return;
  if(!transfers.length){sect.style.display='none';return;}
  sect.style.display='';
  const fullPayLink = payLink.startsWith('http') ? payLink : payLink ? 'https://'+payLink : '';
  const payHtml = fullPayLink
    ? `<a href="${fullPayLink}" target="_blank" class="btn sm" style="text-decoration:none;background:var(--green-bg);color:var(--green);border-color:rgba(42,99,72,.2);">↗ Payment link</a>`
    : `<span style="font-size:10px;color:var(--text4);font-family:'DM Mono',monospace;">No payment link set</span>`;
  list.innerHTML=transfers.map(t=>`
    <div style="background:white;border:1px solid var(--border);border-left:3px solid var(--amber);border-radius:var(--r2);padding:1rem 1.25rem;margin-bottom:10px;box-shadow:var(--shadow);display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;">
      <div>
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
          <span class="pill amber">⏳ Awaiting transfer</span>
          <span style="font-family:'DM Mono',monospace;font-size:13px;font-weight:600;">${t.num}</span>
        </div>
        <div style="font-size:12px;color:var(--text3);">${fmtD(t.date)} · ${t.chan} · ${t.qty}× · <strong style="color:var(--amber);">${fmt(t.total,cur)} held</strong></div>
        <div style="font-size:11px;color:var(--text4);margin-top:3px;">${t.notes||'—'}</div>
      </div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
        ${payHtml}
        <button class="btn gold" onclick="markArtistTransferReceived(${t.id})">✓ Mark transfer received</button>
      </div>
    </div>`).join('');
}

function markExpenseReceived(id){
  const s=getState(),book=getBook(),cur=book.currency;
  const e=s.expenses.find(x=>x.id===id);
  if(!e) return;
  e.received=true;
  e.receivedDate=today();
  saveState(activeBook);
  renderPendingExpenses(); renderExpenses(); updateDash();
  showToast(`✓ Expense marked as received — ${fmt(e.amount,cur)}`);
}

function renderPendingExpenses(){
  const s=getState(),book=getBook(),cur=book.currency;
  const pending=(s.expenses||[]).filter(e=>!e.received);
  const sect=$('d-pending-expenses-sect'),list=$('d-pending-expenses-list');
  if(!sect) return;
  if(!pending.length){sect.style.display='none';return;}
  sect.style.display='';
  const artistLink=(s.artistPaymentLink||'').trim();
  const fullLink=artistLink?(artistLink.startsWith('http')?artistLink:'https://'+artistLink):'';
  const payHtml=fullLink
    ?`<a href="${fullLink}" target="_blank" class="btn sm" style="text-decoration:none;background:var(--green-bg);color:var(--green);border-color:rgba(42,99,72,.2);">↗ Payment link</a>`
    :`<span style="font-size:10px;color:var(--text4);font-family:'DM Mono',monospace;">No payment link set</span>`;
  list.innerHTML=pending.map(e=>`
    <div style="background:white;border:1px solid var(--border);border-left:3px solid var(--amber);border-radius:var(--r2);padding:1rem 1.25rem;margin-bottom:10px;box-shadow:var(--shadow);display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;">
      <div>
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
          <span class="pill amber">⏳ Awaiting payment</span>
          <span style="font-family:'DM Mono',monospace;font-size:13px;font-weight:600;">${fmt(e.amount,cur)}</span>
        </div>
        <div style="font-size:12px;color:var(--text3);">${fmtD(e.date)} · <span style="background:var(--cream3);padding:1px 7px;border-radius:100px;font-size:10px;">${e.cat}</span> · <strong style="color:var(--text2);">${e.desc}</strong></div>
        <div style="font-size:11px;color:var(--text4);margin-top:3px;">${e.ref||''}</div>
      </div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
        ${payHtml}
        <button class="btn gold" onclick="markExpenseReceived(${e.id})">✓ Mark received</button>
      </div>
    </div>`).join('');
}


function submitGratuity(){
  const book=getBook(),qty=parseInt($('g-qty').value)||1,ref=$('g-ref').value.trim(),notes=$('g-notes').value.trim(),date=$('g-date').value||today();
  const s=getState();
  if(qty>s.stock){showToast('⚠ Not enough stock on hand','warn');return;}
  const num='GRAT-'+Date.now().toString().slice(-6);
  // Reduce stock only — no revenue, no sold count
  s.stock=Math.max(0,s.stock-qty);
  if(!s.chStats['Gratuity'])s.chStats['Gratuity']={txns:0,units:0,revenue:0};
  s.chStats['Gratuity'].txns++;s.chStats['Gratuity'].units+=qty;
  s.hist.unshift({num,chan:'Gratuity',qty,price:0,after:s.stock,notes:(ref?(ref+(notes?' · '+notes:'')):notes)||'',date,gratuity:true});
  renderHist();updateDash();saveState(activeBook);
  syncToSheets({type:'order',book:book.title,date,num,chan:'Gratuity',qty,price:0,total:0,stockAfter:s.stock,notes:(ref?ref+' · ':'')+notes});
  addLog('log-gratuity',`${num}: ${qty} gifted → ${s.stock} remaining`,'ok');
  if(s.stock<=book.threshold)addLog('log-gratuity','⚠ Below threshold!','warn');
  $('g-ref').value='';$('g-qty').value='1';$('g-notes').value='';$('g-date').value=today();
  showToast('✓ Gratuity logged');
}

function storeById(id){return getState().stores.find(s=>s.id===id);}
function addStore(){
  const name=$('ns-name').value.trim();if(!name)return;
  getState().stores.push({id:Date.now(),name,contact:$('ns-contact').value.trim(),email:$('ns-email').value.trim(),city:$('ns-city').value.trim(),rate:parseFloat($('ns-rate').value)||40,terms:$('ns-terms').value,notes:$('ns-notes').value.trim(),sent:0,sold:0,returned:0,outstanding:0,amountOwed:0});
  closeM('add-store');['ns-name','ns-contact','ns-email','ns-city','ns-notes'].forEach(id=>$(id).value='');$('ns-rate').value='40';renderStores();updateDash();saveState(activeBook);showToast('✓ Store added');
}
function renderStores(){
  const s=getState(),el=$('stores-list'),book=getBook(),cur=book.currency;
  if(!s.stores.length){el.innerHTML='<div class="empty-state"><div class="e-icon">🏪</div>No stores yet. Add your first consignment account.</div>';return;}
  el.innerHTML=s.stores.map(st=>{
    const sp=st.outstanding===0&&st.sent>0?'<span class="pill gray">Settled</span>':st.amountOwed>0?'<span class="pill amber">Payment due</span>':'<span class="pill green">Active</span>';
    return`<div class="store-card"><div class="store-head"><div><div class="store-name">${st.name}</div><div class="store-meta">${[st.city,st.contact,st.email].filter(Boolean).join(' · ')} · ${st.rate}% commission · ${st.terms}</div></div>${sp}</div><div class="store-kpis"><div class="sk"><div class="sk-l">Sent</div><div class="sk-v">${st.sent}</div></div><div class="sk"><div class="sk-l">Sold</div><div class="sk-v">${st.sold}</div></div><div class="sk"><div class="sk-l">Outstanding</div><div class="sk-v ${st.outstanding>0?'warn':''}">${st.outstanding}</div></div><div class="sk"><div class="sk-l">Owed</div><div class="sk-v ${st.amountOwed>0?'warn':''}">${st.amountOwed>0?fmt(st.amountOwed,cur):'—'}</div></div></div><div class="store-actions"><button class="btn sm gold" onclick="openSend(${st.id})">Send books</button><button class="btn sm ink" onclick="openSale(${st.id})" ${!st.outstanding?'disabled':''}>Record sale</button><button class="btn sm" onclick="openRet(${st.id})" ${!st.outstanding?'disabled':''}>Return</button><button class="btn sm danger-btn" onclick="removeStore(${st.id})">Remove</button></div></div>`;
  }).join('');
}
function removeStore(id){if(!confirm('Remove store?'))return;getState().stores=getState().stores.filter(s=>s.id!==id);renderStores();updateDash();saveState(activeBook);}
function openSend(id){activeId=id;const st=storeById(id);$('send-sname').textContent=st.name;$('send-rate').value=st.rate;openM('send-books');}
function confirmSend(){
  const s=getState(),book=getBook(),st=storeById(activeId),qty=parseInt($('send-qty').value)||0,date=$('send-date').value,rate=parseFloat($('send-rate').value)||st.rate,notes=$('send-notes').value.trim();
  if(qty>s.stock){alert('Not enough stock on hand!');return;}
  s.stock-=qty;st.sent+=qty;st.outstanding+=qty;
  s.ledger.push({id:Date.now(),storeId:st.id,storeName:st.name,type:'Shipment',date,qty,rate,amountDue:0,paid:'n/a',notes,status:'sent'});
  closeM('send-books');renderStores();renderLedger();updateDash();saveState(activeBook);
  syncToSheets({type:'consignment',book:book.title,date,store:st.name,event:'Shipment',qty,rate,amountDue:0,notes,status:'sent'});
  showToast(`✓ ${qty} books sent to ${st.name}`);
}
function openSale(id){activeId=id;const book=getBook();$('sale-sym').textContent=book.currency;$('sale-price').value=book.listPrice.toFixed(2);$('sale-sname').textContent=storeById(id).name;openM('record-sale');}
function confirmSale(){
  const s=getState(),book=getBook(),cur=book.currency,st=storeById(activeId),qty=parseInt($('sale-qty').value)||0,date=$('sale-date').value,price=parseFloat($('sale-price').value)||book.listPrice,paid=$('sale-paid').value,notes=$('sale-notes').value.trim();
  if(qty>st.outstanding){alert('Qty exceeds outstanding books.');return;}
  const gross=qty*price,pub=gross*(1-st.rate/100);
  st.sold+=qty;st.outstanding-=qty;st.amountOwed+=paid==='pending'?pub:0;
  s.sold+=qty;s.revenue+=pub;
  if(!s.chStats['Consignment'])s.chStats['Consignment']={txns:0,units:0,revenue:0};
  s.chStats['Consignment'].txns++;s.chStats['Consignment'].units+=qty;s.chStats['Consignment'].revenue+=pub;
  const num='CON-'+st.name.replace(/\s+/g,'').slice(0,5).toUpperCase()+'-'+Date.now().toString().slice(-4);
  s.hist.unshift({num,chan:'Consignment',qty,price:pub/qty,after:s.stock,notes:st.name,date});
  s.ledger.push({id:Date.now(),storeId:st.id,storeName:st.name,type:'Sale',date,qty,rate:st.rate,amountDue:pub,paid,notes,status:paid});
  closeM('record-sale');renderStores();renderLedger();renderHist();updateDash();saveState(activeBook);
  syncToSheets({type:'consignment',book:book.title,date,store:st.name,event:'Sale',qty,rate:st.rate,amountDue:pub,notes,status:paid});
  showToast(`✓ Sale recorded — ${fmt(pub,cur)} due to you`);
}
function openRet(id){activeId=id;$('ret-sname').textContent=storeById(id).name;openM('return');}
function confirmReturn(){
  const s=getState(),book=getBook(),st=storeById(activeId),qty=parseInt($('ret-qty').value)||0,date=$('ret-date').value,cond=$('ret-cond').value,notes=$('ret-notes').value.trim();
  if(qty>st.outstanding){alert('Qty exceeds outstanding.');return;}
  st.returned+=qty;st.outstanding-=qty;const good=cond.startsWith('Good');if(good)s.stock+=qty;
  s.ledger.push({id:Date.now(),storeId:st.id,storeName:st.name,type:'Return',date,qty,rate:st.rate,amountDue:0,paid:'n/a',notes:(notes?notes+' · ':'')+cond,status:good?'restocked':'written off'});
  closeM('return');renderStores();renderLedger();updateDash();saveState(activeBook);
  syncToSheets({type:'consignment',book:book.title,date,store:st.name,event:'Return',qty,rate:st.rate,amountDue:0,notes:cond,status:good?'restocked':'written off'});
  showToast(good?`✓ ${qty} books returned to stock`:`✓ ${qty} books written off`);
}
function markPaid(lid){
  const s=getState(),book=getBook(),e=s.ledger.find(x=>x.id===lid);if(!e)return;
  const st=storeById(e.storeId);if(st)st.amountOwed=Math.max(0,st.amountOwed-e.amountDue);
  e.paid='paid';e.status='paid';renderLedger();renderStores();updateDash();saveState(activeBook);
  showToast(`✓ Payment of ${fmt(e.amountDue,book.currency)} marked as received`);
}
function renderLedger(){
  const s=getState(),book=getBook(),cur=book.currency,b=$('ledger-body');
  if(!s.ledger.length){b.innerHTML='<tr><td colspan="8"><div class="empty-state" style="padding:1rem;">No entries.</div></td></tr>';return;}
  const pill=e=>{
    if(e.voided)return'<span class="void-badge">Void</span>';
    if(e.type==='Shipment')return'<span class="pill blue">Sent</span>';
    if(e.status==='paid')return'<span class="pill green">Paid</span>';
    if(e.status==='pending')return'<span class="pill amber">Pending</span>';
    if(e.status==='restocked')return'<span class="pill green">Restocked</span>';
    if(e.status==='written off')return'<span class="pill red">Written off</span>';
    return`<span class="pill gray">${e.status}</span>`;
  };
  // Map ledger indices so edit buttons can reference them correctly (ledger is displayed reversed)
  const indexed = s.ledger.map((e,i)=>({e,i}));
  b.innerHTML=[...indexed].reverse().map(({e,i})=>{
    const voided = e.voided?' voided':'';
    const editBtn = isAuthor() ? '' : `<button class="edit-btn" onclick="openEditLedger(${i})" title="Edit entry">✎</button>`;
    return`<tr class="${voided}"><td style="font-size:12px;color:var(--text3);">${fmtD(e.date)}</td><td style="font-weight:600;">${e.storeName}${editBtn}</td><td>${e.type}</td><td class="r">${e.qty}</td><td class="r">${e.type==='Sale'?e.rate+'%':'—'}</td><td class="r" style="font-weight:600;">${e.amountDue>0?fmt(e.amountDue,cur):'—'}</td><td style="font-size:12px;color:var(--text3);">${e.notes||'—'}</td><td>${pill(e)}${e.status==='pending'&&!e.voided?` <button class="btn sm" style="margin-left:6px;" onclick="markPaid(${e.id})">Mark paid</button>`:''}</td></tr>`;
  }).join('');
}

// ── EDIT & VOID SYSTEM ─────────────────────────────────────────────────────
let editCtx = null; // { kind:'hist'|'ledger', idx, snapshot }

function openEditHist(idx) {
  const s = getState(), book = getBook(), h = s.hist[idx];
  if (!h) return;
  editCtx = { kind:'hist', idx, snapshot: JSON.parse(JSON.stringify(h)) };
  $('edit-modal-title').textContent = 'Edit order entry';
  $('edit-modal-type-badge').textContent = h.chan + ' order';
  $('edit-order-fields').style.display = '';
  $('edit-ledger-fields').style.display = 'none';
  $('edit-sym').textContent = book.currency;
  $('edit-num').value = h.num;
  $('edit-date').value = h.date;
  $('edit-qty').value = h.qty;
  $('edit-price').value = h.price.toFixed(2);
  $('edit-chan').value = h.chan;
  $('edit-notes').value = h.notes || '';
  $('edit-diff-preview').style.display = 'none';
  const voidZone = $('edit-void-zone');
  if (h.voided) {
    $('edit-void-btn').textContent = 'Unvoid this entry';
    $('edit-void-body').textContent = 'This entry is currently voided. Unvoiding will re-apply its stock and revenue effects.';
  } else {
    $('edit-void-btn').textContent = 'Void this entry';
    $('edit-void-body').textContent = 'Voiding reverses all stock and revenue effects. The entry stays visible as struck-through for your records.';
  }
  openM('edit-entry');
}

function openEditLedger(idx) {
  const s = getState(), book = getBook(), e = s.ledger[idx];
  if (!e) return;
  editCtx = { kind:'ledger', idx, snapshot: JSON.parse(JSON.stringify(e)) };
  $('edit-modal-title').textContent = 'Edit consignment entry';
  $('edit-modal-type-badge').textContent = e.storeName + ' · ' + e.type;
  $('edit-order-fields').style.display = 'none';
  $('edit-ledger-fields').style.display = '';
  $('edit-l-date').value = e.date;
  $('edit-l-qty').value = e.qty;
  $('edit-l-rate').value = e.rate;
  $('edit-l-notes').value = e.notes || '';
  if (e.voided) {
    $('edit-void-btn').textContent = 'Unvoid this entry';
    $('edit-void-body').textContent = 'This entry is currently voided. Unvoiding will re-apply its effects on consignment stock and payments.';
  } else {
    $('edit-void-btn').textContent = 'Void this entry';
    $('edit-void-body').textContent = 'Voiding reverses the qty and payment effects of this entry. It stays visible as struck-through.';
  }
  openM('edit-entry');
}

function saveEntryEdit() {
  if (!editCtx) return;
  const s = getState(), book = getBook();
  if (editCtx.kind === 'hist') {
    const old = editCtx.snapshot;
    const h = s.hist[editCtx.idx];
    const newQty = parseInt($('edit-qty').value) || old.qty;
    const newPrice = parseFloat($('edit-price').value) || old.price;
    const newChan = $('edit-chan').value;
    const newNum = $('edit-num').value.trim() || old.num;
    const newDate = $('edit-date').value || old.date;
    const newNotes = $('edit-notes').value.trim();

    if (!h.voided) {
      // Reverse old effect
      s.stock += old.qty;
      s.sold -= old.qty;
      s.revenue -= old.qty * old.price;
      if (s.chStats[old.chan]) {
        s.chStats[old.chan].txns--;
        s.chStats[old.chan].units -= old.qty;
        s.chStats[old.chan].revenue -= old.qty * old.price;
        if (s.chStats[old.chan].txns <= 0) delete s.chStats[old.chan];
      }
      // Apply new effect
      s.stock = Math.max(0, s.stock - newQty);
      s.sold += newQty;
      s.revenue += newQty * newPrice;
      if (!s.chStats[newChan]) s.chStats[newChan] = {txns:0,units:0,revenue:0};
      s.chStats[newChan].txns++;
      s.chStats[newChan].units += newQty;
      s.chStats[newChan].revenue += newQty * newPrice;
    }

    // Update the record
    h.num = newNum; h.chan = newChan; h.qty = newQty; h.price = newPrice;
    h.date = newDate; h.notes = newNotes;
    // Recalculate "after" for this entry; for simplicity mark it as edited
    h.edited = true;

  } else {
    // Ledger entry edit (date, qty, rate, notes — non-destructive for stock, 
    // since consignment stock effects are complex; just update the displayed values)
    const e = s.ledger[editCtx.idx];
    e.date = $('edit-l-date').value || e.date;
    e.notes = $('edit-l-notes').value.trim();
    // qty and rate — update display only, reverse/reapply amountDue if sale
    const newQty = parseInt($('edit-l-qty').value) || e.qty;
    const newRate = parseFloat($('edit-l-rate').value) || e.rate;
    if (e.type === 'Sale' && !e.voided) {
      // Find the store and adjust owed
      const st = getState().stores.find(st=>st.id===e.storeId);
      if (st) {
        const oldDue = e.amountDue;
        // We need the sale price — estimate from old amountDue
        const salePrice = oldDue > 0 ? (oldDue / (e.qty * (1 - e.rate/100))) : book.listPrice;
        const newDue = newQty * salePrice * (1 - newRate/100);
        if (e.paid === 'pending' && st) {
          st.amountOwed = Math.max(0, st.amountOwed - oldDue + newDue);
        }
        s.revenue = Math.max(0, s.revenue - oldDue + newDue);
        if (s.chStats['Consignment']) {
          s.chStats['Consignment'].revenue = Math.max(0, s.chStats['Consignment'].revenue - oldDue + newDue);
          s.chStats['Consignment'].units += (newQty - e.qty);
        }
        st.sold += (newQty - e.qty);
        e.amountDue = newDue;
      }
    }
    e.qty = newQty;
    e.rate = newRate;
    e.edited = true;
  }

  closeM('edit-entry');
  renderAll(); updateDash(); saveState(activeBook);
  showToast('✓ Entry updated');
}

function voidEntry() {
  if (!editCtx) return;
  const s = getState(), book = getBook();

  if (editCtx.kind === 'hist') {
    const h = s.hist[editCtx.idx];
    if (!h) return;
    if (!h.voided) {
      // VOID: reverse effects
      s.stock += h.qty;
      s.sold = Math.max(0, s.sold - h.qty);
      s.revenue = Math.max(0, s.revenue - h.qty * h.price);
      if (s.chStats[h.chan]) {
        s.chStats[h.chan].txns = Math.max(0, s.chStats[h.chan].txns - 1);
        s.chStats[h.chan].units = Math.max(0, s.chStats[h.chan].units - h.qty);
        s.chStats[h.chan].revenue = Math.max(0, s.chStats[h.chan].revenue - h.qty * h.price);
        if (s.chStats[h.chan].txns <= 0) delete s.chStats[h.chan];
      }
      h.voided = true;
      showToast('Entry voided — stock & revenue reversed', 'warn');
    } else {
      // UNVOID: re-apply effects
      s.stock = Math.max(0, s.stock - h.qty);
      s.sold += h.qty;
      s.revenue += h.qty * h.price;
      if (!s.chStats[h.chan]) s.chStats[h.chan] = {txns:0,units:0,revenue:0};
      s.chStats[h.chan].txns++;
      s.chStats[h.chan].units += h.qty;
      s.chStats[h.chan].revenue += h.qty * h.price;
      h.voided = false;
      showToast('Entry unvoided — effects restored');
    }
  } else {
    const e = s.ledger[editCtx.idx];
    if (!e) return;
    const st = s.stores.find(st=>st.id===e.storeId);
    if (!e.voided) {
      // VOID consignment entry
      if (e.type === 'Shipment' && st) { st.sent = Math.max(0,st.sent-e.qty); st.outstanding = Math.max(0,st.outstanding-e.qty); s.stock += e.qty; }
      if (e.type === 'Sale' && st) { st.sold = Math.max(0,st.sold-e.qty); st.outstanding += e.qty; s.sold = Math.max(0,s.sold-e.qty); s.revenue = Math.max(0,s.revenue-e.amountDue); if(e.paid==='pending')st.amountOwed = Math.max(0,st.amountOwed-e.amountDue); if(s.chStats['Consignment']){s.chStats['Consignment'].txns=Math.max(0,s.chStats['Consignment'].txns-1);s.chStats['Consignment'].units=Math.max(0,s.chStats['Consignment'].units-e.qty);s.chStats['Consignment'].revenue=Math.max(0,s.chStats['Consignment'].revenue-e.amountDue);} }
      if (e.type === 'Return' && st) { st.returned = Math.max(0,st.returned-e.qty); st.outstanding += e.qty; if(e.status==='restocked') s.stock = Math.max(0,s.stock-e.qty); }
      e.voided = true;
      showToast('Consignment entry voided — effects reversed', 'warn');
    } else {
      // UNVOID consignment entry
      if (e.type === 'Shipment' && st) { st.sent += e.qty; st.outstanding += e.qty; s.stock = Math.max(0,s.stock-e.qty); }
      if (e.type === 'Sale' && st) { st.sold += e.qty; st.outstanding = Math.max(0,st.outstanding-e.qty); s.sold += e.qty; s.revenue += e.amountDue; if(e.paid==='pending')st.amountOwed += e.amountDue; if(!s.chStats['Consignment'])s.chStats['Consignment']={txns:0,units:0,revenue:0}; s.chStats['Consignment'].txns++;s.chStats['Consignment'].units+=e.qty;s.chStats['Consignment'].revenue+=e.amountDue; }
      if (e.type === 'Return' && st) { st.returned += e.qty; st.outstanding = Math.max(0,st.outstanding-e.qty); if(e.status==='restocked')s.stock += e.qty; }
      e.voided = false;
      showToast('Consignment entry unvoided — effects restored');
    }
  }

  closeM('edit-entry');
  renderAll(); updateDash(); saveState(activeBook);
}

// ── RESET
function resetBookData(){
  const book=getBook();
  if(!confirm(`Reset ALL data for "${book.title}"? Orders, history and consignment will be cleared. Your Google Sheet backup is untouched.`))return;
  if(!confirm('Last chance — this cannot be undone. Reset now?'))return;
  states[activeBook]=defaultState(book);lastSavedHashes[activeBook]='';
  renderAll();saveState(activeBook);showToast('✓ Book data reset. Sheet backup untouched.','warn',4000);
}

// ── MODAL HELPERS
function openM(id){$('m-'+id).style.display='flex';const d=id==='send-books'?'send-date':id==='record-sale'?'sale-date':'ret-date';if($(d))$(d).value=today();}
function closeM(id){$('m-'+id).style.display='none';}
function addLog(lid,msg,type=''){const el=$(lid);el.style.display='block';const s=document.createElement('span');s.className='log-line '+type;s.textContent=new Date().toLocaleTimeString()+' · '+msg;el.appendChild(s);el.scrollTop=el.scrollHeight;}

// ── GOOGLE SHEETS
function updateSheetsBadge(){
  [$('sheets-badge'),$('sheets-badge2')].forEach(b=>{
    if(!b)return;
    b.textContent=sheetsUrl?'📊 Sheets: live':'📊 Sheets: not set up';
    b.className=sheetsUrl?'sheets-badge':'sheets-badge off';
  });
  const openLink=$('sheets-open-link');if(openLink){if(sheetsSpreadsheetUrl){openLink.href=sheetsSpreadsheetUrl;openLink.style.display='';}else openLink.style.display='none';}
  const cardLink=$('open-sheet-link');if(cardLink){if(sheetsSpreadsheetUrl){cardLink.href=sheetsSpreadsheetUrl;cardLink.style.display='';}else cardLink.style.display='none';}
}
function normalizeAppsScriptUrl(rawUrl){
  const cleaned=(rawUrl||'').trim();
  if(!cleaned) return '';
  try{
    const u=new URL(cleaned);
    if(!/script\.google\.com$/i.test(u.hostname)) return '';
    // Support URLs with /u/index/ segments (multi-account login)
    const m=u.pathname.match(/\/macros\/(?:u\/\d+\/)?s\/([^/]+)\/(exec|dev)/i);
    if(!m) return '';
    const deploymentId=m[1];
    const type=m[2];
    
    u.pathname=`/macros/s/${deploymentId}/${type}`;
    u.search='';
    u.hash='';
    return u.toString();
  }catch(_){
    return '';
  }
}
async function probeSheetsConnection(url){
  // 1. Try a GET handshake first (Most reliable for initial verification)
  try {
    const res = await fetch(url);
    if (res.ok) {
      const json = await res.json().catch(() => null);
      if (json && json.service === 'lyrical-sheets-webhook-v2') {
        return { ok: true, method: 'GET', sheetName: json.sheetName };
      }
    }
  } catch (e) {
    console.warn('GET probe failed', e);
  }

  // 2. Try a POST probe if GET failed or we want to verify write-access
  const probePayload = {
    version: 2,
    eventId: `probe-${Date.now().toString(36)}`,
    sentAt: new Date().toISOString(),
    payload: {
      type: 'order',
      book: 'Connection Probe',
      date: today(),
      num: 'PROBE',
      chan: 'Probe',
      qty: 0,
      price: 0,
      total: 0,
      stockAfter: 0,
      notes: 'Connection probe'
    }
  };
  
  const res = await fetch(url, {
    method: 'POST',
    mode: 'cors',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(probePayload)
  });
  
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json().catch(() => null);
  if (!json || json.ok !== true) throw new Error('Probe response was not { ok: true }');
  
  return { ok: true, method: 'POST' };
}

async function connectSheets(){
  const rawUrl=$('sheets-url-input').value.trim(),spreadUrl=($('sheets-spreadsheet-input').value||'').trim();
  const normalizedUrl=normalizeAppsScriptUrl(rawUrl);
  if(!normalizedUrl){showToast('Paste a deployed Web App URL (…/macros/s/<id>/exec)','warn');return;}
  if(rawUrl.includes('/dev')) showToast('Using /exec endpoint for public sync (recommended).','warn',3000);
  try{
    const info = await probeSheetsConnection(normalizedUrl);
    showToast(`✓ Connection verified: ${info.sheetName || 'Active'}`);
  }catch(e){
    // If the error is 'Failed to fetch', it's likely a CORS issue.
    // Since we have a no-cors fallback for actual data delivery,
    // let's show a helpful warning but still allow the connection.
    if ((e && e.message && e.message.includes('fetch')) || !navigator.onLine) {
      showToast('⚠ Connection unverified (CORS). Link saved anyway — try a test row.', 'warn', 5000);
    } else {
      showToast(`Connection error: ${e.message || 'Unknown'}`,'err', 4000);
      return;
    }
  }
  sheetsUrl=normalizedUrl;localStorage.setItem('lm-sheets-url',normalizedUrl);
  if(spreadUrl){
    sheetsSpreadsheetUrl=spreadUrl;
    localStorage.setItem('lm-sheets-spreadsheet-url',spreadUrl);
  }else{
    sheetsSpreadsheetUrl='';
    localStorage.removeItem('lm-sheets-spreadsheet-url');
  }
  showSheetsConnected();
  showToast('✓ Google Sheets connected and verified!');
}
function disconnectSheets(){if(!confirm('Disconnect?'))return;sheetsUrl='';sheetsSpreadsheetUrl='';localStorage.removeItem('lm-sheets-url');localStorage.removeItem('lm-sheets-spreadsheet-url');localStorage.removeItem('lm-sheets-secret');$('sheets-setup-card').style.display='';$('sheets-connected-card').style.display='none';updateSheetsBadge();showToast('Sheets disconnected','warn');}
function showSheetsConnected(){$('sheets-setup-card').style.display='none';$('sheets-connected-card').style.display='';$('sheets-url-display').textContent=sheetsUrl;updateSheetsBadge();}
function testSheets(){
  if(!sheetsUrl)return;
  const btn=document.querySelector('[onclick="testSheets()"]');
  if(btn){btn.textContent='Testing…';btn.disabled=true;}
  // Use POST so verification works even when Apps Script has no doGet().
  syncToSheets({
    type:'order',
    book:'Test',
    date:today(),
    num:'TEST-'+Date.now().toString().slice(-4),
    chan:'Test',
    qty:0,
    price:0,
    total:0,
    stockAfter:0,
    notes:'Connection test — check your sheet for this row'
  });
  showToast('✓ Test row sent — check your Google Sheet');
  setTimeout(()=>{if(btn){btn.textContent='Test connection';btn.disabled=false;}},500);
}
// Sheets delivery engine (rebuilt): durable queue + retry + deterministic event IDs
const SHEETS_QUEUE_KEY='lm-sheets-write-queue-v2';
const SHEETS_LOG_KEY='lm-sheets-log-v2';
const MAX_SHEETS_RETRIES=6;
const RETRY_BASE_MS=1200;
let _sheetsQueue=JSON.parse(localStorage.getItem(SHEETS_QUEUE_KEY)||'[]');
let _sheetsWriting=false;
let sheetsLog=JSON.parse(localStorage.getItem(SHEETS_LOG_KEY)||'[]');

function persistSheetsQueue(){ localStorage.setItem(SHEETS_QUEUE_KEY, JSON.stringify(_sheetsQueue)); }
function persistSheetsLog(){ localStorage.setItem(SHEETS_LOG_KEY, JSON.stringify(sheetsLog)); }
function makeEventId(){ return `evt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,9)}`; }
function retryDelayMs(attempt){ return Math.min(60000, RETRY_BASE_MS * Math.pow(2, Math.max(0,attempt-1))); }

async function postToSheets(body){
  const payload = JSON.stringify(body);
  
  try{
    const res=await fetch(sheetsUrl,{
      method:'POST',
      mode:'cors',
      headers:{
        'Content-Type':'text/plain;charset=utf-8'
      },
      body:payload
    });
    if(!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json().catch(()=>null);
    if (data && data.ok) return 'ok';
    if (data && data.error) throw new Error(data.error);
    return 'ok';
  }catch(e){
    // Fallback to no-cors for strict environments.
    await fetch(sheetsUrl, {
      method:'POST',
      mode:'no-cors',
      headers:{
        'Content-Type':'text/plain;charset=utf-8'
      },
      body:payload
    });
    return 'unknown';
  }
}

async function _processQueue(){
  if(_sheetsWriting||!_sheetsQueue.length||!sheetsUrl||!navigator.onLine)return;
  _sheetsWriting=true;
  const item=_sheetsQueue[0];
  try{
    await postToSheets({
      version:2,
      eventId:item.id,
      sentAt:new Date().toISOString(),
      payload:item.payload
    });
    addSheetsLog(item.book,item.type,item.summary,'ok');
    _sheetsQueue.shift();
    persistSheetsQueue();
    updateBulkProgress();
  }catch(e){
    item.attempts=(item.attempts||0)+1;
    item.lastError=(e&&e.message)||'network error';
    item.nextTryAt=Date.now()+retryDelayMs(item.attempts);
    persistSheetsQueue();
    if(item.attempts>=MAX_SHEETS_RETRIES){
      addSheetsLog(item.book,item.type,item.summary+' [max retries reached]','err');
      _sheetsQueue.shift();
      persistSheetsQueue();
      updateBulkProgress();
    }else{
      addSheetsLog(item.book,item.type,item.summary+` [retry ${item.attempts}/${MAX_SHEETS_RETRIES}]`,'retry');
    }
  }
  _sheetsWriting=false;
  const next=_sheetsQueue[0];
  if(next){
    const wait=Math.max(250, (next.nextTryAt||0)-Date.now());
    setTimeout(_processQueue, wait);
  }
}

function syncToSheets(payload){
  if(!sheetsUrl)return;
  const summary=payload.type==='order'
    ?`${payload.num} · ${payload.chan} · ${payload.qty}×`
    :`${payload.store} · ${payload.event} · ${payload.qty}×`;
  _sheetsQueue.push({
    id:makeEventId(),
    payload,
    summary,
    book:payload.book,
    type:payload.type==='order'?'Order':'Consignment',
    attempts:0,
    nextTryAt:Date.now()
  });
  persistSheetsQueue();
  addSheetsLog(payload.book,payload.type==='order'?'Order':'Consignment',summary,'queued');
  _processQueue();
}

let _isBulkSync = false;
let _bulkTotal = 0;
let _bulkDone = 0;

async function pushAllToSheets() {
  if(!sheetsUrl) { showToast('Connect Google Sheets first','warn'); return; }
  if(!confirm('This will enqueue all historical records for all books, then deliver them with retry. Continue?')) return;

  const btn = $('push-all-btn');
  const bar = $('sync-progress-bar');
  const fill = $('sync-progress-fill');
  const stats = $('sync-stats');

  _isBulkSync = true;
  btn.disabled = true;
  btn.textContent = 'Queueing...';
  bar.style.display = 'block';
  stats.style.display = 'block';
  fill.style.width = '0%';

  const toSync = [];
  Object.keys(BOOKS).forEach(bid => {
    const s = states[bid] || defaultState(BOOKS[bid]);
    const book = BOOKS[bid];
    (s.hist || []).forEach(h => toSync.push({
      type:'order', book:book.title, date:h.date, num:h.num, chan:h.chan,
      qty:h.qty, price:h.price, total:h.qty*h.price, stockAfter:h.after,
      notes:(h.voided?'[VOID] ':'')+(h.notes||'')
    }));
    (s.ledger || []).forEach(e => toSync.push({
      type:'consignment', book:book.title, date:e.date, store:e.storeName,
      event:e.type, qty:e.qty, rate:e.rate, amountDue:e.amountDue,
      notes:(e.voided?'[VOID] ':'')+(e.notes||''), status:e.status
    }));
  });

  _bulkTotal = toSync.length;
  _bulkDone = 0;

  if(_bulkTotal === 0) {
    showToast('No records found to sync','warn');
    _isBulkSync = false;
    btn.disabled = false;
    btn.textContent = 'Sync all data';
    bar.style.display = 'none';
    stats.style.display = 'none';
    return;
  }

  stats.textContent = `Queueing ${_bulkTotal} records...`;
  for(const row of toSync) syncToSheets(row);
  btn.textContent = 'Syncing...';
}

function updateBulkProgress() {
  if(!_isBulkSync) return;
  _bulkDone++;
  const pct = Math.min(100, (_bulkDone / _bulkTotal) * 100);
  const fill = $('sync-progress-fill');
  const stats = $('sync-stats');
  const btn = $('push-all-btn');

  if(fill) fill.style.width = pct + '%';
  if(stats) stats.textContent = `Syncing: ${_bulkDone} / ${_bulkTotal} (${Math.round(pct)}%)`;

  if(_bulkDone >= _bulkTotal) {
    _isBulkSync = false;
    if(btn) { btn.disabled = false; btn.textContent = 'Sync all data'; }
    if(stats) stats.textContent = `✓ Queue processed: ${_bulkTotal} records.`;
    showToast(`✓ Sheets queue processed: ${_bulkTotal} records.`);
    setTimeout(() => {
      if(!_isBulkSync) {
        if($('sync-progress-bar')) $('sync-progress-bar').style.display = 'none';
        if($('sync-stats')) $('sync-stats').style.display = 'none';
      }
    }, 4000);
  }
}

function addSheetsLog(book,type,summary,status){
  sheetsLog.unshift({time:new Date().toLocaleTimeString(),book,type,summary,status});
  if(sheetsLog.length>120)sheetsLog.pop();
  persistSheetsLog();
  renderSheetsLog();
}
function renderSheetsLog(){
  const b=$('sheets-log-body');
  if(!b) return;
  if(!sheetsLog.length){
    b.innerHTML='<tr><td colspan="5" style="text-align:center;padding:1.5rem;color:var(--text3);font-size:12px;">No sync events yet.</td></tr>';
    return;
  }
  const labelFor=(st)=> st==='ok'?'Written':st==='unknown'?'Sent (unverified)':st==='queued'?'Queued':st==='retry'?'Retrying':'Failed';
  const classFor=(st)=> st==='ok'||st==='unknown'?'ok':st==='queued'||st==='retry'?'syncing':'err';
  b.innerHTML=sheetsLog.map(l=>`<tr><td style="white-space:nowrap;">${l.time}</td><td style="font-size:11px;color:var(--text3);">${l.book}</td><td>${l.type}</td><td style="color:var(--text2);font-size:12px;">${l.summary}</td><td><span class="log-status ${classFor(l.status)}"></span><span style="color:${classFor(l.status)==='err'?'var(--red)':'var(--green)'};">${labelFor(l.status)}</span></td></tr>`).join('');
}
function copyGasCode(){navigator.clipboard.writeText($('gas-code').textContent).then(()=>showToast('✓ Code copied!'));}
async function verifyUrl(){
  if(!sheetsUrl)return;
  const btn=$('verify-url-btn');
  if(btn){ btn.textContent='Verifying...'; btn.disabled=true; }
  
  try {
    // Try a GET request first to see if the endpoint is alive
    const res = await fetch(sheetsUrl);
    if(res.ok) {
      const data = await res.json();
      if(data && data.service === 'lyrical-sheets-webhook-v2') {
        showToast(`✓ Connection verified: ${data.sheetName || 'Active'}`);
        addSheetsLog('System', 'Verify', 'Handshake successful', 'ok');
      } else {
        showToast('⚠ Unexpected response from URL', 'warn');
      }
    } else {
       // If GET fails but URL looks right, it might be a POST-only deployment or CORS
       showToast('Queuing test row (GET unverified)', 'warn');
    }
  } catch(e) {
    showToast('Queuing test row (Network check failed)', 'warn');
  }

  syncToSheets({
    type:'order',book:'Test',date:today(),num:'VERIFY-'+Date.now().toString().slice(-4),
    chan:'Verify URL',qty:0,price:0,total:0,stockAfter:0,notes:'Verify URL button test'
  });
  
  setTimeout(() => { if(btn){ btn.textContent='↗ Verify URL'; btn.disabled=false; } }, 1000);
}
window.addEventListener('online',()=>_processQueue());
setTimeout(()=>_processQueue(),300);

// ── DATA BACKUPS & PORTABILITY
function exportToJSON() {
  const data = buildBackupPayload();
  
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `lyrical-backup-${today()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  
  localStorage.setItem('lm-last-backup-ts', Date.now().toString());
  updateLastBackupDisplay();
  if($('backup-reminder')) $('backup-reminder').style.display = 'none';
  showToast('✓ JSON Backup downloaded');
}

function maybeAutoDownloadDailyBackup() {
  // Auto-download once per calendar day (local time) when app is opened.
  // This still requires the app to be open on that day.
  const todayKey = new Date().toLocaleDateString('sv-SE'); // YYYY-MM-DD
  const lastAutoDay = localStorage.getItem('lm-last-auto-backup-day');
  if (lastAutoDay === todayKey) return;

  const lastManualOrAutoTs = parseInt(localStorage.getItem('lm-last-backup-ts') || '0', 10);
  if (Number.isFinite(lastManualOrAutoTs) && lastManualOrAutoTs > 0) {
    const lastDate = new Date(lastManualOrAutoTs).toLocaleDateString('sv-SE');
    if (lastDate === todayKey) {
      localStorage.setItem('lm-last-auto-backup-day', todayKey);
      return;
    }
  }

  exportToJSON();
  localStorage.setItem('lm-last-auto-backup-day', todayKey);
}

function updateLastBackupDisplay() {
  const ts = localStorage.getItem('lm-last-backup-ts');
  const el = $('last-backup-display');
  if (!el) return;
  if (!ts) { el.textContent = 'Last backup: Never'; return; }
  const date = new Date(parseInt(ts));
  el.textContent = `Last backup: ${date.toLocaleDateString()} at ${date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`;
}

function checkDailyBackup() {
  const ts = localStorage.getItem('lm-last-backup-ts');
  const now = Date.now();
  const ONE_DAY = 24 * 60 * 60 * 1000;
  
  if (!ts || (now - parseInt(ts)) > ONE_DAY) {
    if($('backup-reminder')) $('backup-reminder').style.display = 'flex';
  } else {
    if($('backup-reminder')) $('backup-reminder').style.display = 'none';
  }
}

function buildBackupPayload() {
  return {
    version: '2.5',
    timestamp: new Date().toISOString(),
    BOOKS: BOOKS,
    states: states,
    productionCosts: JSON.parse(localStorage.getItem('lm-production-costs') || '{}'),
    paymentLinks: JSON.parse(localStorage.getItem('lm-payment-links') || '{}')
  };
}

async function saveSystemBackups() {
  await window._fbSaveSettings(SYSTEM_BACKUP_KEY, systemBackups);
}

async function loadSystemBackups() {
  try {
    const stored = await window._fbLoadSettings(SYSTEM_BACKUP_KEY);
    systemBackups = Array.isArray(stored) ? stored : [];
  } catch (e) {
    systemBackups = [];
  }
  renderSystemBackups();
}

function renderSystemBackups() {
  const body = $('system-backup-list');
  const status = $('system-backup-status');
  if (!body) return;

  if (!systemBackups.length) {
    body.innerHTML = '<tr><td colspan="4"><div class="empty-state">No system backups yet.</div></td></tr>';
    if (status) status.textContent = 'No automatic backups yet.';
    return;
  }

  const sorted = [...systemBackups].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  body.innerHTML = sorted.map(b => `
    <tr>
      <td>${new Date(b.createdAt).toLocaleString()}</td>
      <td>${b.type === 'manual' ? 'Manual' : 'Auto daily'}</td>
      <td class="r">${Object.keys(b.snapshot?.BOOKS || {}).length}</td>
      <td class="r"><button class="btn sm" onclick="restoreSystemBackup('${b.id}')">Restore</button></td>
    </tr>
  `).join('');

  const latest = sorted[0];
  if (status) status.textContent = `Latest system backup: ${new Date(latest.createdAt).toLocaleString()}`;
}

async function createSystemBackup(type = 'auto') {
  const dayKey = today();
  if (type === 'auto' && systemBackups.some(b => b.dayKey === dayKey)) return false;

  const entry = {
    id: `sb-${Date.now()}`,
    dayKey,
    type,
    createdAt: Date.now(),
    snapshot: buildBackupPayload()
  };
  systemBackups.unshift(entry);
  if (systemBackups.length > SYSTEM_BACKUP_LIMIT) {
    systemBackups = systemBackups.slice(0, SYSTEM_BACKUP_LIMIT);
  }
  await saveSystemBackups();
  renderSystemBackups();
  return true;
}

async function ensureDailySystemBackup() {
  if (!isPublisherSession() || isAuthor()) return;
  await loadSystemBackups();
  const created = await createSystemBackup('auto');
  if (created) showToast('✓ Daily system backup created');
}

async function createSystemBackupNow() {
  await loadSystemBackups();
  await createSystemBackup('manual');
  showToast('✓ System backup created');
}

async function applyBackupData(data) {
  // 1. Restore Catalog
  BOOKS = data.BOOKS;
  await window._fbSaveCatalog(BOOKS);

  // 2. Restore individual book states
  for (const bid in data.states) {
    await window._fbSave(bid, JSON.stringify(data.states[bid]));
  }

  // 3. Metadata
  if (data.productionCosts) {
    await window._fbSaveSettings('productionCosts', data.productionCosts);
    localStorage.setItem('lm-production-costs', JSON.stringify(data.productionCosts));
  }
  if (data.paymentLinks) {
    await window._fbSaveSettings('paymentLinks', data.paymentLinks);
    localStorage.setItem('lm-payment-links', JSON.stringify(data.paymentLinks));
  }
}

async function restoreSystemBackup(id) {
  const backup = systemBackups.find(b => b.id === id);
  if (!backup || !backup.snapshot) return;
  if (!confirm('Restore this system backup? This will OVERWRITE your current database and reload the app.')) return;
  try {
    await applyBackupData(backup.snapshot);
    showToast('✓ System backup restored! Reloading...');
    setTimeout(() => location.reload(), 1500);
  } catch (e) {
    console.error('System restore failed', e);
    showToast('Error restoring system backup', 'err');
  }
}

async function handleBackupImportFile(e) {
  const file = e.target.files[0];
  if (!file) return;
  
  const info = $('import-info');
  if (info) info.textContent = `Reading ${file.name}...`;
  
  const reader = new FileReader();
  reader.onload = async (event) => {
    try {
      const data = JSON.parse(event.target.result);
      if (!data.BOOKS || !data.states) throw new Error('Invalid backup format: Missing core data');
      
      if (!confirm('Are you sure? This will OVERWRITE your entire existing database and reload the app.')) {
        if (info) info.textContent = 'Import cancelled';
        return;
      }
      
      await applyBackupData(data);
      
      showToast('✓ Restore successful! Reloading...');
      setTimeout(() => location.reload(), 1500);
      
    } catch (err) {
      console.error('Import failed', err);
      showToast('Error: Invalid backup file', 'err');
      if (info) info.textContent = 'Import failed (invalid file)';
    }
  };
  reader.readAsText(file);
}

function exportAllToCSV() {
  const rows = [['Date', 'Book', 'Type', 'Reference', 'Channel/Store', 'Qty', 'Price/Rate', 'Total', 'Status', 'Notes']];
  
  Object.keys(BOOKS).forEach(bid => {
    const s = states[bid] || defaultState(BOOKS[bid]);
    const bookTitle = BOOKS[bid].title;
    
    // History
    (s.hist || []).forEach(h => {
      rows.push([
        h.date, bookTitle, 'Order', h.num, h.chan, h.qty, h.price, h.qty * h.price, 
        h.voided ? 'VOID' : 'OK', h.notes || ''
      ]);
    });
    
    // Ledger
    (s.ledger || []).forEach(l => {
      rows.push([
        l.date, bookTitle, 'Consignment', l.event || l.type, l.storeName, l.qty, l.rate, l.amountDue,
        l.status || 'OK', l.notes || ''
      ]);
    });
  });
  
  if (rows.length === 1) { showToast('No records to export', 'warn'); return; }
  
  const csvContent = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `lyrical-records-export-${today()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('✓ CSV Export downloaded');
}

// ── PAYMENT LINKS
function renderProductionCostFields(){
  const container=$('production-cost-fields');
  if(!container)return;
  container.innerHTML=Object.values(BOOKS).map(book=>`
    <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
      <div style="display:flex;align-items:center;gap:8px;min-width:220px;">
        <div style="width:8px;height:8px;border-radius:50%;background:${book.accent};flex-shrink:0;"></div>
        <span style="font-size:13px;font-weight:600;color:var(--text);">${book.title}</span>
        <span style="font-size:11px;color:var(--text3);">${book.currency}</span>
      </div>
      <div class="form-group" style="flex:1;margin:0;">
        <div class="price-wrap">
          <span class="sym">${book.currency}</span>
          <input type="number" id="pc-${book.id}" value="${book.productionCost||''}" placeholder="0.00" step="0.01" min="0">
        </div>
      </div>
    </div>`).join('');
}

async function saveProductionCosts(){
  const stored={};
  Object.values(BOOKS).forEach(book=>{
    const inp=$('pc-'+book.id);
    if(inp){ const val=parseFloat(inp.value)||0; book.productionCost=val; stored[book.id]=val; }
  });
  // Save to Firebase + localStorage fallback
  try{ await window._fbSaveSettings('productionCosts', stored); }catch(_){}
  localStorage.setItem('lm-production-costs',JSON.stringify(stored));
  showToast('✓ Break-even targets saved');
  if(activeBook&&activeBook!=='all') updateDash();
  else updateAllOverview();
}

async function loadProductionCosts(){
  try{
    // Try Firebase first
    const stored = await window._fbLoadSettings('productionCosts');
    if(stored){ Object.values(BOOKS).forEach(b=>{ if(stored[b.id]!=null) b.productionCost=stored[b.id]; }); return; }
  }catch(_){}
  // Fallback to localStorage
  try{
    const stored=JSON.parse(localStorage.getItem('lm-production-costs')||'{}');
    Object.values(BOOKS).forEach(b=>{ if(stored[b.id]!=null) b.productionCost=stored[b.id]; });
  }catch(_){}
}

function renderPaymentLinkFields(){
  const container=$('payment-link-fields');
  if(!container)return;
  container.innerHTML=Object.values(BOOKS).map(book=>`
    <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
      <div style="display:flex;align-items:center;gap:8px;min-width:200px;">
        <div style="width:8px;height:8px;border-radius:50%;background:${book.accent};flex-shrink:0;"></div>
        <span style="font-size:13px;font-weight:600;color:var(--text);">${book.title}</span>
      </div>
      <div class="form-group" style="flex:1;margin:0;">
        <input type="text" id="pl-${book.id}" value="${book.paymentLink||''}" placeholder="https://paypal.me/… or email@interac.ca">
      </div>
    </div>`).join('');
}

async function savePaymentLinks(){
  Object.values(BOOKS).forEach(book=>{
    const inp=$('pl-'+book.id);
    if(inp) book.paymentLink=inp.value.trim();
  });
  const stored={};
  Object.values(BOOKS).forEach(b=>stored[b.id]=b.paymentLink||'');
  // Save to Firebase (syncs across all devices) + localStorage as fallback
  try{ await window._fbSaveSettings('paymentLinks', stored); }catch(_){}
  localStorage.setItem('lm-payment-links',JSON.stringify(stored));
  showToast('✓ Payment links saved');
  if(activeBook&&activeBook!=='all') renderArtistTransfers();
}

async function loadPaymentLinks(){
  try{
    // Try Firebase first
    const stored = await window._fbLoadSettings('paymentLinks');
    if(stored){ Object.values(BOOKS).forEach(b=>{ if(stored[b.id]) b.paymentLink=stored[b.id]; }); return; }
  }catch(_){}
}

// ── PROFIT SHARING LOGIC
let psActiveBookId = null;

function renderProfitSettings() {
  if (isAuthor()) return;
  const card = $('profit-sharing-settings-card');
  if (!card) return;
  card.style.display = '';

  // Re-render the selector every time, but preserve the current selection
  const selectorCont = $('ps-book-selector-container');
  if (selectorCont) {
    const currentVal = psActiveBookId || '';
    selectorCont.innerHTML = `
      <select id="ps-book-selector">
        <option value="">Select a book...</option>
        ${Object.values(BOOKS).map(b => `<option value="${b.id}" ${b.id===currentVal?'selected':''}>${b.title}</option>`).join('')}
      </select>
    `;
    const sel = $('ps-book-selector');
    if (sel) {
      sel.addEventListener('change', () => {
        psActiveBookId = sel.value || null;
        renderProfitTierList();
      });
    }
  }

  renderProfitTierList();
}

function renderProfitTierList() {
  const list = $('profit-tier-list');
  if (!list) return;

  list.innerHTML = '';

  if (!psActiveBookId || !BOOKS[psActiveBookId]) {
    list.innerHTML = '<div class="empty-state">Select a book to manage profit tiers.</div>';
    return;
  }

  const book = BOOKS[psActiveBookId];
  if (!book.profitTiers) book.profitTiers = [];
  const tiers = book.profitTiers;
  const cur = book.currency || '€';

  if (tiers.length === 0) {
    list.innerHTML = '<div class="empty-state">No tiers defined yet. Click "+ Add Tier" to start. The first tier typically covers the period before production costs are recovered.</div>';
    return;
  }

  tiers.forEach((t, i) => {
    const isLast = i === tiers.length - 1;
    const row = document.createElement('div');
    row.style.cssText = 'display:grid; grid-template-columns: 2fr 1.5fr 1fr auto; gap:10px; align-items:end; background:var(--cream2); padding:12px; border-radius:var(--r2); border:1px solid var(--border);';

    function makeField(labelText, type, val, onChange) {
      const wrap = document.createElement('div');
      wrap.className = 'form-group';
      wrap.style.margin = '0';
      const lbl = document.createElement('label');
      lbl.textContent = labelText;
      const inp = document.createElement('input');
      inp.type = type;
      inp.value = val;
      inp.style.width = '100%';
      inp.addEventListener('input', () => onChange(inp.value));
      inp.addEventListener('change', () => onChange(inp.value));
      wrap.appendChild(lbl);
      wrap.appendChild(inp);
      return wrap;
    }

    const labelField = makeField('Label', 'text', t.label, v => { t.label = v; });
    const pctField   = makeField('Artist %', 'number', t.artistPct, v => { t.artistPct = parseFloat(v) || 0; });

    // Revenue threshold field: editable for all but last, which is always ∞
    const threshWrap = document.createElement('div');
    threshWrap.className = 'form-group';
    threshWrap.style.margin = '0';
    const threshLbl = document.createElement('label');
    threshLbl.textContent = `Revenue threshold (${cur})`;
    threshWrap.appendChild(threshLbl);

    if (isLast) {
      const pill = document.createElement('div');
      pill.style.cssText = 'height:38px; display:flex; align-items:center; font-family:\'DM Mono\',monospace; font-size:13px; font-weight:600; color:var(--gold); padding:0 4px;';
      pill.textContent = '∞ Unlimited (final tier)';
      threshWrap.appendChild(pill);
    } else {
      const inp = document.createElement('input');
      inp.type = 'number';
      inp.value = t.revenueUpTo || '';
      inp.placeholder = 'e.g. production cost';
      inp.style.width = '100%';
      inp.addEventListener('input', () => { t.revenueUpTo = parseFloat(inp.value) || 0; });
      inp.addEventListener('change', () => { t.revenueUpTo = parseFloat(inp.value) || 0; });
      threshWrap.appendChild(inp);
    }

    const removeBtn = document.createElement('button');
    removeBtn.className = 'btn sm danger-btn';
    removeBtn.textContent = 'Remove';
    removeBtn.style.marginBottom = '2px';
    removeBtn.addEventListener('click', () => {
      book.profitTiers.splice(i, 1);
      renderProfitTierList();
    });

    row.appendChild(labelField);
    row.appendChild(threshWrap);
    row.appendChild(pctField);
    row.appendChild(removeBtn);
    list.appendChild(row);
  });

  // Legend hint
  const hint = document.createElement('div');
  hint.style.cssText = 'font-size:11px; color:var(--text3); margin-top:6px; line-height:1.6;';
  hint.textContent = 'Revenue threshold: cumulative gross revenue at which the NEXT tier begins. The final tier has no ceiling.';
  list.appendChild(hint);
}

function addProfitTier() {
  if (!psActiveBookId || !BOOKS[psActiveBookId]) {
    showToast('Select a book first', 'warn');
    return;
  }
  const book = BOOKS[psActiveBookId];
  if (!book.profitTiers) book.profitTiers = [];
  const tiers = book.profitTiers;
  const productionCost = book.productionCost || 0;

  if (tiers.length === 0) {
    // First tier: pre break-even. Revenue threshold = production cost.
    tiers.push({ label: 'Pre Break-even', revenueUpTo: productionCost || 1000, artistPct: 15 });
  } else if (tiers.length === 1) {
    // Second tier: post break-even. No ceiling — this is the final tier.
    tiers.push({ label: 'Post Break-even', revenueUpTo: null, artistPct: 35 });
  } else {
    // Additional tiers: insert before the last (unlimited) tier
    const prev = tiers[tiers.length - 2];
    const newThreshold = prev.revenueUpTo ? prev.revenueUpTo * 2 : productionCost * 2;
    const lastTier = tiers.pop(); // pull off the unlimited final tier
    tiers.push({ label: `Tier ${tiers.length + 1}`, revenueUpTo: newThreshold, artistPct: Math.max(lastTier.artistPct + 5, 10) });
    tiers.push(lastTier);  // put unlimited tier back at the end
  }
  renderProfitTierList();
}

function removeProfitTier(idx) {
  if (!psActiveBookId || !BOOKS[psActiveBookId]) return;
  BOOKS[psActiveBookId].profitTiers.splice(idx, 1);
  renderProfitTierList();
}

function updateProfitTierField(idx, field, val) {
  if (!psActiveBookId || !BOOKS[psActiveBookId]) return;
  const tier = BOOKS[psActiveBookId].profitTiers[idx];
  if (!tier) return;
  if (field === 'upTo' || field === 'artistPct') tier[field] = parseFloat(val) || 0;
  else tier[field] = val;
}

async function saveProfitTiers() {
  if (!psActiveBookId) { showToast('No book selected', 'warn'); return; }
  const ind = $('ps-save-indicator');
  if (ind) ind.classList.add('show');
  try {
    await window._fbSaveCatalog(BOOKS);
    showToast('✓ Profit tiers saved');
    if (activeBook === psActiveBookId) updateDash();
  } catch(e) {
    showToast('⚠ Error saving tiers', 'err');
  } finally {
    if (ind) setTimeout(() => ind.classList.remove('show'), 1500);
  }
}

function calculateArtistEarnings(bookId) {
  const book = BOOKS[bookId];
  if (!book) return null;
  const s = states[bookId] || defaultState(book);
  const tiers = book.profitTiers && book.profitTiers.length > 0
    ? [...book.profitTiers].sort((a,b) => (a.revenueUpTo || Infinity) - (b.revenueUpTo || Infinity))
    : [];

  if (tiers.length === 0) return null;

  let totalArtistEarned = 0;
  let cumulativeRevenue = 0;

  const sortedHist = [...s.hist].reverse().filter(h => !h.voided && !h.gratuity && h.qty > 0 && h.price > 0);

  sortedHist.forEach(h => {
    let revRemaining = h.qty * h.price;
    while (revRemaining > 0.001) {
      const tier = tiers.find(t => t.revenueUpTo !== null && cumulativeRevenue < t.revenueUpTo) || tiers[tiers.length - 1];
      const isLastTier = tier === tiers[tiers.length - 1] || tier.revenueUpTo === null;
      const capacity = isLastTier ? revRemaining : Math.min(revRemaining, tier.revenueUpTo - cumulativeRevenue);
      totalArtistEarned += capacity * (tier.artistPct / 100);
      cumulativeRevenue += capacity;
      revRemaining -= capacity;
    }
  });

  return {
    totalArtistEarned,
    cumulativeRevenue,
    netPublisher: s.revenue - totalArtistEarned
  };
}

// ── FINANCIAL CENTER LOGIC
function calculateFinancials(year) {
  const result = {
    revenue: 0,
    cogs: 0,
    opex: 0,
    shares: 0,
    profit: 0,
    bookStats: [], 
    expCats: {} 
  };

  const start = new Date(year, 0, 1);
  const end = new Date(year, 11, 31, 23, 59, 59);

  Object.values(BOOKS).forEach(book => {
    const s = states[book.id] || defaultState(book);
    const unitCost = (book.productionCost || 0) / (book.maxPrint || 1);
    
    let bookRev = 0;
    let bookUnits = 0;
    
    (s.hist || []).forEach(h => {
      const d = new Date(h.date);
      if (!h.voided && !h.gratuity && d >= start && d <= end) {
        bookRev += (parseFloat(h.qty) || 0) * (parseFloat(h.price) || 0);
        bookUnits += (parseInt(h.qty) || 0);
      }
    });
    
    const bookCogs = bookUnits * unitCost;
    const bookShares = filterArtistEarningsByYear(book.id, year);
    
    result.revenue += bookRev;
    result.cogs += bookCogs;
    result.shares += bookShares;
    
    result.bookStats.push({
      title: book.title,
      units: bookUnits,
      revenue: bookRev,
      unitCost: unitCost,
      cogs: bookCogs,
      shares: bookShares,
      net: bookRev - bookCogs - bookShares
    });
    
    (s.expenses || []).forEach(e => {
      const d = new Date(e.date);
      if (d >= start && d <= end) {
        result.opex += e.amount || 0;
        const cat = e.cat || 'Uncategorized';
        if (!result.expCats[cat]) result.expCats[cat] = { count: 0, total: 0 };
        result.expCats[cat].count++;
        result.expCats[cat].total += e.amount || 0;
      }
    });
  });

  result.profit = result.revenue - result.cogs - result.opex - result.shares;
  return result;
}

function filterArtistEarningsByYear(bookId, year) {
  const book = BOOKS[bookId];
  const s = states[bookId] || defaultState(book);
  const tiers = [...(book.profitTiers || [])].sort((a,b) => (a.revenueUpTo || Infinity) - (b.revenueUpTo || Infinity));
  if (tiers.length === 0) return 0;

  const start = new Date(year, 0, 1);
  const end   = new Date(year, 11, 31, 23, 59, 59);

  let yearArtistEarned = 0;
  let cumulativeRevenue = 0;

  // Walk history chronologically so cumulative revenue tracks correctly across all time
  const sortedHist = [...s.hist].reverse().filter(h => !h.voided && !h.gratuity && h.qty > 0 && h.price > 0);

  sortedHist.forEach(h => {
    const inYear = new Date(h.date) >= start && new Date(h.date) <= end;
    let revRemaining = h.qty * h.price;
    while (revRemaining > 0.001) {
      const tier = tiers.find(t => t.revenueUpTo !== null && cumulativeRevenue < t.revenueUpTo) || tiers[tiers.length - 1];
      const isLastTier = tier === tiers[tiers.length - 1] || tier.revenueUpTo === null;
      const capacity = isLastTier ? revRemaining : Math.min(revRemaining, tier.revenueUpTo - cumulativeRevenue);
      if (inYear) yearArtistEarned += capacity * (tier.artistPct / 100);
      cumulativeRevenue += capacity;
      revRemaining -= capacity;
    }
  });

  return yearArtistEarned;
}

function renderFinancials() {
  if (isAuthor()) return;
  const yearStr = $('fin-year-selector').value;
  const year = parseInt(yearStr);
  const fin = calculateFinancials(year);
  const cur = getBook().currency || '€';

  $('fin-rev').textContent = fmt(fin.revenue, cur);
  $('fin-cogs').textContent = fmt(fin.cogs, cur);
  $('fin-exp').textContent = fmt(fin.opex + fin.shares, cur);
  
  const totalExpCount = Object.values(fin.expCats).reduce((a,c)=>a+c.count,0);
  $('fin-exp-sub').textContent = `${totalExpCount} expense${totalExpCount!==1?'s':''} logged`;
  $('fin-profit').textContent = fmt(fin.profit, cur);
  
  const expBody = $('fin-exp-body');
  if (expBody) {
    const sortedCats = Object.entries(fin.expCats).sort((a,b) => b[1].total - a[1].total);
    expBody.innerHTML = sortedCats.map(([cat, val]) => `
      <tr>
        <td style="font-weight:600;">${cat}</td>
        <td class="r">${val.count} txn</td>
        <td class="r" style="font-weight:700; color:var(--red);">${fmt(val.total, cur)}</td>
      </tr>
    `).join('') || '<tr><td colspan="3"><div class="empty-state">No expenses for this period.</div></td></tr>';
  }

  const booksBody = $('fin-books-body');
  if (booksBody) {
    booksBody.innerHTML = fin.bookStats.map(bs => `
      <tr>
        <td style="font-weight:600;">${bs.title}</td>
        <td class="r">${bs.units}</td>
        <td class="r">${fmt(bs.revenue, cur)}</td>
        <td class="r">${fmt(bs.unitCost, cur)}</td>
        <td class="r">${fmt(bs.cogs, cur)}</td>
        <td class="r" style="font-weight:700; color:${bs.net > 0 ? 'var(--green)' : 'var(--text)'};">${fmt(bs.net, cur)}</td>
      </tr>
    `).join('') || '<tr><td colspan="6"><div class="empty-state">No data available.</div></td></tr>';
  }
}

function downloadTaxReport() {
  const year = $('fin-year-selector').value;
  const fin = calculateFinancials(parseInt(year));
  
  let csv = 'Date,Type,Book/Source,Category,Description,Revenue,COGS,Expense,Artist Payout,Net\n';
  
  const start = new Date(year, 0, 1);
  const end = new Date(year, 11, 31, 23, 59, 59);

  Object.values(BOOKS).forEach(book => {
    const s = states[book.id] || defaultState(book);
    s.hist.filter(h => !h.voided && !h.gratuity).forEach(h => {
      const d = new Date(h.date);
      if (d >= start && d <= end) {
        csv += `${h.date},Order,${book.title},Sale,"${h.chan} Order #${h.num}",${(h.qty*h.price).toFixed(2)},0,0,0,${(h.qty*h.price).toFixed(2)}\n`;
      }
    });

    (s.expenses || []).forEach(e => {
        const d = new Date(e.date);
        if (d >= start && d <= end) {
          csv += `${e.date},Expense,${book.title},${e.cat},"${e.desc}",0,0,${e.amount.toFixed(2)},0,-${e.amount.toFixed(2)}\n`;
        }
    });
  });

  // Summary lines for COGS and Shares
  csv += `\nSUMMARY FOR ${year},,,,,,,\n`;
  fin.bookStats.forEach(bs => {
    csv += `${year}-12-31,COGS Summary,${bs.title},COGS,Inventory Recovery,0,${bs.cogs.toFixed(2)},0,0,-${bs.cogs.toFixed(2)}\n`;
    csv += `${year}-12-31,Artist Share,${bs.title},Royalty,Tiered Payout,0,0,0,${bs.shares.toFixed(2)},-${bs.shares.toFixed(2)}\n`;
  });

  const blob = new Blob([csv], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.setAttribute('href', url);
  a.setAttribute('download', `Lyrical_Tax_Report_${year}.csv`);
  a.click();
}

// ── PASSWORDS
let _loadedPasswords = null;
async function loadPasswords() {
  try {
    _loadedPasswords = await window._fbLoadSettings('passwords');
  } catch(_) {}
  if (!_loadedPasswords) {
    _loadedPasswords = { publisher: '12345', authors: {} };
  }
  if (!_loadedPasswords.authors) _loadedPasswords.authors = {};
  Object.values(BOOKS).forEach(b => {
    if (_loadedPasswords.authors[b.id] === undefined) {
      _loadedPasswords.authors[b.id] = b.authorPassword || '';
    }
  });
  if ($('pw-pub')) $('pw-pub').value = _loadedPasswords.publisher || '';
  renderAuthorPasswords();
}

function renderAuthorPasswords() {
  const container = $('author-password-fields');
  if (!container) return;
  container.innerHTML = Object.values(BOOKS).map(book => `
    <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
      <div style="display:flex;align-items:center;gap:8px;min-width:200px;">
        <div style="width:8px;height:8px;border-radius:50%;background:${book.accent};flex-shrink:0;"></div>
        <span style="font-size:13px;font-weight:600;color:var(--text);">${book.title}</span>
      </div>
      <div class="form-group" style="flex:1;margin:0;">
        <input type="text" id="pw-auth-${book.id}" value="${(_loadedPasswords.authors && _loadedPasswords.authors[book.id]) || ''}" placeholder="Author password">
      </div>
    </div>`).join('');
}

async function savePasswords() {
  const pub = $('pw-pub').value.trim();
  const authors = {};
  Object.values(BOOKS).forEach(b => {
    const inp = $('pw-auth-'+b.id);
    if(inp) authors[b.id] = inp.value.trim();
  });
  
  const data = { publisher: pub, authors: authors };
  try {
    await window._fbSaveSettings('passwords', data);
    _loadedPasswords = data;
    showToast('✓ Passwords saved securely to Firebase');
  } catch(e) {
    showToast('⚠ Error saving passwords', 'err');
  }
}

// ── MANUAL PRICE FIELD: update default to current book on tab switch
function updateManualForm(){
  const book=getBook();
  $('m-sym').textContent=book.currency;
  $('m-price').value=book.listPrice.toFixed(2);
  $('g-date').value=today();
}

// ── PASSWORD
async function tryUnlock() {
  const inp=$('pw-input'), err=$('pw-err'), val=inp.value;

  inp.disabled = true;
  err.textContent = 'Verifying...';

  let pwData = null;
  try {
    pwData = await window._fbLoadSettings('passwords');
  } catch(e) {}
  
  // Fallback defaults if never saved before
  if (!pwData) {
    pwData = { publisher: '12345', authors: {} };
  }
  if (!pwData.authors) pwData.authors = {};
  Object.values(BOOKS).forEach(b => {
    if (pwData.authors[b.id] === undefined) {
      pwData.authors[b.id] = b.authorPassword || '';
    }
  });

  inp.disabled = false;
  err.textContent = '';

  // Publisher password — full access
  if (val === pwData.publisher && val !== '') {
    sessionStorage.setItem('lm-unlocked','publisher');
    showApp('publisher');
    return;
  }

  // Author passwords — per-book access
  if (IS_AUTHOR_MODE) {
    if (pwData.authors[ACTIVE_BOOK_FORCED] === val && val !== '') {
      sessionStorage.setItem('lm-unlocked', 'author:'+ACTIVE_BOOK_FORCED);
      showApp('author', ACTIVE_BOOK_FORCED);
      return;
    }
  } else {
    const matchedBookId = Object.keys(pwData.authors || {}).find(id => pwData.authors[id] === val && val !== '');
    if (matchedBookId && BOOKS[matchedBookId]) {
      sessionStorage.setItem('lm-unlocked', 'author:'+matchedBookId);
      showApp('author', matchedBookId);
      return;
    }
  }

  // Wrong
  inp.value=''; err.textContent='Wrong password, try again.';
  inp.classList.remove('bad'); void inp.offsetWidth; inp.classList.add('bad');
  setTimeout(()=>{inp.classList.remove('bad');err.textContent='';},2000);
  inp.focus();
}

function logout() {
  sessionStorage.removeItem('lm-unlocked');
  sessionStorage.removeItem('lm-author-view-overrides');
  window.location.reload();
}

function showApp(role, bookId) {
  $('pw-gate').style.display='none';
  $('pw-app').style.display='';
  if (role === 'author' || IS_AUTHOR_MODE) {
    document.getElementById('main-app').classList.add('author-mode');
    // Immediately hide the all-books overview so it never flashes
    const allOv = $('tab-all-overview');
    if(allOv){ allOv.style.display='none'; allOv.classList.remove('active'); }
    $('tab-bar').style.display = '';
    const wm=$('author-watermark'); if(wm){wm.textContent=BOOKS[bookId||ACTIVE_BOOK_FORCED].title+' · Author view';wm.style.display='';}
    const sheetsBtn=$('sheets-tab-btn'); if(sheetsBtn)sheetsBtn.style.display='none';
    const websiteTabBtn=$('website-tab-btn'); if(websiteTabBtn) websiteTabBtn.style.display='none';
    const backupsBtn=$('backups-tab-btn'); if(backupsBtn) backupsBtn.style.display='none';
    const websitePanel=$('tab-website');
    if (websitePanel) {
      websitePanel.style.display='none';
      websitePanel.classList.remove('active');
    }
    const openLink=$('sheets-open-link'); if(openLink)openLink.style.display='none !important';
    const style=document.createElement('style');
    style.textContent='#sheets-open-link{display:none!important;}#open-sheet-link{display:none!important;}#d-breakeven-kpi{display:none!important;}#d-breakeven-block{display:none!important;}#d-reimburse-sect{display:none!important;}#d-expenses-sect{display:none!important;}#d-expenses-kpi{display:none!important;}#d-reimburse-kpi{display:none!important;}#danger-zone-sect{display:none!important;}#danger-zone-block{display:none!important;}#import-btn{display:none!important;}#tab-all-overview{display:none!important;}#backups-tab-btn{display:none!important;}';
    document.head.appendChild(style);
  } else {
    // Publisher — show import button and financials tab
    const importBtn=$('import-btn'); if(importBtn)importBtn.style.display='';
    const finBtn=$('financials-tab-btn'); if(finBtn)finBtn.style.display='';
    const websiteTabBtn=$('website-tab-btn'); if(websiteTabBtn) websiteTabBtn.style.display='';
    const backupsBtn=$('backups-tab-btn'); if(backupsBtn) backupsBtn.style.display='';
  }
  updateRoleToggleButton();
  syncRoleUI();
  boot(bookId || ACTIVE_BOOK_FORCED);
}

async function boot(forcedBook) {
  await loadCatalog();
  buildBookSwitcher();
  await loadPaymentLinks();
  await loadProductionCosts();
  await loadPasswords();
  renderCatalogList();
  renderProfitSettings();
  if(sheetsUrl) showSheetsConnected();
  updateSheetsBadge();
  updateLastBackupDisplay();
  checkDailyBackup();
  maybeAutoDownloadDailyBackup();
  processSyncQueue();

  const initFn = () => {
    fbReady = true;
    if (forcedBook) {
      // Author mode — load only this book
      activeBook = forcedBook;
      const book = BOOKS[forcedBook];
      if (!book) { showToast('Book not found', 'err'); return; }
      document.documentElement.style.setProperty('--book-accent', book.accent);
      document.documentElement.style.setProperty('--book-accent-bg', book.accentBg);
      // Hide the all-overview, show the per-book tab bar and dashboard
      $('tab-all-overview').style.display='none';
      $('tab-all-overview').classList.remove('active');
      $('tab-bar').style.display = '';
      $('tab-dashboard').style.display='block';
      $('tab-dashboard').classList.add('active');
      loadBook(forcedBook).then(()=>{
        setSyncState('ok','<b>Firebase</b> · connected');
        $('hdr-sub').textContent=book.title+' · Author View · Synced '+new Date().toLocaleTimeString();
        renderAll();updateHeader();updateRoleToggleButton();syncRoleUI();
      });
  } else {
      // Publisher — load all books, start on combined view
      activeBook = 'all';
      loadAllBooks().then(() => ensureDailySystemBackup());
      updateRoleToggleButton();
      syncRoleUI();
    }
  };

  if (window._fbReady) { initFn(); }
  else {
    document.addEventListener('firebase-ready', initFn);
    setTimeout(()=>{if(!fbReady){setSyncState('error','<b>Firebase</b> · not connected');renderAll();}},4000);
  }
}

// Global exposure for HTML handlers
Object.assign(window, {
  tryUnlock, logout, switchTab, toggleBookDropdown, switchBook, forceSync,
  toggleCurrentBookView,
  fetchOrders, applyOne, applyAll, toggleFx, calcFx, submitManual,
  submitGratuity, openM, closeM, addStore, confirmSend, confirmSale,
  confirmReturn, openEditHist, openEditLedger, saveEntryEdit, voidEntry,
  resetBookData, connectSheets, disconnectSheets, testSheets, verifyUrl,
  copyGasCode, saveProductionCosts, savePaymentLinks, savePasswords,
  handleImportFile, confirmImport, openLabelModal, printShippingLabel,
  saveArtistPaymentLink, markArtistTransferReceived, markExpenseReceived,
  submitExpense, voidExpense, markPaid, removeStore, addProfitTier, removeProfitTier, 
  saveProfitTiers, renderProfitSettings, updateProfitTierField, renderProfitTierList,
  renderFinancials, downloadTaxReport, createSystemBackupNow, restoreSystemBackup, handleBackupImportFile
});

// ── STARTUP ROUTING
async function initStartup() {
  await loadCatalog(); // Ensure books map is populated
  loadAuthorViewOverrides();
  IS_AUTHOR_MODE = !!URL_BOOK && !!BOOKS[URL_BOOK];
  ACTIVE_BOOK_FORCED = IS_AUTHOR_MODE ? URL_BOOK : null;

  // Author mode via URL param: ?book=hound — skips password if dev=1, else author password gate
  if (IS_AUTHOR_MODE && urlParams.get('dev')==='1') {
    showApp('author', ACTIVE_BOOK_FORCED);
  } else if (sessionStorage.getItem('lm-unlocked')==='publisher') {
    showApp('publisher');
  } else {
    const stored = sessionStorage.getItem('lm-unlocked');
    if (stored && stored.startsWith('author:')) {
      const storedBook = stored.split(':')[1];
      if (!IS_AUTHOR_MODE || storedBook === ACTIVE_BOOK_FORCED) {
        showApp('author', IS_AUTHOR_MODE ? ACTIVE_BOOK_FORCED : storedBook);
      } else {
        $('pw-input').focus();
        setupGate();
      }
    } else {
      $('pw-input').focus();
      setupGate();
    }
  }
}

function setupGate() {
  if (IS_AUTHOR_MODE) {
    const book = BOOKS[ACTIVE_BOOK_FORCED];
    if (book) {
      document.querySelector('#gate-sub').textContent = book.title + ' · Author Portal';
      document.querySelector('#pw-gate .wm').textContent = 'Lyricalmyrical Books';
      const desc = document.getElementById('gate-desc');
      if (desc) {
        desc.style.display = 'block';
        desc.innerHTML = `Enter the author password to view inventory and sales data for <strong>${book.title}</strong>.`;
      }
    }
  } else {
    document.querySelector('#gate-sub').textContent = 'Inventory App';
    document.querySelector('#pw-gate .wm').textContent = 'Lyricalmyrical Books';
    const desc = document.getElementById('gate-desc');
    if (desc) {
      desc.style.display = 'none';
      desc.innerHTML = '';
    }
  }
}

if (window._fbReady) { initStartup(); }
else { document.addEventListener('firebase-ready', initStartup); }
