PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS reports (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL, period TEXT NOT NULL,
 payload_json TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'Submitted',
 created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reports_user_period ON reports(user_id,period);
CREATE INDEX IF NOT EXISTS idx_reports_period ON reports(period);
