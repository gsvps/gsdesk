import { isDesktopClient } from './runtime-config';

declare global {
  interface Window {
    notifyUIReadyGo?: () => Promise<string> | string;
    setWindowFullscreenGo?: (enabled: string) => Promise<string> | string;
    isWindowFullscreenGo?: () => Promise<string> | string;
  }
}

function parseJSON<T>(raw: string | undefined): T {
  return JSON.parse(typeof raw === 'string' ? raw : String(raw)) as T;
}

export async function notifyUIReady(): Promise<void> {
  if (typeof window.notifyUIReadyGo !== 'function') return;
  await window.notifyUIReadyGo();
}

export async function setNativeFullscreen(fullscreen: boolean): Promise<boolean> {
  if (typeof window.setWindowFullscreenGo !== 'function') {
    if (fullscreen) {
      await document.documentElement.requestFullscreen().catch(() => undefined);
    } else if (document.fullscreenElement) {
      await document.exitFullscreen().catch(() => undefined);
    }
    return Boolean(document.fullscreenElement);
  }
  const result = parseJSON<{ ok: boolean; fullscreen?: boolean }>(
    await window.setWindowFullscreenGo(fullscreen ? 'true' : 'false')
  );
  return Boolean(result.fullscreen);
}

export async function isNativeFullscreen(): Promise<boolean> {
  if (typeof window.isWindowFullscreenGo !== 'function') {
    return Boolean(document.fullscreenElement);
  }
  const result = parseJSON<{ ok: boolean; fullscreen?: boolean }>(await window.isWindowFullscreenGo());
  return Boolean(result.fullscreen);
}

export function supportsNativeFullscreen(): boolean {
  return isDesktopClient() && typeof window.setWindowFullscreenGo === 'function';
}
