// ── LIVE SHIPPING READINESS ─────────────────────────────────────────────
//
// Answers one question before any money moves: is this account set up to buy
// a REAL Canada Post label, and will the label that comes out be usable?
//
// This exists because the Developer Portal migration removed the only
// structural difference between test and live. Both modes now address
// api.canadapost-postescanada.ca, so nothing about the request says which one
// you are in — the credentials decide, and the app cannot read a key's
// environment. What it CAN do is check everything else: that the account is
// complete, that the key is the kind this gateway accepts, that the return
// address is real, and that a U.S. parcel has a duty route.
//
// The placeholder checks are the point of the module. buildNonContractShipmentJson
// substitutes a worked example for any sender field left blank — "123 Main St,
// Toronto, ON M4B1B3", phone 416-555-0199 — which is harmless while rehearsing
// and quietly destructive once real: an undeliverable parcel is returned to an
// address that does not exist, and the book is gone.
//
// This is a LEAF module. It imports nothing, and takes the account audit and
// the duty route as inputs rather than computing them, so canadapost.js can use
// the placeholder helpers without a cycle.

/**
 * The stand-in values the shipment builder and the buy handler fall back to.
 * Kept here so the check and the substitution can never drift apart.
 */
export const SHIPMENT_PLACEHOLDERS = {
  senderName: 'Lyricalmyrical Books',
  senderPhone: '4165550199',
  senderAddress1: '123 Main St',
  senderCity: 'Toronto',
  senderProvince: 'ON',
  senderPostalCode: 'M4B1B3',
  destinationPhone: '5555555555',
  destinationPostalCode: '90210',
};

/** Digits only, for comparing phone numbers written in any format. */
export function digitsOf(value) {
  return String(value ?? '').replace(/\D/g, '');
}

