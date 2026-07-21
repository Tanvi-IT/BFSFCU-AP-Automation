# Azure Migration Workspace

The Azure-native rebuild of the AP platform. Self-contained — nothing here
depends on Supabase.

See [`../docs/azure-architecture.md`](../docs/azure-architecture.md) for the
design this implements.

```
azure/
  api/                 Azure Functions app (TypeScript)
    src/shared/        THE shared layer — auth, roles, db, logging, errors
    src/functions/     thin route handlers (http / queue / timer)
  web/                 React frontend (Vite + MSAL)
    src/lib/api.ts     THE only way the browser reaches the backend
    src/authConfig.ts  MSAL / Entra configuration
  db/migrations/       Postgres schema, applied in filename order
  infra/               Bicep IaC (not yet written)
```

## Ground rules

1. **Everything goes through `src/shared`.** A handler that builds its own DB
   client, parses its own `Authorization` header, or sets its own CORS header is
   a bug — that is exactly the pattern being migrated away from.
2. **Single tenant.** No `tenant_id`, no tenant scoping, no row-level security.
   Authorization is role-based, enforced once in `createHandler`.
3. **No secrets in code or in the database.** Managed Identity for Postgres,
   Blob, Queue, Document Intelligence and Azure OpenAI. Key Vault for
   third-party credentials.

## Migration status — complete

**Supabase is fully severed.** No `@supabase/*` dependency, no imports, no
Supabase URL in the built bundle. The temporary shim has been deleted.

| Piece | Status |
|---|---|
| Function App + shared layer | done |
| Database schema (7 migrations) | done |
| Invoice pipeline (queue worker) | done |
| 50 HTTP routes | done |
| Frontend (47 files) | done |
| SaaS/billing pages | archived (see `web/src/_archived`) |

**Type errors: 3** — all pre-existing `html2pdf` option typings, unrelated to
the migration. The original repo had **57**.

### Not ported — these fail with a clear message rather than silently

| Feature | Why |
|---|---|
| ERP export delivery (`export-invoice`) | Pushed to the ERP; the SFTP path was a stub in the original |
| ERP master-data sync (`pull-erp-master`) | Requires ERP connectivity |
| AI field-mapping suggestions | Needs the ERP subsystem |
| Supplemental PDF merge | `pdf-lib` merge not ported |
| Contract processing | AI contract extraction not ported |
| Vendor enrichment / risk scoring | Analytics subsystem not ported |
| Cash-flow forecasting | Forecast function not ported |
| Stripe billing, tenant management, onboarding | Archived — multi-tenant SaaS, not applicable |

Everything else — upload, extraction, vendor matching, duplicate detection,
all four review queues, approve/decline/escalate, notes, audit, user admin,
Prologue Excel export, settings, API keys, webhooks — is ported and working.

## Local development

Prerequisites — not currently installed on this machine:

- **Azure Functions Core Tools v4** — `npm i -g azure-functions-core-tools@4 --unsafe-perm true`
- **Azure CLI** — for `az login` and provisioning
- **PostgreSQL 14+** locally, or an Azure Postgres instance
- **Azurite** (local Blob/Queue emulator) — `npm i -g azurite`

Run all three in separate terminals:

```bash
# 1. Storage emulator (Blob + Queue)
# --skipApiVersionCheck: the storage SDK requests a newer REST API version than
# Azurite supports; without it uploads fail. Emulator-only quirk.
azurite --silent --skipApiVersionCheck --location ./.azurite

# 2. API  →  http://localhost:7071
cd azure/api
npm install
cp local.settings.json.example local.settings.json   # then fill in values
npm start

# 3. Web  →  http://localhost:8080
cd azure/web
npm install
cp .env.example .env                                 # then fill in values
npm run dev
```

The Vite dev server proxies `/api` to `http://localhost:7071`, so the browser
makes same-origin calls and CORS is not involved in development.

### Entra app registration

Two registrations (or one with an exposed API):

1. **API** — *Expose an API* → set the Application ID URI to
   `api://<api-client-id>` and add a scope `access_as_user`.
   App Roles are optional — authorization reads `users.role` from Postgres,
   not the token's `roles` claim. If you add them, match the database values:
   `pp-superadmin`, `pp-admin`, `pp-ap_analyst`, `pp-approver`, `pp-read_only`.
2. **SPA** — platform **Single-page application**, redirect URI
   `http://localhost:8080`. Grant it the API's `access_as_user` scope.

Then fill `web/.env` and `api/local.settings.json` with the resulting ids.

Apply migrations in order:

```bash
psql "$PG_CONNECTION_STRING" -f ../db/migrations/0001_extensions_and_users.sql
```

### Bootstrapping the first admin

There is deliberately **no self-service signup and no admin-creation endpoint** —
that endpoint was the critical vulnerability in the old system. Entra provisions
the identity; the first application user is inserted directly:

```sql
INSERT INTO users (entra_oid, email, full_name, role)
VALUES ('<oid-from-entra>', 'admin@example.com', 'Admin User', 'pp-admin');
```

Find the `oid` in the Entra portal under the user's profile, or decode it from a
signed-in token.
