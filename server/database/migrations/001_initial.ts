// Migration 001: review history and per-user settings (see docs/DESIGN.md "Data model").
// Migrations are TypeScript string modules so they are bundled into .output.
export default /* sql */ `
CREATE TABLE reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  asset_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('kept','trashed','favourited')),
  previous_is_favorite INTEGER,
  reviewed_at TEXT NOT NULL,
  UNIQUE (user_id, asset_id)
);
CREATE INDEX reviews_user_status ON reviews(user_id, status);
CREATE INDEX reviews_user_time ON reviews(user_id, reviewed_at);

CREATE TABLE settings (
  user_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  PRIMARY KEY (user_id, key)
);
`
