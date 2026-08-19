---
name: backend-architect
description: Backend & Cloud Integrations Architect procedure. Manages Firebase Firestore data schemas, offline-first IndexedDB sync queues, Google Apps Script webhook parity, Stripe/Shippo API integrations, and serverless security rules.
---

# Backend & Cloud Architecture Procedure (`/backend-architect`)

Use this skill when modifying database mutations, sync queues, Google Apps Script webhook integration, Stripe/Shippo API handlers, or role-based security rules.

---

## 1. Google Sheets Apps Script Parity Protocol

> [!WARNING]
> Any edit to `apps-script/Code.gs` requires atomic synchronization across 3 locations in the exact same commit:

1. **`apps-script/Code.gs`**:
   - Update `scriptVersion: 'vNN'` and `service: 'lyrical-sheets-webhook-vNN'`.
   - Add a changelog entry to the top comments describing the update.
2. **`src/main.js`**:
   - Update `EXPECTED_SCRIPT_VERSION = 'vNN'`.
3. **`public/gas-code.txt`**:
   - Overwrite with the exact verbatim content of `apps-script/Code.gs`.

---

## 2. Offline-First Data & Persistence Engineering

- **IndexedDB & LocalStorage:** Always write to local storage first for optimistic UI response.
- **Sync Queue:** Queue Firestore mutations when offline; flush sequentially upon reconnection.
- **Chunked Processing:** Process batch Firestore reads/writes in chunks to prevent UI thread locks.

---

## 3. Role-Based Security Enforcement

```javascript
// Ensure publisher privileges before executing sensitive mutations
if (!IS_PUBLISHER) {
  showToast('Publisher access required', 'err');
  return;
}
```

---

## 4. Verification

1. Run `npm.cmd test` to verify data layer tests.
2. Check `git diff public/gas-code.txt apps-script/Code.gs` to confirm exact verbatim parity.
