# Local end-to-end test

Run the whole stack on your machine and take an invoice from upload through
extraction, review and approval.

**Time:** ~30 minutes the first time, most of it Entra setup.

---

## What runs locally vs. what does not

| Component | Local? |
|---|---|
| Frontend (Vite) | ✅ local |
| API + queue worker (Functions) | ✅ local |
| Postgres | ✅ local |
| Blob + Queue | ✅ Azurite emulator |
| **Entra sign-in** | ☁️ **cloud — free, but needs an app registration** |
| **Document Intelligence + Azure OpenAI** | ☁️ **cloud — reuse your existing resources** |

The AI services run in Azure. Use the **same Document Intelligence and Azure
OpenAI endpoints and keys** you already have from the Supabase deployment —
nothing new to provision.

Locally the app authenticates to them with those **keys**. In Azure it uses
**Managed Identity** and no key exists at all. Keys belong in
`local.settings.json` (gitignored) or Key Vault — never in the database, which
is where the old system kept them in plaintext.

---

## 1. Prerequisites

```bash
node -v          # 20+
npm i -g azure-functions-core-tools@4 --unsafe-perm true
npm i -g azurite
psql --version   # PostgreSQL 14+
```

You will also need, from your existing Azure resources:

- Document Intelligence **endpoint + key**
- Azure OpenAI **endpoint + key**, and the **deployment name** (e.g. `gpt-4o`)

Both are in the Azure portal under the resource's *Keys and Endpoint* blade.

---

## 2. Database

```bash
createdb bfsfcu_ap

cd azure/db/migrations
for f in 0001_*.sql 0002_*.sql 0003_*.sql 0004_*.sql 0005_*.sql 0006_*.sql 0007_*.sql; do
  echo "applying $f"
  psql -d bfsfcu_ap -v ON_ERROR_STOP=1 -f "$f" || break
done
```

Windows PowerShell:

```powershell
createdb bfsfcu_ap
Get-ChildItem azure\db\migrations\*.sql | Sort-Object Name | ForEach-Object {
  Write-Host "applying $($_.Name)"
  psql -d bfsfcu_ap -v ON_ERROR_STOP=1 -f $_.FullName
}
```

**Verify:**

```bash
psql -d bfsfcu_ap -c "\dt"
```

Expect ~20 tables including `users`, `invoices`, `vendors`, `audit_logs`,
`erp_departments`, `app_settings`.

---

## 3. Entra app registration

Portal → **Microsoft Entra ID** → **App registrations**.

### 3a. API registration

1. **New registration** → name `bfsfcu-ap-api` → **Register**
2. **Expose an API** → *Add* Application ID URI → accept `api://<client-id>`
3. **Add a scope**
   - Scope name `access_as_user`
   - Who can consent: **Admins and users**
   - Display name / description: `Access the AP API`
   - **Add scope**
4. **App roles** → create five, all *Users/Groups*:
   `superadmin`, `admin`, `ap_analyst`, `approver`, `read_only`
5. Note the **Application (client) ID** and **Directory (tenant) ID**

### 3b. SPA registration

1. **New registration** → name `bfsfcu-ap-web`
2. **Authentication** → *Add a platform* → **Single-page application**
   → Redirect URI `http://localhost:8080`
3. **API permissions** → *Add a permission* → **My APIs** → `bfsfcu-ap-api`
   → **Delegated** → `access_as_user` → *Add*
   → **Grant admin consent**
4. Note this registration's **client ID**

### 3c. Assign yourself a role

**Enterprise applications** → `bfsfcu-ap-api` → **Users and groups**
→ *Add user* → pick yourself → role **admin**.

### 3d. Get your Object ID

**Users** → your account → copy **Object ID** (a GUID). Needed in step 6.

---

## 4. Configure the API

```bash
cd azure/api
npm install
cp local.settings.json.example local.settings.json
```

Edit `local.settings.json`:

