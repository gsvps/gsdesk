import type Database from 'better-sqlite3';

interface KvRow {
  value: string;
  expires_at: number | null;
}

/** SQLite 持久化 KV，供 VPS 自托管使用。 */
export class SqliteKv implements KVNamespace {
  constructor(private db: Database.Database) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS kv_store (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        expires_at INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_kv_expires ON kv_store(expires_at);
    `);
  }

  private purgeExpired() {
    this.db.prepare('DELETE FROM kv_store WHERE expires_at IS NOT NULL AND expires_at <= ?').run(Date.now());
  }

  async get(key: string, type?: 'text'): Promise<string | null>;
  async get(key: string, type: 'json'): Promise<unknown | null>;
  async get(key: string, type: 'arrayBuffer'): Promise<ArrayBuffer | null>;
  async get(key: string, type: 'stream'): Promise<ReadableStream | null>;
  async get(key: string, type?: 'text' | 'json' | 'arrayBuffer' | 'stream'): Promise<unknown> {
    this.purgeExpired();
    const row = this.db.prepare('SELECT value, expires_at FROM kv_store WHERE key = ?').get(key) as KvRow | undefined;
    if (!row) return null;
    if (row.expires_at != null && row.expires_at <= Date.now()) {
      this.db.prepare('DELETE FROM kv_store WHERE key = ?').run(key);
      return null;
    }
    if (type === 'json') {
      try {
        return JSON.parse(row.value);
      } catch {
        return null;
      }
    }
    if (type === 'arrayBuffer') {
      return new TextEncoder().encode(row.value).buffer;
    }
    if (type === 'stream') {
      return new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(row.value));
          controller.close();
        },
      });
    }
    return row.value;
  }

  async put(
    key: string,
    value: string | ArrayBuffer | ReadableStream,
    options?: { expirationTtl?: number }
  ): Promise<void> {
    let text: string;
    if (typeof value === 'string') {
      text = value;
    } else if (value instanceof ArrayBuffer) {
      text = new TextDecoder().decode(value);
    } else {
      text = await new Response(value).text();
    }
    const expiresAt =
      options?.expirationTtl && options.expirationTtl > 0
        ? Date.now() + options.expirationTtl * 1000
        : null;
    this.db
      .prepare(
        `INSERT INTO kv_store (key, value, expires_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, expires_at = excluded.expires_at`
      )
      .run(key, text, expiresAt);
  }

  async delete(key: string): Promise<void> {
    this.db.prepare('DELETE FROM kv_store WHERE key = ?').run(key);
  }

  async list(options?: { prefix?: string; limit?: number; cursor?: string }): Promise<KVNamespaceListResult<string>> {
    this.purgeExpired();
    const prefix = options?.prefix ?? '';
    const limit = options?.limit ?? 1000;
    const rows = this.db
      .prepare('SELECT key, expires_at FROM kv_store WHERE key LIKE ? ORDER BY key LIMIT ?')
      .all(`${prefix}%`, limit) as Array<{ key: string; expires_at: number | null }>;
    return {
      keys: rows.map((row) => ({ name: row.key, expiration: row.expires_at ?? undefined })),
      list_complete: true,
    };
  }

  async getWithMetadata(key: string, type?: 'text'): Promise<KVNamespaceGetWithMetadataResult<string>>;
  async getWithMetadata(key: string, type: 'json'): Promise<KVNamespaceGetWithMetadataResult<unknown>>;
  async getWithMetadata(
    key: string,
    type?: 'text' | 'json'
  ): Promise<KVNamespaceGetWithMetadataResult<string | unknown>> {
    const value = await this.get(key, type ?? 'text');
    return { value, metadata: null, cacheStatus: null };
  }
}
