// Two devices, one book, a flaky connection: thousands of random runs of
// selling, correcting and voiding sales on both, saving whenever the signal
// allows. Whatever the order, once both are back online and synced, no sale
// may be lost, none may be counted twice, a void on either device must stick,
// and the stored totals must match the sales.
//
// It drives the same pieces the real save uses (splitState / mergePart /
// stitchState, as in firebase.js _fbSave, and the totals rebuild run on every
// merge), with a seeded random generator so any failure can be replayed: the
// failing seed is printed, and a seed that ever fails belongs in REGRESSIONS.
import { describe, expect, it } from 'vitest';
import { emptyPart, mergePart, mergeRows, splitState, stitchState } from '../src/lib/merge-state.js';
import { locateConflictTarget } from '../src/lib/sync-conflicts.js';
import { recalculateBookStatsFromHistory } from '../src/lib/inventory.js';

// mulberry32: a tiny seeded generator, so a run is the same every time.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clone = v => JSON.parse(JSON.stringify(v));
const normalize = s => { recalculateBookStatsFromHistory(s); return s; };

function emptyBook() {
  return normalize({ stock: 100, sold: 0, revenue: 0, chStats: {}, invoiceSeq: 1, hist: [], ledger: [], expenses: [], stores: [], artistTransfers: [], artistPayouts: [], artistReceivables: [], doneIds: [] });
}

function makeWorld(seed, { edits }) {
  const rand = rng(seed);
  const pick = list => list[Math.floor(rand() * list.length)];
  const cloud = splitState(clone(emptyBook()));
  const cloudJson = () => Object.fromEntries(Object.entries(cloud).map(([p, v]) => [p, JSON.stringify(v)]));
  const device = name => ({ name, state: stitchState(clone(cloud)), hashes: cloudJson() });
  const devices = [device('shop'), device('laptop')];
  const created = new Set();
  const voided = new Set();
  let n = 0;
  const log = [];

  // What one device does on screen (each followed by the rebuild recomputeAfters runs).
  function act(d) {
    const live = d.state.hist.filter(h => !h.voided);
    const roll = rand();
    if (roll < 0.55 || !live.length) {
      const id = `${d.name}-${++n}`;
      d.state.hist.unshift({ num: `O-${n}`, chan: pick(['Website', 'Book Fair', 'Manual']), qty: 1 + Math.floor(rand() * 3), price: pick([10, 25, 40]), notes: '', date: '2026-10-01', sheetsId: id });
      created.add(id);
      log.push(`${d.name} sells ${id}`);
    } else if (roll < 0.8 || !edits) {
      const h = pick(live);
      h.voided = true;
      voided.add(h.sheetsId);
      log.push(`${d.name} voids ${h.sheetsId}`);
    } else {
      const h = pick(live);
      h.notes = `${h.notes} fixed by ${d.name}`.trim();
      log.push(`${d.name} corrects ${h.sheetsId}`);
    }
    normalize(d.state);
  }

  // _fbSave, part by part: merge each changed part against the base this
  // device last synced, write what changed, and take the merged result.
  function save(d) {
    const parts = splitState(clone(d.state));
    const dirty = Object.keys(parts).filter(p => d.hashes[p] !== JSON.stringify(parts[p]));
    const remote = cloudJson();
    if (!dirty.length) {
      // Nothing to send: the live listener brings in the other device's work.
      d.state = stitchState(clone(cloud));
      d.hashes = remote;
      return;
    }
    const merged = { ...parts };
    let didMerge = false;
    for (const p of dirty) {
      if (remote[p] === d.hashes[p]) continue;
      didMerge = true;
      merged[p] = mergePart(p, JSON.parse(d.hashes[p] ?? JSON.stringify(emptyPart(p))), JSON.parse(remote[p]), parts[p], { baseKnown: d.hashes[p] != null }).value;
    }
    let stitched = stitchState(merged);
    if (didMerge) stitched = normalize(stitched);
    const final = splitState(stitched);
    for (const p of Object.keys(final)) {
      const json = JSON.stringify(final[p]);
      // As _fbSave: a part read from the server is compared with the server's copy.
      const known = dirty.includes(p) ? remote[p] : d.hashes[p];
      if (json !== known) cloud[p] = JSON.parse(json);
      if (json !== known || dirty.includes(p)) d.hashes[p] = json;
    }
    d.state = stitched;
    log.push(`${d.name} saves${didMerge ? ' (merged)' : ''}`);
  }

  function run(steps) {
    for (let i = 0; i < steps; i++) {
      const d = pick(devices);
      act(d);
      if (rand() < 0.45) save(d); // the signal comes and goes
    }
    // Back online: both save until nothing is left to send either way.
    for (let i = 0; i < 6; i++) devices.forEach(save);
  }

  return { run, cloud, devices, created, voided, log };
}

