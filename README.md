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

## Quality checks

```bash
# Run the linter (warnings are informational; CI exits 0 unless there are errors)
npm run lint

# Run the test suite (currently covers pure money/currency helpers in src/lib)
npm test

# Watch mode while developing
npm run test:watch
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
