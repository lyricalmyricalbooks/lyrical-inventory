import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

loadEnv(path.join(__dirname, '.env'));

const PORT = Number(process.env.BACKEND_PORT || process.env.PORT || 8787);
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'change-me';
const TOKEN_SECRET = process.env.TOKEN_SECRET || 'change-me-secret';
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'store.json');

ensureDataFile();
let store = readStore();

const server = http.createServer(async (req, res) => {
  try {
    setCors(res);

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url, `http://${req.headers.host}`);
    const route = `${req.method} ${url.pathname}`;

    if (route === 'GET /health') return sendJson(res, 200, { ok: true, uptime: process.uptime() });
    if (route === 'POST /api/auth/login') return handleLogin(req, res);

    const user = requireAuth(req, res);
    if (!user) return;

    if (route === 'GET /api/dashboard/stats') return sendJson(res, 200, buildDashboardStats());
    if (route === 'GET /api/audit-log') return sendJson(res, 200, { items: store.auditLog.slice(-200).reverse() });

    if (url.pathname === '/api/website-settings') {
      if (req.method === 'GET') return sendJson(res, 200, store.websiteSettings);
      if (req.method === 'PUT') return handleUpdateWebsiteSettings(req, res, user);
    }

    if (url.pathname === '/api/shipping-profiles' && req.method === 'GET') {
      return sendJson(res, 200, { items: Object.values(store.shippingProfiles) });
    }
    if (url.pathname === '/api/shipping-profiles' && req.method === 'POST') {
      return handleCreateShippingProfile(req, res, user);
    }

    if (url.pathname.startsWith('/api/shipping-profiles/')) {
      const id = url.pathname.split('/').pop();
      if (req.method === 'GET') return handleGetById(res, store.shippingProfiles, id, 'Shipping profile');
      if (req.method === 'PUT') return handleUpdateShippingProfile(req, res, user, id);
      if (req.method === 'DELETE') return handleDeleteShippingProfile(res, user, id);
    }

    if (url.pathname === '/api/authors' && req.method === 'GET') {
      return sendJson(res, 200, { items: Object.values(store.authors) });
    }
    if (url.pathname === '/api/authors' && req.method === 'POST') {
      return handleCreateAuthor(req, res, user);
    }

    if (url.pathname.startsWith('/api/authors/')) {
      const id = url.pathname.split('/').pop();
      if (req.method === 'GET') return handleGetById(res, store.authors, id, 'Author');
      if (req.method === 'PUT') return handleUpdateAuthor(req, res, user, id);
      if (req.method === 'DELETE') return handleDeleteAuthor(res, user, id);
    }

    if (url.pathname === '/api/books' && req.method === 'GET') {
      return sendJson(res, 200, { items: Object.values(store.books) });
    }
    if (url.pathname === '/api/books' && req.method === 'POST') {
      return handleCreateBook(req, res, user);
    }

    if (url.pathname.match(/^\/api\/books\/[^/]+\/photos$/) && req.method === 'POST') {
      const id = url.pathname.split('/')[3];
      return handleAddBookPhoto(req, res, user, id);
    }

    if (url.pathname.match(/^\/api\/books\/[^/]+\/photos\/[^/]+$/) && req.method === 'DELETE') {
      const [, , , bookId, , photoId] = url.pathname.split('/');
      return handleDeleteBookPhoto(res, user, bookId, photoId);
    }

    if (url.pathname.startsWith('/api/books/')) {
      const id = url.pathname.split('/').pop();
      if (req.method === 'GET') return handleGetById(res, store.books, id, 'Book');
      if (req.method === 'PUT') return handleUpdateBook(req, res, user, id);
      if (req.method === 'DELETE') return handleDeleteBook(res, user, id);
    }

    // Compatibility endpoints for existing frontend data model.
    if (url.pathname.match(/^\/api\/inventory\/books\/[^/]+$/)) {
      const bookId = url.pathname.split('/').pop();
      if (req.method === 'GET') {
        return sendJson(res, 200, { data: store.inventory.books[bookId] ?? null });
      }
      if (req.method === 'PUT') {
        const body = await readJson(req, res);
        if (!body) return;
        store.inventory.books[bookId] = body.data;
        appendAudit(user.email, 'inventory.book.updated', { bookId });
        persist();
        return sendJson(res, 200, { ok: true });
      }
    }

    if (url.pathname.match(/^\/api\/inventory\/settings\/[^/]+$/)) {
      const key = url.pathname.split('/').pop();
      if (req.method === 'GET') return sendJson(res, 200, { data: store.inventory.settings[key] ?? null });
      if (req.method === 'PUT') {
        const body = await readJson(req, res);
        if (!body) return;
        store.inventory.settings[key] = body.data;
        appendAudit(user.email, 'inventory.settings.updated', { key });
        persist();
        return sendJson(res, 200, { ok: true });
      }
    }

    if (url.pathname === '/api/inventory/catalog') {
      if (req.method === 'GET') return sendJson(res, 200, { data: store.inventory.catalog ?? null });
      if (req.method === 'PUT') {
        const body = await readJson(req, res);
        if (!body) return;
        store.inventory.catalog = body.data;
        appendAudit(user.email, 'inventory.catalog.updated');
        persist();
        return sendJson(res, 200, { ok: true });
      }
    }

    sendJson(res, 404, { error: 'Not Found' });
  } catch (err) {
    console.error(err);
    sendJson(res, 500, { error: 'Internal Server Error' });
  }
});

