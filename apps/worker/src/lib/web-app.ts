import type { Context } from 'hono';

export const DEFAULT_WEB_APP_PATH = '/app';

/** 规范化浏览器控制端入口路径（无末尾斜杠，始终以 / 开头）。 */
export function normalizeWebAppPath(raw?: string): string {
  const trimmed = (raw ?? DEFAULT_WEB_APP_PATH).trim() || DEFAULT_WEB_APP_PATH;
  const withSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return withSlash.replace(/\/+$/, '') || DEFAULT_WEB_APP_PATH;
}

export function webAppEntryPath(raw?: string): string {
  return `${normalizeWebAppPath(raw)}/`;
}

export function isWebAppPath(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function fetchAsset(assets: Fetcher, assetPath: string, method: string, origin: string): Promise<Response> {
  const assetUrl = new URL(assetPath, origin);
  return assets.fetch(new Request(assetUrl.toString(), { method }));
}

/** 将 {prefix}/... 映射到 ASSETS 上的静态文件路径，SPA 路由回退 index.html。 */
export async function serveWebApp(c: Context, assets: Fetcher, prefix: string): Promise<Response> {
  const url = new URL(c.req.url);
  let assetPath = url.pathname.slice(prefix.length) || '/';
  if (!assetPath.startsWith('/')) {
    assetPath = `/${assetPath}`;
  }
  if (assetPath.endsWith('/')) {
    assetPath += 'index.html';
  }

  const response = await fetchAsset(assets, assetPath, c.req.method, url.origin);

  if (response.status !== 404 || assetPath.includes('.')) {
    return response;
  }

  return fetchAsset(assets, '/index.html', c.req.method, url.origin);
}

/** 兼容 base=/ 构建产物：页面在 /app/ 下但脚本引用 /assets/*。 */
export async function serveRootAsset(c: Context, assets: Fetcher, pathname: string): Promise<Response> {
  return fetchAsset(assets, pathname, c.req.method, new URL(c.req.url).origin);
}
