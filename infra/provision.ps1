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

  # eastus2 co-locates with peapod-test-resource, the AI Services resource this
  # app calls for every invoice. Extraction is already the slowest step in the
  # pipeline (~4.6s); a cross-region hop adds to it needlessly.
  [string] $Location = 'eastus2',

  [Parameter(Mandatory)]
  [securestring] $PostgresAdminPassword,

  # Defaults match the app registrations already in use.
  [string] $EntraTenantId    = 'ada79fc3-524b-4499-b38d-a5fb2ada3a2e',
  [string] $EntraApiClientId = '102be26f-eb18-45e7-9647-234befd298d1',

  # Existing multi-service AI Services resource (Document Intelligence + OpenAI)
  # in rg-peapod-test. Note there are also separate di-peapod-test and
  # oai-peapod-test resources in eastus; this app uses the multi-service one.
  [string] $AiEndpoint = 'https://peapod-test-resource.services.ai.azure.com',
  [string] $AiResourceGroup = 'rg-peapod-test',
  [string] $AiResourceName = 'peapod-test-resource',

  # Supply only if the script cannot read the key itself and Managed Identity
  # is unavailable. Left empty, the script decides automatically.
  [string] $AiKey = '',

  # Entra administrator for the Postgres server — the principal allowed to
  # create the Function App's database role afterwards.
  #
  # Looked up from Microsoft Graph when not supplied, but `az login` only
  # obtains an ARM token by default, so that lookup fails with
  # InteractionRequired in most tenants. Supplying them skips Graph entirely.
  [string] $PostgresEntraAdminObjectId = '',
  [string] $PostgresEntraAdminUpn = '',

  [switch] $SkipMigrations
)

$ErrorActionPreference = 'Stop'

function Write-Step($msg) { Write-Host "`n=== $msg ===" -ForegroundColor Cyan }

# --- Preflight ---------------------------------------------------------------
Write-Step 'Preflight'

# These installers commonly do not add themselves to PATH, so look in the
# standard locations before giving up. Only affects this session.
$candidatePaths = @(
  (Get-ChildItem 'C:\Program Files\PostgreSQL\*\bin' -Directory -ErrorAction SilentlyContinue |
     Sort-Object Name -Descending | Select-Object -First 1 -ExpandProperty FullName),
  'C:\Program Files\Microsoft SDKs\Azure\CLI2\wbin',
  "$env:APPDATA\npm",
  "$env:ProgramFiles\nodejs"
) | Where-Object { $_ -and (Test-Path $_) }

foreach ($p in $candidatePaths) {
  if ($env:Path -notlike "*$p*") { $env:Path = "$p;$env:Path" }
}

foreach ($tool in @('az', 'psql', 'func', 'npm')) {
  $cmd = Get-Command $tool -ErrorAction SilentlyContinue
  if (-not $cmd) {
    throw @"
$tool was not found, on PATH or in the usual install locations.

  az    -> winget install Microsoft.AzureCLI
  psql  -> part of the PostgreSQL install (C:\Program Files\PostgreSQL\<v>\bin)
  func  -> npm i -g azure-functions-core-tools@4 --unsafe-perm true
  npm   -> part of Node 20+

If it is installed somewhere unusual, add its folder to PATH and re-run.
"@
  }
  Write-Host ("  {0,-5} {1}" -f $tool, $cmd.Source)
}

$account = az account show 2>$null | ConvertFrom-Json
if (-not $account) { throw 'Not signed in. Run: az login' }
Write-Host "  subscription : $($account.name)"
Write-Host "  signed in as : $($account.user.name)"

# The Postgres Entra administrator. Prefer the supplied values; fall back to
# Graph only if they were omitted.
$signedInId = $PostgresEntraAdminObjectId
$signedInUpn = $PostgresEntraAdminUpn

if (-not $signedInId -or -not $signedInUpn) {
  Write-Host '  looking up the signed-in user in Microsoft Graph...'
  $graphId = az ad signed-in-user show --query id -o tsv 2>$null
  $graphUpn = az ad signed-in-user show --query userPrincipalName -o tsv 2>$null

  if ($LASTEXITCODE -eq 0 -and $graphId -and $graphId -notmatch '^ERROR') {
    if (-not $signedInId) { $signedInId = $graphId.Trim() }
    if (-not $signedInUpn) { $signedInUpn = $graphUpn.Trim() }
  }
}

