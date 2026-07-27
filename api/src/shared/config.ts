/**
 * Central configuration. Every setting is read here and nowhere else.
 *
 * Secrets are NOT stored in code or in the database. Managed Identity covers
 * Postgres, Blob, Queue, Document Intelligence and Azure OpenAI; Key Vault
 * references (via App Settings) cover third-party credentials.
 */

function required(name: string): string {
  const v = process.env[name];
  if (!v || v.trim() === '') {
    throw new Error(`Missing required setting: ${name}`);
  }
  return v;
}

function optional(name: string, fallback: string): string {
  const v = process.env[name];
  return v && v.trim() !== '' ? v : fallback;
}

function bool(name: string, fallback: boolean): boolean {
  const v = process.env[name];
  if (v === undefined || v.trim() === '') return fallback;
  return v.toLowerCase() === 'true' || v === '1';
}

function int(name: string, fallback: number): number {
  const v = process.env[name];
  if (!v) return fallback;
  const n = Number.parseInt(v, 10);
  return Number.isNaN(n) ? fallback : n;
}

export const config = {
  auth: {
    /**
     * Secret used to sign and verify session tokens (HS256).
     *
     * Must be a strong random value, set only on the server (never shipped to
     * the browser), and rotated by changing this setting. In production put it
     * in Key Vault. Local development uses a fixed development value if unset.
     */
    get sessionSecret() {
      return optional('SESSION_SECRET', 'dev-only-insecure-session-secret-change-me');
    },
    /** Session lifetime. Accepts values like '8h', '12h', '7d'. */
    get sessionTtl() {
      return optional('SESSION_TTL', '12h');
    },
    /**
     * Whether the session cookie is marked Secure. True in Azure (HTTPS);
     * false locally over plain HTTP so the cookie is accepted.
     */
    get cookieSecure() {
      return !bool('AUTH_COOKIE_INSECURE', false);
    },
  },

  db: {
    get host() {
      return required('PG_HOST');
    },
    get port() {
      return int('PG_PORT', 5432);
    },
    get database() {
      return required('PG_DATABASE');
    },
    get user() {
      return required('PG_USER');
    },
    /** Only used for local development; production uses Managed Identity. */
    get password() {
      return process.env['PG_PASSWORD'] ?? '';
    },
    get ssl() {
      return bool('PG_SSL', true);
    },
    get useManagedIdentity() {
      return bool('PG_USE_MANAGED_IDENTITY', true);
    },
    get maxConnections() {
      return int('PG_MAX_CONNECTIONS', 5);
    },
  },

  storage: {
    get blobAccountUrl() {
      return required('BLOB_ACCOUNT_URL');
    },
    get blobContainer() {
      return optional('BLOB_CONTAINER', 'invoices');
    },
    get queueAccountUrl() {
      return required('QUEUE_ACCOUNT_URL');
    },
    get queueName() {
      return optional('QUEUE_NAME', 'invoice-jobs');
    },
  },

  ai: {
    get docIntelEndpoint() {
      return required('DOCINTEL_ENDPOINT');
    },
    get docIntelApiVersion() {
      return optional('DOCINTEL_API_VERSION', '2024-11-30');
    },
    /**
     * Optional API key for Document Intelligence.
     *
     * Managed Identity is the production path and needs no key. A key is
     * supported for local development, where setting up RBAC on the AI
     * resource is more friction than it is worth. Keep keys in
     * local.settings.json (gitignored) or Key Vault — never in the database.
     */
    get docIntelKey() {
      return process.env['DOCINTEL_KEY'] ?? '';
    },
    get openAiEndpoint() {
      return required('AOAI_ENDPOINT');
    },
    get openAiDeployment() {
      return optional('AOAI_DEPLOYMENT', 'gpt-4o');
    },
    get openAiApiVersion() {
      return optional('AOAI_API_VERSION', '2024-08-01-preview');
    },
    /** Optional API key for Azure OpenAI. See docIntelKey. */
    get openAiKey() {
      return process.env['AOAI_KEY'] ?? '';
    },
    /**
     * Whether the deployment is a reasoning model (gpt-5.x, o-series).
     *
     * Reasoning models reject `max_tokens` — they require
     * `max_completion_tokens` — and accept only the default `temperature`.
     * Set false for gpt-4o-style deployments, which take both.
     */
    get openAiReasoningModel() {
      return bool('AOAI_REASONING_MODEL', true);
    },
  },

  http: {
    get allowedOrigins() {
      return optional('ALLOWED_ORIGINS', '')
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean);
    },
  },

  /**
   * Machine-to-machine ingestion (e.g. a Power Automate flow that forwards
   * emailed invoices). A caller presenting `X-Api-Key: <apiKey>` is
   * authenticated as the service user `userId` — no login round-trip. Both must
   * be set for the key path to work; leaving `apiKey` empty disables it.
   *
   * Keep the key in Key Vault (or local.settings.json locally), never in the
   * database or the repo. Rotate by changing this value; it is independent of
   * SESSION_SECRET, so rotating it does not sign anyone out.
   */
  ingest: {
    get apiKey() {
      return process.env['INGEST_API_KEY'] ?? '';
    },
    /** users.id of the service account that API-key requests act as. */
    get userId() {
      return process.env['INGEST_USER_ID'] ?? '';
    },
  },

  /**
   * Demo mode. When enabled, the demo-reset endpoint is available so a
   * presenter can wipe transactional data between demos. MUST be left unset
   * (false) in production — the reset endpoint 404s when this is off.
   */
  demo: {
    get enabled() {
      return bool('DEMO_MODE', false);
    },
  },

  logLevel: optional('LOG_LEVEL', 'info'),
  isLocal: process.env['AZURE_FUNCTIONS_ENVIRONMENT'] === 'Development',
} as const;