```jsonc
{
  "IsEncrypted": false,
  "Values": {
    "FUNCTIONS_WORKER_RUNTIME": "node",
    "AzureWebJobsStorage": "UseDevelopmentStorage=true",
    "AZURE_FUNCTIONS_ENVIRONMENT": "Development",

    "ENTRA_TENANT_ID": "<directory-tenant-id>",
    "ENTRA_CLIENT_ID": "<API-registration-client-id>",
    "ENTRA_AUDIENCE": "api://<API-registration-client-id>",

    "PG_HOST": "localhost",
    "PG_PORT": "5432",
    "PG_DATABASE": "bfsfcu_ap",
    "PG_USER": "postgres",
    "PG_PASSWORD": "postgres",
    "PG_SSL": "false",
    "PG_USE_MANAGED_IDENTITY": "false",

    "BLOB_ACCOUNT_URL": "http://127.0.0.1:10000/devstoreaccount1",
    "BLOB_CONTAINER": "invoices",
    "QUEUE_ACCOUNT_URL": "http://127.0.0.1:10001/devstoreaccount1",
    "QUEUE_NAME": "invoice-jobs",

    "DOCINTEL_ENDPOINT": "https://<your-docintel>.cognitiveservices.azure.com",
    "DOCINTEL_KEY": "<your-docintel-key>",
    "AOAI_ENDPOINT": "https://<your-openai>.openai.azure.com",
    "AOAI_KEY": "<your-openai-key>",
    "AOAI_DEPLOYMENT": "gpt-4o",
    "AOAI_API_VERSION": "2024-08-01-preview",

    "ALLOWED_ORIGINS": "http://localhost:8080",
    "LOG_LEVEL": "info"
  },
  "Host": { "CORS": "http://localhost:8080" }
}
```

> **These are the same endpoints and keys the Supabase version used.** Reuse them.
>
> `local.settings.json` is gitignored, so the keys stay out of the repo. If you
> prefer Managed Identity locally instead, omit `DOCINTEL_KEY`/`AOAI_KEY`, run
> `az login`, and grant your account **Cognitive Services User** on both
> resources — the code falls back to Managed Identity when no key is set.

---

## 5. Configure the frontend

```bash
cd azure/web
npm install
cp .env.example .env
```

Edit `.env`:

```
VITE_ENTRA_TENANT_ID=<directory-tenant-id>
VITE_ENTRA_CLIENT_ID=<SPA-registration-client-id>
VITE_API_SCOPE=api://<API-registration-client-id>/access_as_user
VITE_API_BASE_URL=/api
```

> Note the two different client IDs: `VITE_ENTRA_CLIENT_ID` is the **SPA**,
> while `VITE_API_SCOPE` uses the **API** registration. Mixing these up is the
> most common setup error.

---

## 6. Create your user

There is deliberately no signup and no admin-creation endpoint. Insert the
first user directly, using the Object ID from step 3d:

```bash
psql -d bfsfcu_ap -c "INSERT INTO users (entra_oid, email, full_name, role)
  VALUES ('<your-object-id>', 'you@company.com', 'Your Name', 'admin');"
```

**Verify:**

```bash
psql -d bfsfcu_ap -c "SELECT email, role, is_active FROM users;"
```

---

## 7. Start everything

Three terminals:

```bash
# 1 — storage emulator
# --skipApiVersionCheck is required: the @azure/storage-blob SDK negotiates a
# newer REST API version than Azurite supports, and without it every upload
# fails with "The API version ... is not supported by Azurite". Emulator-only —
# real Azure Storage accepts the version.
azurite --silent --skipApiVersionCheck --location ./.azurite

# 2 — API  (http://localhost:7071)
cd azure/api && npm start

# 3 — web  (http://localhost:8080)
cd azure/web && npm run dev
```

Terminal 2 should list the functions on startup (`invoices-upload`,
`process-invoice`, `me`, …). If it does not, the build failed — check for
TypeScript errors above the listing.

---

## 8. End-to-end test

### Test 1 — Sign in

1. Open <http://localhost:8080>
2. **Sign in with Microsoft** → complete Entra login
3. You should land on the dashboard with your name in the header

**If you see "Access not enabled":** you are authenticated but step 6 did not
match — the `entra_oid` in the database differs from your token's Object ID.

### Test 2 — Upload an invoice

1. Go to **Upload** (`/poc/upload`)
2. Drop in a **real invoice PDF** — extraction is genuine, so use something
   with a vendor name, invoice number, date and total
3. **Process** → expect *"1 invoice queued"* within about a second

**What to verify — this is the core architectural change:**
the upload returns immediately; extraction happens afterwards in the worker.

Terminal 2 should show, over the next 10–30 seconds (Document Intelligence
polls until the document is analysed):

```
Processing started
Extraction complete   { invoiceNumber: '...', lineItems: N }
Processing complete   { status: '...' }
```

