// Infrastructure for the BFSFCU AP application.
//
// Deployed at resource-group scope:
//
//   Storage account       blob container "invoices", queue "invoice-jobs"
//   PostgreSQL Flexible   application database, Entra auth enabled
//   Function App          API + queue worker, system-assigned identity
//   Static Web App        frontend
//   Application Insights  Function App telemetry
//
// Two things this template deliberately does NOT do, because they cannot be
// expressed in Bicep or belong to resources outside this resource group:
//
//   1. Grant the Function App's identity access to Document Intelligence and
//      Azure OpenAI. Those live in another resource group, so provision.ps1
//      creates that role assignment.
//   2. Create the in-database Postgres role for the Function App's identity.
//      That is a SQL GRANT; provision.ps1 prints the statement to run.

targetScope = 'resourceGroup'

@description('Short name used to derive resource names. Lowercase letters and digits.')
@minLength(3)
@maxLength(11)
param namePrefix string

@description('Region for all resources.')
param location string = resourceGroup().location

@description('Entra directory (tenant) id.')
param entraTenantId string

@description('Client id of the API app registration.')
param entraApiClientId string

@description('Document Intelligence / Azure OpenAI endpoint (multi-service AI Services resource).')
param aiEndpoint string

@description('Azure OpenAI deployment name.')
param openAiDeployment string = 'gpt-5.1'

@description('Azure OpenAI API version.')
param openAiApiVersion string = '2025-01-01-preview'

@description('True when the deployment is a reasoning model (gpt-5.x, o-series).')
param openAiReasoningModel bool = true

@description('''
API key for the AI Services resource. Leave empty to use Managed Identity,
which requires a Cognitive Services User role assignment on that resource —
and creating one requires Owner or User Access Administrator. Supply a key when
you only have Contributor.
''')
@secure()
param aiKey string = ''

@description('Postgres administrator login. Used to apply migrations; not used by the app at runtime.')
param postgresAdminUser string = 'pgadmin'

@description('Postgres administrator password.')
@secure()
param postgresAdminPassword string

@description('Entra object id of the person or group to make Postgres Entra administrator.')
param postgresEntraAdminObjectId string

@description('Display name (UPN) of the Postgres Entra administrator.')
param postgresEntraAdminName string

// Storage account names cap at 24 characters. uniqueString() returns 13, plus
// "st", so the prefix is truncated to 9 to stay inside the limit.
var storageName = toLower('${take(namePrefix, 9)}st${uniqueString(resourceGroup().id)}')
var functionAppName = '${namePrefix}-api'
var planName = '${namePrefix}-plan'
var postgresName = '${namePrefix}-pg'
var swaName = '${namePrefix}-web'
var insightsName = '${namePrefix}-ai'
var workspaceName = '${namePrefix}-logs'
var databaseName = 'bfsfcu_ap'

// ---------------------------------------------------------------------------
// Storage — invoice documents and the processing queue
// ---------------------------------------------------------------------------
resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: storageName
  location: location
  sku: { name: 'Standard_LRS' }
  kind: 'StorageV2'
  properties: {
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
    allowBlobPublicAccess: false // invoice documents are never publicly readable
  }
}

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  parent: storage
  name: 'default'
}

// The app calls createIfNotExists() at runtime, but declaring them keeps the
// infrastructure self-describing.
resource invoicesContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobService
  name: 'invoices'
  properties: { publicAccess: 'None' }
}

resource queueService 'Microsoft.Storage/storageAccounts/queueServices@2023-05-01' = {
  parent: storage
  name: 'default'
}

resource invoiceQueue 'Microsoft.Storage/storageAccounts/queueServices/queues@2023-05-01' = {
  parent: queueService
  name: 'invoice-jobs'
}

// Flex Consumption stores the deployment package in a blob container rather
// than mounting a file share.
resource deploymentContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobService
  name: 'deploymentpackage'
  properties: { publicAccess: 'None' }
}

// ---------------------------------------------------------------------------
// Observability
// ---------------------------------------------------------------------------
resource workspace 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: workspaceName
  location: location
  properties: {
    sku: { name: 'PerGB2018' }
    retentionInDays: 30
  }
}

resource insights 'Microsoft.Insights/components@2020-02-02' = {
  name: insightsName
  location: location
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: workspace.id
  }
}

