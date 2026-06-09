/**
 * Gmail add-on — "Send to Lyrical Inventory"
 * ────────────────────────────────────────────────────────────────────────────
 * Adds a sidebar card inside Gmail. Open a receipt/invoice email, confirm the
 * vendor / amount / category, and press the button: a draft expense is written
 * to the app's Firestore inbox (collection `emailReceiptInbox`). The web app
 * picks it up live and the owner reviews + imports it from the existing
 * "Import Receipts from Email" screen.
 *
 * AUTH MODEL (no secrets stored anywhere):
 *   The add-on writes to Firestore using the signed-in owner's OWN OAuth token
 *   (ScriptApp.getOAuthToken) carrying the `datastore` scope. A Google
 *   OAuth-token write goes through Cloud IAM and bypasses Firestore security
 *   rules, so the project owner can write the inbox doc directly — no service
 *   account key in client code or script properties.
 *
 *   For this to work the Apps Script project MUST be linked to the same Google
 *   Cloud project as Firebase (FIREBASE_PROJECT_ID). See GMAIL_ADDON_SETUP.md.
 */

var FIREBASE_PROJECT_ID = 'lyricalmyrical-37c46';
var INBOX_COLLECTION = 'emailReceiptInbox';
// Firebase Storage bucket (matches firebaseConfig.storageBucket in src/firebase.js).
var STORAGE_BUCKET = 'lyricalmyrical-37c46.firebasestorage.app';

// Must mirror EXPENSE_CATEGORIES in src/main.js so an imported category lands
// on a real bucket instead of falling back to "Other".
var ADDON_CATEGORIES = [
  'Software & Subscriptions', 'Marketing & Advertising', 'Printing & Production',
  'Editorial & Proofreading', 'Illustration & Photography', 'Rights & Permissions',
  'ISBN, Barcodes & Cataloging', 'Shipping & Postage', 'Warehousing & Fulfillment',
  'Packaging Materials', 'Office Supplies', 'Home Office', 'Travel & Meals',
  'Professional Services', 'Sales Processing Fees',
  'Books, Research & Reference', 'Events & Exhibitions', 'Other'
];

/** Homepage card (shown when no message is open). */
function onGmailHomepage(e) {
  var section = CardService.newCardSection()
    .addWidget(CardService.newTextParagraph().setText(
      'Open a <b>receipt</b> or <b>invoice</b> email, then use this panel to send ' +
      'it straight into Lyrical Inventory as a draft expense.'));
  return CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader().setTitle('Lyrical Inventory'))
    .addSection(section)
    .build();
}

/** Contextual card built when a message is opened. */
function onGmailMessageOpen(e) {
  if (e && e.gmail && e.gmail.accessToken) {
    GmailApp.setCurrentMessageAccessToken(e.gmail.accessToken);
  }
  var msg = GmailApp.getMessageById(e.gmail.messageId);
  var guess = extractReceiptFields_(msg);

  var section = CardService.newCardSection();
  section.addWidget(CardService.newTextParagraph()
    .setText('<b>' + escapeForCard_(msg.getSubject() || '(no subject)') + '</b>'));
  section.addWidget(CardService.newKeyValue()
    .setTopLabel('From').setContent(escapeForCard_(msg.getFrom() || '')));

  section.addWidget(CardService.newTextInput()
    .setFieldName('vendor').setTitle('Vendor').setValue(guess.vendor || ''));
  section.addWidget(CardService.newTextInput()
    .setFieldName('amount').setTitle('Amount')
    .setValue(guess.amount ? String(guess.amount) : ''));
  section.addWidget(CardService.newTextInput()
    .setFieldName('currency').setTitle('Currency (e.g. CAD)')
    .setValue(guess.currency || 'CAD'));
  section.addWidget(CardService.newTextInput()
    .setFieldName('date').setTitle('Date (YYYY-MM-DD)').setValue(guess.date || ''));

  var catInput = CardService.newSelectionInput()
    .setType(CardService.SelectionInputType.DROPDOWN)
    .setTitle('Category').setFieldName('category');
  for (var i = 0; i < ADDON_CATEGORIES.length; i++) {
    catInput.addItem(ADDON_CATEGORIES[i], ADDON_CATEGORIES[i],
      ADDON_CATEGORIES[i] === guess.category);
  }
  section.addWidget(catInput);

  var action = CardService.newAction()
    .setFunctionName('importReceiptToApp')
    .setParameters({ messageId: e.gmail.messageId });
  section.addWidget(CardService.newTextButton()
    .setText('Send to Lyrical Inventory')
    .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
    .setOnClickAction(action));

  return CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader().setTitle('Send to Lyrical Inventory'))
    .addSection(section)
    .build();
}

