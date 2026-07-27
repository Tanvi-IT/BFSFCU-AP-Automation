-- Power Automate service account + API-key ownership.
--
-- A default, non-interactive service user that machine clients (a Power
-- Automate flow forwarding emailed invoices) authenticate as via an API key.
-- The key itself lives in api_keys as a hash; this migration only creates the
-- identity and links api_keys to the user it authenticates as.
--
-- Idempotent: safe to re-run.

-- 1. The service user. Role 'user' — invoice work only, no user/settings admin.
--    password_hash is a non-bcrypt sentinel so interactive password login can
--    never succeed; this account is reachable only through its API key.
INSERT INTO users (email, full_name, role, auth_provider, password_hash, is_active)
SELECT 'power-automate@peapod.com',
       'Power Automate (Integration)',
       'user',
       'local',
       'x-no-interactive-login',
       true
WHERE NOT EXISTS (
  SELECT 1 FROM users WHERE lower(email) = lower('power-automate@peapod.com')
);

-- The API key itself lives in the existing api_keys table (hash only). Rows are
-- tagged by name = 'Power Automate' and resolve to the service user above at
-- verification time, so no schema change to api_keys is required.
