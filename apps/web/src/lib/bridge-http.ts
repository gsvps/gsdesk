/**
 * Agent 本地 UI 通过 HTTP 桥接（浏览器模式，127.0.0.1:19527）。
 */
const AGENT_UI_PORT = '19527';

export function isAgentLocalServer(): boolean {
  if (typeof window === 'undefined') return false;
  const { hostname, port } = window.location;
  return hostname === '127.0.0.1' && port === AGENT_UI_PORT;
}

function bridgeURL(name: string, query?: Record<string, string>): string {
  const qs =
    query && Object.keys(query).length
      ? '?' + new URLSearchParams(query).toString()
      : '';
  return `/__clouddesk/bridge/${name}${qs}`;
}

async function bridgeGet(name: string, query?: Record<string, string>): Promise<string> {
  const res = await fetch(bridgeURL(name, query));
  if (!res.ok) throw new Error(`bridge ${name} failed: HTTP ${res.status}`);
  return res.text();
}

async function bridgePost(name: string, body?: unknown): Promise<string> {
  const res = await fetch(bridgeURL(name), {
    method: 'POST',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`bridge ${name} failed: HTTP ${res.status}`);
  return res.text();
}

async function parsePath(raw: string): Promise<string> {
  try {
    return JSON.parse(raw) as string;
  } catch {
    return raw;
  }
}

export function installAgentHttpBridge(): void {
  if (!isAgentLocalServer()) return;

  window.getRuntimeConfig = () => bridgeGet('getRuntimeConfig');
  window.getInitialState = () => bridgeGet('getInitialState');
  window.refreshAgentStatus = () => bridgeGet('refreshAgentStatus');
  window.getControllerTokenGo = () => bridgeGet('getControllerTokenGo');
  window.getOTPStatusGo = () => bridgeGet('getOTPStatusGo');
  window.getInstallStateGo = () => bridgeGet('getInstallStateGo');
  window.getInstallProgressGo = () => bridgeGet('getInstallProgressGo');
  window.getClientVersionGo = () => bridgeGet('getClientVersionGo');
  window.checkUpdateGo = () => bridgeGet('checkUpdateGo');
  window.notifyUIReadyGo = () => bridgeGet('notifyUIReadyGo');
  window.isWindowFullscreenGo = () => bridgeGet('isWindowFullscreenGo');

  window.saveControllerTokenGo = (token: string) => bridgePost('saveControllerTokenGo', { token });
  window.reconnectAgentGo = () => bridgePost('reconnectAgentGo');
  window.copyText = (text: string) => bridgePost('copyText', { text });
  window.generateOTPGo = () => bridgePost('generateOTPGo');
  window.clearPermanentPasswordGo = () => bridgePost('clearPermanentPasswordGo');
  window.saveSettingsGo = (raw: string) => bridgePost('saveSettingsGo', raw);
  window.closeWindowGo = () => bridgePost('closeWindowGo');
  window.runInstallGo = (raw: string) => bridgePost('runInstallGo', raw);
  window.openExternalGo = (url: string) => bridgePost('openExternalGo', { url });
  window.setWindowFullscreenGo = (enabled: string) => bridgePost('setWindowFullscreenGo', { enabled });

  window.browseDownloadDirGo = async (current: string) => parsePath(await bridgeGet('browseDownloadDirGo', { current }));
  window.browseInstallDirGo = async (current: string) => parsePath(await bridgeGet('browseInstallDirGo', { current }));
}