/** Button handler: write the confirmed draft to the Firestore inbox. */
function importReceiptToApp(e) {
  try {
    if (e && e.gmail && e.gmail.accessToken) {
      GmailApp.setCurrentMessageAccessToken(e.gmail.accessToken);
    }
    var f = (e && e.formInput) || {};
    var messageId = (e && e.gmail && e.gmail.messageId) ||
      (e && e.parameters && e.parameters.messageId) || '';

    var draft = {
      vendor: String(f.vendor || '').trim(),
      description: String(f.vendor || 'Email receipt').trim(),
      amount: parseFloat(String(f.amount || '0').replace(/[^0-9.\-]/g, '')) || 0,
      currency: String(f.currency || 'CAD').toUpperCase().slice(0, 3),
      date: normalizeDate_(f.date),
      reference: '',
      category: ADDON_CATEGORIES.indexOf(f.category) >= 0 ? f.category : 'Other',
      sourceSnippet: '',
      confidence: 1,
      gmailMessageId: messageId,
      source: 'gmail-addon'
    };

    if (!draft.amount) {
      return notify_('Enter an amount before sending.');
    }

    // Best-effort enrichment from the live message (snippet + order/ref number)
    // and upload of the receipt file(s) so the imported expense keeps the PDF.
    try {
      var msg = GmailApp.getMessageById(messageId);
      draft.sourceSnippet = String(msg.getPlainBody() || '').replace(/\s+/g, ' ').slice(0, 240);
      var refm = String(msg.getSubject() || '').match(/#\s*([A-Z0-9][A-Z0-9\-]{3,})/i);
      if (refm) draft.reference = refm[1];
      var files = uploadReceiptFiles_(msg);
      if (files.length) { draft.receipt = files[0]; draft.receiptUrls = files; }
    } catch (_) { /* metadata-only access; skip enrichment/upload */ }

    writeInboxDoc_(draft);
    return notify_('✓ Sent to Lyrical Inventory — review it in the app.');
  } catch (err) {
    return notify_('Could not send: ' + err);
  }
}

/** Upsert the inbox document to Firestore using the owner's OAuth token. */
function writeInboxDoc_(draft) {
  // Key the document on the Gmail message id so pressing "Send" twice on the
  // same email overwrites its draft instead of queueing a duplicate expense.
  // PATCH upserts — it creates the doc if it doesn't exist yet.
  var docId = 'gmail_' + String(draft.gmailMessageId || Date.now()).replace(/[^A-Za-z0-9_-]/g, '_');
  var url = 'https://firestore.googleapis.com/v1/projects/' + FIREBASE_PROJECT_ID +
    '/databases/(default)/documents/' + INBOX_COLLECTION + '/' + docId;
  var body = {
    fields: {
      // Mirror the app's { data: JSON, ts } convention so the client parses it
      // exactly like settings/submission docs.
      data: { stringValue: JSON.stringify(draft) },
      ts: { integerValue: String(Date.now()) },
      source: { stringValue: 'gmail-addon' }
    }
  };
  var res = UrlFetchApp.fetch(url, {
    method: 'patch',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    payload: JSON.stringify(body),
    muteHttpExceptions: true
  });
  var code = res.getResponseCode();
  if (code < 200 || code >= 300) {
    throw new Error('Firestore HTTP ' + code + ': ' + res.getContentText().slice(0, 300));
  }
}

/**
 * Upload the message's PDF/image attachments to Firebase Storage and return
 * public Firebase download URLs. Uses the owner's OAuth token (devstorage
 * scope): the upload goes through IAM (bypassing Storage rules) and the
 * resulting ?token= URL grants read like any Firebase download URL. Failures
 * are swallowed so the receipt still imports (just without the file) if an
 * upload hiccups.
 */
function uploadReceiptFiles_(msg) {
  var urls = [];
  var atts;
  try {
    atts = msg.getAttachments({ includeInlineImages: false, includeAttachments: true });
  } catch (_) { return urls; }

  for (var i = 0; i < atts.length; i++) {
    try {
      var att = atts[i];
      var mime = att.getContentType();
      var name = att.getName();
      if (!(/pdf|image/i.test(mime) || /\.(pdf|png|jpe?g|webp)$/i.test(name))) continue;

      var objectPath = 'email-receipts/' + msg.getId() + '/' + name;
      var enc = encodeURIComponent(objectPath);
      var token = Utilities.getUuid();

      // 1) upload the bytes
      var up = UrlFetchApp.fetch(
        'https://storage.googleapis.com/upload/storage/v1/b/' + STORAGE_BUCKET +
          '/o?uploadType=media&name=' + enc,
        {
          method: 'post',
          contentType: mime || 'application/octet-stream',
          headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
          payload: att.getBytes(),
          muteHttpExceptions: true
        });
      if (up.getResponseCode() < 200 || up.getResponseCode() >= 300) continue;

      // 2) stamp a Firebase download token so the app can read it via a
      //    standard Firebase Storage download URL
      UrlFetchApp.fetch(
        'https://storage.googleapis.com/storage/v1/b/' + STORAGE_BUCKET + '/o/' + enc,
        {
          method: 'patch',
          contentType: 'application/json',
          headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
          payload: JSON.stringify({ metadata: { firebaseStorageDownloadTokens: token } }),
          muteHttpExceptions: true
        });

      urls.push('https://firebasestorage.googleapis.com/v0/b/' + STORAGE_BUCKET +
        '/o/' + enc + '?alt=media&token=' + token);
    } catch (_) { /* skip this attachment */ }
  }
  return urls;
}

/** Light heuristic extraction so the card opens pre-filled. */
function extractReceiptFields_(msg) {
  var subject = msg.getSubject() || '';
  var body = '';
  try { body = msg.getPlainBody() || ''; } catch (_) {}
  var hay = subject + '\n' + body;

  var from = msg.getFrom() || '';
  var vm = from.match(/^\s*"?([^"<]+?)"?\s*</);
  var vendor = (vm ? vm[1] : from)
    .replace(/,?\s*(inc|llc|ltd|pbc|co|corp|gmbh)\.?\s*$/i, '')
    .trim();

  var amount = 0;
  var currency = 'CAD';
  var money = hay.match(/([$€£])\s*([0-9][0-9,]*\.[0-9]{2})/);
  if (money) {
    amount = parseFloat(money[2].replace(/,/g, '')) || 0;
    if (money[1] === '€') currency = 'EUR';
    else if (money[1] === '£') currency = 'GBP';
    else currency = 'USD'; // bare $ — refine below if a code is present
  }
  var cm = hay.match(/\b(USD|CAD|EUR|GBP|AUD|JPY|MXN|CHF)\b/);
  if (cm) currency = cm[1].toUpperCase();

  var date = '';
  try {
    date = Utilities.formatDate(msg.getDate(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  } catch (_) {}

  return { vendor: vendor, amount: amount, currency: currency, date: date, category: 'Other' };
}

function normalizeDate_(s) {
  s = String(s || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  var d = new Date(s);
  var when = isNaN(d.getTime()) ? new Date() : d;
  return Utilities.formatDate(when, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function escapeForCard_(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function notify_(text) {
  return CardService.newActionResponseBuilder()
    .setNotification(CardService.newNotification().setText(text))
    .build();
}
