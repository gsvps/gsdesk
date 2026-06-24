import { ensureSystemController, isDatabaseReady } from './system-user';

/** Embedded schema for one-click deploy when wrangler db:migrate was never run. */
const BOOTSTRAP_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  avatar TEXT,
  password_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  device_name TEXT NOT NULL,
  hostname TEXT NOT NULL,
  os TEXT NOT NULL,
  public_key TEXT NOT NULL,
  unattended_enabled INTEGER NOT NULL DEFAULT 0,
  online INTEGER NOT NULL DEFAULT 0,
  last_seen INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  access_password_hash TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_devices_user_id ON devices(user_id);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  started_at INTEGER,
  ended_at INTEGER,
  ip TEXT,
  user_agent TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (device_id) REFERENCES devices(id)
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_device_id ON sessions(device_id);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  device_id TEXT,
  action TEXT NOT NULL,
  ip TEXT,
  metadata TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);

INSERT OR IGNORE INTO users (id, email, name, password_hash, created_at, updated_at)
VALUES ('controller', 'controller@local', 'Controller', 'disabled', 0, 0);
`;

let bootstrapPromise: Promise<boolean> | null = null;

/** Creates D1 tables on first use (Workers Builds often skip npm run db:migrate). */
export async function ensureDatabaseReady(db: D1Database): Promise<boolean> {
  if (await isDatabaseReady(db)) {
    await ensureSystemController(db);
    return true;
  }

  if (!bootstrapPromise) {
    bootstrapPromise = runBootstrap(db);
  }
  return bootstrapPromise;
}

async function runBootstrap(db: D1Database): Promise<boolean> {
  try {
    await db.exec(BOOTSTRAP_SQL);
    return await isDatabaseReady(db);
  } catch (err) {
    console.error('D1 bootstrap failed', err);
    bootstrapPromise = null;
    return false;
  }
}
