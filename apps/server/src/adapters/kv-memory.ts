interface KvEntry {
  value: string;
  expiresAt?: number;
}

export class MemoryKv implements KVNamespace {
  private store = new Map<string, KvEntry>();

  async get(key: string, type?: 'text'): Promise<string | null>;
  async get(key: string, type: 'json'): Promise<unknown | null>;
  async get(key: string, type: 'arrayBuffer'): Promise<ArrayBuffer | null>;
  async get(key: string, type: 'stream'): Promise<ReadableStream | null>;
  async get(key: string, type?: 'text' | 'json' | 'arrayBuffer' | 'stream'): Promise<unknown> {
    this.cleanup();
    const entry = this.store.get(key);
    if (!entry) return null;
    if (type === 'json') {
      try {
        return JSON.parse(entry.value);
      } catch {
        return null;
      }
    }
    if (type === 'arrayBuffer') {
      return new TextEncoder().encode(entry.value).buffer;
    }
    if (type === 'stream') {
      return new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(entry.value));
          controller.close();
        },
      });
    }
    return entry.value;
  }

  async put(key: string, value: string | ArrayBuffer | ReadableStream, options?: { expirationTtl?: number }): Promise<void> {
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
        : undefined;
    this.store.set(key, { value: text, expiresAt });
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  async list(options?: { prefix?: string; limit?: number; cursor?: string }): Promise<KVNamespaceListResult> {
    this.cleanup();
    const prefix = options?.prefix ?? '';
    const keys = [...this.store.keys()]
      .filter((key) => key.startsWith(prefix))
      .slice(0, options?.limit ?? 1000)
      .map((name) => ({ name, expiration: this.store.get(name)?.expiresAt }));
    return { keys, list_complete: true };
  }

  private cleanup() {
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (entry.expiresAt && entry.expiresAt <= now) {
        this.store.delete(key);
      }
    }
  }
}
