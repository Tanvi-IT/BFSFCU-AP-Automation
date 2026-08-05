# BFSFCU Accounts Payable

Single-tenant accounts-payable system. Invoices arrive, are extracted by AI,
reviewed, and approved, and recorded for audit. Any user can approve — including
invoices they uploaded; self-approval is flagged, not blocked.

Azure-native: local email/password auth (session cookie), Azure Functions for
the API, PostgreSQL, Blob and Queue Storage, Document Intelligence and Azure
OpenAI. Rebuilt from a Supabase original, which is retired. An optional,
feature-flagged write-back stages approved invoices into Fiserv Prologue (SQL
Server) — see below.

---

## Documentation

| Document | Read it when |
|---|---|
| **[CONTEXT.md](CONTEXT.md)** | You are an AI assistant, or a developer starting cold — conventions, traps, and what will silently break |
| **[ARCHITECTURE.md](ARCHITECTURE.md)** | You need to understand how the system fits together, or why something is the way it is |
| **[DEVELOPER.md](DEVELOPER.md)** | You are setting up locally, debugging a local failure, or deploying |

---

## Layout

```
api/            Azure Functions — HTTP routes and the queue worker
  src/shared/     the shared layer: auth, roles, db, logging, errors, pipeline
  src/functions/  thin route handlers (http / queue)
web/            React SPA (Vite)
  src/lib/api.ts  the only way the browser reaches the backend
db/migrations/  numbered SQL (0001..0015), applied in filename order
db/prologue/    Prologue stored-proc DDL (deployed by BankFund's DBA)
infra/          Bicep template and provisioning script (WIP)
```

---

## Quick start

Local development, assuming Node 20+, Docker, and the Azure Functions Core Tools.
Full detail — including the AI keys you need — is in [DEVELOPER.md](DEVELOPER.md).

```powershell
# database (then apply db/migrations in filename order — see DEVELOPER.md)
docker run -d --name bfsfcu-pg -e POSTGRES_PASSWORD=postgres `
  -e POSTGRES_DB=bfsfcu_ap -p 5432:5432 postgres:17

# storage emulator
azurite --silent --skipApiVersionCheck --location .\.azurite

# api  -> http://localhost:7071
cd api; npm install; npm start

# web  -> http://localhost:8080
cd web; npm install; npm run dev
```

There is no signup. Running the migrations seeds a local admin
(`admin@peapod.com`); the dev-only default password is in
[DEVELOPER.md](DEVELOPER.md). Rotate it for any real deployment.

---

## Deploying

Deployment is CLI-driven (Flex Consumption Functions + a Static Web App). The
exact commands and the live-DB migration gotcha are in
[DEVELOPER.md](DEVELOPER.md); the `infra/main.bicep` template is WIP and should
not be deployed from as-is.

---

## Prologue (Fiserv) integration

An optional, feature-flagged write-back stages an approved invoice directly in
Fiserv Prologue Financials (SQL Server) as an **unposted** AP transaction, so it
isn't re-keyed. Off unless `PROLOGUE_ENABLED=true`; when off the app is unchanged
(it is deployed off). On approve it calls two stored procs
(`db/prologue/tanvi_ap_integration.sql`, deployed by BankFund's DBA) that write
four tables — `am_table_next_key`, `co_batch`, `ap_transaction`,
`ap_transaction_detail` — and records the returned transaction id on the invoice.
Posting stays with Prologue's own engine. Design detail is in
[ARCHITECTURE.md](ARCHITECTURE.md); env vars and deploy notes in
[DEVELOPER.md](DEVELOPER.md).

---

## Principles

These are load-bearing. Reversing one silently will break something subtle.

**Single tenant.** No `tenant_id`, no tenant scoping, no RLS. Authorization is
role-based (`admin` / `user`), enforced in one place.

**Everything goes through `api/src/shared`.** A handler that builds its own DB
client, parses its own auth header, or sets its own CORS header is a bug — that
duplication is exactly what this rebuild removed.

**Uploads return immediately.** Extraction runs in a queue-triggered worker; the
browser never waits on the AI pipeline.

**Auth is local, and thin.** Email/password with an HS256 session cookie; users
are keyed on `id`, never email. Optional **Microsoft Entra SSO** is layered on
the `auth_provider` / `external_id` seam and admin-configured in User Management —
it issues the same session cookie, so it's a second identity source, not a
rewrite. Match-existing-only; no client secret is stored.

**No secrets in the database.** Function App settings (connection string / API
keys) or Key Vault — never plaintext columns.

**Any user can approve, but self-approval is flagged.** Approval is recorded in
the audit trail with `self_approved` rather than blocked; that flag is where
maker–checker separation would go if reinstated.

**Faithful port, not a redesign.** UI and behaviour deliberately match the
original so it stays testable against known-good behaviour.

---

## Not ported

ERP export delivery and master-data sync, AI field-mapping suggestions, contract
processing, vendor enrichment and risk scoring, and cash-flow forecast insights
are not carried over. Known gaps are listed at the end of
[ARCHITECTURE.md](ARCHITECTURE.md).
