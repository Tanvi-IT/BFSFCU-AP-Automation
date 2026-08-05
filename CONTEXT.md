# Context for AI assistants

Read this before changing anything. It is written for an AI coding assistant
joining this repository cold, and covers what the code does not say about
itself: why things are the way they are, which mistakes have already been made,
and what will silently break.

Last verified against the codebase 2026-07-30.

---

## What this is

A single-tenant accounts-payable system for a credit union. Invoices arrive,
are extracted by AI, reviewed, and approved. **Any user can approve any invoice,
including one they uploaded** — self-approval is allowed and flagged in the audit
trail, not blocked (there is no enforced two-person separation).

It is a rebuild of a Supabase application, forked in turn from a multi-tenant
SaaS product. **Both ancestries leave traces**, and most surprises in this
codebase come from one of them. When something looks nonsensical, ask whether it
made sense in a multi-tenant SaaS, or under Supabase.

Stack: Azure Functions (TypeScript) + React/Vite + PostgreSQL + local
password auth (session cookie) + Blob/Queue Storage + Document Intelligence +
Azure OpenAI. Plus an **optional** Fiserv Prologue (SQL Server) write-back on
approve, feature-flagged off by default (see "Prologue write-back" below).

---

## Ground rules

**1. Everything goes through `api/src/shared`.**
A handler that builds its own database client, parses its own auth header, or
sets its own CORS header is a bug. Removing that duplication was the point of
the rebuild. Routes are thin; logic lives in `shared/repository`.

**2. Two roles: `admin` and `user`.**
admin can do everything (user management, vendor upload, audit); user does all
invoice work including approve. `roleLabel()` in `web/src/lib/roles.ts` maps to
display labels. (Auth is local email/password, plus optional Microsoft Entra SSO
on the same session cookie. See the auth section.)

**3. Users log in by email; identity is the session token's `sub` (= users.id).**
`auth_provider` and `external_id` link a user to an external identity provider.
Microsoft Entra SSO is now implemented on this seam (optional, admin-configured)
— it ends by issuing the same session token, so identity resolution downstream
is unchanged. See "Entra SSO" below.

**4. One `app.http()` registration per route.**
Azure Functions permits exactly one. Methods sharing a path use
`createMethodHandler` with **per-method roles**. Collapsing them onto a single
role set is a privilege escalation — six route groups have different roles per
method.

**5. Handlers throw `AppError`; the wrapper shapes the response.**
Never hand-build an error response inside a route.

**6. This is a faithful port, not a redesign.**
The UI deliberately matches the original so it stays testable. Two improvements
were made and then reverted for this reason. Do not "improve" behaviour without
being asked.

---

## Layout

```
api/src/
  index.ts                  every function module must be imported here
  functions/http/           attachments auth demo departments integrations
                            invoices me users vendors workflow
  functions/queue/          processInvoice.ts — the pipeline worker
  shared/
    handler.ts              createHandler / createMethodHandler — THE entry point
    auth.ts                 token verification. The only place.
    authorize.ts            role checks. The only place.
    config.ts              every setting is read here and nowhere else
    db.ts errors.ts logger.ts cors.ts blob.ts queue.ts
    prologue.ts             mssql client for the Prologue write-back (flag-gated)
    ai/                     credential documentIntelligence openai
    pipeline/               duplicateCheck persist routing vendorMatch
    repository/             activity invoices users vendors workflow

web/src/
  App.tsx                   all routes
  hooks/useAuth.ts          AuthProvider context (login/logout, role) + authApi
  pages/Auth.tsx            email/password login form
  lib/api.ts                the only way the browser reaches the backend
  lib/roles.ts              role -> display label
  hooks/useAuth.ts          identity, roles, the tenantId stub
  components/Layout.tsx     shell, header, role badge
  components/AppSidebar.tsx the single navigation
  services/                 typed API client
  pages/          (26)      main pages
  pages/poc/      (16)      the queue-oriented pages actually used daily

db/migrations/              0001..0015, applied in filename order
db/prologue/                tanvi_ap_integration.sql — Prologue stored-proc DDL
                            (deployed by BankFund's DBA, not an app migration)
infra/                      main.bicep, provision.ps1
ARCHITECTURE.md README.md   at repo root; DEVELOPER.md too (docs/ folder removed)
```

---

## Domain model

**Invoice status** (`invoice_status` enum) — drives every queue:

```
queued -> processing -> validated   (low confidence, needs review)
                     -> submitted   (high confidence, awaiting approval)
                     -> exception   (duplicate, extraction failure, anomaly)
validated|submitted|exception -> approved | rejected
```

