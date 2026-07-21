# BFSFCU Accounts Payable

Single-tenant accounts-payable system. Invoices arrive, are extracted by AI,
reviewed by one person, approved by another, and exported to the ERP.

Azure-native: Entra ID for identity, Azure Functions for the API, PostgreSQL,
Blob and Queue Storage, Document Intelligence and Azure OpenAI. Rebuilt from a
Supabase original, which is retired.

---

## Documentation

| Document | Read it when |
|---|---|
| **[CONTEXT.md](CONTEXT.md)** | You are an AI assistant, or a developer starting cold — conventions, traps, and what will silently break |
| **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** | You need to understand how the system fits together, or why something is the way it is |
| **[docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)** | You are setting up locally, or debugging a local failure |
| **[docs/PRODUCTION.md](docs/PRODUCTION.md)** | You are deploying, hardening for production, or setting up CI/CD |
| **[infra/README.md](infra/README.md)** | You are provisioning Azure resources |

---

## Layout

```
api/            Azure Functions — HTTP routes and the queue worker
  src/shared/     the shared layer: auth, roles, db, logging, errors
  src/functions/  thin route handlers (http / queue)
web/            React SPA — Vite, MSAL
  src/lib/api.ts    the only way the browser reaches the backend
  src/authConfig.ts MSAL / Entra configuration
db/migrations/  numbered SQL, applied in filename order
infra/          Bicep template and provisioning script
docs/           the documents above
```

---

## Quick start

Local development, assuming Node 20+, Docker and the Azure Functions Core
Tools. Full detail in [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).

```powershell
# database
docker run -d --name bfsfcu-pg -e POSTGRES_PASSWORD=postgres `
  -e POSTGRES_DB=bfsfcu_ap -p 5432:5432 postgres:17

# storage emulator
azurite --silent --skipApiVersionCheck --location .\.azurite

# api  -> http://localhost:7071
cd api; npm install; npm start

# web  -> http://localhost:8080
cd web; npm install; npm run dev
```

You also need two Entra app registrations and a row in `users` — there is no
signup. Both are covered in the development guide.

---

## Deploying

```powershell
cd infra
.\provision.ps1 -NamePrefix <prefix> `
                -PostgresEntraAdminObjectId '<your-object-id>' `
                -PostgresEntraAdminUpn '<you@company.com>' `
                -PostgresAdminPassword (Read-Host 'pg password' -AsSecureString)
```

See [infra/README.md](infra/README.md) for prerequisites and the manual steps
it prints at the end.

---

## Principles

These are load-bearing. Reversing one silently will break something subtle.

**Single tenant.** No `tenant_id`, no tenant scoping, no RLS. Authorization is
role-based, enforced in one place.

**Everything goes through `api/src/shared`.** A handler that builds its own DB
client, parses its own auth header, or sets its own CORS header is a bug — that
duplication is exactly what this rebuild removed.

**Uploads return immediately.** Extraction runs in a queue-triggered worker.
The browser never waits on the AI pipeline.

**Identity and access are separate.** Entra proves who someone is; the `users`
table decides whether they may use the application. A valid token with no row
is rejected.

**No secrets in the database.** Managed Identity where possible, Function App
settings or Key Vault otherwise. The original stored provider keys in plaintext
columns named `*_key_encrypted`.

**A submitter cannot approve their own invoice.** Enforced server-side, on
`submitted_by`, inside the transaction — not in the browser, and not bypassed
by `pp-superadmin`.

**Faithful port, not a redesign.** The UI and behaviour deliberately match the
original so it stays testable against known-good behaviour.

---

## Not ported

Each throws a clear "not available yet in the Azure build" error rather than
failing silently:

ERP export delivery and master-data sync (both were already stubs), AI
field-mapping suggestions, supplemental PDF merge, contract processing, vendor
enrichment and risk scoring, cash-flow forecast insights, email ingestion.

Known gaps and rough edges are listed at the end of
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
