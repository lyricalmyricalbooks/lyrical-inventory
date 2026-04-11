const API_BASE = (window.__LM_BACKEND_URL__ || localStorage.getItem('lm-backend-url') || 'http://localhost:8787').replace(/\/$/, '');
const TOKEN_KEY = 'lm-backend-token';
const USER_KEY = 'lm-backend-user';

function getToken() {
  return localStorage.getItem(TOKEN_KEY) || '';
}

function getUser() {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY) || 'null');
  } catch {
    return null;
  }
}

async function api(path, { method = 'GET', body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || `Request failed (${res.status})`);
  }
  return data;
}

window._fbAuth = { provider: 'custom-backend' };

window._fbSignInWithGoogle = async () => {
  const password = window.prompt('Enter admin password');
  if (!password) throw new Error('Login cancelled');
  const result = await api('/api/auth/login', { method: 'POST', body: { password } });

  localStorage.setItem(TOKEN_KEY, result.token);
  const user = { email: 'lyricalmyrical@gmail.com' };
  localStorage.setItem(USER_KEY, JSON.stringify(user));

  return { user };
};

window._fbSignOut = async () => {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
};

window._fbOnAuthStateChanged = (cb) => {
  cb(getUser());
};

window._fbSave = async (bookId, json) => {
  await api(`/api/inventory/books/${encodeURIComponent(bookId)}`, { method: 'PUT', body: { data: json } });
};

window._fbLoad = async (bookId) => {
  const data = await api(`/api/inventory/books/${encodeURIComponent(bookId)}`);
  return data?.data ?? null;
};

window._fbWatch = async (bookId, cb) => {
  const value = await window._fbLoad(bookId);
  if (value) cb(value);
};

window._fbSaveSettings = async (key, data) => {
  await api(`/api/inventory/settings/${encodeURIComponent(key)}`, { method: 'PUT', body: { data } });
};

window._fbLoadSettings = async (key) => {
  const payload = await api(`/api/inventory/settings/${encodeURIComponent(key)}`);
  return payload?.data ?? null;
};

window._fbSaveCatalog = async (catalog) => {
  await api('/api/inventory/catalog', { method: 'PUT', body: { data: catalog } });
};

window._fbLoadCatalog = async () => {
  const payload = await api('/api/inventory/catalog');
  return payload?.data ?? null;
};

window._fbReady = true;
document.dispatchEvent(new Event('firebase-ready'));
