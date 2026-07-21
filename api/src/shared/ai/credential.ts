/**
 * Authentication for Azure AI services.
 *
 * Two supported modes:
 *   1. Managed Identity (production) — no key exists at all.
 *   2. API key (local development) — avoids setting up RBAC on the AI resource
 *      just to run the stack on a laptop.
 *
 * Either way the key never touches the database. The old design stored provider
 * keys in plaintext columns misleadingly named `*_key_encrypted`; keys now live
 * only in local.settings.json (gitignored) or Key Vault.
 */

import { DefaultAzureCredential } from '@azure/identity';
import { config } from '../config';

const COGNITIVE_SCOPE = 'https://cognitiveservices.azure.com/.default';

let credential: DefaultAzureCredential | undefined;
let cached: { token: string; expiresOn: number } | undefined;

export async function getCognitiveToken(): Promise<string> {
  const now = Date.now();
  if (cached && cached.expiresOn - 5 * 60_000 > now) {
    return cached.token;
  }

  credential ??= new DefaultAzureCredential();
  const result = await credential.getToken(COGNITIVE_SCOPE);
  if (!result) {
    throw new Error('Failed to acquire a token for Azure AI services');
  }

  cached = { token: result.token, expiresOn: result.expiresOnTimestamp };
  return cached.token;
}

/**
 * Auth headers for Document Intelligence.
 *
 * Uses the API key when one is configured (local development); otherwise
 * Managed Identity, which is the production path.
 */
export async function docIntelAuthHeaders(): Promise<Record<string, string>> {
  const key = config.ai.docIntelKey;
  if (key) return { 'Ocp-Apim-Subscription-Key': key };
  return { Authorization: `Bearer ${await getCognitiveToken()}` };
}

/** Auth headers for Azure OpenAI. Key if configured, else Managed Identity. */
export async function openAiAuthHeaders(): Promise<Record<string, string>> {
  const key = config.ai.openAiKey;
  if (key) return { 'api-key': key };
  return { Authorization: `Bearer ${await getCognitiveToken()}` };
}