/** Letters and digits only, upper-cased — for postal codes and street lines. */
function squash(value) {
  return String(value ?? '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

/** True when a value is one of the built-in stand-ins rather than real detail. */
export function isPlaceholderValue(value, placeholder) {
  const given = squash(value);
  return !!given && given === squash(placeholder);
}

/**
 * Is this sender address the worked example the builder falls back to?
 *
 * Judged as a whole rather than field by field: a publisher who genuinely lives
 * in Toronto should not be warned about their own city, so this only fires when
 * the street line itself is the stand-in, or when the street is missing (which
 * is what causes the substitution in the first place).
 */
export function senderAddressIsPlaceholder(sender = {}) {
  const street = String(sender.address1 ?? '').trim();
  if (!street) return true;
  if (!isPlaceholderValue(street, SHIPMENT_PLACEHOLDERS.senderAddress1)) return false;
  // The street matches. Only call it a placeholder when the rest of the worked
  // example travels with it, so a real "123 Main St" somewhere else is spared.
  return isPlaceholderValue(sender.city, SHIPMENT_PLACEHOLDERS.senderCity)
    && isPlaceholderValue(sender.postalCode, SHIPMENT_PLACEHOLDERS.senderPostalCode);
}

/** Sender fields a Canada Post shipment cannot be created without. */
export function missingSenderFields(sender = {}) {
  const missing = [];
  if (!String(sender.name ?? '').trim()) missing.push('name');
  if (!String(sender.address1 ?? '').trim()) missing.push('street address');
  if (!String(sender.city ?? '').trim()) missing.push('city');
  if (!String(sender.province ?? sender.state ?? '').trim()) missing.push('province');
  if (!String(sender.postalCode ?? '').trim()) missing.push('postal code');
  return missing;
}

/**
 * Canada Post's own credential systems, told apart by shape.
 *
 * The modern JSON gateway takes a Developer Portal client ID (32 hex characters)
 * and exchanges it for a Bearer token. A Developer Program key — issued as
 * "USERNAME:PASSWORD" for the retired soa-gw hosts — is not accepted there under
 * any scheme, and no toggle on the settings card can change that.
 */
export function describeKeyKind(apiKey = '') {
  const key = String(apiKey ?? '').trim();
  if (!key) return 'missing';
  if (key.includes(':')) return 'legacy-combined';
  if (/^[0-9a-f]{32}$/i.test(key)) return 'portal-client-id';
  return 'unrecognised';
}

/**
 * A Zonos Account Key is what makes U.S. duty automatic: sent as X-CPC-Zonos-Key
 * on the shipment call, it lets Canada Post issue the Declaration ID itself. It
 * is an opaque token, so the only check worth making is that what was pasted is
 * plausibly a token rather than an email address, a URL or a Declaration ID
 * pasted into the wrong box — each of which would ride along on every live
 * shipment and be rejected by Canada Post with no useful message.
 */
export function inspectZonosAccountKey(accountKey = '') {
  const key = String(accountKey ?? '').trim();
  if (!key) return { present: false, plausible: false, problem: '' };
  if (/\s/.test(key)) {
    return { present: true, plausible: false, problem: 'It contains a space. An Account Key is a single unbroken token.' };
  }
  if (key.includes('@')) {
    return { present: true, plausible: false, problem: 'That looks like an email address, not an Account Key.' };
  }
  if (/^https?:\/\//i.test(key)) {
    return { present: true, plausible: false, problem: 'That looks like a web address, not an Account Key.' };
  }
  if (/^[a-z0-9]{13}$/.test(key)) {
    return {
      present: true,
      plausible: false,
      problem: 'That is the shape of a 13-character Declaration ID, which belongs in the shipping form — not an Account Key.'
    };
  }
  if (key.length < 16) {
    return { present: true, plausible: false, problem: `It is only ${key.length} characters. Account Keys are longer than that.` };
  }
  return { present: true, plausible: true, problem: '' };
}

const CHECK_OK = 'ok';
const CHECK_BLOCKED = 'blocked';
const CHECK_WARN = 'warn';

/**
 * Assess whether a real label can be bought right now.
 *
 * @param {object}  input
 * @param {object}  input.settings      Tax Centre settings (cpEnabled, cpApiKey, cpTestMode…).
 * @param {object}  input.accountAudit  Result of validateCanadaPostAccount — passed in, not computed, to keep this a leaf.
 * @param {object}  input.sender        Sender fields as the form has them.
 * @param {object}  input.destination   Destination fields, including countryCode.
 * @param {object}  input.dutyRoute     Result of resolveDutyPrepaymentRoute for this destination.
 * @returns {{mode: string, ready: boolean, blockers: string[], warnings: string[], checks: object[]}}
 */
export function assessLiveShippingReadiness({
  settings = {},
  accountAudit = null,
  sender = {},
  destination = {},
  dutyRoute = null,
} = {}) {
  const isTest = !!settings.cpTestMode;
  const isEnabled = settings.cpEnabled !== false;
  const mode = isTest ? 'test' : 'live';
  const checks = [];

  const add = (id, label, status, detail, fix = '') => {
    checks.push({ id, label, status, detail, fix });
  };

  // ── 1. The integration itself ──────────────────────────────────────────
  if (isEnabled) {
    add('enabled', 'Canada Post is switched on', CHECK_OK, 'Rates and labels come from Canada Post directly.');
  } else {
    add('enabled', 'Canada Post is switched off', CHECK_BLOCKED,
      'The shipping screen is showing estimated prices, and no label can be bought.',
      'Turn on “Enable Direct Canada Post API” above and save.');
  }

  // ── 2. Credentials and account ─────────────────────────────────────────
  const kind = describeKeyKind(settings.cpApiKey);
  if (kind === 'missing') {
    add('key', 'API key', CHECK_BLOCKED, 'No Canada Post key saved.', 'Paste your Client ID from the Canada Post Developer Portal.');
  } else if (kind === 'legacy-combined') {
    add('key', 'API key', CHECK_BLOCKED,
      'That key is in the old “username:password” form, which this gateway does not accept.',
      'Get a Client ID and Client Secret from the Canada Post Developer Portal and paste them in the two boxes.');
  } else if (kind === 'portal-client-id') {
    add('key', 'API key', CHECK_OK, 'A Developer Portal Client ID is saved.');
  } else {
    add('key', 'API key', CHECK_WARN,
      'This key is not the usual 32-character Client ID. It may still work, but check it came from the Developer Portal.');
  }

  const auditErrors = Array.isArray(accountAudit?.errors) ? accountAudit.errors : [];
  if (auditErrors.length) {
    add('account', 'Account details', CHECK_BLOCKED, auditErrors[0], 'Fill in the missing field above and save.');
  } else {
    add('account', 'Account details', CHECK_OK,
      `Labels will be billed to Canada Post account ${accountAudit?.customerNumber || '—'}.`);
  }

  // ── 3. The return address on every parcel ──────────────────────────────
  const missing = missingSenderFields(sender);
  if (missing.length) {
    add('sender', 'Return address', CHECK_BLOCKED,
      `Your own ${missing.join(', ')} ${missing.length === 1 ? 'is' : 'are'} blank, so a stand-in address would be printed instead.`,
      'Fill in your address in the Sender panel of the shipping form.');
  } else if (senderAddressIsPlaceholder(sender)) {
    add('sender', 'Return address', CHECK_BLOCKED,
      'The return address is still the example one (123 Main St, Toronto). A parcel that cannot be delivered would be returned to an address that does not exist.',
      'Replace it with your real address in the Sender panel.');
  } else {
    add('sender', 'Return address', CHECK_OK, 'Your own address will be printed on the label.');
  }

  // Canada Post requires a sender contact number on a shipment, so a blank one
  // blocks rather than warns: sending it empty earns a schema error that reads
  // like an address problem, and sending a stand-in puts a number on a live
  // label that nobody answers.
  const senderPhone = digitsOf(sender.phone);
  if (!senderPhone) {
    add('sender-phone', 'Your phone number', CHECK_BLOCKED,
      'Blank. Canada Post needs a contact number for the sender on every shipment.',
      'Add your phone number in the Sender panel.');
  } else if (senderPhone === SHIPMENT_PLACEHOLDERS.senderPhone) {
    add('sender-phone', 'Your phone number', CHECK_WARN,
      'Still the example number (416-555-0199).',
      'Replace it with your real number in the Sender panel.');
  } else {
    add('sender-phone', 'Your phone number', CHECK_OK, 'A real number will be printed on the label.');
  }

  // ── 4. Where this parcel is going ──────────────────────────────────────
  const destCountry = String(destination.countryCode || '').toUpperCase();
  const destPhone = digitsOf(destination.phone);
  if (destCountry && destCountry !== 'CA') {
    if (!destPhone || destPhone === SHIPMENT_PLACEHOLDERS.destinationPhone) {
      add('recipient-phone', 'Recipient phone number', CHECK_WARN,
        'Blank or still the example number. Customs can hold an international parcel with no contact number.',
        'Ask the customer for a phone number and put it in the Recipient panel.');
    } else {
      add('recipient-phone', 'Recipient phone number', CHECK_OK, 'Customs has a contact number for this parcel.');
    }
  }

  // ── 5. U.S. duty ───────────────────────────────────────────────────────
  if (destCountry === 'US' && dutyRoute) {
    if (dutyRoute.route === 'verified') {
      add('duty', 'U.S. duty', CHECK_OK,
        'Your Zonos Verified Account is connected — Canada Post adds the Declaration ID and bills the duty automatically.');
    } else if (dutyRoute.route === 'manual') {
      add('duty', 'U.S. duty', CHECK_OK,
        `Declaration ID ${dutyRoute.declarationId} is entered and will travel with the label.`);
    } else {
      add('duty', 'U.S. duty', CHECK_WARN,
        'No prepaid duty for this parcel. It can still be sent, but the customer is billed on delivery and may refuse it.',
        'Save a Zonos Account Key in the Tax Centre\u2019s Zonos section to make this automatic, or buy the declaration in the Zonos Prepay app.');
    }
  }

  // ── 6. Which environment this actually is ──────────────────────────────
  if (isTest) {
    add('mode', 'Sandbox keys are switched on', CHECK_WARN,
      'Canada Post serves test and live from the same address, so this is only a test if the key above is a development key. With a production key this buys real, billable labels.',
      'Turn off “Sandbox keys” once you are ready to ship for real.');
  } else {
    add('mode', 'Live purchasing', CHECK_OK, 'Labels bought here are real, charged to your account, and can be mailed.');
  }

  const blockers = checks.filter(c => c.status === CHECK_BLOCKED).map(c => c.detail);
  const warnings = checks.filter(c => c.status === CHECK_WARN).map(c => c.detail);

  return { mode, ready: blockers.length === 0, blockers, warnings, checks };
}
