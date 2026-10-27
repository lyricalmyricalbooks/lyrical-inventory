// The receipt drop zones (the project-ledger expense form, the Tax Centre's
// Log Business Expense form and the batch expense importer) all light up the
// same way while a file is dragged over them: the `.drag` class on the zone.
// These helpers are that shared behaviour; each form keeps its own named
// handlers because the markup wires them by name.

// Highlights (or un-highlights) the drop zone with this id while a file hovers.
export function setDropzoneDrag(ev, dropzoneId, on) {
  if (ev) ev.preventDefault();
  const dz = document.getElementById(dropzoneId);
  if (dz) dz.classList.toggle('drag', !!on);
}

// Ends a drop on a single-field drop zone: clears the highlight and hands the
// dropped files to the zone's file input. Returns true when there were files
// to hand over, so the caller can refresh its form.
export function dropFilesIntoInput(ev, dropzoneId, inputId) {
  setDropzoneDrag(ev, dropzoneId, false);
  const input = document.getElementById(inputId);
  const files = ev && ev.dataTransfer && ev.dataTransfer.files;
  if (!input || !files || files.length === 0) return false;
  try { input.files = files; } catch (e) { /* older browsers: ignore */ }
  return true;
}
