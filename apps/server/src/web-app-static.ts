import fs from 'node:fs';
import path from 'node:path';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

export const DEFAULT_WEB_APP_PATH = '/app';

export function normalizeWebAppPath(raw?: string): string {
  const trimmed = (raw ?? DEFAULT_WEB_APP_PATH).trim() || DEFAULT_WEB_APP_PATH;
  const withSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return withSlash.replace(/\/+$/, '') || DEFAULT_WEB_APP_PATH;
}

function contentType(filePath: string): string {
  return MIME[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream';
}

/** VPS 自托管：从 dist 目录提供浏览器控制端静态页（需先 npm run build:web:app）。 */
export function tryServeWebApp(pathname: string, distRoot: string, webAppPath?: string): Response | null {
  const prefix = normalizeWebAppPath(webAppPath);

  if (pathname === prefix) {
    pathname = `${prefix}/`;
  }
  if (!pathname.startsWith(`${prefix}/`)) {
    return null;
  }

  if (!fs.existsSync(distRoot)) {
    return new Response('Web control UI not built. Run npm run build:web:app', { status: 503 });
  }

  let rel = pathname.slice(prefix.length) || '/';
  if (rel.endsWith('/')) {
    rel += 'index.html';
  }
  rel = rel.replace(/^\/+/, '');

  const filePath = path.join(distRoot, rel);
  const safeRoot = path.resolve(distRoot);
  const safeFile = path.resolve(filePath);
  if (!safeFile.startsWith(safeRoot)) {
    return new Response('Forbidden', { status: 403 });
  }

  if (fs.existsSync(safeFile) && fs.statSync(safeFile).isFile()) {
    const body = fs.readFileSync(safeFile);
    return new Response(body, {
      headers: { 'Content-Type': contentType(safeFile) },
    });
  }

  const indexPath = path.join(distRoot, 'index.html');
  if (fs.existsSync(indexPath)) {
    const body = fs.readFileSync(indexPath);
    return new Response(body, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  return new Response('Web control UI not found', { status: 503 });
}

export function webAppEntryPath(webAppPath?: string): string {
  return `${normalizeWebAppPath(webAppPath)}/`;
}
