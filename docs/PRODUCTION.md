# Production readiness

What exists today is a **test environment**. This is the gap between that and
something that can hold real invoices, and how to get continuous deployment.

---

## What is deployed now

| | |
|---|---|
| Resource group | `bfsfcuap-rg`, eastus2 |
| Frontend | Static Web App |
| API + worker | Function App, Flex Consumption (FC1) |
| Database | PostgreSQL Flexible Server 16, Burstable B1ms |
| Storage | blob `invoices`, queue `invoice-jobs` |
| AI | existing multi-service AI Services resource in `rg-peapod-test` |

Provisioned by `infra/main.bicep` and `infra/provision.ps1`.

---

## Blockers

Each of these should be closed before real invoice data lands.

### 1. The database is publicly reachable

The server has a public endpoint and an `AllowAllAzureServices` firewall rule —
`0.0.0.0`, which means every Azure tenant, not just yours.

Move it behind a **VNet with a Private Endpoint**, put the Function App on VNet
integration, and delete the public rule. This is the single most important
change on the list.

### 2. The AI key is an app setting

The subscription account is Contributor and cannot create role assignments, so
`provision.ps1` fell back to reading the resource key and storing it as
`DOCINTEL_KEY` / `AOAI_KEY`.

Have an Owner or User Access Administrator grant the Function App's identity
**Cognitive Services User** on the AI resource, then delete both settings.
`credential.ts` uses Managed Identity whenever no key is present, so removing
them is the whole change. Until then, treat the key as a live credential and
rotate it on the usual schedule.

### 3. Postgres password authentication is still enabled

Managed Identity is in use by the application, but `passwordAuth` remains
enabled so migrations can run with psql. Once a deployment pipeline applies
migrations using a workload identity, set `passwordAuth: Disabled`.

### 4. No backup or recovery plan

7-day retention, geo-redundant backup disabled, no high availability. Decide a
retention period against the credit union's record-keeping obligations —
`audit_logs` in particular is append-only precisely because it is a financial
audit trail.

### 5. Sizing is for testing

Burstable B1ms with 32 GB will not survive real volume. Move to General Purpose
and size storage against expected invoice retention.

### 6. Secrets are not in Key Vault

Function App settings are encrypted at rest and access-controlled, which is
adequate for a test. For production, use Key Vault references so rotation does
not require redeployment.

### 7. Unresolved application issues

- `useAuth`'s `tenantId` stub returning the nil UUID so 21 dead guards pass.
- "Clarus AP" branding on routed pages — another company's name in the UI.
- Approval and per-method role enforcement have not been exercised end to end;
  both need a second user, because segregation of duties blocks self-approval.

---

## Azure DevOps

**Short answer: it will not make this easier, and the repository is already on
GitHub.**

The repository lives at `github.com/bodesannith/bfsfcu-ap-azure`. Azure Static
Web Apps has first-class GitHub integration — creating the resource offers to
generate the workflow and injects the deployment token — and
`Azure/functions-action` covers the Function App. Both are already available
with no additional setup.

Adopting Azure DevOps means adding service connections, a second permissions
model, and either mirroring the repository or pointing pipelines at GitHub.
That is real work for no capability this project needs.

**Azure DevOps earns its place when:**

- the organisation has standardised on it and this app should not be an
  exception
- you need Azure Boards or Test Plans alongside the code
- approval gates must be owned by people who will never have GitHub access

None of those are true today. If one becomes true, the pipeline below ports to
either system with minor syntax differences — the substance is the same.

### Version control is already solved

Worth separating the two things that came up together: **version control and
deployment automation are independent.** The repository is already under
version control with full history. Azure DevOps would add a *different* host
for that history, not more of it.

---

## Continuous deployment

Deploy by hand until the environment is known good. Managed Identity and
networking failures are much faster to diagnose interactively than through
pipeline round-trips — the initial deployment hit five distinct problems that
each took one command to identify and would have taken a pipeline cycle each.

Once stable, three stages:

**1. Infrastructure** — `az deployment group create` against `main.bicep`.
Incremental and idempotent, safe to run on every push to main.

**2. Database migrations** — apply `db/migrations/*.sql` in filename order.
They are written to be re-runnable. The pipeline identity needs a Postgres role
created the same way the Function App's was; see `infra/README.md`.

**3. Application** —
- API: `npm ci`, `npm run build`, then `Azure/functions-action`
- Frontend: `npm ci`, `npm run build`, then the Static Web Apps action

### The trap that will catch you

`VITE_*` values are **inlined at build time**. They must be present as
environment variables in the build step, not as Static Web App configuration.
Setting them as app settings has no effect whatsoever — the built bundle
already contains whatever was present when Vite ran. This caught the previous
deployment of the legacy stack.

### Authentication for the pipeline

Use **OIDC federated credentials**, not a service principal secret. GitHub
Actions and Azure DevOps both support it, and it removes a long-lived
credential from the equation entirely.

### Suggested environments

| Environment | Purpose |
|---|---|
| `dev` | current `bfsfcuap-rg`, deploys on every push to main |
| `prod` | separate subscription or resource group, manual approval gate |

Keep them in separate resource groups with separate Entra app registrations —
sharing a registration between environments means a redirect URI mistake in dev
can affect production sign-in.

---

## Before going live

- [ ] Postgres behind a Private Endpoint, public access removed
- [ ] Managed Identity for the AI services; both key settings deleted
- [ ] `passwordAuth` disabled once migrations run under a workload identity
- [ ] Backup retention and HA decided against record-keeping obligations
- [ ] Database resized off Burstable
- [ ] Key Vault references for anything still secret
- [ ] Approval flow and role enforcement tested with more than one user
- [ ] `tenantId` guards removed and the stub deleted
- [ ] Branding audit — no other company's name in the UI
- [ ] Alerting on Function App failures and queue depth
- [ ] Log retention aligned with audit requirements
