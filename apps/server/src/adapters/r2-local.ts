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
