// View state only. Never store financial data or duplicate existing controls.
export function createPhonePageMemory(win) {
  const positions = new Map();
  let frame = null;
  const phone = () => win.matchMedia?.('(max-width: 768px)').matches;
  return {
    leave(key) {
      if (phone() && key) positions.set(key, win.scrollY);
      if (frame !== null) win.cancelAnimationFrame(frame);
      frame = null;
    },
    enter(key) {
      if (!phone()) return;
      if (frame !== null) win.cancelAnimationFrame(frame);
      const top = positions.get(key) || 0;
      frame = win.requestAnimationFrame(() => {
        frame = null;
        win.scrollTo({ top, left: 0, behavior: 'instant' });
      });
    },
    clear() {
      positions.clear();
      if (frame !== null) win.cancelAnimationFrame(frame);
      frame = null;
    },
  };
}

// Move the original nodes, with their listeners and visibility intact, into
// the account menu on phones. Restore them in order on desktop or author view.
export function initPhoneWorkspace(root, win = window) {
  const menu = root.querySelector('#phone-account-tools');
  const header = root.querySelector('.app-header');
  const chip = root.ownerDocument.getElementById('sync-chip');
  if (!menu || !header) return () => {};
  const media = win.matchMedia('(max-width: 768px)');
  const ids = ['profile-toggle-group', 'role-toggle-btn'];
  const moves = ids.map(id => {
    const node = root.querySelector(`#${id}`);
    if (!node) return null;
    const marker = root.ownerDocument.createComment(`phone home: ${id}`);
    node.before(marker);
    return { node, marker };
  }).filter(Boolean);
  let chipMarker;
  if (chip) { chipMarker = root.ownerDocument.createComment('sync chip home'); chip.before(chipMarker); }
  const update = () => {
    const compact = media.matches && root.classList.contains('pub-shell');
    for (const { node, marker } of moves) {
      if (compact) menu.append(node); else marker.after(node);
    }
    if (chip) { if (compact) header.after(chip); else chipMarker.after(chip); }
  };
  media.addEventListener('change', update);
  const observer = new MutationObserver(update);
  observer.observe(root, { attributes: true, attributeFilter: ['class'] });
  update();
  return () => {
    media.removeEventListener('change', update);
    observer.disconnect();
    moves.forEach(({ node, marker }) => { marker.after(node); marker.remove(); });
    if (chip) { chipMarker.after(chip); chipMarker.remove(); }
  };
}