// ---------------------------------------------------------------------------
// PostgreSQL
// ---------------------------------------------------------------------------
resource postgres 'Microsoft.DBforPostgreSQL/flexibleServers@2023-12-01-preview' = {
  name: postgresName
  location: location
  sku: {
    name: 'Standard_B1ms' // burstable — sized for testing, not production
    tier: 'Burstable'
  }
  properties: {
    version: '16'
    administratorLogin: postgresAdminUser
    administratorLoginPassword: postgresAdminPassword
    storage: { storageSizeGB: 32 }
    backup: {
      backupRetentionDays: 7
      geoRedundantBackup: 'Disabled'
    }
    highAvailability: { mode: 'Disabled' }
    authConfig: {
      // Both: Entra for the app's Managed Identity, password for applying
      // migrations with psql.
      activeDirectoryAuth: 'Enabled'
      passwordAuth: 'Enabled'
      tenantId: entraTenantId
    }
  }
}

resource database 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2023-12-01-preview' = {
  parent: postgres
  name: databaseName
  properties: {
    charset: 'UTF8'
    collation: 'en_US.utf8'
  }
}

// Allows Azure-hosted services (the Function App) to connect. Tighten to a
// VNet or Private Endpoint before this carries production data.
resource allowAzure 'Microsoft.DBforPostgreSQL/flexibleServers/firewallRules@2023-12-01-preview' = {
  parent: postgres
  name: 'AllowAllAzureServices'
  properties: {
    startIpAddress: '0.0.0.0'
    endIpAddress: '0.0.0.0'
  }
}

// Azure Postgres refuses CREATE EXTENSION unless the extension is allow-listed
// here; the parameter defaults to empty. Migration 0001 needs pgcrypto for
// gen_random_uuid() and pg_trgm for vendor similarity matching.
resource extensionsAllowList 'Microsoft.DBforPostgreSQL/flexibleServers/configurations@2023-12-01-preview' = {
  parent: postgres
  name: 'azure.extensions'
  properties: {
    value: 'PGCRYPTO,PG_TRGM'
    source: 'user-override'
  }
  dependsOn: [ database ]
}

resource postgresEntraAdmin 'Microsoft.DBforPostgreSQL/flexibleServers/administrators@2023-12-01-preview' = {
  parent: postgres
  name: postgresEntraAdminObjectId
  properties: {
    principalName: postgresEntraAdminName
    principalType: 'User'
    tenantId: entraTenantId
  }
  // Must follow the configuration change, not run alongside it. Setting
  // azure.extensions briefly puts the server into an updating state, and an
  // Entra principal operation attempted during it fails with
  // AadAuthOperationCannotBePerformedWhenServerIsNotAccessible.
  dependsOn: [ database, extensionsAllowList ]
}

// ---------------------------------------------------------------------------
// Function App — HTTP API and the queue-triggered worker
// ---------------------------------------------------------------------------
// Flex Consumption, not the classic Y1 Dynamic plan.
//
// This subscription reports zero App Service plan quota for Y1 and B1 in both
// eastus and eastus2 — every classic SKU fails preflight with
// SubscriptionIsOverQuotaForSku. FC1 validates, and is in any case the current
// recommended hosting for Functions: faster cold starts and explicit
// per-instance concurrency.
resource plan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: planName
  location: location
  kind: 'functionapp'
  sku: {
    name: 'FC1'
    tier: 'FlexConsumption'
  }
  properties: { reserved: true } // Linux
}

