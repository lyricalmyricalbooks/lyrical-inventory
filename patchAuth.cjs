const fs = require('fs');
let code = fs.readFileSync('src/main.js', 'utf8');

const startIdx = code.indexOf('// ── PASSWORD');
if (startIdx === -1) {
    console.log("Could not find start index");
    process.exit(1);
}

const replacement = `// ── GOOGLE AUTHENTICATION
window.tryGoogleLogin = async function() {
  const err = $('pw-err');
  err.textContent = 'Contacting Google...';
  try {
    await window._fbSignInWithGoogle();
    err.textContent = 'Authenticating...';
  } catch (e) {
    console.error(e);
    err.textContent = 'Sign-in failed or was cancelled.';
    setTimeout(() => { err.textContent = ''; }, 3000);
  }
};

function logout() {
  window._fbSignOut().then(() => {
    sessionStorage.removeItem('lm-author-view-overrides');
    window.location.reload();
  });
}

function showApp(role, bookId) {
  $('pw-gate').style.display='none';
  $('pw-app').style.display='';
  if (role === 'author' || IS_AUTHOR_MODE) {
    document.getElementById('main-app').classList.add('author-mode');
    const allOv = $('tab-all-overview');
    if(allOv){ allOv.style.display='none'; allOv.classList.remove('active'); }
    $('tab-bar').style.display = '';
    const wm=$('author-watermark'); if(wm){wm.textContent=BOOKS[bookId||ACTIVE_BOOK_FORCED]?.title+' · Author view';wm.style.display='';}
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
  buildBookSwitcher();
  await loadPaymentLinks();
  await loadProductionCosts();
  renderCatalogList();
  renderProfitSettings();
  if(sheetsUrl) showSheetsConnected();
  updateSheetsBadge();
  updateLastBackupDisplay();
  initializeBackupFolderDisplay();
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
      // Publisher
      activeBook = 'all';
      loadAllBooks().then(() => ensureDailySystemBackup());
      updateRoleToggleButton();
      syncRoleUI();
    }
  };

  initFn();
}

// Global exposure for HTML handlers (cleaned up)
Object.assign(window, {
  logout, switchTab, toggleBookDropdown, switchBook, forceSync,
  toggleCurrentBookView,
  fetchOrders, applyOne, applyAll, toggleFx, calcFx, submitManual,
  submitGratuity, openM, closeM, addStore, confirmSend, confirmSale,
  confirmReturn, openEditHist, openEditLedger, saveEntryEdit, voidEntry,
  resetBookData, connectSheets, disconnectSheets, testSheets, verifyUrl,
  copyGasCode, saveProductionCosts, savePaymentLinks,
  handleImportFile, confirmImport, openLabelModal, printShippingLabel,
  saveArtistPaymentLink, markArtistTransferReceived, markExpenseReceived,
  submitExpense, voidExpense, markPaid, removeStore, addProfitTier, removeProfitTier, 
  saveProfitTiers, renderProfitSettings, updateProfitTierField, renderProfitTierList,
  renderFinancials, downloadTaxReport, createSystemBackupNow, restoreSystemBackup, handleBackupImportFile,
  chooseBackupFolder, exportToJSON, exportAllToCSV
});

// ── STARTUP ROUTING
let authStateHandled = false;
async function initStartup() {
  await loadCatalog(); // Ensure books map is populated
  loadAuthorViewOverrides();

  // Master Publisher Email
  const publisherEmail = 'lyricalmyrical@gmail.com'; // Adjust this or pull from settings if dynamic

  window._fbOnAuthStateChanged(user => {
    if (!user) {
      // Not logged in
      setupGate(null);
      return;
    }
    
    // Check access
    const uEmail = user.email.toLowerCase().trim();
    if (uEmail === publisherEmail) {
      window.IS_PUBLISHER = true;
      IS_AUTHOR_MODE = false;
      showApp('publisher', null);
      return;
    }

    // Artist Check
    const matchedBookId = Object.keys(BOOKS).find(id => {
      const dbEmail = (BOOKS[id].authorEmail || '').toLowerCase().trim();
      return dbEmail === uEmail;
    });

    if (matchedBookId) {
      window.IS_PUBLISHER = false;
      IS_AUTHOR_MODE = true;
      ACTIVE_BOOK_FORCED = matchedBookId;
      showApp('author', matchedBookId);
      return;
    }
    
    // No match
    window._fbSignOut();
    setupGate('Your Google account is not authorized for any books.');
  });
}

function setupGate(errMsg) {
  $('pw-gate').style.display='';
  $('pw-app').style.display='none';
  document.querySelector('#gate-sub').textContent = 'Inventory App';
  document.querySelector('#pw-gate .wm').textContent = 'Lyricalmyrical Books';
  const desc = document.getElementById('gate-desc');
  if (desc) {
    desc.style.display = errMsg ? 'block' : 'none';
    desc.innerHTML = errMsg ? \`<span style="color:var(--red);font-weight:600;">\${errMsg}</span>\` : '';
  }
}

// Global IS_PUBLISHER override for UI hooks
window.IS_PUBLISHER = false;
window.isPublisherSession = () => window.IS_PUBLISHER;
window.isAuthor = () => IS_AUTHOR_MODE || (window.IS_PUBLISHER && activeBook && activeBook !== 'all' && AUTHOR_VIEW_BY_BOOK[activeBook]);

if (window._fbReady) { initStartup(); }
else { document.addEventListener('firebase-ready', initStartup); }
`;

code = code.substring(0, startIdx) + replacement;
fs.writeFileSync('src/main.js', code);
console.log('Patched');
