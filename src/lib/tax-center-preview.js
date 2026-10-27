// While the app opens, the Tax Centre on screen is this device's saved copy
// (main.js showStartupPreview), and saving it is refused until the cloud copy
// is in (firebase.js _fbSaveSettings). An expense logged in that window is
// already on screen, so when the cloud copy arrives it must be merged in, not
// replaced — replacing it threw the expense away without a word.
import { mergeSettingDoc } from './merge-state.js';

// `baseJson` is the device's copy as first shown, `loaded` the cloud copy,
// `current` what is on screen now. Returns the Tax Centre to keep, and whether
// it holds edits from the preview that still need saving.
export function keepPreviewEdits(baseJson, loaded, current) {
  if (typeof baseJson !== 'string' || !current || typeof current !== 'object') {
    return { value: loaded, kept: false, conflicts: [] };
  }
  if (JSON.stringify(current) === baseJson) return { value: loaded, kept: false, conflicts: [] };
  const res = mergeSettingDoc(baseJson, JSON.stringify(loaded), current);
  // A copy even when nothing needed merging: `current` still carries the
  // preview's mark, and keeping that object would refuse every save after.
  return { value: res.merged ? res.value : { ...current }, kept: true, conflicts: res.conflicts };
}
