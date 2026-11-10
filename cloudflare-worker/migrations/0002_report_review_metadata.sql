-- Apply ONCE to every existing V2.5 department D1 database.
ALTER TABLE reports ADD COLUMN reviewed_by TEXT;
ALTER TABLE reports ADD COLUMN reviewed_at TEXT;
ALTER TABLE reports ADD COLUMN review_note TEXT;
CREATE INDEX IF NOT EXISTS idx_reports_status_created ON reports(status, created_at);
