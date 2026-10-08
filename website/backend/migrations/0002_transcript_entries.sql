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