```bash
psql -d bfsfcu_ap -c "SELECT invoice_number, status, total_amount FROM invoices;"
```

Status depends on the real confidence score and vendor state:

| Status | Meaning |
|---|---|
| `submitted` | High Confidence — clean extraction, known active vendor |
| `validated` | Low Confidence — needs review (a new vendor always lands here) |
| `exception` | Duplicate, extraction failure, or a critical flag |

**The first upload from any vendor goes to Low Confidence**, because the vendor
is created as `pending_verification`. That is correct behaviour, not a bug.

### Test 3 — Review queues

- **Low Confidence** (`/poc/low-confidence`) — where a first-time vendor lands
- **High Confidence** (`/poc/high-confidence`) — clean invoices from known vendors
- Open it: vendor, amount, dates, line items all populated
- The PDF preview loads via a short-lived SAS URL

### Test 4 — Approve

1. Click **Approve**
2. It leaves the queue and appears under approved invoices

```bash
psql -d bfsfcu_ap -c "SELECT action, created_at FROM audit_logs ORDER BY created_at;"
```

Expect `processed`, then `approved` — the audit entry is written in the same
transaction as the status change.

### Test 5 — Duplicate detection

Upload **the same PDF again**.

Expected: *"1 file had already been uploaded"* and **no second invoice row**.
This is the `UNIQUE(file_hash)` constraint — the protection against
duplicate payments.

```bash
psql -d bfsfcu_ap -c "SELECT COUNT(*) FROM invoices;"   # still 1
```

Now upload a **genuinely different invoice** — different vendor or invoice
number — and confirm it creates a new row and resolves its own vendor.

To test the *hard* duplicate path (same invoice number, different file), upload
a second document from the same vendor carrying the same invoice number.

### Test 6 — Decline and notes

1. Upload another invoice, open it from a queue
2. Add a **note** → it appears with your name (attributed server-side)
3. **Decline** with a reason → moves to the Declined queue

### Test 7 — Roles

```bash
psql -d bfsfcu_ap -c "UPDATE users SET role = 'read_only';"
```

Sign out, sign back in. Approve/decline should now be rejected with
*"This action requires one of: admin, approver"*. Then restore:

```bash
psql -d bfsfcu_ap -c "UPDATE users SET role = 'admin';"
```

### Test 8 — Excel export

**Invoices** → filter **Approved** → **Export Prologue Reconciliation File**.
An `.xlsx` downloads with the original ten columns: Vendor ID, Vendor Name,
Invoice Number, Amount, Invoice Date, ACH Account, ACH Routing, Sanitized
Filename, Transaction Date, Approved Date.

### Test 9 — Admin

- **User Management** — lists users; add one by **Entra Object ID** (not a password)
- **Audit Console** — full audit trail
- **Settings** — save a change and confirm it persists after reload

---

## Troubleshooting

| Symptom | Cause |
|---|---|
| Blank page, console `Missing VITE_ENTRA_*` | `.env` not created or dev server not restarted |
| Redirect loop on sign-in | SPA redirect URI is not exactly `http://localhost:8080` |
| `401` on every API call | `VITE_API_SCOPE` uses the wrong client ID — must be the **API** registration |
| `403 Access not enabled` | `users.entra_oid` does not match your Object ID |
| Upload works, invoice stays `queued` | Azurite not running, or the worker did not start — check terminal 2 |
| Invoice goes to `exception` | Open `processing_error` on the row: `SELECT processing_error FROM invoices WHERE status='exception';` |
| `ECONNREFUSED ::1:5432` | Postgres not running, or use `127.0.0.1` instead of `localhost` |
| Feature shows "not available yet in the Azure build" | Expected — see the not-ported list in `README.md` |

**Reset between runs:**

```bash
psql -d bfsfcu_ap -c "TRUNCATE invoice_line_items, invoice_anomalies, invoice_notes, invoices, vendors CASCADE;"
```

`audit_logs` is intentionally append-only and is not cleared.

---

## What this does not cover

- **ERP export delivery, master-data sync, contract processing, supplemental
  PDF merge, vendor enrichment, cash-flow forecasting** — not ported; each
  reports so explicitly
- **Managed Identity** — local runs use a Postgres password and your `az login`
  session; Azure uses Managed Identity instead
- **Email ingestion** — no endpoint is wired up locally
