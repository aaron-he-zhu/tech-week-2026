PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS visitors (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  nickname TEXT NOT NULL DEFAULT '',
  share_token TEXT UNIQUE,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS wishes (
  visitor_id TEXT NOT NULL REFERENCES visitors(id) ON DELETE CASCADE,
  event_id TEXT NOT NULL,
  snapshot TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (visitor_id, event_id)
);
CREATE INDEX IF NOT EXISTS wishes_by_event ON wishes(event_id, created_at, visitor_id);
CREATE TABLE IF NOT EXISTS rate_limits (
  bucket TEXT PRIMARY KEY,
  hits INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS address_tips (
  visitor_id TEXT NOT NULL REFERENCES visitors(id) ON DELETE CASCADE,
  event_id TEXT NOT NULL,
  address TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (visitor_id, event_id)
);
CREATE INDEX IF NOT EXISTS address_tips_by_event ON address_tips(event_id, updated_at DESC, visitor_id);
CREATE TABLE IF NOT EXISTS ratings (
  visitor_id TEXT NOT NULL REFERENCES visitors(id) ON DELETE CASCADE,
  event_id TEXT NOT NULL,
  score INTEGER NOT NULL CHECK (score BETWEEN 1 AND 5),
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (visitor_id, event_id)
);
CREATE INDEX IF NOT EXISTS ratings_by_event ON ratings(event_id, updated_at DESC, visitor_id);
CREATE TABLE IF NOT EXISTS google_accounts (
  google_sub TEXT PRIMARY KEY,
  visitor_id TEXT NOT NULL UNIQUE REFERENCES visitors(id) ON DELETE CASCADE,
  email TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS visitor_sessions (
  token_hash TEXT PRIMARY KEY,
  visitor_id TEXT NOT NULL REFERENCES visitors(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_by_visitor ON visitor_sessions(visitor_id);
CREATE TABLE IF NOT EXISTS google_challenges (
  id TEXT PRIMARY KEY,
  nonce_hash TEXT NOT NULL,
  session_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS google_login_uses (
  challenge_id TEXT PRIMARY KEY NOT NULL REFERENCES google_challenges(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS transcript_links (
  visitor_id TEXT NOT NULL REFERENCES visitors(id) ON DELETE CASCADE,
  event_id TEXT NOT NULL,
  url TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (visitor_id, event_id)
);
CREATE INDEX IF NOT EXISTS transcript_links_by_event ON transcript_links(event_id, updated_at DESC, visitor_id);
