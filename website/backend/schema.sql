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
-- Multiple independently editable links. Keep the legacy slot working during deployment
-- and for cached clients; triggers mirror that slot into the new collection.
CREATE TABLE IF NOT EXISTS transcript_entries (
  id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
  visitor_id TEXT NOT NULL REFERENCES visitors(id) ON DELETE CASCADE,
  event_id TEXT NOT NULL,
  url TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  updated_at INTEGER NOT NULL,
  legacy_key TEXT UNIQUE
);
CREATE INDEX IF NOT EXISTS transcript_entries_by_event ON transcript_entries(event_id, updated_at DESC, id);
CREATE INDEX IF NOT EXISTS transcript_entries_by_visitor ON transcript_entries(visitor_id, event_id);

CREATE TRIGGER IF NOT EXISTS transcript_legacy_insert AFTER INSERT ON transcript_links BEGIN
  INSERT INTO transcript_entries(visitor_id,event_id,url,title,updated_at,legacy_key)
  VALUES(NEW.visitor_id,NEW.event_id,NEW.url,NEW.title,NEW.updated_at,NEW.visitor_id || ':' || NEW.event_id)
  ON CONFLICT(legacy_key) DO UPDATE SET url=excluded.url,title=excluded.title,updated_at=excluded.updated_at;
END;
CREATE TRIGGER IF NOT EXISTS transcript_legacy_update AFTER UPDATE ON transcript_links BEGIN
  UPDATE transcript_entries SET url=NEW.url,title=NEW.title,updated_at=NEW.updated_at
  WHERE legacy_key=OLD.visitor_id || ':' || OLD.event_id;
END;
CREATE TRIGGER IF NOT EXISTS transcript_legacy_delete AFTER DELETE ON transcript_links BEGIN
  DELETE FROM transcript_entries WHERE legacy_key=OLD.visitor_id || ':' || OLD.event_id;
END;

INSERT INTO transcript_entries(visitor_id,event_id,url,title,updated_at,legacy_key)
SELECT visitor_id,event_id,url,title,updated_at,visitor_id || ':' || event_id FROM transcript_links WHERE true
ON CONFLICT(legacy_key) DO NOTHING;