function check(world) {
  const hist = world.cloud.hist;
  const ids = hist.map(h => h.sheetsId);
  const problems = [];
  const lost = [...world.created].filter(id => !ids.includes(id));
  if (lost.length) problems.push(`lost ${lost.join(', ')}`);
  const doubled = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (doubled.length) problems.push(`counted twice ${[...new Set(doubled)].join(', ')}`);
  const unvoided = [...world.voided].filter(id => hist.some(h => h.sheetsId === id && !h.voided));
  if (unvoided.length) problems.push(`void lost on ${unvoided.join(', ')}`);
  const stored = stitchState(clone(world.cloud));
  const rebuilt = normalize(clone(stored));
  if (stored.revenue !== rebuilt.revenue || stored.sold !== rebuilt.sold) problems.push(`totals ${stored.revenue}/${stored.sold} but sales add up to ${rebuilt.revenue}/${rebuilt.sold}`);
  world.devices.forEach(d => {
    if (JSON.stringify(splitState(d.state)) !== JSON.stringify(splitState(stored))) problems.push(`${d.name} did not end on the cloud copy`);
  });
  return problems;
}

// Seeds that once failed, kept so they can never quietly fail again.
const REGRESSIONS = [];

function sweep(seeds, opts) {
  const failures = [];
  for (const seed of seeds) {
    const world = makeWorld(seed, opts);
    world.run(opts.steps);
    const problems = check(world);
    if (problems.length) failures.push({ seed, problems, log: world.log.slice(-12) });
    if (failures.length >= 3) break;
  }
  return failures;
}

const range = (from, count) => Array.from({ length: count }, (_, i) => from + i);

describe('two devices on a flaky connection', () => {
  it('never loses a sale, counts one twice, or drops a void (selling and voiding)', () => {
    const failures = sweep([...REGRESSIONS, ...range(1, 1500)], { steps: 30, edits: false });
    expect(failures, JSON.stringify(failures, null, 1)).toEqual([]);
  });

  it('keeps that true when sales are also corrected on both devices', () => {
    const failures = sweep([...REGRESSIONS, ...range(5001, 1500)], { steps: 30, edits: true });
    expect(failures, JSON.stringify(failures, null, 1)).toEqual([]);
  });
});

// The two cases the sweep first caught, pinned down directly.
describe('one sale changed on both devices', () => {
  const sale = { num: 'O-1', chan: 'Website', qty: 1, price: 40, notes: '', date: '2026-10-01', sheetsId: 'shop-1' };

  it('keeps a void from one and a corrected note from the other, as one sale', () => {
    const { rows, conflicts } = mergeRows('hist', [sale], [{ ...sale, voided: true }], [{ ...sale, notes: 'paid cash' }]);
    expect(rows).toEqual([{ ...sale, voided: true, notes: 'paid cash' }]);
    expect(conflicts).toEqual([]);
  });

  it('reports a field both changed differently, keeps this device\'s, and the conflict can be found again', () => {
    const local = { ...sale, price: 35 };
    const { rows, conflicts } = mergeRows('hist', [sale], [{ ...sale, price: 30 }], [local]);
    expect(rows).toEqual([local]);
    expect(conflicts).toHaveLength(1);
    const target = locateConflictTarget({ hist: rows }, { part: 'hist', key: conflicts[0].key, kept: local, other: { ...sale, price: 30 } });
    expect(target.status).toBe('unchanged');
  });
});
