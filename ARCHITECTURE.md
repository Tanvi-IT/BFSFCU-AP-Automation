# Architecture

A single-tenant accounts-payable (AP) system for a credit union. Invoices
arrive, are extracted by AI, reviewed, and approved, and recorded for audit.
Any user can approve — including invoices they uploaded; self-approval is
flagged in the audit trail, not blocked (no enforced two-person separation).

It is an Azure-native rebuild of a Supabase application (itself forked from a
multi-tenant SaaS). Both ancestries left traces; when something looks odd, ask
whether it made sense under Supabase or in a multi-tenant product. See
[CONTEXT.md](CONTEXT.md) for the traps that have already cost debugging time.

Last verified against the codebase 2026-07-30.

---

## Stack

React/Vite SPA · Azure Functions (TypeScript) · PostgreSQL Flexible Server ·
Azure Blob + Queue Storage · Azure Document Intelligence + Azure OpenAI ·
local email/password auth (HS256 session cookie). Optionally, a Fiserv Prologue
(SQL Server, via `mssql`) write-back on approve — feature-flagged off by default.

```
Browser (React SPA)
    │  same-origin /api  (session cookie, httpOnly)
    ▼
Azure Static Web App ──linked backend──> Azure Functions ──HTTP──> PostgreSQL
                                              │                        ▲
                                              │ queue message          │
                                              ▼                        │
                                     Queue worker ──> Document Intelligence
                                                  ──> Azure OpenAI ─────┘
                                                  ──> Blob Storage
```

Uploads return in about a second. Everything slow — OCR, the language model,
vendor matching — runs in a queue-triggered worker, so the browser never waits
on the multi-second pipeline.

---

## Components

| Path | What it is |
|---|---|
| `web/` | React SPA (Vite). The only way it reaches the backend is `web/src/lib/api.ts`. |
| `api/` | Azure Functions. Thin HTTP routes + the queue worker; all logic lives in `api/src/shared`. |
| `db/migrations/` | Numbered SQL (`0001`..`0015`), applied in filename order. Idempotent — re-runnable. |
| `db/prologue/` | `tanvi_ap_integration.sql` — the two Prologue stored procs. Deployed and owned by BankFund's DBA, **not** an app migration. |
| `infra/` | Bicep template and provisioning script (WIP — do not deploy from `main.bicep`). |

### `api/src` layout

```
index.ts                 every function module must be imported here or it won't register
functions/http/          admin departments erp invoices me settings users vendors workflow …
functions/queue/         processInvoice.ts — the pipeline worker
shared/
  handler.ts             createHandler / createMethodHandler — THE entry point for every route
  auth.ts                session-token verification (the only place)
  authorize.ts           role checks (the only place)
  config.ts              every setting is read here and nowhere else
  db.ts errors.ts logger.ts cors.ts blob.ts queue.ts
  prologue.ts            mssql client for the Prologue write-back (flag-gated)
  ai/                    credential · documentIntelligence · openai
  pipeline/              duplicateCheck · persist · routing · vendorMatch
  repository/            activity · invoices · users · vendors · workflow
```

---

## Request path

Every route goes through `createHandler` / `createMethodHandler` in
`shared/handler.ts`. That wrapper is the only place that authenticates, resolves
the user, checks the role, shapes errors, and sets CORS. A route cannot forget
to authenticate — it never runs until the wrapper has.

1. **Authenticate** — `shared/auth.ts` verifies the HS256 session cookie
   (signed with `SESSION_SECRET`). Machine callers (Power Automate) may instead
   present an `X-Api-Key`. This is the only place a token is verified.
