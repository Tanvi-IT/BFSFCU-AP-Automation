# Developer guide

How to run the stack locally and the conventions to follow. Read
[CONTEXT.md](CONTEXT.md) first for the traps, and [ARCHITECTURE.md](ARCHITECTURE.md)
for how the pieces fit.

Last verified 2026-07-28.

---

## What runs locally

| Component | Where |
|---|---|
| Frontend (Vite) | local — port **8080** |
| API + queue worker (Functions) | local — port **7071** |
| PostgreSQL | local — Docker container `bfsfcu-pg` |
| Blob + Queue | Azurite emulator (ports 10000–10002) |
| Document Intelligence + Azure OpenAI | **cloud** — reuse the existing resources (a key is enough) |

Auth is **local email/password** — no Entra, no cloud identity setup. The
migrations seed a local admin, `admin@peapod.com` / `Invoice@approve`.

> These credentials and the `postgres` database password below are **local
> dev-only throwaways** — a localhost Docker container and a seeded default, not
> production secrets. Rotate both for any real/shared deployment. No production
> secrets live in this repo (`local.settings.json` and `.env` are gitignored).

---

## Prerequisites

```powershell
node -v                                   # 20+
npm i -g azure-functions-core-tools@4     # `func`
npm i -g azurite
docker --version
```

`func` and `psql` are often not on PATH after install. `psql` usually lives in
`C:\Program Files\PostgreSQL\<version>\bin` (that install is typically
client-only — no server — which is why Postgres runs in Docker below).

---

## 1. PostgreSQL (Docker)

```powershell
docker run -d --name bfsfcu-pg -e POSTGRES_PASSWORD=postgres `
  -e POSTGRES_DB=bfsfcu_ap -p 5432:5432 postgres:17
# already created? just start it:
docker start bfsfcu-pg
```

Apply the migrations in filename order (creates every table **and seeds the
default admin**):

```powershell
$env:PGHOST='127.0.0.1'; $env:PGUSER='postgres'
$env:PGPASSWORD='postgres'; $env:PGDATABASE='bfsfcu_ap'

Get-ChildItem db\migrations\*.sql | Sort-Object Name | ForEach-Object {
  psql -v ON_ERROR_STOP=1 -f $_.FullName
}
```

Use **`127.0.0.1`**, never `localhost`: the container binds IPv4 only and Node
17+ resolves `localhost` to `::1` first (`ECONNREFUSED ::1:5432`). Applying a
single later migration (e.g. after `git pull`):

```powershell
docker exec -i -e PGPASSWORD=postgres bfsfcu-pg `
  psql -h 127.0.0.1 -U postgres -d bfsfcu_ap -v ON_ERROR_STOP=1 -f - < db\migrations\00XX.sql
```

---

## 2. Azurite (blob + queue)

```powershell
azurite --silent --skipApiVersionCheck --location .\.azurite
```

`--skipApiVersionCheck` is **required** — the storage SDK negotiates a newer REST
API version than Azurite supports, and without it every upload fails. Azurite
takes a few seconds to bind its ports; an immediate check gives a false negative.

---

## 3. Configure the API

```powershell
cd api
npm install
Copy-Item local.settings.json.example local.settings.json
```

The example already points at the local Postgres and Azurite. Fill in the two AI
values from the shared resource and you're set:

```
DOCINTEL_ENDPOINT / DOCINTEL_KEY      # Document Intelligence
AOAI_ENDPOINT / AOAI_KEY              # Azure OpenAI
AOAI_DEPLOYMENT = gpt-4o             # the model deployment name
AOAI_REASONING_MODEL = false        # false for gpt-4o; true only for gpt-5 / o-series
```

Local-only settings already in the example: `PG_HOST=127.0.0.1`,
`PG_USE_MANAGED_IDENTITY=false`, `AUTH_COOKIE_INSECURE=true` (so the session
cookie is accepted over plain HTTP), and `AzureWebJobsStorage=UseDevelopmentStorage=true`.
Every setting is read in `api/src/shared/config.ts` and nowhere else.

The web app needs no cloud config — the Vite dev server proxies `/api` to
`:7071`, so the session cookie is same-origin.

---

## 4. Run

Four terminals (or start Postgres/Azurite once and leave them):

