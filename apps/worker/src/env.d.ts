interface Env {
  DB: D1Database;
  KV: KVNamespace;
  R2: R2Bucket;
  ASSETS?: Fetcher;
  DEVICE_ROOM: DurableObjectNamespace;
  SESSION_ROOM: DurableObjectNamespace;
  APP_NAME?: string;
  BACKEND_KIND?: 'cloudflare' | 'self_hosted';
  ALLOWED_ORIGIN?: string;
  SKIP_SIGNATURE_VERIFY?: string;
  CLIENT_LATEST_VERSION?: string;
  CLIENT_DOWNLOAD_URL?: string;
  CLIENT_RELEASE_NOTES?: string;
  CONTROLLER_JWT_SECRET?: string;
  /** 浏览器/mobile 控制端入口路径，默认 /app（见 wrangler.toml [vars]） */
  WEB_APP_PATH?: string;
}

export type { Env };
