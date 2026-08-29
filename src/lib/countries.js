// Country resolution — the single place that turns whatever a country was
// written as into an ISO 3166-1 alpha-2 code.
//
// This exists because of a real mis-filed order. A customer in Serbia was
// counted as a United States sale everywhere in the app: the domestic/
// international margin split, the region filters on the shipping ledger, the
// exported CSV. The cause was a hand-maintained table of about forty countries
// paired with a fallback that answered 'US' for anything missing from it.
// Serbia was missing, so Serbia became the United States — silently, with no
// warning anywhere, and looking exactly like a genuine US order.
//
// Two things follow from that, and both are load-bearing:
//
//   1. The table below is the complete ISO 3166-1 list, not a curated subset.
//      A country the shop has never shipped to before must still resolve the
//      first time it appears, because nobody is going to notice that it didn't.
//
//   2. resolveCountryCode answers '' — never a guess — when it cannot place a
//      value. Callers that need a code for an API payload can still default,
//      but nothing that *classifies* an order is allowed to turn "I don't
//      know" into "United States". See shipmentRegion.

/** ISO 3166-1 alpha-2 → English short name. */
export const ISO_COUNTRIES = {
  AD: 'Andorra', AE: 'United Arab Emirates', AF: 'Afghanistan',
  AG: 'Antigua and Barbuda', AI: 'Anguilla', AL: 'Albania', AM: 'Armenia',
  AO: 'Angola', AQ: 'Antarctica', AR: 'Argentina', AS: 'American Samoa',
  AT: 'Austria', AU: 'Australia', AW: 'Aruba', AX: 'Åland Islands',
  AZ: 'Azerbaijan', BA: 'Bosnia and Herzegovina', BB: 'Barbados',
  BD: 'Bangladesh', BE: 'Belgium', BF: 'Burkina Faso', BG: 'Bulgaria',
  BH: 'Bahrain', BI: 'Burundi', BJ: 'Benin', BL: 'Saint Barthélemy',
  BM: 'Bermuda', BN: 'Brunei', BO: 'Bolivia',
  BQ: 'Bonaire, Sint Eustatius and Saba', BR: 'Brazil', BS: 'Bahamas',
  BT: 'Bhutan', BV: 'Bouvet Island', BW: 'Botswana', BY: 'Belarus',
  BZ: 'Belize', CA: 'Canada', CC: 'Cocos (Keeling) Islands',
  CD: 'Congo (Democratic Republic)', CF: 'Central African Republic',
  CG: 'Congo', CH: 'Switzerland', CI: 'Côte d’Ivoire', CK: 'Cook Islands',
  CL: 'Chile', CM: 'Cameroon', CN: 'China', CO: 'Colombia', CR: 'Costa Rica',
  CU: 'Cuba', CV: 'Cabo Verde', CW: 'Curaçao', CX: 'Christmas Island',
  CY: 'Cyprus', CZ: 'Czechia', DE: 'Germany', DJ: 'Djibouti', DK: 'Denmark',
  DM: 'Dominica', DO: 'Dominican Republic', DZ: 'Algeria', EC: 'Ecuador',
  EE: 'Estonia', EG: 'Egypt', EH: 'Western Sahara', ER: 'Eritrea',
  ES: 'Spain', ET: 'Ethiopia', FI: 'Finland', FJ: 'Fiji',
  FK: 'Falkland Islands', FM: 'Micronesia', FO: 'Faroe Islands', FR: 'France',
  GA: 'Gabon', GB: 'United Kingdom', GD: 'Grenada', GE: 'Georgia',
  GF: 'French Guiana', GG: 'Guernsey', GH: 'Ghana', GI: 'Gibraltar',
  GL: 'Greenland', GM: 'Gambia', GN: 'Guinea', GP: 'Guadeloupe',
  GQ: 'Equatorial Guinea', GR: 'Greece',
  GS: 'South Georgia and the South Sandwich Islands', GT: 'Guatemala',
  GU: 'Guam', GW: 'Guinea-Bissau', GY: 'Guyana', HK: 'Hong Kong',
  HM: 'Heard Island and McDonald Islands', HN: 'Honduras', HR: 'Croatia',
  HT: 'Haiti', HU: 'Hungary', ID: 'Indonesia', IE: 'Ireland', IL: 'Israel',
  IM: 'Isle of Man', IN: 'India', IO: 'British Indian Ocean Territory',
  IQ: 'Iraq', IR: 'Iran', IS: 'Iceland', IT: 'Italy', JE: 'Jersey',
  JM: 'Jamaica', JO: 'Jordan', JP: 'Japan', KE: 'Kenya', KG: 'Kyrgyzstan',
  KH: 'Cambodia', KI: 'Kiribati', KM: 'Comoros', KN: 'Saint Kitts and Nevis',
  KP: 'North Korea', KR: 'South Korea', KW: 'Kuwait', KY: 'Cayman Islands',
  KZ: 'Kazakhstan', LA: 'Laos', LB: 'Lebanon', LC: 'Saint Lucia',
  LI: 'Liechtenstein', LK: 'Sri Lanka', LR: 'Liberia', LS: 'Lesotho',
  LT: 'Lithuania', LU: 'Luxembourg', LV: 'Latvia', LY: 'Libya',
  MA: 'Morocco', MC: 'Monaco', MD: 'Moldova', ME: 'Montenegro',
  MF: 'Saint Martin', MG: 'Madagascar', MH: 'Marshall Islands',
  MK: 'North Macedonia', ML: 'Mali', MM: 'Myanmar', MN: 'Mongolia',
  MO: 'Macao', MP: 'Northern Mariana Islands', MQ: 'Martinique',
  MR: 'Mauritania', MS: 'Montserrat', MT: 'Malta', MU: 'Mauritius',
  MV: 'Maldives', MW: 'Malawi', MX: 'Mexico', MY: 'Malaysia',
  MZ: 'Mozambique', NA: 'Namibia', NC: 'New Caledonia', NE: 'Niger',
  NF: 'Norfolk Island', NG: 'Nigeria', NI: 'Nicaragua', NL: 'Netherlands',
  NO: 'Norway', NP: 'Nepal', NR: 'Nauru', NU: 'Niue', NZ: 'New Zealand',
  OM: 'Oman', PA: 'Panama', PE: 'Peru', PF: 'French Polynesia',
  PG: 'Papua New Guinea', PH: 'Philippines', PK: 'Pakistan', PL: 'Poland',
  PM: 'Saint Pierre and Miquelon', PN: 'Pitcairn', PR: 'Puerto Rico',
  PS: 'Palestine', PT: 'Portugal', PW: 'Palau', PY: 'Paraguay', QA: 'Qatar',
  RE: 'Réunion', RO: 'Romania', RS: 'Serbia', RU: 'Russia', RW: 'Rwanda',
  SA: 'Saudi Arabia', SB: 'Solomon Islands', SC: 'Seychelles', SD: 'Sudan',
  SE: 'Sweden', SG: 'Singapore', SH: 'Saint Helena', SI: 'Slovenia',
  SJ: 'Svalbard and Jan Mayen', SK: 'Slovakia', SL: 'Sierra Leone',
  SM: 'San Marino', SN: 'Senegal', SO: 'Somalia', SR: 'Suriname',
  SS: 'South Sudan', ST: 'São Tomé and Príncipe', SV: 'El Salvador',
  SX: 'Sint Maarten', SY: 'Syria', SZ: 'Eswatini',
  TC: 'Turks and Caicos Islands', TD: 'Chad',
  TF: 'French Southern Territories', TG: 'Togo', TH: 'Thailand',
  TJ: 'Tajikistan', TK: 'Tokelau', TL: 'Timor-Leste', TM: 'Turkmenistan',
  TN: 'Tunisia', TO: 'Tonga', TR: 'Türkiye', TT: 'Trinidad and Tobago',
  TV: 'Tuvalu', TW: 'Taiwan', TZ: 'Tanzania', UA: 'Ukraine', UG: 'Uganda',
  UM: 'United States Minor Outlying Islands', US: 'United States',
  UY: 'Uruguay', UZ: 'Uzbekistan', VA: 'Vatican City',
  VC: 'Saint Vincent and the Grenadines', VE: 'Venezuela',
  VG: 'Virgin Islands (British)', VI: 'Virgin Islands (U.S.)', VN: 'Vietnam',
  VU: 'Vanuatu', WF: 'Wallis and Futuna', WS: 'Samoa', YE: 'Yemen',
  YT: 'Mayotte', ZA: 'South Africa', ZM: 'Zambia', ZW: 'Zimbabwe',
};

