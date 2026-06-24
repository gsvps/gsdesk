import fs from 'node:fs/promises';
import path from 'node:path';

export class LocalR2Bucket implements R2Bucket {
  constructor(private root: string) {}

  async head(key: string): Promise<R2Object | null> {
    try {
      const stat = await fs.stat(this.filePath(key));
      return {
        key,
        size: stat.size,
        uploaded: stat.mtime,
        httpMetadata: {},
        customMetadata: {},
        checksums: {},
        writeHttpMetadata: () => undefined,
      } as R2Object;
    } catch {
      return null;
    }
  }

  async get(key: string): Promise<R2ObjectBody | null> {
    try {
      const data = await fs.readFile(this.filePath(key));
      const body = new Uint8Array(data);
      return {
        key,
        size: body.byteLength,
        body,
        arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength),
        text: async () => new TextDecoder().decode(body),
        json: async () => JSON.parse(new TextDecoder().decode(body)),
        blob: async () => new Blob([body]),
        writeHttpMetadata: () => undefined,
        customMetadata: {},
        httpMetadata: {},
        checksums: {},
        uploaded: new Date(),
      } as R2ObjectBody;
    } catch {
      return null;
    }
  }

  async put(
    key: string,
    value: ReadableStream | ArrayBuffer | ArrayBufferView | string | Blob | null,
    options?: R2PutOptions
  ): Promise<R2Object> {
    await fs.mkdir(path.dirname(this.filePath(key)), { recursive: true });
    let data: Uint8Array;
    if (typeof value === 'string') {
      data = new TextEncoder().encode(value);
    } else if (value instanceof ArrayBuffer) {
      data = new Uint8Array(value);
    } else if (ArrayBuffer.isView(value)) {
      data = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    } else if (value instanceof Blob) {
      data = new Uint8Array(await value.arrayBuffer());
    } else if (value) {
      data = new Uint8Array(await new Response(value).arrayBuffer());
    } else {
      data = new Uint8Array();
    }
    await fs.writeFile(this.filePath(key), data);
    return (await this.head(key))!;
  }

  async delete(key: string | string[]): Promise<void> {
    const keys = Array.isArray(key) ? key : [key];
    await Promise.all(keys.map((k) => fs.rm(this.filePath(k), { force: true })));
  }

  async list(): Promise<R2Objects> {
    return { objects: [], truncated: false };
  }

  private filePath(key: string): string {
    return path.join(this.root, key.replace(/\.\./g, '_'));
  }
}

export function createLocalAssets(root: string): Fetcher {
  return {
    fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
      let rel = decodeURIComponent(url.pathname);
      if (rel === '/') rel = '/index.html';
      const filePath = path.join(root, rel.replace(/^\//, '').replace(/\.\./g, '_'));
      return fs
        .readFile(filePath)
        .then((data) => {
          const type = contentType(filePath);
          return new Response(data, { headers: { 'Content-Type': type } });
        })
        .catch(() => new Response('Not Found', { status: 404 }));
    },
  };
}

function contentType(filePath: string): string {
  if (filePath.endsWith('.html')) return 'text/html; charset=utf-8';
  if (filePath.endsWith('.js')) return 'application/javascript; charset=utf-8';
  if (filePath.endsWith('.css')) return 'text/css; charset=utf-8';
  if (filePath.endsWith('.svg')) return 'image/svg+xml';
  if (filePath.endsWith('.png')) return 'image/png';
  if (filePath.endsWith('.ico')) return 'image/x-icon';
  if (filePath.endsWith('.json')) return 'application/json; charset=utf-8';
  return 'application/octet-stream';
}
