<#
.SYNOPSIS
  Provision and deploy the BFSFCU AP application to Azure.

.DESCRIPTION
  Runs the Bicep template, then performs the steps Bicep cannot:

    - grants the Function App's identity access to the AI services resource,
      which lives in a different resource group
    - applies the database migrations
    - prints the SQL to create the Function App's Postgres role

  Safe to re-run: the Bicep deployment is incremental and the migrations are
  written to be idempotent.

.EXAMPLE
  .\provision.ps1 -NamePrefix bfsfcuap -PostgresAdminPassword (Read-Host -AsSecureString)
#>

[CmdletBinding()]
param(
  [Parameter(Mandatory)][ValidatePattern('^[a-z0-9]{3,11}$')]
  [string] $NamePrefix,

  [string] $ResourceGroup = "$NamePrefix-rg",
  [string] $Location = 'eastus',

  [Parameter(Mandatory)]
  [securestring] $PostgresAdminPassword,

  # Defaults match the app registrations already in use.
  [string] $EntraTenantId    = 'ada79fc3-524b-4499-b38d-a5fb2ada3a2e',
  [string] $EntraApiClientId = '102be26f-eb18-45e7-9647-234befd298d1',

  # Existing multi-service AI Services resource (Document Intelligence + OpenAI).
  [string] $AiEndpoint          = 'https://peapod-test-resource.services.ai.azure.com',
  [Parameter(Mandatory)][string] $AiResourceId,

  [switch] $SkipMigrations
)

$ErrorActionPreference = 'Stop'

function Write-Step($msg) { Write-Host "`n=== $msg ===" -ForegroundColor Cyan }

# --- Preflight ---------------------------------------------------------------
Write-Step 'Preflight'

foreach ($tool in @('az', 'psql', 'func')) {
  if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) {
    throw "$tool is not on PATH. Install it before running this script."
  }
}

$account = az account show 2>$null | ConvertFrom-Json
if (-not $account) { throw 'Not signed in. Run: az login' }
Write-Host "  subscription : $($account.name)"
Write-Host "  signed in as : $($account.user.name)"

# The Postgres Entra administrator is set to whoever runs this, so that the
# same person can create the Function App's database role afterwards.
$signedInId = az ad signed-in-user show --query id -o tsv
$signedInUpn = az ad signed-in-user show --query userPrincipalName -o tsv

# --- Resource group ----------------------------------------------------------
Write-Step "Resource group $ResourceGroup"
az group create --name $ResourceGroup --location $Location --output none
Write-Host '  ready'

# --- Bicep -------------------------------------------------------------------
Write-Step 'Deploying infrastructure'

