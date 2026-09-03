import type { DatabaseSync } from "node:sqlite";
import type { Carrier, TrackPoint } from "@vakt/domain";

export interface PositionRow {
  carrier_key: string;
  ts: number;
  lon: number;
  lat: number;
  sog: number | null;
  cog: number | null;
  heading: number | null;
  nav_status: number | null;
  src: "hist" | "live";
}

export interface AssignmentRow {
  unit_id: string;
  slot: number;
  carrier_key: string;
  from_ts: number;
  to_ts: number | null;
  reason: string | null;
}

export class PositionsRepo {
  private insert;
  constructor(private db: DatabaseSync) {
    this.insert = db.prepare(
      "INSERT OR IGNORE INTO positions (carrier_key, ts, lon, lat, sog, cog, heading, nav_status, src) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    );
  }
  insertMany(rows: PositionRow[]): void {
    if (!rows.length) return;
    this.db.exec("BEGIN");
    try {
      for (const r of rows) this.insert.run(r.carrier_key, r.ts, r.lon, r.lat, r.sog, r.cog, r.heading, r.nav_status, r.src);
      this.db.exec("COMMIT");
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  loadSince(ts: number): Map<string, TrackPoint[]> {
    const rows = this.db.prepare("SELECT carrier_key, ts, lon, lat FROM positions WHERE ts >= ? ORDER BY carrier_key, ts").all(ts) as Pick<
      PositionRow,
      "carrier_key" | "ts" | "lon" | "lat"
    >[];
    const out = new Map<string, TrackPoint[]>();
    for (const r of rows) {
      let arr = out.get(r.carrier_key);
      if (!arr) {
        arr = [];
        out.set(r.carrier_key, arr);
      }
      arr.push([r.lon, r.lat, r.ts]);
    }
    return out;
  }
  pruneBefore(ts: number): number {
    return Number(this.db.prepare("DELETE FROM positions WHERE ts < ?").run(ts).changes);
  }
  private countStmt: ReturnType<DatabaseSync["prepare"]> | null = null;
  count(): number {
    this.countStmt ??= this.db.prepare("SELECT COUNT(*) AS n FROM positions");
    return Number((this.countStmt.get() as { n: number }).n);
  }
}

export class CarriersRepo {
  private upsertStmt;
  private getStmt;
  constructor(db: DatabaseSync) {
    this.upsertStmt = db.prepare(
      `INSERT INTO carriers (key, kind, name, meta, first_seen, last_seen) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET name = excluded.name, meta = excluded.meta, last_seen = excluded.last_seen`,
    );
    this.getStmt = db.prepare("SELECT meta FROM carriers WHERE key = ?");
  }
  upsert(key: string, carrier: Carrier, seenAt: number): void {
    const name = carrier.kind === "vessel" ? carrier.name : carrier.kind === "train" ? (carrier.publicCode ?? carrier.lineName ?? null) : carrier.label;
    this.upsertStmt.run(key, carrier.kind, name, JSON.stringify(carrier), seenAt, seenAt);
  }
  get(key: string): Carrier | null {
    const row = this.getStmt.get(key) as { meta: string } | undefined;
    if (!row) return null;
    try {
      return JSON.parse(row.meta) as Carrier;
    } catch {
      return null;
    }
  }
}

export class AssignmentsRepo {
  private openStmt;
  private closeStmt;
  private listOpenStmt;
  private pruneStmt;
  constructor(db: DatabaseSync) {
    this.openStmt = db.prepare(
      "INSERT OR REPLACE INTO assignments (unit_id, slot, carrier_key, from_ts, to_ts, reason) VALUES (?, ?, ?, ?, NULL, ?)",
    );
    this.closeStmt = db.prepare("UPDATE assignments SET to_ts = ?, reason = ? WHERE unit_id = ? AND to_ts IS NULL");
    this.listOpenStmt = db.prepare("SELECT * FROM assignments WHERE to_ts IS NULL ORDER BY slot");
    this.pruneStmt = db.prepare("DELETE FROM assignments WHERE to_ts IS NOT NULL AND to_ts < ?");
  }
  open(unitId: string, slot: number, carrierKey: string, fromTs: number, reason: string): void {
    this.openStmt.run(unitId, slot, carrierKey, fromTs, reason);
  }
  close(unitId: string, toTs: number, reason: string): void {
    this.closeStmt.run(toTs, reason, unitId);
  }
  listOpen(): AssignmentRow[] {
    return this.listOpenStmt.all() as unknown as AssignmentRow[];
  }
  pruneClosedBefore(ts: number): number {
    return Number(this.pruneStmt.run(ts).changes);
  }
}