# Fail here rather than passing an empty value to Bicep, where it produces an
# opaque "invalid name ... 1 name segment(s) ... 2 expected" template error.
if (-not $signedInId -or -not $signedInUpn) {
  throw @"
Could not determine the Postgres Entra administrator.

`az login` obtains an ARM token but not a Microsoft Graph token, so
`az ad signed-in-user show` fails with InteractionRequired. Either grant Graph
access:

    az login --scope https://graph.microsoft.com//.default

or pass the values directly (find the object id in Entra > Users > your account):

    -PostgresEntraAdminObjectId '<your-entra-object-id>' ``
    -PostgresEntraAdminUpn      '<you@sstech.us>'
"@
}

Write-Host "  postgres entra admin : $signedInUpn ($signedInId)"

# --- Resource group ----------------------------------------------------------
Write-Step "Resource group $ResourceGroup"
az group create --name $ResourceGroup --location $Location --output none
Write-Host '  ready'

# --- AI access: Managed Identity if permitted, otherwise a key ---------------
# Granting Cognitive Services User needs Owner or User Access Administrator.
# A Contributor cannot do it, so fall back to the resource's key. Decided
# before the deployment because the key is a template parameter.
Write-Step 'Choosing how the Function App will authenticate to the AI services'

$AiResourceId = "/subscriptions/$($account.id)/resourceGroups/$AiResourceGroup" +
                "/providers/Microsoft.CognitiveServices/accounts/$AiResourceName"

$aiKey = $AiKey
$canAssignRoles = $false

if (-not $aiKey) {
  $probe = az role assignment list --scope $AiResourceId --query "[0].id" -o tsv 2>&1
  if ($LASTEXITCODE -eq 0 -and $probe -notmatch 'ERROR') { $canAssignRoles = $true }
}

if ($canAssignRoles) {
  Write-Host '  Managed Identity (role assignment will be created after deployment)'
} else {
  Write-Host '  cannot read or write role assignments — falling back to an API key'
  # Note: this command takes -g/-n, not --ids.
  $aiKey = az cognitiveservices account keys list `
    -g $AiResourceGroup -n $AiResourceName --query key1 -o tsv 2>$null
  if (-not $aiKey -or $aiKey -match 'ERROR') {
    throw @"
Could not read the AI resource's key, and Managed Identity is not available
without permission to create role assignments.

Either ask an Owner / User Access Administrator to grant the Function App's
identity "Cognitive Services User" on:

  $AiResourceId

or supply the key yourself with -AiKey.
"@
  }
  Write-Host '  key retrieved (stored as a Function App setting, not in the repo)'
}

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
    aiKey=$aiKey `
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
if ($canAssignRoles) {
  Write-Step 'Granting the Function App access to Document Intelligence and Azure OpenAI'
  az role assignment create `
    --assignee-object-id $functionPrincipalId `
    --assignee-principal-type ServicePrincipal `
    --role 'Cognitive Services User' `
    --scope $AiResourceId `
    --output none 2>$null
  if ($?) { Write-Host '  granted' } else { Write-Host '  already present' }
} else {
  Write-Step 'AI access'
  Write-Host '  using an API key; no role assignment needed' -ForegroundColor Yellow
}

# --- Firewall for this machine ----------------------------------------------
# Needed so psql can reach Postgres to apply migrations.
Write-Step 'Allowing this machine through the Postgres firewall'
$myIp = (Invoke-RestMethod -Uri 'https://api.ipify.org?format=json').ip
# Argument names differ from most az commands: --server-name is the server and
# --name is the firewall rule. There is no --rule-name.
az postgres flexible-server firewall-rule create `
  --resource-group $ResourceGroup `
  --server-name "$NamePrefix-pg" `
  --name 'provisioning-client' `
  --start-ip-address $myIp --end-ip-address $myIp `
  --output none 2>$null

if ($LASTEXITCODE -eq 0) {
  Write-Host "  allowed $myIp"
} else {
  Write-Host "  could not add the firewall rule for $myIp" -ForegroundColor Yellow
  Write-Host '  migrations will fail unless this machine can reach the server' -ForegroundColor Yellow
}

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