2. **Resolve the user** — `shared/repository/users.ts`, keyed on `users.id`
   (the token's `sub`).
3. **Authorize** — `shared/authorize.ts`. The only place role decisions are made.
4. **Run the handler**, which returns a response or throws an `AppError` that the
   wrapper shapes.

**One `app.http()` registration per route.** Azure Functions permits exactly
one. Methods sharing a path use `createMethodHandler` with **per-method** roles;
collapsing them onto a single role set is a privilege escalation.

---

## Identity and authorization

- **Auth is local email/password** with an HS256 session cookie (httpOnly,
  SameSite=Lax, same-origin via the `/api` proxy — the browser never handles the
  token). **Microsoft Entra SSO** is implemented on the `auth_provider` /
  `external_id` seam (optional, admin-configured): the SPA signs in with MSAL
  (public client / PKCE), the backend verifies the Entra ID token
  (`shared/entra.ts`) and issues the *same* session cookie — so SSO is just a
  second identity source, and password login still works alongside it. Config
  (`entra_*` in `app_settings`, migration 0016) is set in User Management;
  match-existing-only, so an Entra user needs an admin-created account. No client
  secret is stored (public client).
- **Two roles** (`app_role` enum): `admin` and `user`. `admin` does everything
  (user management, vendor upload, audit); `user` does all invoice work,
  including approve. Never render a role name raw — use `roleLabel()` in
  `web/src/lib/roles.ts`.
- **There is no self-signup.** Users are created by an admin; the first admin is
  seeded by migration `0009` (`admin@peapod.com`; the dev-only default password
  is in DEVELOPER.md — rotate it for any real deployment).

### Segregation of duties

By product decision, any user may approve any invoice, **including their own** —
self-approval is not blocked. Instead the audit trail records the approver and
flags `self_approved: true` (in both `approve()` and `approveMany()`). If
maker–checker separation is ever reinstated, that flag is where it goes.

---

## Invoice pipeline

```
upload → blob + row(queued) → queue message → 202 returned
                                   │
                                   ▼
   Document Intelligence (prebuilt-invoice)        ~4–5s   (required)
                                   ▼
   Azure OpenAI normalisation                      ~2–3s   (non-blocking)
                                   ▼
   vendor match → duplicate check → GL inheritance → route to a status
```

- **Stage 1 (Document Intelligence)** — `prebuilt-invoice`; submit then poll.
  A failure here fails the invoice (after retries it lands in Low Confidence).
- **Stage 2 (Azure OpenAI)** — normalises stage 1: dates to `YYYY-MM-DD`, fixes
  swapped invoice/due dates, rejects a PO number mistaken for an invoice number.
  **Non-blocking by design**: any failure returns null and the invoice keeps its
  stage-1 extraction — so a total misconfiguration is *silent*. Verify with
  `confidence_score`, which only stage 2 populates. `AOAI_REASONING_MODEL`
  switches the request shape (reasoning models reject `max_tokens` and
  non-default `temperature`).
- **Vendor match** — exact identifiers → `pg_trgm` similarity → AI last resort.
  Vendors are created only by an admin's spreadsheet import; an unknown payee
  goes to Exceptions rather than becoming a vendor.
- **GL inheritance** — a new invoice inherits its vendor's most recent coded
  invoice (approved first, then validated/submitted) at ingest, so it arrives
  already coded. `persist.ts` fills only a blank field, never overwriting.

**Status enum** drives every queue:

```
queued → processing → validated   (low confidence, needs review)
                    → submitted    (high confidence, awaiting approval)
                    → exception    (duplicate, extraction failure, anomaly)
validated|submitted|exception → approved | rejected
```

---

## Prologue (Fiserv) write-back — optional, feature-flagged

On approval the app can stage the invoice directly in Fiserv Prologue Financials
(SQL Server) as an **unposted** AP transaction, removing the manual re-key. Off
unless `PROLOGUE_ENABLED=true`; when off, `approve()` is unchanged.

```
Browser: Approve
   │  POST /invoices/{id}/approve
   ▼
workflow.approve()          [Postgres BEGIN … FOR UPDATE OF i]
   │  shared/prologue.ts (mssql)
   ├─ EXEC dbo.tanvi_get_batchid_4today   → batch_id
   ├─ EXEC dbo.tanvi_insert_ap_invoice    → transaction_id
   ▼  on transaction_id: UPDATE invoices → approved, erp_reference_id = txid
Postgres COMMIT  →  200 { id, status: "approved" }
```

**Prologue-first, no shared transaction.** Postgres and SQL Server cannot share a
transaction, so the invoice moves to `approved` only after Prologue returns a
transaction id. The proc's `vendor_id` + `vendor_document_number` duplicate guard
makes a retry safe if the local commit fails after a successful insert. The
Prologue transaction id is stored in the existing `erp_reference_id` column
(`erp_status` / `push_status` = `synced`) — no migration.

**Four tables, two stored procs** (`db/prologue/tanvi_ap_integration.sql`,
deployed and owned by BankFund's DBA; the app login gets EXECUTE only):

| Table | Op | Why |
|---|---|---|
| `am_table_next_key` | UPDATE | key allocation for the batch + transaction (tables aren't IDENTITY-keyed) |
| `co_batch` | INSERT (once/day) | the batch the header lives in and is posted from |
| `ap_transaction` | INSERT | AP header, unposted (`transaction_status = U`) |
| `ap_transaction_detail` | INSERT | GL distribution line(s) |

Posting is left to Prologue's own engine. **Field mapping** (`stageInPrologue()`):
vendor → `vendors.external_id` (= Prologue `vendor_id`, from the uploaded vendor
list); invoice #, date, due date, amount straight across; GL is a **single line**
on `gl_code` (v1 — the proc accepts a multi-line array). `gl_approver` is **not**
sent — the AP tables have no approver column (it lives in Prologue's `wf_*`
workflow module, keyed by user id). `transaction_type_id` is left NULL in v1.
`company_id` defaults `01` and the default trade/misc/freight account
`01886910800005`, both from sample data — confirm before go-live.

**Config** — the `prologue` block in `config.ts` (read nowhere else):
`PROLOGUE_ENABLED`, `PROLOGUE_HOST` / `PORT` / `DATABASE` / `USER` / `PASSWORD`,
`PROLOGUE_ENCRYPT`, `PROLOGUE_TRUST_SERVER_CERT`, `PROLOGUE_COMPANY_ID`,
`PROLOGUE_DEFAULT_ACCOUNT`, `PROLOGUE_SOURCE_USER`. Requires the `mssql` package.

---

## Data

Extensions: `pgcrypto` (`gen_random_uuid()`) and `pg_trgm` (vendor matching).
Azure Postgres requires both allow-listed in the `azure.extensions` server
parameter (defaults to empty).

| Table | Notes |
|---|---|
| `users` | Keyed on `id`; email/password auth. |
| `invoices` | `status` drives every queue. GL coding + the decline reason live here (below). |
| `invoice_line_items`, `invoice_anomalies`, `invoice_notes`, `invoice_attachments` | Children of an invoice. |
| `vendors` | Fuzzy-matched at ingest; replaced wholesale by an admin list upload (FK is `ON DELETE SET NULL`). |
| `audit_logs` | Append-only; a trigger blocks UPDATE. Records only the actor's user id — **no IP / user-agent**. |
| `erp_*`, `app_settings` | ERP mapping / single-row settings; largely unused in this build. |

**GL coding is two fields.** `gl_code` is the **GL Account** (a 14-digit number,
dashes allowed); `gl_approver` (migration `0015`) is the **GL Approver** name.
The old single "GL (Approver)" field and the Department field were removed from
the review UI — the `department_*` columns remain but are unused.

**The decline reason is in `checker_comment`, not `decline_reason`.**
`decline_reason` (migration `0002`) is a legacy, unused column; the app writes
and reads `checker_comment`, and a declined invoice has status `rejected` (not
`declined`).

**Vendor snapshot.** Invoices carry `vendor_name_snapshot` so a later
vendor-list replacement can't erase who an invoice was for. Lookups that must
survive a list refresh (e.g. GL inheritance) match on this name, not just
`vendor_id`.

---

## Front end

- **Routing** — routes have **no `/poc/` prefix**: `/dashboard`,
  `/high-confidence`, `/low-confidence`, `/exceptions`, `/declined`, `/upload`,
  `/vendors`, `/settings/audit`, `/user-management`, and `/invoices`
  (the Approved view is `/invoices?status=approved`). **The source folder is
  still `pages/poc/`** and imports use it — only route strings were renamed.
- **Layout** ([`components/Layout.tsx`](web/src/components/Layout.tsx)) — a
  full-width fixed top banner over the sidebar, which is offset by a
  `--header-height` CSS variable in `components/ui/sidebar.tsx`.
- **Status tags** go through `invoiceStatusLabel()`
  (`web/src/lib/invoiceStatus.ts`): the review states all show as **"In Queue"**.
- **Lists** open a record on **row click** (no eye-icon column) and gate their
  empty state on a successful load, so a transient fetch failure keeps the
  spinner rather than flashing "no invoices".

---

## Secrets

No secret is stored in the database. This deployment uses the simplest path per
dependency (no Managed Identity / RBAC required):

| Dependency | This deployment | Local |
|---|---|---|
| PostgreSQL | username / password (`PG_USE_MANAGED_IDENTITY=false`) | password |
| Blob + Queue | `AzureWebJobsStorage` connection string (covers both) | Azurite |
| Document Intelligence + Azure OpenAI | API key | key |

`blob.ts` / `queue.ts` use the connection string when `AzureWebJobsStorage`
looks like one, otherwise fall back to `DefaultAzureCredential` (Managed
Identity). Keys live in `local.settings.json` (gitignored) or Function App
settings — never in the repo.

---

## Deliberate omissions & known gaps

- **No multi-tenancy.** `useAuth` still exposes a `tenantId` stub returning the
  nil UUID because some surviving pages guard data loads on it; do not "fix" the
  stub to return undefined (those pages would spin forever).
- **No signup / password reset / email verification.**
- **No ORM** — SQL in a repository layer; routes never touch the DB directly.
- ERP export delivery, master sync, and various analytics from the original are
  not ported. "Clarus AP" branding survives on a few routed pages, from the fork.
- `vite build` does **not** typecheck — run `npx tsc --noEmit -p tsconfig.app.json`
  (three pre-existing `html2pdf` errors are expected).

See [DEVELOPER.md](DEVELOPER.md) to run it locally and [CONTEXT.md](CONTEXT.md)
for the conventions and traps.
