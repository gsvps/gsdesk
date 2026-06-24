import type Database from 'better-sqlite3';

type SqlValue = string | number | boolean | null | ArrayBuffer;

class SqlitePreparedStatement implements D1PreparedStatement {
  private bindings: SqlValue[] = [];

  constructor(
    private db: Database.Database,
    private query: string
  ) {}

  bind(...values: unknown[]): D1PreparedStatement {
    this.bindings = values as SqlValue[];
    return this;
  }

  first<T = unknown>(colName?: string): Promise<T | null> {
    const stmt = this.db.prepare(this.query);
    const row = this.bindings.length ? stmt.get(...this.bindings) : stmt.get();
    if (!row) return Promise.resolve(null);
    if (colName) {
      return Promise.resolve((row as Record<string, unknown>)[colName] as T);
    }
    return Promise.resolve(row as T);
  }

  run<T = unknown>(): Promise<D1Result<T>> {
    const stmt = this.db.prepare(this.query);
    const result = this.bindings.length ? stmt.run(...this.bindings) : stmt.run();
    return Promise.resolve({
      success: true,
      meta: {
        duration: 0,
        changes: result.changes,
        last_row_id: Number(result.lastInsertRowid),
        rows_read: 0,
        rows_written: result.changes,
      },
      results: [],
    });
  }

  all<T = unknown>(): Promise<D1Result<T>> {
    const stmt = this.db.prepare(this.query);
    const results = (this.bindings.length ? stmt.all(...this.bindings) : stmt.all()) as T[];
    return Promise.resolve({
      success: true,
      meta: {
        duration: 0,
        changes: 0,
        last_row_id: 0,
        rows_read: results.length,
        rows_written: 0,
      },
      results,
    });
  }

  raw<T = unknown[]>(): Promise<T[]> {
    const stmt = this.db.prepare(this.query);
    const rows = this.bindings.length ? stmt.raw(...this.bindings).all() : stmt.raw().all();
    return Promise.resolve(rows as T[]);
  }
}

export class SqliteD1Database implements D1Database {
  constructor(private db: Database.Database) {}

  prepare(query: string): D1PreparedStatement {
    return new SqlitePreparedStatement(this.db, query);
  }

  async batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]> {
    const results: D1Result<T>[] = [];
    const tx = this.db.transaction(() => {
      for (const statement of statements) {
        const prepared = statement as SqlitePreparedStatement;
        const stmt = this.db.prepare(prepared['query']);
        const bindings = prepared['bindings'] as SqlValue[];
        const run = bindings.length ? stmt.run(...bindings) : stmt.run();
        results.push({
          success: true,
          meta: {
            duration: 0,
            changes: run.changes,
            last_row_id: Number(run.lastInsertRowid),
            rows_read: 0,
            rows_written: run.changes,
          },
          results: [],
        });
      }
    });
    tx();
    return results;
  }

  async exec(query: string): Promise<D1ExecResult> {
    this.db.exec(query);
    return { count: 0, duration: 0 };
  }

  get native(): Database.Database {
    return this.db;
  }
}

export function createD1Database(db: Database.Database): D1Database {
  return new SqliteD1Database(db);
}