// Spellings a person or a storefront actually writes, which are not the ISO
// short name. Storefront checkouts, hand-typed shipping labels and older
// exports all land here, so the list is about what shows up in real orders
// rather than about linguistic completeness.
const COUNTRY_ALIASES = {
  usa: 'US', 'u.s.': 'US', 'u.s.a.': 'US', 'united states of america': 'US',
  america: 'US', 'the united states': 'US',
  uk: 'GB', 'u.k.': 'GB', 'great britain': 'GB', britain: 'GB',
  england: 'GB', scotland: 'GB', wales: 'GB', 'northern ireland': 'GB',
  can: 'CA',
  holland: 'NL', 'the netherlands': 'NL',
  deutschland: 'DE',
  españa: 'ES', espana: 'ES',
  italia: 'IT',
  suisse: 'CH', schweiz: 'CH', svizzera: 'CH',
  osterreich: 'AT', österreich: 'AT',
  'czech republic': 'CZ', czechia: 'CZ',
  'republic of serbia': 'RS', srbija: 'RS', 'serbia and montenegro': 'RS',
  turkey: 'TR', turkiye: 'TR',
  'south korea': 'KR', 'republic of korea': 'KR', korea: 'KR',
  'north korea': 'KP',
  russia: 'RU', 'russian federation': 'RU',
  vietnam: 'VN', 'viet nam': 'VN',
  'ivory coast': 'CI', "cote d'ivoire": 'CI', 'côte d’ivoire': 'CI',
  'cape verde': 'CV',
  swaziland: 'SZ',
  macedonia: 'MK',
  burma: 'MM',
  'east timor': 'TL',
  'hong kong sar': 'HK', 'hong kong sar china': 'HK',
  'macau': 'MO',
  'vatican': 'VA', 'holy see': 'VA',
  'brunei darussalam': 'BN',
  'bolivia (plurinational state of)': 'BO',
  'venezuela (bolivarian republic of)': 'VE',
  'iran (islamic republic of)': 'IR',
  'syrian arab republic': 'SY',
  'lao': 'LA', "lao people's democratic republic": 'LA',
  'republic of ireland': 'IE', eire: 'IE',
  'new zealand aotearoa': 'NZ',
  uae: 'AE', emirates: 'AE',
  'united republic of tanzania': 'TZ',
  'democratic republic of the congo': 'CD', drc: 'CD', 'congo-kinshasa': 'CD',
  'republic of the congo': 'CG', 'congo-brazzaville': 'CG',
  'the gambia': 'GM',
  'the bahamas': 'BS',
  'the philippines': 'PH',
};

