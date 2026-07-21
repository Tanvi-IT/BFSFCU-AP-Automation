# Architecture

A single-tenant accounts-payable system: invoices arrive, are extracted by AI,
reviewed by a person, approved by a different person, and exported to the ERP.

Rebuilt Azure-native from a Supabase original. Supabase is retired, not kept.

---

## Shape

```
Browser (React SPA)
    | MSAL: Entra ID sign-in, access token per request
    v
Azure Functions  ── HTTP routes ──> PostgreSQL
    |                                   ^
    | queue message                     |
    v                                   |
Queue worker ──> Document Intelligence  |
             ──> Azure OpenAI  ─────────┘
             ──> Blob Storage
```

Uploads return in about a second. Everything slow — OCR, the language model,
vendor matching — happens in a queue-triggered worker, so the browser never
waits on a multi-second pipeline. This is the main structural difference from
the original, where extraction ran inside the HTTP request and uploads blocked
for up to a minute.

---

## Components

| Path | What it is |
|---|---|
| `api/` | Azure Functions, TypeScript. HTTP routes and the queue worker. |
| `web/` | React SPA, Vite, MSAL for auth. |
| `db/migrations/` | Numbered SQL, applied in filename order. |
| `infra/` | Bicep template and provisioning script. |

---

## Request path

Every authenticated route goes through `createHandler` or
`createMethodHandler` in `api/src/shared/handler.ts`. That wrapper is the only
place that authenticates, resolves the user, checks the role, shapes errors and
sets CORS headers. A route cannot forget to authenticate, because it never sees
the request until the wrapper has run.

1. **Authenticate** — `shared/auth.ts` verifies the bearer token against
   Entra's JWKS, checking issuer and audience. This is the only place a token
   is verified.
2. **Resolve the user** — `shared/repository/users.ts` looks up the
   application user by the token's `oid` claim.
3. **Check the role** — `shared/authorize.ts`. The only place authorization
   decisions are made.
4. **Run the handler**, which returns a response or throws an `AppError`.

### One registration per route

Azure Functions permits a single `app.http()` per route. Methods that share a
path are registered together with `createMethodHandler`, which takes a map of
method to `{roles, handler}`.

Roles are declared **per method**, not per route. Six of the merged route
groups have different roles per method — `settings` is GET/any but
PATCH/admin — so collapsing them onto one role set would be a privilege
escalation, not a tidy-up.

---

## Identity and authorization

These are deliberately separate:

- **Entra ID proves who someone is.** Anyone in the directory can obtain a
  valid token.
- **The `users` table decides whether they may use the application.** A valid
  token with no matching row is rejected with 403.

There is no signup and no admin-creation endpoint; the first user is inserted
directly. The equivalent endpoint in the original system was its most serious
vulnerability.

Users are keyed on **`entra_oid`**, never email. The email column is display
metadata and is overwritten from the token on each sign-in, so a row with a
correct email and a wrong object id looks fine and fails every request.

### Roles

Stored in the `app_role` enum, prefixed `pp-` because the names double as Entra
group names and bare names like `admin` are too generic to claim in a shared
directory. Never rendered raw — `web/src/lib/roles.ts` maps them to labels.

| Role | Capability |
|---|---|
| `pp-read_only` | View only |
| `pp-ap_analyst` | Review and edit invoices, upload |
| `pp-approver` | The above, plus approve and decline |
| `pp-admin` | Everything, including settings and user management |
| `pp-superadmin` | Bypasses every role check |

**Entra App Roles are not used.** The token's `roles` claim is parsed into
`principal.tokenRoles` and never read; authorization comes from `users.role`.
Creating `pp-admin` as a directory group grants nothing today. The prefix
reserves the names for when that integration is built.

### Segregation of duties

A submitter cannot approve their own invoice. Enforced inside the transaction
in both `approve()` and `approveMany()`, on `submitted_by` rather than role, so
`pp-superadmin` does not bypass it. This is the control that stops one person
creating and paying an invoice unilaterally.

---

## Invoice pipeline

```
upload ──> blob + row(queued) ──> queue message ──> 202 returned
                                       |
                    ┌──────────────────┘
                    v
        Document Intelligence (prebuilt-invoice)     ~4-5s
                    v
        Azure OpenAI normalisation                   ~2-3s
                    v
        vendor match ──> duplicate check ──> status
```

**Stage 1, Document Intelligence** — `prebuilt-invoice`. Submits, then polls
`Operation-Location`. Polling is safe here because no user is waiting.

**Stage 2, Azure OpenAI** — normalises and validates stage 1's output: dates to
`YYYY-MM-DD`, MM/DD/YYYY interpretation, correcting swapped invoice and due
dates, rejecting a PO number mistaken for an invoice number.

Stage 2 is **non-blocking by design**: any failure returns null and the invoice
keeps its stage-1 extraction. That means an outright misconfiguration is
silent — extraction succeeds, normalisation quietly never happens. When
debugging "the AI did nothing", suspect a swallowed error in `chat()` first.

Reasoning deployments (gpt-5.x, o-series) reject `max_tokens` and any
non-default `temperature`; `AOAI_REASONING_MODEL` switches the request shape.

**Idempotency** — the file's SHA-256 is the key. The same bytes can never
produce two invoices however many times they are uploaded or retried.

---

## Data

23 tables. The ones that matter:

| Table | Notes |
|---|---|
| `users` | Keyed on `entra_oid`. Replaces Supabase `auth.users`. |
| `invoices` | Status drives every queue. `submitted_by` drives segregation of duties. |
| `invoice_line_items`, `invoice_anomalies`, `invoice_notes` | Children of an invoice. |
| `vendors` | Fuzzy-matched at ingest via `pg_trgm`. |
| `audit_logs` | **Append-only.** A trigger blocks UPDATE. Never cleared, including by demo reset. |
| `erp_*` | ERP mapping, master data, export history. |
| `app_settings` | Single row — single-tenant. |

Extensions: `pgcrypto` for `gen_random_uuid()`, `pg_trgm` for vendor matching.
Azure Postgres requires both to be allow-listed in the `azure.extensions`
server parameter, which defaults to empty.

---

## Secrets

No secret is ever stored in the database. The original kept provider keys in
plaintext columns named `*_key_encrypted`.

| Dependency | Production | Local |
|---|---|---|
| PostgreSQL | Managed Identity | password |
| Blob, Queue | connection string | Azurite |
| Document Intelligence, Azure OpenAI | Managed Identity, or key if RBAC unavailable | key |

`credential.ts` uses Managed Identity whenever no key is configured. Keys live
in `local.settings.json` (gitignored) or Function App settings — never in the
repo.

---

## Deliberate omissions

- **No multi-tenancy.** No `tenant_id`, no tenant scoping, no RLS.
- **No signup, no password reset, no email verification.** Entra owns identity.
- **No ORM.** SQL in a repository layer; routes never touch the database
  directly.
- **No secrets in the database.**

---

## Known gaps

- `useAuth` still returns a deprecated `tenantId` stub, because ~21 pages guard
  their data loads with `if (!tenantId) return;`. It returns the nil UUID so
  those guards pass. Removing the guards and the stub together is outstanding.
- Cash-flow forecasting insights, ERP export delivery, ERP master sync,
  supplemental PDF merge, contract processing and vendor enrichment are not
  ported.
- "Clarus AP" branding survives on some routed pages, from the fork.
- Three pre-existing `html2pdf` type errors. `vite build` does not typecheck;
  run `npx tsc --noEmit -p tsconfig.app.json`.
