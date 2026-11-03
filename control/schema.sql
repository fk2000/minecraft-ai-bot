-- Control plane for multi-server chest transfer jobs (no auth tokens stored here).

CREATE TABLE IF NOT EXISTS servers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  host TEXT NOT NULL,
  port INTEGER NOT NULL DEFAULT 25565,
  profile_name TEXT NOT NULL,
  inventory_shared INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  auth TEXT NOT NULL DEFAULT 'offline',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS routes (
  id TEXT PRIMARY KEY,
  from_server_id TEXT NOT NULL REFERENCES servers(id),
  to_server_id TEXT NOT NULL REFERENCES servers(id),
  inventory_shared INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  route_id TEXT REFERENCES routes(id),
  from_server TEXT NOT NULL,
  to_server TEXT NOT NULL,
  status TEXT NOT NULL CHECK (
    status IN ('queued', 'withdrawing', 'in_transit', 'depositing', 'done', 'failed')
  ),
  manifest_json TEXT NOT NULL,
  moved_json TEXT,
  failure_reason TEXT,
  claimed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status, updated_at);
