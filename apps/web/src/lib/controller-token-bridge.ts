declare global {
  interface Window {
    getControllerTokenGo?: () => Promise<string> | string;
    saveControllerTokenGo?: (token: string) => Promise<string> | string;
  }
}

interface ControllerTokenResult {
  ok?: boolean;
  token?: string;
  error?: string;
}

async function callBridge<T>(fn: () => Promise<string> | string | undefined): Promise<T> {
  if (!fn) throw new Error('Controller token bridge unavailable');
  const raw = await fn();
  return JSON.parse(typeof raw === 'string' ? raw : String(raw)) as T;
}

export function hasControllerTokenBridge(): boolean {
  return typeof window.getControllerTokenGo === 'function';
}

export async function loadControllerTokenFromBridge(): Promise<string | null> {
  if (!hasControllerTokenBridge()) return null;
  const data = await callBridge<ControllerTokenResult>(() => window.getControllerTokenGo?.());
  const token = data.token?.trim();
  return token || null;
}

export async function saveControllerTokenToBridge(token: string): Promise<void> {
  if (!hasControllerTokenBridge()) return;
  const data = await callBridge<ControllerTokenResult>(() => window.saveControllerTokenGo?.(token));
  if (!data.ok) throw new Error(data.error || '保存控制器令牌失败');
}

export async function clearControllerTokenBridge(): Promise<void> {
  await saveControllerTokenToBridge('');
}