server.listen(PORT, () => {
  console.log(`Backend listening on http://localhost:${PORT}`);
});

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', CORS_ORIGIN);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
}

async function handleLogin(req, res) {
  const body = await readJson(req, res);
  if (!body) return;
  if (body.password !== ADMIN_PASSWORD) return sendJson(res, 401, { error: 'Invalid credentials' });

  const token = signToken({ email: 'admin@local', role: 'admin' });
  sendJson(res, 200, { token, user: { email: 'admin@local', role: 'admin' } });
}

function requireAuth(req, res) {
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ')) {
    sendJson(res, 401, { error: 'Missing bearer token' });
    return null;
  }
  const token = auth.slice('Bearer '.length);
  const payload = verifyToken(token);
  if (!payload) {
    sendJson(res, 401, { error: 'Invalid or expired token' });
    return null;
  }
  return payload;
}

function signToken(payload) {
  const exp = Date.now() + 1000 * 60 * 60 * 12;
  const body = Buffer.from(JSON.stringify({ ...payload, exp })).toString('base64url');
  const sig = crypto.createHmac('sha256', TOKEN_SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function verifyToken(token) {
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expectedSig = crypto.createHmac('sha256', TOKEN_SECRET).update(body).digest('base64url');
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) return null;
  const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  if (!payload.exp || Date.now() > payload.exp) return null;
  return payload;
}

async function handleCreateShippingProfile(req, res, user) {
  const body = await readJson(req, res);
  if (!body) return;
  const id = slug(body.name || `shipping-${Date.now()}`);
  const profile = {
    id,
    name: String(body.name || '').trim(),
    carrier: String(body.carrier || '').trim(),
    serviceLevel: String(body.serviceLevel || '').trim(),
    price: num(body.price),
    currency: body.currency || 'USD',
    estimatedDays: String(body.estimatedDays || '').trim(),
    region: String(body.region || '').trim(),
    active: body.active !== false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  if (!profile.name) return sendJson(res, 400, { error: 'name is required' });
  store.shippingProfiles[id] = profile;
  appendAudit(user.email, 'shipping.create', { id });
  persist();
  sendJson(res, 201, profile);
}

async function handleUpdateShippingProfile(req, res, user, id) {
  const current = store.shippingProfiles[id];
  if (!current) return sendJson(res, 404, { error: 'Shipping profile not found' });
  const body = await readJson(req, res);
  if (!body) return;
  store.shippingProfiles[id] = { ...current, ...body, id, updatedAt: new Date().toISOString() };
  appendAudit(user.email, 'shipping.update', { id });
  persist();
  sendJson(res, 200, store.shippingProfiles[id]);
}

function handleDeleteShippingProfile(res, user, id) {
  if (!store.shippingProfiles[id]) return sendJson(res, 404, { error: 'Shipping profile not found' });
  const inUse = Object.values(store.books).some((b) => b.shippingProfileId === id);
  if (inUse) return sendJson(res, 409, { error: 'Shipping profile is in use by a book' });
  delete store.shippingProfiles[id];
  appendAudit(user.email, 'shipping.delete', { id });
  persist();
  sendJson(res, 200, { ok: true });
}

async function handleCreateAuthor(req, res, user) {
  const body = await readJson(req, res);
  if (!body) return;
  const id = slug(body.name || `author-${Date.now()}`);
  const author = {
    id,
    name: String(body.name || '').trim(),
    email: String(body.email || '').trim().toLowerCase(),
    bio: String(body.bio || '').trim(),
    website: String(body.website || '').trim(),
    social: body.social || {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  if (!author.name) return sendJson(res, 400, { error: 'name is required' });
  store.authors[id] = author;
  appendAudit(user.email, 'author.create', { id });
  persist();
  sendJson(res, 201, author);
}

async function handleUpdateAuthor(req, res, user, id) {
  const current = store.authors[id];
  if (!current) return sendJson(res, 404, { error: 'Author not found' });
  const body = await readJson(req, res);
  if (!body) return;
  store.authors[id] = { ...current, ...body, id, updatedAt: new Date().toISOString() };
  appendAudit(user.email, 'author.update', { id });
  persist();
  sendJson(res, 200, store.authors[id]);
}

function handleDeleteAuthor(res, user, id) {
  if (!store.authors[id]) return sendJson(res, 404, { error: 'Author not found' });
  const inUse = Object.values(store.books).some((b) => (b.authorIds || []).includes(id));
  if (inUse) return sendJson(res, 409, { error: 'Author is in use by one or more books' });
  delete store.authors[id];
  appendAudit(user.email, 'author.delete', { id });
  persist();
  sendJson(res, 200, { ok: true });
}

async function handleCreateBook(req, res, user) {
  const body = await readJson(req, res);
  if (!body) return;
  const id = slug(body.slug || body.title || `book-${Date.now()}`);
  if (store.books[id]) return sendJson(res, 409, { error: 'Book already exists' });
  const book = normalizeBook({ id, ...body });
  if (!book.title) return sendJson(res, 400, { error: 'title is required' });
  store.books[id] = book;
  appendAudit(user.email, 'book.create', { id });
  persist();
  sendJson(res, 201, book);
}

async function handleUpdateBook(req, res, user, id) {
  const current = store.books[id];
  if (!current) return sendJson(res, 404, { error: 'Book not found' });
  const body = await readJson(req, res);
  if (!body) return;
  const book = normalizeBook({ ...current, ...body, id, photos: current.photos });
  store.books[id] = book;
  appendAudit(user.email, 'book.update', { id });
  persist();
  sendJson(res, 200, book);
}

function handleDeleteBook(res, user, id) {
  if (!store.books[id]) return sendJson(res, 404, { error: 'Book not found' });
  delete store.books[id];
  appendAudit(user.email, 'book.delete', { id });
  persist();
  sendJson(res, 200, { ok: true });
}

async function handleAddBookPhoto(req, res, user, id) {
  const book = store.books[id];
  if (!book) return sendJson(res, 404, { error: 'Book not found' });
  const body = await readJson(req, res);
  if (!body) return;
  if (!Array.isArray(book.photos)) book.photos = [];
  if (book.photos.length >= 10) return sendJson(res, 409, { error: 'Maximum 10 photos allowed per book' });

  const photo = {
    id: crypto.randomUUID(),
    url: String(body.url || '').trim(),
    alt: String(body.alt || '').trim(),
    sortOrder: Number.isFinite(Number(body.sortOrder)) ? Number(body.sortOrder) : book.photos.length,
    createdAt: new Date().toISOString(),
  };
  if (!photo.url) return sendJson(res, 400, { error: 'url is required' });

  book.photos.push(photo);
  book.updatedAt = new Date().toISOString();
  appendAudit(user.email, 'book.photo.add', { id, photoId: photo.id });
  persist();
  sendJson(res, 201, photo);
}

function handleDeleteBookPhoto(res, user, bookId, photoId) {
  const book = store.books[bookId];
  if (!book) return sendJson(res, 404, { error: 'Book not found' });
  const before = book.photos?.length || 0;
  book.photos = (book.photos || []).filter((p) => p.id !== photoId);
  if (book.photos.length === before) return sendJson(res, 404, { error: 'Photo not found' });
  book.updatedAt = new Date().toISOString();
  appendAudit(user.email, 'book.photo.delete', { id: bookId, photoId });
  persist();
  sendJson(res, 200, { ok: true });
}

async function handleUpdateWebsiteSettings(req, res, user) {
  const body = await readJson(req, res);
  if (!body) return;
  store.websiteSettings = {
    ...store.websiteSettings,
    ...body,
    updatedAt: new Date().toISOString(),
  };
  appendAudit(user.email, 'settings.website.update');
  persist();
  sendJson(res, 200, store.websiteSettings);
}

function normalizeBook(raw) {
  return {
    id: raw.id,
    title: str(raw.title),
    subtitle: str(raw.subtitle),
    isbn: str(raw.isbn),
    sku: str(raw.sku),
    publicationDate: str(raw.publicationDate),
    format: str(raw.format),
    status: str(raw.status || 'draft'),
    language: str(raw.language || 'en'),
    pageCount: int(raw.pageCount),
    listPrice: num(raw.listPrice),
    salePrice: num(raw.salePrice),
    currency: str(raw.currency || 'USD'),
    inventoryCount: int(raw.inventoryCount),
    lowStockThreshold: int(raw.lowStockThreshold),
    shippingProfileId: str(raw.shippingProfileId),
    authorIds: Array.isArray(raw.authorIds) ? raw.authorIds : [],
    genres: Array.isArray(raw.genres) ? raw.genres : [],
    tags: Array.isArray(raw.tags) ? raw.tags : [],
    seoTitle: str(raw.seoTitle),
    seoDescription: str(raw.seoDescription),
    featured: Boolean(raw.featured),
    photos: Array.isArray(raw.photos) ? raw.photos.slice(0, 10) : [],
    createdAt: raw.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function buildDashboardStats() {
  const books = Object.values(store.books);
  const totalInventory = books.reduce((sum, b) => sum + (Number(b.inventoryCount) || 0), 0);
  const lowStockBooks = books.filter((b) => (Number(b.inventoryCount) || 0) <= (Number(b.lowStockThreshold) || 0)).length;
  const featuredBooks = books.filter((b) => b.featured).length;
  return {
    books: books.length,
    authors: Object.keys(store.authors).length,
    shippingProfiles: Object.keys(store.shippingProfiles).length,
    totalInventory,
    lowStockBooks,
    featuredBooks,
    updatedAt: new Date().toISOString(),
  };
}

function handleGetById(res, collection, id, label) {
  const record = collection[id];
  if (!record) return sendJson(res, 404, { error: `${label} not found` });
  sendJson(res, 200, record);
}

function appendAudit(actor, action, metadata = {}) {
  store.auditLog.push({
    id: crypto.randomUUID(),
    actor,
    action,
    metadata,
    at: new Date().toISOString(),
  });
  if (store.auditLog.length > 1000) {
    store.auditLog = store.auditLog.slice(-1000);
  }
}

function ensureDataFile() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(defaultStore(), null, 2));
  }
}

function readStore() {
  const content = fs.readFileSync(DATA_FILE, 'utf8');
  const parsed = JSON.parse(content);
  return { ...defaultStore(), ...parsed };
}

function persist() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2));
}

function defaultStore() {
  return {
    books: {},
    authors: {},
    shippingProfiles: {},
    websiteSettings: {
      siteName: 'Lyricalmyrical Books',
      seo: { titleTemplate: '%s · Lyricalmyrical Books', defaultDescription: '' },
      merchandising: { featuredCollectionTitle: 'Featured Books', showBadges: true },
      announcements: [],
      updatedAt: new Date().toISOString(),
    },
    auditLog: [],
    inventory: {
      books: {},
      settings: {},
      catalog: null,
    },
  };
}

async function readJson(req, res) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    sendJson(res, 400, { error: 'Invalid JSON body' });
    return null;
  }
}

function sendJson(res, code, payload) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  const rows = fs.readFileSync(file, 'utf8').split('\n');
  for (const row of rows) {
    const line = row.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

function str(v) { return String(v ?? '').trim(); }
function int(v) { const n = Number(v); return Number.isFinite(n) ? Math.trunc(n) : 0; }
function num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }
function slug(v) {
  return String(v || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || crypto.randomUUID();
}
