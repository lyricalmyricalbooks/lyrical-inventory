import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getStorage, ref as sRef, uploadBytesResumable, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";

const firebaseConfig = {
  apiKey:"AIzaSyB0BTOjfUFZKCVth9eR8iN0mvfkpRIFKSI",
  authDomain:"lyricalmyrical-37c46.firebaseapp.com",
  projectId:"lyricalmyrical-37c46",
  storageBucket:"lyricalmyrical-37c46.firebasestorage.app",
  messagingSenderId:"448719824639",
  appId:"1:448719824639:web:2aa79291b13bf6716ececa"
};
const app = initializeApp(firebaseConfig);
const storage = getStorage(app);
window._fbStorage = storage;
window._fbUploadReceipt = async (file, path) => {
  const storageRef = sRef(storage, `receipts/${path}`);
  const uploadTask = uploadBytesResumable(storageRef, file);
  return new Promise((resolve, reject) => {
    uploadTask.on('state_changed', null, reject, async () => {
      const url = await getDownloadURL(uploadTask.snapshot.ref);
      resolve(url);
    });
  });
};

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