$plainPassword = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto(
  [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($PostgresAdminPassword)
)

$deployment = az deployment group create `
  --resource-group $ResourceGroup `
  --template-file "$PSScriptRoot\main.bicep" `
  --parameters `
    namePrefix=$NamePrefix `
    location=$Location `
    entraTenantId=$EntraTenantId `
    entraApiClientId=$EntraApiClientId `
    aiEndpoint=$AiEndpoint `
    postgresAdminPassword=$plainPassword `
    postgresEntraAdminObjectId=$signedInId `
    postgresEntraAdminName=$signedInUpn `
  --query properties.outputs -o json | ConvertFrom-Json

if (-not $deployment) { throw 'Deployment produced no outputs.' }

$functionAppName = $deployment.functionAppName.value
$functionPrincipalId = $deployment.functionAppPrincipalId.value
$swaName = $deployment.staticWebAppName.value
$swaHostname = $deployment.staticWebAppHostname.value
$pgHost = $deployment.postgresHost.value
$pgDatabase = $deployment.postgresDatabase.value

Write-Host "  function app : $functionAppName"
Write-Host "  static web   : https://$swaHostname"
Write-Host "  postgres     : $pgHost"

# --- AI role assignment ------------------------------------------------------
# Cross-resource-group, so it cannot live in the template.
Write-Step 'Granting the Function App access to Document Intelligence and Azure OpenAI'

az role assignment create `
  --assignee-object-id $functionPrincipalId `
  --assignee-principal-type ServicePrincipal `
  --role 'Cognitive Services User' `
  --scope $AiResourceId `
  --output none 2>$null

if ($?) { Write-Host '  granted' } else { Write-Host '  already present' }

# --- Firewall for this machine ----------------------------------------------
# Needed so psql can reach Postgres to apply migrations.
Write-Step 'Allowing this machine through the Postgres firewall'
$myIp = (Invoke-RestMethod -Uri 'https://api.ipify.org?format=json').ip
az postgres flexible-server firewall-rule create `
  --resource-group $ResourceGroup `
  --name "$NamePrefix-pg" `
  --rule-name 'provisioning-client' `
  --start-ip-address $myIp --end-ip-address $myIp `
  --output none 2>$null
Write-Host "  allowed $myIp"

# --- Migrations --------------------------------------------------------------
if (-not $SkipMigrations) {
  Write-Step 'Applying database migrations'

  $env:PGHOST = $pgHost
  $env:PGUSER = 'pgadmin'
  $env:PGPASSWORD = $plainPassword
  $env:PGDATABASE = $pgDatabase
  $env:PGSSLMODE = 'require'

  Get-ChildItem "$PSScriptRoot\..\db\migrations\*.sql" | Sort-Object Name | ForEach-Object {
    Write-Host "  applying $($_.Name)"
    psql -v ON_ERROR_STOP=1 -q -f $_.FullName
    if ($LASTEXITCODE -ne 0) { throw "Migration failed: $($_.Name)" }
  }

  Write-Host '  all migrations applied'
}

# --- Deploy the API ----------------------------------------------------------
Write-Step 'Deploying the Function App'
Push-Location "$PSScriptRoot\..\api"
try {
  npm ci
  npm run build
  func azure functionapp publish $functionAppName --javascript
} finally {
  Pop-Location
}

# --- Remaining manual steps --------------------------------------------------
Write-Step 'Remaining manual steps'

Write-Host @"
1. Create the Function App's Postgres role. Managed Identity authentication
   needs a database role matching the identity's name; this is a SQL GRANT and
   cannot be expressed in Bicep. Connect as the Entra administrator (you) with:

     psql "host=$pgHost user=$signedInUpn dbname=$pgDatabase sslmode=require"

   then run:

     SELECT * FROM pgaadauth_create_principal('$functionAppName', false, false);
     GRANT ALL PRIVILEGES ON DATABASE $pgDatabase TO "$functionAppName";
     GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO "$functionAppName";
     GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO "$functionAppName";
     ALTER DEFAULT PRIVILEGES IN SCHEMA public
       GRANT ALL ON TABLES TO "$functionAppName";

2. Add the Static Web App to the SPA app registration's redirect URIs:

     https://$swaHostname

   Sign-in fails without this. It must be under the Single-page application
   platform, not Web.

3. Insert the first application user. There is deliberately no signup:

     INSERT INTO users (entra_oid, email, full_name, role)
     VALUES ('<your-entra-object-id>', '<you@sstech.us>', '<Your Name>', 'pp-admin');

4. Build and deploy the frontend. VITE_* values are inlined at build time, so
   they must be present in the build environment, not in app settings:

     cd ..\web
     `$env:VITE_ENTRA_TENANT_ID = '$EntraTenantId'
     `$env:VITE_ENTRA_CLIENT_ID = '<SPA app registration client id>'
     `$env:VITE_API_SCOPE       = 'api://$EntraApiClientId/access_as_user'
     `$env:VITE_API_BASE_URL    = 'https://$($functionAppName).azurewebsites.net/api'
     npm ci; npm run build
     swa deploy .\dist --deployment-token (az staticwebapp secrets list --name $swaName --query properties.apiKey -o tsv)

"@ -ForegroundColor Yellow

Write-Step 'Done'
