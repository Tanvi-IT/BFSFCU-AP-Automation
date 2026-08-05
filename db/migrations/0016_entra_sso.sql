-- 0016_entra_sso.sql
-- Configurable Microsoft Entra (Azure AD) single sign-on.
--
-- Stores ONLY non-secret configuration: the integration uses a public client
-- (authorization-code + PKCE) and the backend validates the ID token, so there
-- is no client secret to keep. Tenant id and client (application) id are public,
-- consistent with app_settings' "non-secret configuration only" rule.
--
-- When enabled, the login page offers "Sign in with Microsoft". A user may sign
-- in via Entra only if an administrator has already created their account
-- (matched by external_id, then email) — there is no self-provisioning.

BEGIN;

ALTER TABLE app_settings
  ADD COLUMN IF NOT EXISTS entra_enabled   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS entra_tenant_id text,
  ADD COLUMN IF NOT EXISTS entra_client_id text;

COMMENT ON COLUMN app_settings.entra_enabled IS
  'When true (and tenant/client are set), the login page offers Microsoft Entra SSO.';
COMMENT ON COLUMN app_settings.entra_tenant_id IS
  'Entra directory (tenant) id. Public; no secret is stored (public client + PKCE).';
COMMENT ON COLUMN app_settings.entra_client_id IS
  'Entra application (client) id of the SPA app registration. Public.';

-- Lookup by external_id (the Entra object id) at SSO login.
CREATE INDEX IF NOT EXISTS users_external_id_idx
  ON users (external_id) WHERE external_id IS NOT NULL;

COMMIT;
