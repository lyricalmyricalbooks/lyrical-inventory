async function fetchOrders() {
  const book = getBook();
  const btn  = $('scan-btn');
  const log  = 'log-web';
  const MAX_RETRIES = 3;

  if (!sheetsUrl) {
    showToast('Connect Google Sheets first to scan Gmail', 'warn');
    return;
  }

  const setStatus = (msg) => { btn.innerHTML = `<span class="spinner"></span>${msg}`; btn.disabled = true; };

  // Read scan memory for smarter queries
  const mem = getScanMemory();
  const lastScanDate = mem.lastScan ? new Date(mem.lastScan) : null;
  const appliedNums  = new Set(mem.appliedNums || []);
  const daysBack     = parseInt(localStorage.getItem('lm-scan-days') || '30');
  const sinceDate    = new Date(Date.now() - daysBack * 86400000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

  const normalizeText = (value) => String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

  const normalizeOrderNum = (value) => {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const hit = raw.match(/#?[a-z0-9]+-[a-z0-9-]+/i);
    if (hit) {
      const v = hit[0].toUpperCase();
      return v.startsWith('#') ? v : `#${v}`;
    }
    return raw;
  };

  const inferBookIdFromText = (value) => {
    const txt = normalizeText(value);
    if (!txt) return null;
    for (const b of Object.values(BOOKS)) {
      const tokens = [b.id, b.title, b.urlParam, b.author, ...(b.title || '').split(/\s+/)]
        .filter(Boolean)
        .map(v => normalizeText(v))
        .filter(v => v.length >= 4);
      if (tokens.some(t => t && txt.includes(t))) return b.id;
    }
    return null;
  };

  setStatus('Connecting to Google Apps Script…');
  let attempt = 0;
  let parsed = null;
  let lastError;

  while (attempt < MAX_RETRIES) {
    attempt++;
    try {
      const res = await fetch(sheetsUrl, {
        method: 'POST',
        mode: 'cors',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'scanGmail', daysBack })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!data || !data.ok) throw new Error(data.error || 'Server returned failure');
      parsed = data;
      break;
    } catch (e) {
      lastError = e;
      console.warn(`Scan attempt ${attempt} failed:`, e);
      if (attempt < MAX_RETRIES) {
        setStatus(`Retrying… (${attempt}/${MAX_RETRIES})`);
        await new Promise(res => setTimeout(res, 1200 * attempt));
      }
    }
  }

  if (!parsed) {
    addLog(log, `❌ Apps Script Scan failed: ${lastError?.message || 'Unknown error'}. Check URL or re-authorize Apps Script.`, 'err');
    orders = [];
    btn.textContent = 'Scan Gmail'; btn.disabled = false;
    return;
  }

  setStatus('Parsing results…');

  // Normalise and enrich
  orders = (parsed.orders || []).map(o => {
    const orderNum = normalizeOrderNum(o.orderNum || o.number || o.order || o.orderNumber);
    const stableId = String(o.id || orderNum).trim();
    // Use the fetched email body to identify the correct book
    const textBlob = [o.body, o.notes, o.itemTitle, o.title].filter(Boolean).join(' ');
    
    let resolvedBookId = inferBookIdFromText(textBlob) || inferBookIdFromText(o.orderNum);
    if (!resolvedBookId) {
      resolvedBookId = BOOKS[activeBook] ? activeBook : Object.keys(BOOKS)[0];
    }
    
    const qty = Math.max(1, parseInt(o.qty ?? o.quantity ?? 1, 10) || 1);
    const price = parseFloat(o.price ?? o.unitPrice ?? o.amount ?? 0) || BOOKS[resolvedBookId]?.listPrice || book.listPrice;
    
    return {
      ...o,
      id: stableId || `order-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      hasBook: !!resolvedBookId,
      bookId: resolvedBookId,
      orderNum,
      qty,
      price
    };
  }).filter(o => o.orderNum);

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
}
