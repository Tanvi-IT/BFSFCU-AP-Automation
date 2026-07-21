/**
 * Storage Queue — invoice processing jobs.
 *
 * The queue is what lets an upload return in ~1 second while the 20-second AI
 * pipeline runs in the background. It also gives us automatic retry and, after
 * `maxDequeueCount` (5, set in host.json), a poison queue.
 *
 * The poison queue is the "needs a human" list. Monitor it — an unwatched
 * poison queue is silent data loss with extra steps.
 */

import { QueueServiceClient, QueueClient } from '@azure/storage-queue';
import { DefaultAzureCredential } from '@azure/identity';
import { config } from './config';

/** Message placed on the queue for each invoice awaiting processing. */
export interface InvoiceJob {
  invoiceId: string;
  blobPath: string;
  fileHash: string;
  source: 'manual_upload' | 'email_ingest' | 'api_ingest';
  /** Incremented by the worker when it re-queues deliberately. */
  attempt?: number;
}

let queueClient: QueueClient | undefined;

function connectionString(): string | undefined {
  const cs = process.env['AzureWebJobsStorage'];
  return cs && cs.includes('=') ? cs : undefined;
}

async function getQueue(): Promise<QueueClient> {
  if (queueClient) return queueClient;

  const cs = connectionString();
  const service = cs
    ? QueueServiceClient.fromConnectionString(cs)
    : new QueueServiceClient(config.storage.queueAccountUrl, new DefaultAzureCredential());

  const client = service.getQueueClient(config.storage.queueName);
  await client.createIfNotExists();

  queueClient = client;
  return client;
}

/**
 * Queue an invoice for processing.
 *
 * The Functions queue trigger expects base64 for JSON payloads, which is the
 * default encoding used by the host.
 */
export async function enqueueInvoiceJob(job: InvoiceJob): Promise<void> {
  const queue = await getQueue();
  const payload = Buffer.from(JSON.stringify(job)).toString('base64');
  await queue.sendMessage(payload);
}

/** Parse a queue message body into a job, whether or not it arrives base64. */
export function parseInvoiceJob(raw: unknown): InvoiceJob {
  if (typeof raw === 'object' && raw !== null) {
    return raw as InvoiceJob;
  }

  if (typeof raw === 'string') {
    // The host usually decodes base64 for us; handle the raw case defensively.
    try {
      return JSON.parse(raw) as InvoiceJob;
    } catch {
      return JSON.parse(Buffer.from(raw, 'base64').toString('utf8')) as InvoiceJob;
    }
  }

  throw new Error('Unrecognised queue message payload');
}