resource functionApp 'Microsoft.Web/sites@2023-12-01' = {
  name: functionAppName
  location: location
  kind: 'functionapp,linux'
  identity: { type: 'SystemAssigned' }
  properties: {
    serverFarmId: plan.id
    httpsOnly: true
    // Flex Consumption declares runtime, scaling and deployment here rather
    // than through linuxFxVersion and FUNCTIONS_* app settings.
    functionAppConfig: {
      deployment: {
        storage: {
          type: 'blobContainer'
          value: '${storage.properties.primaryEndpoints.blob}deploymentpackage'
          authentication: {
            type: 'StorageAccountConnectionString'
            storageAccountConnectionStringName: 'DEPLOYMENT_STORAGE_CONNECTION_STRING'
          }
        }
      }
      scaleAndConcurrency: {
        maximumInstanceCount: 40
        instanceMemoryMB: 2048
      }
      runtime: {
        name: 'node'
        version: '20'
      }
    }
    siteConfig: {
      ftpsState: 'Disabled'
      minTlsVersion: '1.2'
      cors: {
        allowedOrigins: [ 'https://${swa.properties.defaultHostname}' ]
        supportCredentials: false
      }
      appSettings: concat([
        { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', value: insights.properties.ConnectionString }
        {
          name: 'DEPLOYMENT_STORAGE_CONNECTION_STRING'
          value: 'DefaultEndpointsProtocol=https;AccountName=${storage.name};AccountKey=${storage.listKeys().keys[0].value};EndpointSuffix=${environment().suffixes.storage}'
        }

        // The Functions runtime's own storage. Uses a key; the application's
        // own blob/queue access below goes through Managed Identity.
        {
          name: 'AzureWebJobsStorage'
          value: 'DefaultEndpointsProtocol=https;AccountName=${storage.name};AccountKey=${storage.listKeys().keys[0].value};EndpointSuffix=${environment().suffixes.storage}'
        }

        { name: 'ENTRA_TENANT_ID', value: entraTenantId }
        { name: 'ENTRA_CLIENT_ID', value: entraApiClientId }
        // v2.0 tokens carry the bare client id in aud, not the api:// URI.
        { name: 'ENTRA_AUDIENCE', value: entraApiClientId }

        { name: 'PG_HOST', value: postgres.properties.fullyQualifiedDomainName }
        { name: 'PG_PORT', value: '5432' }
        { name: 'PG_DATABASE', value: databaseName }
        // With Managed Identity the user is the identity's name, and the
        // password is an Entra token fetched at connection time.
        { name: 'PG_USER', value: functionAppName }
        { name: 'PG_SSL', value: 'true' }
        { name: 'PG_USE_MANAGED_IDENTITY', value: 'true' }

        { name: 'BLOB_ACCOUNT_URL', value: storage.properties.primaryEndpoints.blob }
        { name: 'BLOB_CONTAINER', value: 'invoices' }
        { name: 'QUEUE_ACCOUNT_URL', value: storage.properties.primaryEndpoints.queue }
        { name: 'QUEUE_NAME', value: 'invoice-jobs' }

        // credential.ts uses Managed Identity when no key is set. Both keys are
        // the same value — one multi-service AI Services resource.
        { name: 'DOCINTEL_ENDPOINT', value: aiEndpoint }
        { name: 'AOAI_ENDPOINT', value: aiEndpoint }
        { name: 'AOAI_DEPLOYMENT', value: openAiDeployment }
        { name: 'AOAI_API_VERSION', value: openAiApiVersion }
        { name: 'AOAI_REASONING_MODEL', value: string(openAiReasoningModel) }

        { name: 'ALLOWED_ORIGINS', value: 'https://${swa.properties.defaultHostname}' }
        { name: 'LOG_LEVEL', value: 'info' }
      ], empty(aiKey) ? [] : [
        { name: 'DOCINTEL_KEY', value: aiKey }
        { name: 'AOAI_KEY', value: aiKey }
      ])
    }
  }
}

// ---------------------------------------------------------------------------
// Static Web App — frontend
// ---------------------------------------------------------------------------
resource swa 'Microsoft.Web/staticSites@2023-12-01' = {
  name: swaName
  location: location
  sku: {
    name: 'Standard' // Standard is required to link a separate Function App backend
    tier: 'Standard'
  }
  properties: {
    stagingEnvironmentPolicy: 'Enabled'
    allowConfigFileUpdates: true
  }
}

// ---------------------------------------------------------------------------
// No storage role assignments.
//
// blob.ts and queue.ts both prefer the AzureWebJobsStorage connection string
// over DefaultAzureCredential, and that setting is a full connection string
// above. Managed Identity role assignments for Storage would therefore never
// be exercised — and creating them requires Owner or User Access
// Administrator, which a Contributor does not have.
//
// To move Storage onto Managed Identity, set AzureWebJobsStorage to the
// identity-based form (AzureWebJobsStorage__accountName) and grant Storage
// Blob Data Contributor and Storage Queue Data Contributor separately.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Outputs — consumed by provision.ps1
// ---------------------------------------------------------------------------
output functionAppName string = functionApp.name
output functionAppHostname string = functionApp.properties.defaultHostName
output functionAppPrincipalId string = functionApp.identity.principalId
output staticWebAppName string = swa.name
output staticWebAppHostname string = swa.properties.defaultHostname
output postgresHost string = postgres.properties.fullyQualifiedDomainName
output postgresDatabase string = databaseName
output storageAccountName string = storage.name
