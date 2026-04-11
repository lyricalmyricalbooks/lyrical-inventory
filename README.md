# Lyricalmyrical Inventory

This project now includes a local backend service for website/admin settings and catalog management (no Firebase required).

## Backend features

- Password login with signed bearer tokens (`POST /api/auth/login`)
- Book CRUD with publisher metadata (ISBN/SKU/publication details/pricing/inventory/SEO)
- Author CRUD
- Shipping profile CRUD with referential safety (cannot delete profile while used by books)
- Book photo management (`max 10 photos per book`)
- Website settings API (merchandising, SEO, announcements)
- Dashboard stats + audit log
- Inventory compatibility endpoints under `/api/inventory/*`
- JSON file persistence in `backend/data/store.json`

## Run

```bash
npm run dev
npm run dev:backend
```

Run both together:

```bash
npm run dev:all
```

Build frontend:

```bash
npm run build
```

## Backend quickstart

1. Copy env template:
   ```bash
   cp backend/.env.example backend/.env
   ```
2. Set a strong `ADMIN_PASSWORD` and `TOKEN_SECRET`.
3. Start backend:
   ```bash
   npm run dev:backend
   ```
