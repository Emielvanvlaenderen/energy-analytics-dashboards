# Deploy: Energy Analytics Dashboards

This app is split into three parts:

| Piece | Host | Purpose |
|--------|------|---------|
| **UI** | Netlify (static) | React app |
| **API + Python** | Render | Optimisations, guest workspaces, CSV download |
| **Accounts + saved runs** | Supabase | GitHub OAuth, `saved_simulations` table, Storage |

**Auth model**

- **No login** for browsing, editing inputs, running optimisations, and **Download CSV** (latest or selected run).
- **Sign in with GitHub** only when **Save to my account** (persists CSV + optional `study_inputs` snapshot in Supabase).

---

## 0. Prerequisites

- GitHub repo pushed (this project).
- Accounts: [Supabase](https://supabase.com), [Render](https://render.com), [Netlify](https://netlify.com).
- Local: Node 20+, Python 3 with `pip install -r projects/ci-bess-uk/optimisation/requirements.txt` (and v2g requirements if you use V2G).

---

## 1. Supabase project

### 1.1 Create project

1. Supabase Dashboard → **New project** (pick region, set DB password).
2. Note **Project URL** and **anon public** key (Settings → API).
3. Note **service_role** key (server only — never put in the frontend).

### 1.2 GitHub OAuth

1. GitHub → Settings → Developer settings → **OAuth Apps** → New.
   - Homepage URL: your Netlify URL (or `http://localhost:5173` for dev).
   - Callback: `https://<project-ref>.supabase.co/auth/v1/callback`
2. Copy Client ID + Secret into Supabase → **Authentication** → **Providers** → **GitHub** (enable).
3. Supabase → **Authentication** → **URL configuration** → **Redirect URLs**, add:
   - `http://localhost:5173/auth/callback`
   - `https://<your-site>.netlify.app/auth/callback`

### 1.3 Database + storage

1. **SQL Editor** → run the full script: [`supabase/schema.sql`](../supabase/schema.sql).
2. **Storage** → confirm buckets **`simulation-results`** and **`market-data`** (both private).  
   Storage policies for user results are in `schema.sql`; `market-data` is written only by the API service role.

---

## 2. Render (API + Python)

### 2.0 Free vs paid (Blueprint)

The repo [`render.yaml`](../render.yaml) defaults to **free** (`plan: free`, **no disk**). Estimated cost: **$0**.

| | Free (`render.yaml`) | Paid ([`render.paid.yaml`](../render.paid.yaml)) |
|--|----------------------|--------------------------------------------------|
| Cost | $0 | ~$9.50/mo (Starter + 10 GB disk) |
| Disk | None — data under `/tmp/energy-data` (ephemeral) | `/var/data` persists |
| Idle | Spins down after ~15 min; ~1 min cold start | Always on |

Render Blueprint has **no UI** to change plan or remove disk — it reads `render.yaml` from GitHub. After we change that file, **re-sync** or re-create the Blueprint so pricing updates.

**Free limitations:** guest workspace files are lost on redeploy/restart/spin-down; pre-run demos from the repo still work.

### 2.1 Create Web Service

1. Render → **New** → **Blueprint** (uses `render.yaml`) **or** **Web Service** (manual).
2. Settings (Blueprint / manual):
   - **Root directory:** `web`
   - **Build:** `npm ci --include=dev && npm run build && pip3 install -r ../projects/ci-bess-uk/optimisation/requirements.txt -r ../projects/v2g-uk/optimisation/requirements.txt` (`--include=dev` needed because `NODE_ENV=production` skips Vite)
   - **Start:** `node server/index.mjs` (or `npm start`)
   - **Plan:** **Free** (default in repo) or Starter for production.

### 2.2 Persistent disk (paid only)

Free instances **cannot** attach disks on Render.

For paid deploy, use [`render.paid.yaml`](../render.paid.yaml) as `render.yaml`, or add a disk in the Dashboard:

1. Service → **Disks** → Add disk: mount `/var/data`, ~10 GB.
2. Set `DATA_ROOT=/var/data`.

### 2.3 Environment variables

Set in Render → **Environment**:

| Variable | Example / notes |
|----------|------------------|
| `NODE_ENV` | `production` |
| `DATA_ROOT` | `/tmp/energy-data` (free) or `/var/data` (with disk) |
| `PORT` | Set automatically by Render (do not hard-code on free) |
| `PYTHON` | `python3` |
| `CORS_ORIGINS` | `https://your-app.netlify.app,http://localhost:5173` |
| `SUPABASE_URL` | `https://xxx.supabase.co` |
| `SUPABASE_ANON_KEY` | anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | service role (secret) |
| `CRON_SECRET` | Random secret for `POST /api/cron/refresh-market-data` (same value in GitHub Actions secrets) |

Optional: `SERVE_STATIC=false` if you only serve API from Render (Netlify serves UI).  
Optional: `DAY_AHEAD_DISABLE_API=true` or `PV_LIVE_DISABLE_API=true` to skip live upstream fallback when Supabase cache is empty.

**Market data (free daily refresh):** GitHub Actions calls your Render API once per day. The job fetches [Ember GB day-ahead](https://files.ember-energy.org/public-downloads/price/outputs/european_wholesale_electricity_price_data_hourly.zip) + PV_Live yield and stores them in Supabase Storage bucket `market-data`. Each optimisation run downloads from Supabase (~fast) instead of re-fetching upstream.

Copy your Render URL, e.g. `https://energy-analytics-api.onrender.com`.

### 2.4 Daily market-data refresh (free — GitHub Actions)

1. Supabase SQL Editor → run any **new** statements from [`supabase/schema.sql`](../supabase/schema.sql) (creates `market_data_refresh_log` + `market-data` bucket).
2. Render → add `CRON_SECRET` (generate a long random string).
3. GitHub repo → **Settings → Secrets and variables → Actions**:
   - `RENDER_API_URL` = `https://energy-analytics-api-5u38.onrender.com` (your Render URL, no trailing slash)
   - `CRON_SECRET` = same value as Render
4. **Seed once** after deploy (Storage bucket must exist):
   ```bash
   curl -X POST "https://YOUR-API.onrender.com/api/cron/refresh-market-data" \
     -H "X-Cron-Secret: YOUR_CRON_SECRET"
   ```
   Or locally: `cd web && npm run refresh:market-data`
5. Workflow [`.github/workflows/refresh-market-data.yml`](../.github/workflows/refresh-market-data.yml) runs daily at 06:15 UTC. Use **Actions → Refresh market data → Run workflow** to test.

Check status: `GET /api/health` → `marketData.manifest.updatedAt`.

---

## 3. Netlify (frontend)

### 3.1 Site

1. Netlify → **Add site** → Import from GitHub → same repo.
2. Build settings (or [`netlify.toml`](../netlify.toml)):
   - Base: `web`
   - Build: `npm ci && npm run build`
   - Publish: `dist`

### 3.2 Environment variables

| Variable | Value |
|----------|--------|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon key |
| `VITE_API_BASE_URL` | Set in `web/netlify.toml` (Render URL). **Do not** add in Netlify UI (would duplicate). |

### 3.3 API routing

**Default (in repo): direct Render URL** — [`web/netlify.toml`](../web/netlify.toml) sets `VITE_API_BASE_URL` to your Render service. The UI calls Render directly; no Netlify `/api` proxy needed.

On Render set:

```text
CORS_ORIGINS=https://emiel-energy-analytics.netlify.app,http://localhost:5173
```

**Optional:** Netlify proxy — remove `VITE_API_BASE_URL` from `web/netlify.toml` and use [`web/public/_redirects`](../web/public/_redirects) only.

### 3.4 Deploy

Deploy site; open `https://<site>.netlify.app` and confirm **Sign in with GitHub** appears on results pages when Supabase env is set.

---

## 4. Local development

### 4.1 Env files

Copy [`.env.example`](../.env.example) to `web/.env.local`:

```bash
# UI (optional if using Vite plugin only)
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...

# Only if API on another port without Vite plugin:
# VITE_API_BASE_URL=http://localhost:3001
```

For API-only server (`npm run dev:server`), use `web/.env` or shell exports:

```bash
SUPABASE_URL=...
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
DATA_ROOT=../.data
```

### 4.2 Run

```bash
cd web
npm install
npm run dev          # Vite + embedded API (default)
# or
npm run dev:with-api # Vite + separate API on :3001
```

Use repo folders directly (no guest workspace copy):

```bash
USE_LEGACY_PROJECT_DIRS=true npm run dev
```

### 4.3 Test auth + save

1. Run a simulation → open **Results**.
2. **Download CSV** — should work signed out.
3. **Sign in with GitHub to save** → OAuth → return to `/auth/callback` → save with a name.
4. Row appears in Supabase Table Editor → `saved_simulations`; file in Storage bucket.

---

## 5. Checklist

- [ ] Supabase: GitHub provider, redirect URLs, `schema.sql`, buckets `simulation-results` + `market-data`
- [ ] Render: env vars including `CRON_SECRET`, service URL live
- [ ] GitHub Actions secrets: `RENDER_API_URL`, `CRON_SECRET`; seed market data once
- [ ] Netlify: `VITE_SUPABASE_*`, API proxy or `VITE_API_BASE_URL`, `CORS_ORIGINS` on Render
- [ ] End-to-end: guest run → download CSV → GitHub save → file in Storage

---

## 6. GDPR / privacy (lightweight)

- No email/password; GitHub OAuth only for optional save.
- Guest data lives on Render disk under `guest:<uuid>` (~72h cookie); not in Supabase until user saves.
- Saved runs: Supabase `auth.users` + `saved_simulations` + Storage; document in your privacy notice if you go public.

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Save returns 503 | Missing `SUPABASE_*` on Render |
| Save returns 401 | Sign in again; pass Bearer token (frontend uses `apiFetch` with session) |
| Download 404 | Run optimisation first; check `results/` in workspace |
| CORS errors | Match `CORS_ORIGINS` to exact Netlify URL; or use Netlify proxy |
| Optimisation fails | SSH/logs on Render; confirm `pip3 install` for PuLP/CBC |
| Day-ahead price flat after ~26 Mar 2026 | Seed Supabase market data (`POST /api/cron/refresh-market-data`). Check `/api/health` → `marketData.manifest`. |
| Local paths wrong | `USE_LEGACY_PROJECT_DIRS=true` or clear `.data/workspaces` |
