# Context for AI assistants

Read this before changing anything. It is written for an AI coding assistant
joining this repository cold, and covers what the code does not say about
itself: why things are the way they are, which mistakes have already been made,
and what will silently break.

Last verified against the codebase 2026-07-21.

---

## What this is

A single-tenant accounts-payable system for a credit union. Invoices arrive,
are extracted by AI, reviewed by one person, approved by a **different** person,
and exported to an ERP.

It is a rebuild of a Supabase application, forked in turn from a multi-tenant
SaaS product. **Both ancestries leave traces**, and most surprises in this
codebase come from one of them. When something looks nonsensical, ask whether it
made sense in a multi-tenant SaaS, or under Supabase.

Stack: Azure Functions (TypeScript) + React/Vite + PostgreSQL + Entra ID +
Blob/Queue Storage + Document Intelligence + Azure OpenAI.

---

## Ground rules

**1. Everything goes through `api/src/shared`.**
A handler that builds its own database client, parses its own auth header, or
sets its own CORS header is a bug. Removing that duplication was the point of
the rebuild. Routes are thin; logic lives in `shared/repository`.

**2. Never render a role name raw.**
Roles are stored `pp-` prefixed. Use `roleLabel()` from `web/src/lib/roles.ts`.

**3. Users are keyed on `entra_oid`, never email.**
`email` is display metadata, overwritten from the token on every sign-in. A row
with the right email and a wrong object id looks perfectly correct and 403s on
every request.

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
  functions/http/           admin departments erp exports invoices me
                            settings users vendors workflow
  functions/queue/          processInvoice.ts — the pipeline worker
  shared/
    handler.ts              createHandler / createMethodHandler — THE entry point
    auth.ts                 token verification. The only place.
    authorize.ts            role checks. The only place.
    config.ts              every setting is read here and nowhere else
    db.ts errors.ts logger.ts cors.ts blob.ts queue.ts
    ai/                     credential documentIntelligence openai
    pipeline/               duplicateCheck persist routing vendorMatch
    repository/             activity invoices users vendors workflow

web/src/
  App.tsx                   all routes
  authConfig.ts             MSAL configuration
  lib/api.ts                the only way the browser reaches the backend
  lib/roles.ts              role -> display label
  hooks/useAuth.ts          identity, roles, the tenantId stub
  components/Layout.tsx     shell, header, role badge
  components/AppSidebar.tsx the single navigation
  services/                 typed API client
  pages/          (26)      main pages
  pages/poc/      (16)      the queue-oriented pages actually used daily

db/migrations/              0001..0008, applied in filename order
infra/                      main.bicep, provision.ps1
docs/                       ARCHITECTURE, DEVELOPMENT, PRODUCTION
```

---

## Domain model

**Invoice status** (`invoice_status` enum) — drives every queue:

```
queued -> processing -> validated   (low confidence, needs review)
                     -> submitted   (high confidence, awaiting approval)
                     -> exception   (duplicate, extraction failure, anomaly)
validated|submitted|exception -> approved | declined
```

Only `validated`, `submitted` and `exception` are approvable (`REVIEWABLE` in
`repository/workflow.ts`).

**Roles** (`app_role` enum), least to most privileged:
`pp-read_only`, `pp-ap_analyst`, `pp-approver`, `pp-admin`, `pp-superadmin`.

**Segregation of duties.** A submitter cannot approve their own invoice.
Enforced in both `approve()` and `approveMany()`, inside the transaction, on
`submitted_by` — not role, so `pp-superadmin` does **not** bypass it. This is a
financial control. Do not weaken it.

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

**Token validation returns a deliberately opaque message.** To diagnose, decode
the token's payload segment *without verifying* and compare `iss`, `aud`, `ver`
against `config.auth`.

### IPv4 vs IPv6

The Functions host and the Postgres container both bind IPv4 only; Node 17+
resolves `localhost` to `::1` first. **Use `127.0.0.1`** in `PG_HOST` and in the
Vite proxy target. Symptom: `ECONNREFUSED ::1:5432`, or a 502 from the proxy
that looks exactly like an auth failure.

### Entra

- **`requestedAccessTokenVersion` must be `2`** on the API registration, nested
  under `api` in the manifest. It defaults to null (v1), whose issuer is
  `sts.windows.net` and never matches.
- **`ENTRA_AUDIENCE` is the bare client id**, not `api://<client-id>`. v2 tokens
  carry the client id in `aud`.
- **Redirect URIs go under Single-page application**, not Web. A Web URI passes
  the authorize request then fails token redemption with `AADSTS9002326`.
- **MSAL caches tokens in `sessionStorage`.** After changing an app
  registration, clear it or close the tab, or the old token keeps being replayed
  until expiry.

### Azure

- **`azure.extensions`** must allow-list `pgcrypto` and `pg_trgm`; it defaults
  to empty and `CREATE EXTENSION` is refused.
- **Azurite needs `--skipApiVersionCheck`**, or every upload fails.
- Classic App Service SKUs (Y1, B1) have **zero quota** on the current
  subscription. Flex Consumption (FC1) is used instead, which needs
  `functionAppConfig` rather than `linuxFxVersion`.

### Leftovers from the fork

**`tenantId` is a stub returning the nil UUID.** This build is single-tenant,
but **21 guards across 15 pages** still gate data loads on
`if (!tenantId) return;`. Those guards
bail before fetching **and before clearing the loading flag**, so the page spins
forever. The stub returns a non-empty value purely so they pass. Removing the
guards and the stub together is outstanding work. **Do not "fix" the stub by
returning undefined.**

**Entra App Roles are parsed and discarded.** `principal.tokenRoles` is
populated in `auth.ts` and never read. Authorization comes from `users.role` in
Postgres. Creating `pp-admin` as a directory group grants nothing.

**Some pages were bulk-scripted during the port** — roughly 18 settings and ERP
pages. Four had their Supabase query builder stripped to `let query: any = null`
with the `.eq()` chain left behind, so they threw before calling an API that
worked fine. Those four are fixed; if a settings or ERP page misbehaves,
**suspect the port before suspecting logic**.

**"Clarus AP" branding** survives on some routed pages — another company's name,
from the fork.

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

# local database
$env:PGHOST='127.0.0.1'; $env:PGUSER='postgres'
$env:PGPASSWORD='postgres'; $env:PGDATABASE='bfsfcu_ap'
psql -c "SELECT invoice_number, status, confidence_score FROM invoices;"
```

`psql` is usually at `C:\Program Files\PostgreSQL\17\bin` and not on PATH.

---

## Deployed environment

Resource group `bfsfcuap-rg`, eastus2. Static Web App + Function App (Flex
Consumption) + PostgreSQL Flexible Server 16 + Storage. AI comes from an
existing multi-service resource in `rg-peapod-test`.

The Function App authenticates to Postgres with Managed Identity; the database
role was created with `pgaadauth_create_principal_with_oid`, which exists only
in the `postgres` database while roles are cluster-wide.

AI access uses an **API key**, not Managed Identity, because the deploying
account is Contributor and cannot create role assignments.

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
