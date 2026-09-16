# Gmail receipt finder

The Gmail tab in **Import Receipts from Email** now scans candidate messages,
classifies them with Gemini, and saves editable receipts and original attachments
in an account-scoped IndexedDB outbox. Import selected receipts writes Business
Expenses, retaining invoice fields, line items, source references and attachment
links. Existing Paste & Upload and Gmail add-on intake remain separate flows.

## Deployment (required before live scanning)

1. In the Google Cloud project used by Firebase Authentication, enable Gmail API.
   Add `https://www.googleapis.com/auth/gmail.readonly` to the OAuth consent
   configuration. During OAuth testing, add the publisher as a test user. For a
   public rollout, follow Google's restricted-scope verification requirements.
   The existing Firebase Google sign-in provider and authorized app domains are
   reused. Connecting uses reauthentication, so it cannot silently switch the app
   to a different Google account.
2. Create a **separate Apps Script project**, using both files in
   `apps-script/receipt-finder/`. Do not paste this into the Sheets backend:
   both services define `doPost`. The Sheets script stays at its existing version.
3. In that project's Script Properties, set:
   - `FIREBASE_WEB_API_KEY`: the web API key for this Firebase project.
   - `PUBLISHER_UID`: the publisher's exact Firebase Authentication UID.
   - `GEMINI_API_KEY`: a Gemini API key, restricted to the Generative Language API.
   - `GEMINI_MODEL`: optional primary model ID; default `gemini-2.5-flash`.
     If it is unavailable, the service tries the supported Flash fallback chain
     (`gemini-3.8-flash`, `gemini-3.7-flash`, then `gemini-3.6-flash`).
   The Gemini key never goes into the app, its settings, or its source files.
4. Deploy as a web app, executing as the owner, accessible to Anyone. Each POST
   validates a Firebase ID token using Firebase's accounts lookup endpoint and
   checks the exact publisher UID **before** calling Gemini. The endpoint has no
   Gmail scope or stored mailbox credentials. Copy its `/exec` URL.
5. Deploy `storage.rules` so the publisher can save original email text under
   `receipts/email-imports/`. Enable global Firestore storage and save Tax Centre
   settings there before importing. Existing receipt image/PDF access rules stay
   in effect.
6. Open Import Receipts from Email → Finder setup, save the deployment URL, then
   press **Test connection**. The service answers a `GET` with its own setup report
   (`service`, `scriptVersion`, and a boolean per Script Property — never a value),
   so a missing key, an unredeployed script, or the Sheets URL pasted in by mistake
   is named before any scan spends Gmail requests or AI credits. Anyone can reach
   this report, which is why it reports presence only.
7. Once the check reads Ready, Connect Gmail. Scan a small date range first and
   compare results with originals.

### Keeping the service version in step

`RECEIPT_SCRIPT_VERSION` in `apps-script/receipt-finder/Code.gs` and
`EXPECTED_FINDER_VERSION` in `src/lib/receipt-finder-client.js` move together
whenever the service's behaviour changes, with a line in the version-history block
atop `Code.gs`. A deployment left on an older version is reported as needing a
redeploy rather than failing mid-scan. This service versions independently of the
Sheets backend, which keeps its own `scriptVersion`/`EXPECTED_SCRIPT_VERSION` pair.

## Behaviour and data

- Gmail OAuth access tokens stay in memory; reconnect after reload or expiry.
  Disconnect drops the local token. Google account permissions can be revoked at
  <https://myaccount.google.com/permissions>. No background Gmail access occurs
  while the app is closed.
- Each scan handles 25 messages with a next-page action. Completed messages are
  checkpointed; stop/retry never marks an unfinished email as completed. Failures
  remain visible. AI sees only scanned message content and supported PDF/images.
- Scans preserve unknown amounts, dates and currencies. Confidence below 85% or
  invalid fields requires review. Matching totals are not enough to deduplicate
  unrelated vendors. Repeated invoice references and message/attachment evidence
  are checked along with currency, date and amount.
- The outbox stores original bytes and user edits before import. It is a scoped
  extension because the existing `lm-sync-queue` accepts only book snapshots.
  Receipt import resumes on app startup, reconnection, or Retry pending imports.
  Queued receipts stay in the finder until upload and ledger commit finish.
- Source files upload to the existing Firebase receipt store before the ledger
  mutation. A Firestore transaction appends against the latest global expense
  ledger and rechecks duplicates across devices. Missing FX leaves the receipt
  pending; no 1:1 fallback is used. Conversion uses the app's current rate helper,
  not a historical tax-date FX service.
- One email can contain multiple receipts. IDs include the account, message and
  extraction row. A source message ID alone never causes all its other invoices
  to be discarded. Original attachments are shared across receipts from an email.
- Unpaid status is retained as metadata in Business Expenses; this feature does
  not implement an accounts-payable ledger or change existing tax calculations.
- Original bytes remain in IndexedDB until Clear saved finder data is used.
  Clearing removes pending drafts too; the UI asks before doing so. Imported
  records and cloud attachments are retained. Browser storage clearing also
  removes local drafts. Cloud receipt links follow the app's existing tokenized
  download-link model: anyone holding a link can access that file.
- Attachment limit: 12 MB each, 18 MB per AI request. Oversize, unsupported,
  unreadable and unfinished AI results remain retryable errors. Never silently
  import a receipt whose attachments failed to download.

## Verification references

- [Firebase Google sign-in and incremental scopes](https://firebase.google.com/docs/auth/web/google-signin)
- [Firebase accounts lookup](https://firebase.google.com/docs/reference/rest/auth#section-get-account-info)
- [Gmail message search and pagination](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/list)
- [Gemini structured output](https://ai.google.dev/gemini-api/docs/structured-output)

Live OAuth, deployed Apps Script, Firebase rules and Gmail extraction require the
owner's setup above. Unit tests use synthetic emails and mocked service responses;
they do not access the publisher's mailbox or spend AI credits.
