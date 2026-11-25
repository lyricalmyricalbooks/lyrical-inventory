// Folding this device's copy of a settings list into the cloud copy, for a
// list whose cloud copy couldn't be read when the app opened.
//
// On a bad connection at start-up a screen falls back to this device's copy,
// which is often empty on a new phone (Open Call even starts a blank
// "General Open Call"). Saving that over the cloud copy wiped every saved
// newsletter or contributor. So the first save after such a start reads the
// cloud copy again and merges: whatever this device has wins, and whatever
// only the cloud has is kept. Something deleted on this device while the
// cloud couldn't be read can come back, which is the safe way round.

/**
 * Records from both lists, matched by `id`. This device's record wins where
 * both have it; the cloud's own records follow this device's in their order.
 * Records with no id are kept from both.
 * @template {{ id?: string }} T
 * @param {T[] | null | undefined} cloud
 * @param {T[] | null | undefined} local
 * @returns {T[]}
 */
export function unionById(cloud, local) {
  const mine = Array.isArray(local) ? local : [];
  const ids = new Set(mine.map(r => r && r.id).filter(Boolean));
  const theirs = (Array.isArray(cloud) ? cloud : []).filter(r => r && !(r.id && ids.has(r.id)));
  return [...mine, ...theirs];
}

/**
 * Open Call data from the cloud with this device's changes laid over it:
 * projects are matched by id, and inside a project both have, contributors
 * are matched by id too (this device's version of a contributor wins).
 * @param {any} cloud
 * @param {any} local
 */
export function mergeOpenCallData(cloud, local) {
  const cloudProjects = (cloud && cloud.projects) || {};
  const localProjects = (local && local.projects) || {};
  const projects = { ...cloudProjects };
  Object.entries(localProjects).forEach(([id, proj]) => {
    const theirs = cloudProjects[id];
    projects[id] = theirs && proj
      ? { ...theirs, ...proj, contributors: unionById(theirs.contributors, proj.contributors) }
      : proj;
  });
  const activeProjectId = (local && local.activeProjectId && projects[local.activeProjectId])
    ? local.activeProjectId
    : ((cloud && cloud.activeProjectId) || (local && local.activeProjectId) || '');
  return { ...(cloud || {}), ...(local || {}), projects, activeProjectId };
}