The declined status value is **`rejected`**, not `declined` (the enum has both —
0004 re-added `rejected` because the app uses it throughout; `QUEUE.declined =
"rejected"`). The UI label is "Declined".

Only `validated`, `submitted` and `exception` are approvable (`REVIEWABLE` in
`repository/workflow.ts`).

**Roles** (`app_role` enum): `admin` and `user`. admin does everything; user
does all invoice work including approve.

**Approval / segregation of duties.** By product decision, any user may approve
any invoice, **including their own** — self-approval is NOT blocked. Instead the
audit trail records the approver and flags `self_approved: true` (in both
`approve()` and `approveMany()`). If a future requirement reinstates maker-checker
separation, that flag/logic is where it goes.

**Invoice GL coding — two fields.** `gl_code` is the **GL Account** (a 14-digit
number, dashes allowed); `gl_approver` (added in migration **0015**) is the
**GL Approver** name. The old single "GL (Approver)" field and the Department
field were removed from the review UI — the `department_*` columns still exist
but are unused. A new upload **inherits its vendor's most recent coded invoice**
(approved first, then validated/submitted) at ingest: see `lastCodingForVendor` /
`codingSuggestionForInvoice` in `repository/invoices.ts`, the
`GET /invoices/{id}/suggested-coding` route, and `persist.ts` — which only fills
a **blank** field, never overwriting a reviewer's coding.

**Decline reason lives in `checker_comment`, NOT `decline_reason`.**
`decline_reason` (migration 0002) is a legacy, unused column. The app writes and
reads `checker_comment`, and a declined invoice has status **`rejected`** (not
`declined`). Reading `decline_reason` yields "No reason provided" — a bug that has
already hit the declined list and the server-side search.

---

## Prologue (Fiserv) write-back on approve

An optional integration writes an approved invoice straight into Fiserv Prologue
Financials (SQL Server) as an **unposted** AP transaction, so AP staff don't
re-key it. It is **off unless `PROLOGUE_ENABLED=true`** — when off, `approve()`
takes the plain-Postgres path and none of this runs. Deployed off.

- **Cross-database, no shared transaction.** The app DB is Postgres; Prologue is
  SQL Server. There is no ACID transaction across both. The design is
  **Prologue-first**: `approve()` stages the transaction in Prologue inside the
  same `FOR UPDATE` row lock and only flips the invoice to `approved` once
  Prologue returns a transaction id. The proc's duplicate guard (`vendor_id` +
  `vendor_document_number`) is the idempotency net if the local commit fails
  after a successful insert.
- **Reuses the fork's `erp_`/`push_` columns — no migration.** The Prologue
  transaction id lands in `invoices.erp_reference_id`, with `erp_status` /
  `push_status` = `synced`.
- **Two stored procs, four tables.** `dbo.tanvi_get_batchid_4today` and
  `dbo.tanvi_insert_ap_invoice` (DDL in `db/prologue/tanvi_ap_integration.sql`)
  write only `am_table_next_key`, `co_batch`, `ap_transaction`,
  `ap_transaction_detail`. Audit shadow rows (`zm_*`, `am_modifications_register`)
  were deliberately dropped. The procs are **owned/deployed by BankFund's DBA**;
  the app login needs EXECUTE on them only. Called via `mssql` from
  `shared/prologue.ts`; posting is left to Prologue's own engine.
- **Vendor id mapping is `vendors.external_id`** (= Prologue `ap_vendor.vendor_id`),
  populated from the admin's uploaded vendor list — the existing `HEADER_MAP`
  already maps a `vendor_id` column onto `external_id`. `approve()` **blocks**
  (clear error, invoice stays queued) if the vendor is unmapped or
  `gl_code`/dates/amount are missing — that is the "approve only if Prologue can
  be updated" contract.
- **Single-line GL (v1).** The full amount is coded to `gl_code`. The proc accepts
  a multi-line array; only the mapping in `stageInPrologue()` sends one line.
- **`gl_approver` is NOT sent.** `ap_transaction`/`ap_transaction_detail` have no
  approver column; Prologue's approver lives in its Workflow (`wf_*`) module and
  is a user id, not a name. Parked pending BankFund's workflow answer.
  `transaction_type_id` is also left NULL in v1.
