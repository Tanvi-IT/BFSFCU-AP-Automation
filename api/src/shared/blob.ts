/**
 * Blob Storage — invoice documents.
 *
 * Production uses Managed Identity. Local development falls back to the
 * Azurite connection string in AzureWebJobsStorage.
 *
 * Files are private; the browser never gets a container URL. When a user needs
 * to view a document the API issues a short-lived SAS URL.
 */

import {
  BlobServiceClient,
  StorageSharedKeyCredential,
  generateBlobSASQueryParameters,
  BlobSASPermissions,
  SASProtocol,
} from '@azure/storage-blob';
import { DefaultAzureCredential } from '@azure/identity';
import { config } from './config';
import { AppError } from './errors';

let serviceClient: BlobServiceClient | undefined;

function connectionString(): string | undefined {
  const cs = process.env['AzureWebJobsStorage'];
  // A bare "UseDevelopmentStorage=true" or a full connection string.
  return cs && cs.includes('=') ? cs : undefined;
}

function getServiceClient(): BlobServiceClient {
  if (serviceClient) return serviceClient;

  const cs = connectionString();
  serviceClient = cs
    ? BlobServiceClient.fromConnectionString(cs)
    : new BlobServiceClient(config.storage.blobAccountUrl, new DefaultAzureCredential());

  return serviceClient;
}

async function getContainer() {
  const container = getServiceClient().getContainerClient(config.storage.blobContainer);
  // Safe to call repeatedly; no-op when it already exists.
  await container.createIfNotExists();
  return container;
}

/** Storage path for a new document: invoices/YYYY/MM/<uuid>.<ext> */
export function buildBlobPath(originalFilename: string, id: string): string {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const ext = originalFilename.split('.').pop()?.toLowerCase() ?? 'pdf';
  const safeExt = /^[a-z0-9]{1,5}$/.test(ext) ? ext : 'pdf';
  return `${year}/${month}/${id}.${safeExt}`;
}

export async function uploadBlob(
  path: string,
  content: Buffer,
  contentType: string
): Promise<void> {
  const container = await getContainer();
  const blob = container.getBlockBlobClient(path);
  await blob.uploadData(content, {
    blobHTTPHeaders: { blobContentType: contentType },
  });
}

export async function downloadBlob(path: string): Promise<Buffer> {
  const container = await getContainer();
  const blob = container.getBlockBlobClient(path);

  if (!(await blob.exists())) {
    throw AppError.notFound(`Document not found: ${path}`);
  }

  return blob.downloadToBuffer();
}

export async function deleteBlob(path: string): Promise<void> {
  const container = await getContainer();
  await container.getBlockBlobClient(path).deleteIfExists();
}

/**
 * Short-lived read URL for the browser.
 *
 * With Managed Identity there is no account key, so we sign with a user
 * delegation key — which is itself time-limited and tied to the identity.
 */
export async function getReadUrl(path: string, minutes = 15): Promise<string> {
  const container = await getContainer();
  const blob = container.getBlockBlobClient(path);

  if (!(await blob.exists())) {
    throw AppError.notFound(`Document not found: ${path}`);
  }

  const startsOn = new Date(Date.now() - 60_000); // small clock-skew allowance
  const expiresOn = new Date(Date.now() + minutes * 60_000);
  const service = getServiceClient();

  const credential = (service as unknown as { credential?: unknown }).credential;

  // Local development (Azurite) signs with the shared key.
  if (credential instanceof StorageSharedKeyCredential) {
    const sas = generateBlobSASQueryParameters(
      {
        containerName: config.storage.blobContainer,
        blobName: path,
        permissions: BlobSASPermissions.parse('r'),
        startsOn,
        expiresOn,
        protocol: SASProtocol.HttpsAndHttp,
      },
      credential
    ).toString();
    return `${blob.url}?${sas}`;
  }

  // Production: user delegation SAS via Managed Identity.
  const delegationKey = await service.getUserDelegationKey(startsOn, expiresOn);
  const accountName = service.accountName;
  const sas = generateBlobSASQueryParameters(
    {
      containerName: config.storage.blobContainer,
      blobName: path,
      permissions: BlobSASPermissions.parse('r'),
      startsOn,
      expiresOn,
      protocol: SASProtocol.Https,
    },
    delegationKey,
    accountName
  ).toString();

  return `${blob.url}?${sas}`;
}
