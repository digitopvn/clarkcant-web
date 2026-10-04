CREATE TABLE request_rate_limits (
  action TEXT NOT NULL,
  visitor_hash TEXT NOT NULL,
  bucket INTEGER NOT NULL,
  hits INTEGER NOT NULL CHECK(hits > 0),
  PRIMARY KEY(action, visitor_hash, bucket)
);
CREATE INDEX request_rate_limit_cleanup ON request_rate_limits(bucket);
CREATE INDEX survey_visitor_window ON surveys(visitor_hash, created_at);
ALTER TABLE oauth_clients ADD COLUMN expires_at INTEGER;
UPDATE oauth_clients SET expires_at=CAST(strftime('%s','now') AS INTEGER)+7776000 WHERE expires_at IS NULL;
CREATE INDEX oauth_client_expiry ON oauth_clients(expires_at);
