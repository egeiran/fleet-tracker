import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

export const SCHEMA_VERSION = 1;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS carriers (
  key          TEXT PRIMARY KEY,
  kind         TEXT NOT NULL,
  name         TEXT,
  meta         TEXT NOT NULL,
  first_seen   INTEGER NOT NULL,
  last_seen    INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS positions (
  carrier_key TEXT NOT NULL,
  ts          INTEGER NOT NULL,
  lon         REAL NOT NULL,
  lat         REAL NOT NULL,
  sog         REAL,
  cog         REAL,
  heading     REAL,
  nav_status  INTEGER,
  src         TEXT NOT NULL,
  PRIMARY KEY (carrier_key, ts)
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS positions_ts ON positions (ts);
CREATE TABLE IF NOT EXISTS assignments (
  unit_id     TEXT NOT NULL,
  slot        INTEGER NOT NULL,
  carrier_key TEXT NOT NULL,
  from_ts     INTEGER NOT NULL,
  to_ts       INTEGER,
  reason      TEXT,
  PRIMARY KEY (unit_id, from_ts)
);
CREATE INDEX IF NOT EXISTS assignments_open ON assignments (slot) WHERE to_ts IS NULL;
CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT NOT NULL);
`;

/** Opens (or creates) the SQLite file with WAL and runs the idempotent schema. */
export function openDb(path: string): DatabaseSync {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA synchronous = NORMAL");
  db.exec(SCHEMA);
  db.prepare("INSERT OR REPLACE INTO kv (k, v) VALUES ('schema_version', ?)").run(String(SCHEMA_VERSION));
  return db;
}

export function kvGet(db: DatabaseSync, k: string): string | null {
  const row = db.prepare("SELECT v FROM kv WHERE k = ?").get(k) as { v: string } | undefined;
  return row?.v ?? null;
}

export function kvSet(db: DatabaseSync, k: string, v: string): void {
  db.prepare("INSERT OR REPLACE INTO kv (k, v) VALUES (?, ?)").run(k, v);
}
