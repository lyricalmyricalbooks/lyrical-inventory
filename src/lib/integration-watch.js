// Reporting on a check that runs by itself.
//
// integration-health.js holds the judgement — what a failure means, when it has
// earned an interruption, how long to wait before asking again. This is the
// half that touches the world: it keeps the record in browser storage, raises
// the card, and sets the mark that stays on the tab after the card is
// dismissed.
//
// It sits in lib rather than in either feature because both the storefront
// watch and the label watch need it, and neither should have to import the
// other to say that it is not working.

import { dismissAppAlert, pushAppAlert } from './app-alert.js';
import {
  describeIntegrationHealth,
  describeIntegrationRecovery,
  healthBackoffMs,
  justRecovered,
  readHealthRecords,
  readHealthState,
  recordFailure,
  recordSuccess,
  shouldAnnounceFailure,
  writeHealthState,
} from './integration-health.js';

/**
 * The services this speaks for. `label` is what the publisher is shown, so it
 * is the storefront's own name rather than an internal id.
 */
export const INTEGRATIONS = Object.freeze({
  bigcartel: { id: 'bigcartel', label: 'Big Cartel' },
  shippo: { id: 'shippo', label: 'Shippo' },
  canadapost: { id: 'canadapost', label: 'Canada Post' },
  'shipping-email': { id: 'shipping-email', label: 'Shipping email scan' },
});

const store = () => (typeof localStorage === 'undefined' ? null : localStorage);
const alertId = (id) => `health-${id}`;

function labelFor(id) {
  return INTEGRATIONS[id]?.label || 'This service';
}

/**
 * The mark that outlives the card.
 *
 * Dismissing a notification should clear the notification, not the problem, so
 * the fault also shows on the tab it belongs to and stays there until a check
 * actually succeeds. Painted from `data-health-badge` attributes rather than a
 * hard-coded element list, so a tab can carry the mark wherever it appears —
 * the sidebar and the tab bar both, as the storefront gap badge already does.
 */
export function renderIntegrationBadges() {
  if (typeof document === 'undefined') return;
  // Records read once rather than per node: this runs after every successful
  // check, on a five-minute timer, and each service is marked in two places.
  const records = readHealthRecords(store());
  document.querySelectorAll('[data-health-badge]').forEach(node => {
    // A comma-separated list, because one tab can host several services — the
    // Tax Centre holds Shippo and Canada Post both — and a mark per service on
    // the same button would be a row of identical dots saying one thing.
    const ids = String(node.getAttribute('data-health-badge') || '')
      .split(',').map(id => id.trim()).filter(Boolean);
    const faulty = ids.filter(id => shouldAnnounceFailure(records[id]));
    node.hidden = !faulty.length;
    if (faulty.length) {
      node.textContent = '!';
      node.setAttribute('title', `${faulty.map(labelFor).join(' and ')} ${faulty.length === 1 ? 'is' : 'are'} not answering — open to see why`);
    }
  });
}

/**
 * Record that a check failed, and say so if it has earned it.
 *
 * `online` and `configured` are passed through to the judgement rather than
 * checked here: a device with no connection, or a service with no key, must
 * still have its failure counted — it just must not be talked about. Counting
 * it is what lets the backoff widen while the app is offline, instead of
 * hammering the moment the signal returns.
 */
export function noteIntegrationFailure(id, error, { online = true, configured = true } = {}) {
  const key = String(id || '').trim();
  if (!key) return null;
  const prior = readHealthState(store(), key);
  const folded = recordFailure(prior, { error });

  const said = describeIntegrationHealth({
    label: labelFor(key), state: folded, online, configured,
  });

  // Raised once per fault, not once per failed check. The publisher chose a
  // card they can dismiss plus a mark that stays, so re-pushing the card every
  // five minutes would undo the dismissal they just made and turn the whole
  // corner into something to swat away. The exception is a fault that changes
  // character — an unreachable service that turns out to be a refused key is
  // different news and gets said again.
  const alreadySaid = prior.announced && prior.category === folded.category;
  const speak = said.visible && !alreadySaid;

  const next = writeHealthState(store(), key, {
    ...folded,
    announced: said.visible || prior.announced,
  });

  if (speak) {
    pushAppAlert({
      id: alertId(key),
      icon: said.icon,
      title: said.title,
      detail: said.meta ? `${said.detail} ${said.meta}.` : said.detail,
      tone: said.tone,
      actionLabel: said.action?.label || '',
      action: `recheckIntegration('${key}')`,
    });
  }
  renderIntegrationBadges();
  return next;
}

/**
 * Record that a check worked. Says "working again" exactly once, and only when
 * somebody was told it was broken in the first place.
 */
export function noteIntegrationSuccess(id) {
  const key = String(id || '').trim();
  if (!key) return null;
  const prior = readHealthState(store(), key);
  // Nothing was wrong and nothing is wrong: no write, no card, no repaint. This
  // runs after every successful check on a five-minute timer, and the ordinary
  // case is by far the most common one.
  if (!prior.attempts && !prior.announced) return prior;

  const healed = recordSuccess(prior);
  const next = writeHealthState(store(), key, healed);

  if (justRecovered(healed)) {
    const said = describeIntegrationRecovery(labelFor(key));
    pushAppAlert({
      id: alertId(key),
      icon: said.icon,
      title: said.title,
      detail: said.detail,
      tone: said.tone,
    });
  } else {
    dismissAppAlert(alertId(key));
  }
  renderIntegrationBadges();
  return next;
}

/**
 * How long this integration should wait before being asked again.
 *
 * Zero while it is healthy, widening once it has failed twice running. Callers
 * fold it into their own interval, so a dead endpoint stops being polled every
 * five minutes forever without any change to the watch gates themselves.
 */
export function integrationBackoffMs(id, baseMs) {
  return healthBackoffMs(readHealthState(store(), String(id || '').trim()).attempts, baseMs);
}

/** Whether this integration is currently in a fault the publisher was told about. */
export function integrationIsFaulty(id) {
  return shouldAnnounceFailure(readHealthState(store(), String(id || '').trim()));
}
