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

@description('Postgres administrator login. Used to apply migrations; not used by the app at runtime.')
param postgresAdminUser string = 'pgadmin'

@description('Postgres administrator password.')
@secure()
param postgresAdminPassword string

@description('Entra object id of the person or group to make Postgres Entra administrator.')
param postgresEntraAdminObjectId string

@description('Display name (UPN) of the Postgres Entra administrator.')
param postgresEntraAdminName string

var storageName = toLower('${namePrefix}st${uniqueString(resourceGroup().id)}')
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

resource postgresEntraAdmin 'Microsoft.DBforPostgreSQL/flexibleServers/administrators@2023-12-01-preview' = {
  parent: postgres
  name: postgresEntraAdminObjectId
  properties: {
    principalName: postgresEntraAdminName
    principalType: 'User'
    tenantId: entraTenantId
  }
  dependsOn: [ database ]
}

// ---------------------------------------------------------------------------
// Function App — HTTP API and the queue-triggered worker
// ---------------------------------------------------------------------------
resource plan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: planName
  location: location
  sku: {
    name: 'Y1' // consumption
    tier: 'Dynamic'
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
    siteConfig: {
      linuxFxVersion: 'Node|20'
      ftpsState: 'Disabled'
      minTlsVersion: '1.2'
      cors: {
        allowedOrigins: [ 'https://${swa.properties.defaultHostname}' ]
        supportCredentials: false
      }
      appSettings: [
        { name: 'FUNCTIONS_EXTENSION_VERSION', value: '~4' }
        { name: 'FUNCTIONS_WORKER_RUNTIME', value: 'node' }
        { name: 'WEBSITE_NODE_DEFAULT_VERSION', value: '~20' }
        { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', value: insights.properties.ConnectionString }

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

        // No DOCINTEL_KEY or AOAI_KEY: with no key set, the code authenticates
        // to both services with Managed Identity.
        { name: 'DOCINTEL_ENDPOINT', value: aiEndpoint }
        { name: 'AOAI_ENDPOINT', value: aiEndpoint }
        { name: 'AOAI_DEPLOYMENT', value: openAiDeployment }
        { name: 'AOAI_API_VERSION', value: openAiApiVersion }
        { name: 'AOAI_REASONING_MODEL', value: string(openAiReasoningModel) }

        { name: 'ALLOWED_ORIGINS', value: 'https://${swa.properties.defaultHostname}' }
        { name: 'LOG_LEVEL', value: 'info' }
      ]
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
// Role assignments — the Function App's identity reaching Storage
// ---------------------------------------------------------------------------
var blobContributorRoleId = 'ba92f5b4-2d11-453d-a403-e96b0029c9fe' // Storage Blob Data Contributor
var queueContributorRoleId = '974c5e8b-45b9-4653-ba55-5f855dd0fb88' // Storage Queue Data Contributor

resource blobRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: storage
  name: guid(storage.id, functionApp.id, blobContributorRoleId)
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', blobContributorRoleId)
    principalId: functionApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

resource queueRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: storage
  name: guid(storage.id, functionApp.id, queueContributorRoleId)
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', queueContributorRoleId)
    principalId: functionApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

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
