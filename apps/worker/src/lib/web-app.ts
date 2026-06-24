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

  const assetUrl = new URL(assetPath, url.origin);
  const response = await assets.fetch(new Request(assetUrl.toString(), c.req.raw));

  if (response.status !== 404 || assetPath.includes('.')) {
    return response;
  }

  return assets.fetch(new Request(new URL('/index.html', url.origin).toString(), c.req.raw));
}

export function webAppRedirect(c: Context, prefix: string): Response {
  const url = new URL(c.req.url);
  url.pathname = `${prefix}/`;
  return c.redirect(url.toString(), 302);
}