- **Batch approve** pushes **per-invoice** when the flag is on (one bad invoice
  doesn't roll back the rest) and returns a `failed[]` list.
- **Config** is the `prologue` block in `config.ts` (`PROLOGUE_*` env vars).
  `company_id` defaults to `01` and the default trade/misc/freight account to
  `01886910800005`, both from BankFund sample data — confirm before go-live.

---

## Traps

These have all bitten already. Each cost real debugging time.

### Silent failures

**Stage-2 AI failures are swallowed by design.** `normalizeInvoice()` catches
everything and returns null so a reasoning failure never loses an invoice.
A total misconfiguration therefore looks like success: extraction works,
normalisation silently never happens. Verify with `confidence_score` — it is
populated only by stage 2.

**Route conflicts only appear in the `func start` banner.** The host starts
fine and serves surviving routes. Always check for `function(s) are in error`.

**`vite build` does not typecheck.** Run
`npx tsc --noEmit -p tsconfig.app.json`. Three pre-existing `html2pdf` errors
are expected; anything else is yours.

### IPv4 vs IPv6

The Functions host and the Postgres container both bind IPv4 only; Node 17+
resolves `localhost` to `::1` first. **Use `127.0.0.1`** in `PG_HOST` and in the
Vite proxy target. Symptom: `ECONNREFUSED ::1:5432`, or a 502 from the proxy
that looks exactly like an auth failure.

### Auth (local password + session cookie)

- **`useAuth` must be context, not per-hook state.** It is an `AuthProvider`
  (wrapping the app in `main.tsx`). If you refactor it back to local `useState`,
  login/logout will update only the calling component and everyone else stays
  stale — the symptom is a **blank screen right after login** that a reload fixes.
- **`SESSION_SECRET`** signs the HS256 session token. Set `AUTH_COOKIE_INSECURE=true`
  for local HTTP (so the cookie is not marked Secure); omit it in Azure.
- The cookie is httpOnly SameSite=Lax, same-origin via the `/api` proxy — the
  browser never handles the token.
- **Microsoft Entra SSO is implemented on the `auth_provider`/`external_id` seam**
  (optional — see "Entra SSO" below). Local email/password still works alongside
  it. The seeded local admin is `admin@peapod.com`; its **dev-only** default
  password lives in `db/migrations/0009_local_auth.sql` (and DEVELOPER.md) —
  rotate it for any real deployment. The live demo's password has already been
  changed, so the seed default no longer works against live.

### Entra SSO (optional, admin-configured)

Off unless an admin enables it in **User Management → Single Sign-On (Microsoft
Entra)**; the config (`entra_enabled` / `entra_tenant_id` / `entra_client_id`,
migration **0016**) lives in `app_settings`.

- **Public client (PKCE), no secret.** The SPA signs in with MSAL
  (`web/src/lib/entra.ts`), gets an **ID token**, and posts it to
  `POST /api/auth/sso/entra`. The backend verifies it against Entra's JWKS
  (`api/src/shared/entra.ts`), maps it to a user, and calls `signSession()` — so
  the session cookie and everything downstream are identical to password login.
  Only the (public) tenant/client ids are stored — nothing secret in the DB.
- **Match-existing-only.** SSO logs in a user only if an admin already created
  their account: matched by `external_id`, then email (linking `external_id` on
  first login). Unknown Entra users are rejected — no self-provisioning.
- **Login page** fetches `GET /api/auth/sso/config` and shows "Sign in with
  Microsoft" only when enabled. Admin config is `GET/PUT /api/settings/sso`.
- The app registration must list the site URL as a **SPA redirect URI**, and the
  Function App needs outbound access to `login.microsoftonline.com` (JWKS).

### Azure

- **`azure.extensions`** must allow-list `pgcrypto` and `pg_trgm`; it defaults
  to empty and `CREATE EXTENSION` is refused.
- **Azurite needs `--skipApiVersionCheck`**, or every upload fails.
- Classic App Service SKUs (Y1, B1) have **zero quota** on the current
  subscription. Flex Consumption (FC1) is used instead, which needs
  `functionAppConfig` rather than `linuxFxVersion`.

### Leftovers from the fork

**`tenantId` is a stub returning the nil UUID.** This build is single-tenant, but
some surviving pages still gate data loads on `if (!tenantId) return;`. Those
guards bail before fetching **and before clearing the loading flag**, so the page
spins forever. The stub returns a non-empty value purely so they pass. **Do not
"fix" the stub by returning undefined.** (Many pages that had this guard were
deleted in the sidebar cleanup, so far fewer remain than before.)

**The sidebar and its pages were heavily trimmed.** Only Dashboard, the
processing queues (High/Low Confidence, Exceptions, Declined, Approved), and
Administration (Upload Invoices, Vendors, User Management, Audit) remain. The
ERP-admin / settings / intelligence / AI pages and their backend endpoints
(settings.ts, admin.ts, erp.ts, exports.ts) were deleted. Their DB tables were
left in place. Don't be surprised the code is gone.

**Some pages were bulk-scripted during the port** — roughly 18 settings and ERP
pages. Four had their Supabase query builder stripped to `let query: any = null`
with the `.eq()` chain left behind, so they threw before calling an API that
worked fine. Those four are fixed; if a settings or ERP page misbehaves,
**suspect the port before suspecting logic**.

**"Clarus AP" branding** survives on some routed pages — another company's name,
from the fork.

### UI & routing (added 2026-07-28)

**Routes dropped the `/poc/` prefix.** Queue pages are `/high-confidence`,
`/low-confidence`, `/exceptions`, `/declined`, `/upload`, `/user-management`
(consistent with `/invoices`). **The source folder is still `pages/poc/` and the
imports still use it** — only route *strings* were renamed. Never rewrite the
`pages/poc/` import paths (e.g. via a blind find-replace of `/poc/`). Approved
invoices are the `/invoices?status=approved` view; bare `/invoices` redirects
there and its heading reads "Approved".

**Status tags go through `invoiceStatusLabel()`** (`web/src/lib/invoiceStatus.ts`):
queued/processing/validated/submitted all render as **"In Queue"**;
approved/exception/declined map to their own labels. The audit "In Queue" filter
matches them by sending a **comma-separated** status set
(`queued,processing,validated,submitted`); `repository/invoices.ts` `list()`
accepts that and uses `status::text = ANY`. Server-side search covers invoice #,
vendor, amount, and `checker_comment`.

**The top banner is full-width, above the sidebar.** `Layout.tsx` renders it as a
`fixed` bar and offsets the shadcn sidebar down with a `--header-height` CSS
variable (fallback `0px`) added to `ui/sidebar.tsx`. Queue lists open a record on
**row click** — the eye-icon action column was removed.

**Queue pages gate their empty state on `hasLoaded`** (set only after a
successful fetch), so a transient failure keeps the spinner and the 10-second
poll recovers instead of flashing "no invoices".

---

## Working commands

```powershell
# local stack
docker start bfsfcu-pg
azurite --silent --skipApiVersionCheck --location .\.azurite
cd api; npm start        # :7071
cd web; npm run dev      # :8080

# typecheck
cd api; npx tsc --noEmit
cd web; npm run typecheck   # 3 pre-existing html2pdf errors

# local database (postgres/postgres is the local Docker default — a throwaway,
# not a secret; there are no production credentials in this repo)
$env:PGHOST='127.0.0.1'; $env:PGUSER='postgres'
$env:PGPASSWORD='postgres'; $env:PGDATABASE='bfsfcu_ap'
psql -c "SELECT invoice_number, status, confidence_score FROM invoices;"
```

`psql` is usually at `C:\Program Files\PostgreSQL\17\bin` and not on PATH.

---

## Deployed environment

The live demo runs **entirely in resource group `rg-peapod-test`**: Static Web
App (`bfsfcuap-web`) + Function App (`bfsfcuap-api`, Flex Consumption) +
PostgreSQL Flexible Server 16 (`bfsfcuap-pg`) + Storage, with AI from an existing
multi-service resource in the same group.

Auth to every dependency is by **credential, not Managed Identity**: Postgres
uses username/password (`PG_USE_MANAGED_IDENTITY=false`), Storage uses the
`AzureWebJobsStorage` connection string (which also covers Blob + Queue), and AI
uses an API key. The `infra/main.bicep` template describes a different,
Managed-Identity-based target (`bfsfcuap-rg`) and is WIP — do not deploy from it.
Deploy commands are in [DEVELOPER.md](DEVELOPER.md).

---

## Making changes

**Adding a route** — add to an existing file in `functions/http/`, use
`createHandler`, put logic in `repository/`. If the path already exists, merge
into `createMethodHandler` with per-method roles. New file? Import it in
`src/index.ts` or it will not register.

**Adding a setting** — `config.ts` only, plus `local.settings.json.example` and
`infra/main.bicep`.

**Changing the schema** — a new numbered migration. Never edit an applied one.
Make it idempotent; they get re-run.

**Touching auth or roles** — `auth.ts`, `authorize.ts`, `handler.ts`. Nowhere
else. Per-method roles must survive any route merge.

---

## Verify, do not assume

The most expensive mistakes in this project's history were confident diagnoses
that turned out wrong:

- A sign-in failure was attributed to Entra platform configuration for two
  rounds. The actual cause was the Vite proxy resolving to IPv6.
- Storage role assignments were written into the template and blocked a
  deployment; the code prefers a connection string and would never have used
  them.
- A quota of zero was read as a hard limit; the resource provider was simply
  unregistered.

The pattern: an error message was taken as evidence of the *cause* rather than
the *symptom*. Reproduce, instrument, then conclude. When an error is opaque,
add temporary logging rather than theorise — that is what finally settled the
token problem in one step after two wrong guesses.
