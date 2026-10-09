// The Apps Script web app no longer answers anonymous callers: every request
// except the plain health check carries the signed-in user's Firebase ID token
// (GET: ?idToken=..., POST: a top-level "idToken" field in the JSON body).
// Rather than touch each of the ~30 call sites, one wrapper around fetch adds
// the token to any request aimed at an Apps Script web-app address.
const GAS_HOSTS = new Set(['script.google.com', 'script.googleusercontent.com']);

export function isGasUrl(input) {
  try {
    const u = new URL(typeof input === 'string' ? input : input && input.url, 'https://invalid.example/');
    return u.protocol === 'https:' && GAS_HOSTS.has(u.hostname);
  } catch (_) { return false; }
}

// Returns [input, init] with the token attached. Leaves non-Apps-Script
// requests, token-less calls and bodies that already carry a token untouched.
export function withGasToken(input, init, token) {
  if (!token || typeof input !== 'string' || !isGasUrl(input)) return [input, init];
  const method = String((init && init.method) || 'GET').toUpperCase();
  if (method === 'GET') {
    if (/[?&]idToken=/.test(input)) return [input, init];
    // The bare health/capabilities GET stays anonymous.
    if (!/[?&]action=/.test(input)) return [input, init];
    return [input + (input.includes('?') ? '&' : '?') + 'idToken=' + encodeURIComponent(token), init];
  }
  const body = init && init.body;
  if (method === 'POST' && typeof body === 'string' && body.length > 2 && body[0] === '{' && body[1] === '"') {
    // Our key goes first, so a body that already carries its own idToken
    // (receipt finder) keeps it: JSON.parse takes the last duplicate.
    return [input, { ...init, body: '{"idToken":' + JSON.stringify(token) + ',' + body.slice(1) }];
  }
  return [input, init];
}

export function installGasAuth(getToken, target = globalThis) {
  if (!target.fetch || target.fetch.__gasAuth) return;
  const original = target.fetch.bind(target);
  const wrapped = async function (input, init) {
    if (typeof input === 'string' && isGasUrl(input)) {
      let token = '';
      try { token = await getToken(); } catch (_) { token = ''; }
      [input, init] = withGasToken(input, init, token);
    }
    return original(input, init);
  };
  wrapped.__gasAuth = true;
  target.fetch = wrapped;
}
