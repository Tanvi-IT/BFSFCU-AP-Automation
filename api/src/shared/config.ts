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
     * Key for encrypting secrets stored in the database at rest — currently the
     * Prologue SQL Server password (see shared/crypto.ts). Falls back to
     * `sessionSecret` so it works without extra configuration; set a dedicated
     * `SETTINGS_ENC_KEY` in production and DO NOT rotate it without re-saving the
     * encrypted settings, or they can no longer be decrypted.
     */
    get settingsEncKey() {
      return optional('SETTINGS_ENC_KEY', this.sessionSecret);
    },
    /**
     * Server-side pepper for hashing machine API keys (see
     * shared/repository/apiKeys.ts). Keys are stored as an scrypt hash salted
     * with this pepper, so a database-only leak cannot be used to verify guessed
     * keys offline. Falls back to `settingsEncKey` so it works without extra
     * configuration; set a dedicated `API_KEY_PEPPER` in production. Rotating it
     * invalidates all existing API keys — rotate the Power Automate key after.
     */
    get apiKeyPepper() {
      return optional('API_KEY_PEPPER', this.settingsEncKey);
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
    /**
     * Optional custom classification model that splits a bundled PDF (several
     * invoices in one file) into per-invoice page ranges. The whole split
     * feature is INERT unless this is set — leave it empty and every upload is
     * processed as a single document exactly as before.
     */
    get docIntelClassifierId() {
      return optional('DOCINTEL_CLASSIFIER_ID', '');
    },
    /**
     * Endpoint hosting the classifier. Defaults to the main Document
     * Intelligence endpoint, so if the classifier lives on the same resource no
     * extra config is needed; override only when it was trained on a different
     * resource.
     */
    get docIntelClassifierEndpoint() {
      return optional('DOCINTEL_CLASSIFIER_ENDPOINT', this.docIntelEndpoint);
    },
    /** API key for the classifier resource. Defaults to the main DI key. */
    get docIntelClassifierKey() {
      return optional('DOCINTEL_CLASSIFIER_KEY', this.docIntelKey);
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

  /**
   * Fiserv Prologue Financials (SQL Server) integration.
   *
   * On invoice approval the app stages an unposted AP transaction in Prologue by
   * calling two stored procedures. The whole integration is inert unless
   * `PROLOGUE_ENABLED` is true, so a deployment without SQL Server connectivity
   * behaves exactly as before until the flag is flipped.
   *
   * host/database/user use an empty-string fallback (not `required`) so config
   * never throws at import when the integration is off; `shared/prologue.ts`
   * fails with a clear error if the flag is on but a value is missing.
   *
   * companyId and defaultAccount default to the values observed in BankFund's
   * Prologue sample data (`company_id = '01'`, default GL account
   * '01886910800005'); confirm both with BankFund before go-live.
   */
  prologue: {
    get enabled() {
      return bool('PROLOGUE_ENABLED', false);
    },
    get host() {
      return optional('PROLOGUE_HOST', '');
    },
    get port() {
      return int('PROLOGUE_PORT', 1433);
    },
    get database() {
      return optional('PROLOGUE_DATABASE', '');
    },
    get user() {
      return optional('PROLOGUE_USER', '');
    },
    /** Keep in Key Vault / Function App settings — never in the repo. */
    get password() {
      return process.env['PROLOGUE_PASSWORD'] ?? '';
    },
    /** TLS to SQL Server. True by default; most Azure SQL requires it. */
    get encrypt() {
      return bool('PROLOGUE_ENCRYPT', true);
    },
    /** Only for a self-signed server cert on a trusted network. */
    get trustServerCertificate() {
      return bool('PROLOGUE_TRUST_SERVER_CERT', false);
    },
    get companyId() {
      return optional('PROLOGUE_COMPANY_ID', '01');
    },
    /** trade_discount / misc / freight default account (all three, per sample). */
    get defaultAccount() {
      return optional('PROLOGUE_DEFAULT_ACCOUNT', '01886910800005');
    },
    /** Written to Prologue audit rows as the source system user. */
    get sourceUser() {
      return optional('PROLOGUE_SOURCE_USER', 'TANVI');
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
