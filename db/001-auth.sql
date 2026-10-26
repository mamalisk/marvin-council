CREATE TABLE IF NOT EXISTS marvin_auth_users (
  github_id text PRIMARY KEY,
  login text NOT NULL,
  display_name text NOT NULL,
  tokens text,
  verified_at bigint NOT NULL,
  probe_window bigint NOT NULL DEFAULT 0,
  probe_count integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS marvin_auth_sessions (
  id_hash text PRIMARY KEY,
  github_id text NOT NULL REFERENCES marvin_auth_users(github_id) ON DELETE CASCADE,
  expires_at bigint NOT NULL
);
CREATE INDEX IF NOT EXISTS marvin_auth_sessions_user ON marvin_auth_sessions(github_id);
CREATE INDEX IF NOT EXISTS marvin_auth_sessions_expiry ON marvin_auth_sessions(expires_at);

CREATE TABLE IF NOT EXISTS marvin_oauth_flows (
  state_hash text PRIMARY KEY,
  browser_hash text NOT NULL,
  verifier text NOT NULL,
  expires_at bigint NOT NULL
);
CREATE INDEX IF NOT EXISTS marvin_oauth_flows_expiry ON marvin_oauth_flows(expires_at);
