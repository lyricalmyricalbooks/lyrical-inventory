# Gmail add-on — "Send to Lyrical Inventory"

Adds a panel inside Gmail. Open a receipt or invoice, confirm the vendor /
amount / category, and press **Send to Lyrical Inventory**. The receipt shows
up live in the app under **Import from Email** as a draft expense, ready to
review and import.

It works on whatever Google account you're signed into in Gmail — no more
guessing which mailbox the search hit.

```
Gmail message  ──(add-on)──▶  Firestore: emailReceiptInbox  ──(live)──▶  App "Import from Email"
```

## How it delivers without any secret key

The add-on writes the draft to Firestore using **your own** OAuth token
(`ScriptApp.getOAuthToken()`) carrying the `datastore` scope. A Google
OAuth-token write goes through Cloud IAM and **bypasses Firestore security
rules**, so you (the project owner) can write the inbox document directly. No
service-account key is stored in the script or anywhere in client code.

The catch: the Apps Script project must be **linked to the same Google Cloud
project as Firebase** so the token is scoped to that project. Steps below.

## One-time setup

### 1. Put the code in your Apps Script project
Use the **same** Apps Script project that already powers the Sheets/Gmail
web app (the one behind your `…/macros/s/<id>/exec` URL), so everything shares
one deployment and one authorization.

- Add `GmailAddon.gs` (copy its contents into a new script file).
- Replace the project manifest with `appsscript.json`
  (**Project Settings → "Show appsscript.json manifest file in editor"**, then
  paste). It already includes every scope the web app uses **plus** the add-on
  and `datastore` scopes. Keep any extra scopes your project already had.

> `FIREBASE_PROJECT_ID` in `GmailAddon.gs` is set to `lyricalmyrical-37c46`.
> Change it only if you point the app at a different Firebase project.

### 2. Link the script to the Firebase Google Cloud project
1. Firebase Console → **Project settings** → note the **Project number** for
   `lyricalmyrical-37c46`.
2. Apps Script → **Project Settings → Google Cloud Platform (GCP) Project →
   Change project** → paste that project number.

### 3. Enable the Firestore API in that GCP project
Google Cloud Console (project `lyricalmyrical-37c46`) → **APIs & Services →
Enable APIs** → enable **Cloud Firestore API** (usually already on for a
Firebase project).

### 4. Publish the Firestore rules
Deploy the updated `firestore.rules` (adds the `emailReceiptInbox` block) from
the Firebase console or `firebase deploy --only firestore:rules`.

### 5. Deploy the add-on
Apps Script → **Deploy → Test deployments → Install** (for just yourself), or
**Deploy → New deployment → Add-on** to publish it to your Workspace. Open
Gmail, open any email, and approve the authorization prompt the first time
(it will list the new Gmail + Firestore scopes).

## Using it
1. Open a receipt/invoice in Gmail.
2. The **Send to Lyrical Inventory** panel appears on the right. Fields are
   pre-filled by a quick heuristic — correct the amount/vendor/category if
   needed.
3. Press the button. You'll see "✓ Sent to Lyrical Inventory."
4. In the app, the **📧 Import from Email** button shows a count badge. Open it,
   review the draft(s) in the table, and **Import selected drafts**. Each
   imported row is removed from the queue automatically.

## Troubleshooting
- **"Firestore HTTP 403 / PERMISSION_DENIED"** — the script isn't linked to the
  Firebase GCP project (step 2), or the Firestore API isn't enabled (step 3),
  or you authorized as an account that isn't an owner/editor of the project.
- **Nothing shows up in the app** — confirm the rules were published (step 4)
  and that you're signed into the app as `lyricalmyricalbooks@gmail.com`.
- **No panel in Gmail** — re-check the `addOns.gmail` block in the manifest and
  that the add-on deployment/installation succeeded.
