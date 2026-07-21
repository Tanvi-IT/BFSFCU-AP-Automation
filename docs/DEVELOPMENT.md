# Development

Running the stack locally. Roughly 30 minutes the first time, most of it Entra
setup.

---

## What runs locally

| Component | Where |
|---|---|
| Frontend (Vite) | local, port 8080 |
| API + queue worker (Functions) | local, port 7071 |
| PostgreSQL | local — Docker is easiest |
| Blob + Queue | Azurite emulator |
| **Entra sign-in** | **cloud** — free, but needs an app registration |
| **Document Intelligence + Azure OpenAI** | **cloud** — reuse the existing resources |

---

## Prerequisites

```powershell
node -v      # 20+
npm i -g azure-functions-core-tools@4 --unsafe-perm true
npm i -g azurite
docker --version
psql --version
```

`psql` and `func` are frequently not on PATH after installation. `psql` usually
lives in `C:\Program Files\PostgreSQL\<version>\bin`.

---

## 1. PostgreSQL

A local PostgreSQL install is often client-only — psql and pgAdmin but no
server. Docker avoids the question:

```powershell
docker run -d --name bfsfcu-pg -e POSTGRES_PASSWORD=postgres `
  -e POSTGRES_DB=bfsfcu_ap -p 5432:5432 postgres:17
```

Apply the migrations:

```powershell
$env:PGHOST='127.0.0.1'; $env:PGUSER='postgres'
$env:PGPASSWORD='postgres'; $env:PGDATABASE='bfsfcu_ap'

Get-ChildItem db\migrations\*.sql | Sort-Object Name | ForEach-Object {
  psql -v ON_ERROR_STOP=1 -f $_.FullName
}
```

Expect 23 tables. `NOTICE: trigger ... does not exist, skipping` is normal —
the migrations drop before they create so they can be re-run.

Use **`127.0.0.1`**, not `localhost`. The container binds IPv4 only, and Node
17+ resolves `localhost` to `::1` first, producing `ECONNREFUSED ::1:5432`.

---

## 2. Azurite

```powershell
azurite --silent --skipApiVersionCheck --location .\.azurite `
  --blobHost 127.0.0.1 --queueHost 127.0.0.1 --tableHost 127.0.0.1
```

`--skipApiVersionCheck` is required: the storage SDK negotiates a newer REST
API version than Azurite supports, and without it every upload fails with
*"The API version ... is not supported by Azurite"*. Emulator-only — real Azure
Storage accepts the version.

It takes a few seconds to bind ports 10000–10002; an immediate check gives a
false negative.

---

## 3. Entra app registrations

Two registrations.

**API** (`bfsfcu-ap-api`)
1. *Expose an API* → Application ID URI → accept `api://<client-id>`
2. Add a scope `access_as_user`, admins and users may consent
3. **Manifest → `api.requestedAccessTokenVersion` → `2`**

**SPA** (`bfsfcu-ap-web`)
1. *Authentication* → *Add a platform* → **Single-page application** →
   redirect URI `http://localhost:8080`
2. *API permissions* → My APIs → the API registration → delegated
   `access_as_user` → **Grant admin consent**

Two settings cause most sign-in failures:

**`requestedAccessTokenVersion` must be 2.** It defaults to null, meaning v1,
whose issuer is `https://sts.windows.net/...` and never matches the v2 issuer
the API expects. The property is nested under `api` in the manifest.

**The redirect URI must be under Single-page application, not Web.** A Web
platform URI passes the authorize request and then fails token redemption with
`AADSTS9002326`.

Entra App Roles are optional and currently unused — see ARCHITECTURE.md.

---

## 4. Configure

```powershell
cd api
npm install
Copy-Item local.settings.json.example local.settings.json
```

Fill in the tenant id, the **API** registration's client id, and the AI
endpoint and key. Two values are easy to get wrong:

- **`ENTRA_AUDIENCE` is the bare client id**, not `api://<client-id>`. v2
  tokens carry the client id in `aud`; only v1 tokens carry the URI.
- **`PG_HOST` is `127.0.0.1`** — see above.

```powershell
cd ..\web
npm install
Copy-Item .env.example .env
```

`VITE_ENTRA_CLIENT_ID` is the **SPA** registration. `VITE_API_SCOPE` uses the
**API** registration. Mixing them up is the most common setup error, and
produces a 401 on every call rather than an obvious failure.

`VITE_*` values are inlined at build time. Changing `.env` requires restarting
the dev server.

---

## 5. Create your user

There is no signup. Find your Object ID in Entra → Users → your account, then:

```sql
INSERT INTO users (entra_oid, email, full_name, role)
VALUES ('<your-object-id>', 'you@company.com', 'Your Name', 'pp-admin');
```

It must be the **user's** object id — not the application's client id, not the
enterprise application's object id. The wrong one gives 403 on every call with
no hint as to why.

---

## 6. Run

Three terminals:

```powershell
azurite --silent --skipApiVersionCheck --location .\.azurite   # 1
cd azure\api; npm start                                        # 2 -> :7071
cd azure\web; npm run dev                                      # 3 -> :8080
```

Check the Functions host banner for `The following function(s) are in error` —
route conflicts appear there and nowhere else. The host starts happily with
broken routes.

---

## Testing the invoice flow

Upload a PDF invoice, then watch the API log:

```
Invoice queued        -> upload accepted, message enqueued
Processing started    -> queue worker picked it up
Extraction complete   -> Document Intelligence returned
Processing complete   -> normalisation, vendor match, status set
```

Verify stage 2 actually ran, since it fails silently:

```sql
SELECT invoice_number, invoice_date, due_date, confidence_score, status
FROM invoices;
```

A populated `confidence_score` and `YYYY-MM-DD` dates mean the language model
ran. Raw Document Intelligence output has neither.

**Approval needs two people.** A submitter cannot approve their own invoice, so
testing the approve path needs a second user row and an invoice submitted by
someone else.

---

## Troubleshooting

| Symptom | Cause |
|---|---|
| Signed in, still on the login page | `/me` failed. Check the API log — if there are no requests at all, the Vite proxy is not reaching :7071 |
| Every call 401, sign-in works | `aud` or `iss` mismatch. Decode the token payload and compare against `config.auth` |
| `403 not provisioned` | `users.entra_oid` does not match the token's `oid` |
| Upload works, invoice stays `queued` | Azurite not running, or the worker did not start |
| Invoice goes to `exception` | `SELECT processing_error FROM invoices WHERE status='exception'` |
| `ECONNREFUSED ::1:5432` or `::1:7071` | Use `127.0.0.1`, not `localhost` |
| Page spins forever | A `tenantId` guard bailed before clearing the loading flag |
| Feature says "not available yet" | Deliberate — see the gaps in ARCHITECTURE.md |

Token validation returns a deliberately opaque message. To diagnose, decode the
payload segment without verifying and compare `iss`, `aud` and `ver` against
`config.auth`.

---

## Conventions

- Everything goes through `api/src/shared`. A handler that builds its own DB
  client, parses its own auth header or sets its own CORS header is a bug.
- Routes never touch the database directly — use the repository layer.
- Handlers throw `AppError`; the wrapper shapes the response. Never hand-build
  an error response in a route.
- `vite build` does not typecheck. Run
  `npx tsc --noEmit -p tsconfig.app.json`; three pre-existing `html2pdf` errors
  are expected.
