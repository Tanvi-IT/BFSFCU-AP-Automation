# Azure infrastructure

Provisions a **testing** environment. Sized and secured for testing, not for
production — see *Before production* below.

## What it creates

| Resource | Purpose |
|---|---|
| Storage account | `invoices` blob container, `invoice-jobs` queue |
| PostgreSQL Flexible Server | application database, Entra auth enabled |
| Function App | HTTP API **and** the queue-triggered worker |
| Static Web App | frontend |
| Application Insights + Log Analytics | Function App telemetry |

The frontend and the API are deliberately **separate**. Static Web Apps'
built-in managed Functions support HTTP triggers only, and this application
depends on a queue trigger (`process-invoice`) — that is what lets an upload
return in about a second instead of blocking on the AI pipeline. Under managed
Functions the worker would never run and invoices would sit at `queued`.

## Prerequisites

```powershell
az --version      # Azure CLI, signed in with: az login
psql --version    # to apply migrations
func --version    # Azure Functions Core Tools v4
npm --version     # Node 20+
```

You also need the resource id of the existing AI Services resource:

```powershell
az cognitiveservices account show `
  --name peapod-test-resource --resource-group <its-rg> --query id -o tsv
```

## Running it

```powershell
cd azure\infra
.\provision.ps1 -NamePrefix bfsfcuap `
                -AiResourceId '<the id from above>' `
                -PostgresAdminPassword (Read-Host 'pg password' -AsSecureString)
```

Re-running is safe: the Bicep deployment is incremental and the migrations are
idempotent.

The script finishes by printing four manual steps — the Postgres role for the
Managed Identity, the SPA redirect URI, the first user row, and the frontend
build. Those are listed there rather than automated because each needs a value
only you can supply, or is a SQL grant Bicep cannot express.

## No keys anywhere

The Function App gets a system-assigned identity, and the template grants it
**Storage Blob Data Contributor** and **Storage Queue Data Contributor**. The
script grants **Cognitive Services User** on the AI resource separately,
because that resource is in another resource group.

`DOCINTEL_KEY` and `AOAI_KEY` are deliberately **not** set. With no key present
the code authenticates to both AI services with Managed Identity — see
`api/src/shared/ai/credential.ts`. The same applies to Postgres:
`PG_USE_MANAGED_IDENTITY=true` and no password in app settings.

The one exception is `AzureWebJobsStorage`, which the Functions runtime itself
needs and which uses an account key. That is the runtime's own bookkeeping
storage, not application data.

## Before production

This template is honest about being a testing environment:

- **Postgres is reachable from all Azure services** (`0.0.0.0` firewall rule)
  and has a public endpoint. Move it behind a VNet or Private Endpoint.
- **Burstable B1ms Postgres**, 32 GB, no high availability, 7-day backups.
- **Consumption Function App** — cold starts are noticeable, and the queue
  worker's scale-out is limited.
- The Postgres administrator password is passed as a parameter. For production
  put it in Key Vault, or drop password auth entirely once the Managed Identity
  role exists.
- No custom domain, no WAF, no private networking between tiers.

## CI

Deliberately none. Deploy by hand until the environment is known good —
Managed Identity and networking problems are much faster to diagnose
interactively than through pipeline round-trips. Once it is stable, GitHub
Actions is the natural fit: the repository is already on GitHub, and Static Web
Apps generates a workflow and deployment token for you. `Azure/functions-action`
covers the Function App.

Note that `VITE_*` values are inlined by Vite at **build** time. They must be
present in the build environment (repository secrets), not in Static Web App
configuration — setting them as app settings has no effect.
