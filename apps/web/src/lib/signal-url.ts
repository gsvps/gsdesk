import type { SessionCreateResult } from './api';
import { getRuntimeConfig } from './runtime-config';

/** 开发环境通过 Vite 代理 WebSocket，避免浏览器直连 8787 失败 */
export function resolveSignalUrl(session: SessionCreateResult): string {
  const path =
    session.signal_path ??
    (() => {
      try {
        const u = new URL(session.signal_url);
        return `${u.pathname}${u.search}`;
      } catch {
        return session.signal_url;
      }
    })();

  if (path.startsWith('ws://') || path.startsWith('wss://')) {
    return path;
  }

  const { apiBase } = getRuntimeConfig();
  if (apiBase && session.signal_url) {
    return session.signal_url;
  }

  if (import.meta.env.DEV) {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}${path.startsWith('/') ? path : `/${path}`}`;
  }

  if (session.signal_url) {
    return session.signal_url;
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}${path.startsWith('/') ? path : `/${path}`}`;
}