```powershell
docker start bfsfcu-pg                                    # 1
azurite --silent --skipApiVersionCheck --location .\.azurite   # 2
cd api;  npm start                                       # 3 -> :7071
cd web;  npm run dev                                     # 4 -> :8080
```

Open **http://localhost:8080** and sign in with `admin@peapod.com` /
`Invoice@approve`.

Check the Functions host banner for `The following function(s) are in error` —
route conflicts appear **there and nowhere else**; the host starts happily with
broken routes.

---

## Testing the invoice flow

Upload a PDF on the Upload page, then watch the API log:

```
Processing started    → queue worker picked it up
Extraction complete   → Document Intelligence returned
Processing complete   → normalisation, vendor match, status set
```

Stage 2 fails silently, so verify it actually ran:

```powershell
psql -c "SELECT invoice_number, invoice_date, due_date, confidence_score, status FROM invoices;"
```

A populated `confidence_score` and `YYYY-MM-DD` dates mean the language model
ran (raw Document Intelligence output has neither). For the invoice to match a
vendor (and inherit GL coding), import a vendor list first (Administration →
Vendors); an unmatched invoice goes to Exceptions.

---

## Typecheck & build

```powershell
cd api;  npx tsc --noEmit          # API
cd web;  npm run typecheck         # web — 3 pre-existing html2pdf errors are expected
```

`vite build` does **not** typecheck — always run `npm run typecheck` separately.

---

## Deploy

Deployment is CLI-driven (code isn't uploadable through the Azure Portal for Flex
Consumption / Static Web Apps). No `--build remote` — a corporate SSL proxy
blocks Kudu, but blob-based deploy works:

```bash
# API
cd api && npm run build && func azure functionapp publish bfsfcuap-api --javascript
# web (same-origin API; VITE_DEMO_MODE shows the demo-reset button)
cd web && VITE_DEMO_MODE=true npm run build
swa deploy ./dist --deployment-token "$(az staticwebapp secrets list -g rg-peapod-test -n bfsfcuap-web --query properties.apiKey -o tsv)" --env production
```

DDL migrations against the live DB must run as the Entra owner (the app role
isn't the table owner). Full resource names, the ownership gotcha, and the exact
migration command are in the deployment notes — ask before redeploying.

---

## Conventions

- **Everything goes through `api/src/shared`.** A handler that builds its own DB
  client, parses its own auth header, or sets its own CORS header is a bug.
- **Routes are thin** — logic lives in `shared/repository`; routes never touch
  the database directly.
- **Handlers throw `AppError`**; the wrapper shapes the response. Never
  hand-build an error response in a route.
- **One `app.http()` per route**, with **per-method** roles. A new file must be
  imported in `api/src/index.ts` or it won't register.
- **Users are keyed on `id`** (the session `sub`), never email.
- **Never render a role name raw** — use `roleLabel()`.
- **Adding a setting** — `config.ts` only, plus `local.settings.json.example`
  and `infra/main.bicep`.
- **Schema changes** — a new numbered migration; never edit an applied one; keep
  it idempotent (they get re-run).
- **This is a faithful port, not a redesign** — match existing UI/behaviour
  unless asked to change it.

---

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Blank screen right after login (reload fixes it) | `useAuth` was refactored to local state — it must stay an `AuthProvider` context. |
| Every call 401 / login rejected | Check `SESSION_SECRET` is set and (locally) `AUTH_COOKIE_INSECURE=true`. |
| `ECONNREFUSED ::1:5432` or a proxy 502 that looks like auth | Use `127.0.0.1`, not `localhost`, in `PG_HOST` and the Vite proxy target. |
| Upload works, invoice stays `queued` | Azurite not running, or the worker didn't start. |
| Invoice goes to `exception` | `psql -c "SELECT processing_error FROM invoices WHERE status='exception';"` |
| "The AI did nothing" (extraction OK, no normalisation) | Swallowed stage-2 error — check `confidence_score` and the AI settings. |
| A page spins forever | A `tenantId` guard bailed before clearing the loading flag — don't change the stub. |
| `CREATE EXTENSION` refused on Azure | Allow-list `pgcrypto` + `pg_trgm` in the `azure.extensions` server parameter. |

More depth, and the full list of traps that have already cost debugging time,
is in [CONTEXT.md](CONTEXT.md).
