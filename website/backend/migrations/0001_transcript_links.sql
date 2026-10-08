CREATE TABLE IF NOT EXISTS transcript_links (
  visitor_id TEXT NOT NULL REFERENCES visitors(id) ON DELETE CASCADE,
  event_id TEXT NOT NULL,
  url TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (visitor_id, event_id)
);
CREATE INDEX IF NOT EXISTS transcript_links_by_event ON transcript_links(event_id, updated_at DESC, visitor_id);
