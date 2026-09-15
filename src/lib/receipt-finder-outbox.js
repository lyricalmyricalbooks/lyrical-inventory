import { receiptDuplicate, receiptExpense, receiptProblems } from './receipt-finder.js';

// Processing is sequential, so a failed upload/FX lookup cannot drop the rest.
// The server transaction is the final duplicate check, including cross-device.
export async function flushReceiptOutbox(state, deps) {
  for (const draft of state.drafts.filter(row => row.status === 'queued')) {
    if (!deps.canSync()) break;
    try {
      if (receiptProblems(draft).length) throw new Error(receiptProblems(draft).join('. '));
      const duplicate = receiptDuplicate(draft, deps.expenses());
      if (duplicate) {
        draft.status = 'imported'; draft.error = ''; draft.updatedAt = Date.now();
        await deps.save();
        continue;
      }
      const source = state.emails[`${draft.account}:${draft.messageId}`];
      if (!source) throw new Error('Original email is missing. Scan this email again.');
      const rate = await deps.rate(draft.currency);
      if (!Number.isFinite(rate) || rate <= 0) throw new Error('Waiting for a currency conversion rate');
      const receiptFiles = await deps.files(source);
      if (!deps.canSync()) break;
      const expense = receiptExpense(draft, rate, receiptFiles);
      const result = await deps.commit(expense, draft);
      if (!deps.canSync()) break;
      deps.accept(result.expense);
      draft.status = 'imported'; draft.error = ''; draft.selected = false; draft.updatedAt = Date.now();
      await deps.save();
    } catch (error) {
      draft.error = error.message || 'Import failed. Retry when connected.';
      draft.updatedAt = Date.now();
      await deps.save();
    }
    deps.render();
  }
}