// Built once at module load. Keys are lowercased, stripped of accents and
// stripped of the punctuation and spacing that varies between sources, so
// "Bosnia & Herzegovina", "bosnia-and-herzegovina", "Türkiye" and "Turkiye"
// all collapse onto the key their canonical name produces. A near-miss
// spelling resolves instead of falling through to the "unknown" answer.
const NAME_TO_CODE = new Map();

function indexKey(value) {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

for (const [code, name] of Object.entries(ISO_COUNTRIES)) {
  NAME_TO_CODE.set(indexKey(name), code);
  NAME_TO_CODE.set(indexKey(code), code);
}
for (const [alias, code] of Object.entries(COUNTRY_ALIASES)) {
  NAME_TO_CODE.set(indexKey(alias), code);
}

/** Whether a string is an ISO 3166-1 alpha-2 code this table knows. */
export function isCountryCode(value) {
  return typeof value === 'string' && Object.hasOwn(ISO_COUNTRIES, value.trim().toUpperCase());
}

/**
 * Alpha-2 code for a country written any of the usual ways, or '' when the
 * value cannot be placed.
 *
 * Never guesses. An empty answer is the caller's cue to ask rather than to
 * assume, which is the whole point of this module.
 */
export function resolveCountryCode(value) {
  let raw = value;
  // Storefront payloads sometimes carry the country as an object rather than a
  // string, with the code under any of several keys.
  if (raw && typeof raw === 'object') {
    raw = raw.code || raw.iso2 || raw.country_code || raw.alpha2 || raw.id || raw.name || '';
  }
  const text = String(raw ?? '').trim();
  if (!text) return '';
  return NAME_TO_CODE.get(indexKey(text)) || '';
}

/** English short name for a code, or the input unchanged when unrecognized. */
export function countryName(value) {
  const code = resolveCountryCode(value);
  return code ? ISO_COUNTRIES[code] : String(value ?? '').trim();
}

/**
 * Every country as {code, name}, alphabetical by name, with the two the shop
 * ships to most sitting at the top behind a separator.
 */
export function countryOptions() {
  const rest = Object.entries(ISO_COUNTRIES)
    .filter(([code]) => code !== 'CA' && code !== 'US')
    .map(([code, name]) => ({ code, name }))
    .sort((a, b) => a.name.localeCompare(b.name, 'en'));
  return [
    { code: 'CA', name: ISO_COUNTRIES.CA },
    { code: 'US', name: ISO_COUNTRIES.US },
    ...rest,
  ];
}

/**
 * Which bucket an order belongs to on the shipping ledger: 'CA', 'US' or
 * 'intl'.
 *
 * A country this module cannot place is 'intl', never 'US'. That asymmetry is
 * deliberate — the app's origin is Canada, so an unplaceable destination is at
 * worst a foreign one, and filing it under the United States is the specific
 * mistake this module exists to prevent. Unrecognized values should be rare
 * now that the table is complete; use countryIsUnrecognized to surface them.
 */
export function shipmentRegion(value) {
  const code = resolveCountryCode(value);
  if (code === 'CA') return 'CA';
  if (code === 'US') return 'US';
  return 'intl';
}

/** Human label for a region key, for tables and CSV exports. */
export const REGION_LABELS = { CA: 'Canadian', US: 'USA', intl: 'International' };

/**
 * True when a country was written down but could not be placed — a typo, or a
 * name this table has never seen. Worth flagging in the UI: the order still
 * counts as international, but nobody can buy a label for it until it is fixed.
 */
export function countryIsUnrecognized(value) {
  const text = typeof value === 'object' && value !== null
    ? String(value.name ?? value.code ?? '').trim()
    : String(value ?? '').trim();
  return !!text && !resolveCountryCode(text);
}
