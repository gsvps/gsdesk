export interface AgentUIState {
  device_id: string;
  online: boolean;
  server_url: string;
  device_name: string;
  default_quality: string;
  clipboard_enabled: boolean;
  download_dir: string;
  auto_accept: boolean;
  launch_at_startup: boolean;
  start_minimized: boolean;
  agent_enabled: boolean;
  otp_idle_refresh_minutes: number;
  close_to_tray: boolean;
  config_path: string;
  install_path?: string;
  agent_ready: boolean;
}

export interface AgentSavePayload {
  server_url: string;
  device_name: string;
  default_quality: string;
  clipboard_enabled: boolean;
  download_dir: string;
  auto_accept: boolean;
  launch_at_startup: boolean;
  start_minimized: boolean;
  permanent_password: string;
  clear_permanent_password: boolean;
  agent_enabled: boolean;
  otp_idle_refresh_minutes: number;
  close_to_tray: boolean;
}

export interface AgentOTPStatus {
  ok?: boolean;
  code?: string;
  expires_in?: number;
  otp_idle_refresh_minutes?: number;
  active_sessions?: number;
  error?: string;
}

export interface AgentActionResult {
  ok: boolean;
  error?: string;
  message?: string;
  code?: string;
  expires_in?: number;
  state?: AgentUIState;
  online?: boolean;
}

declare global {
  interface Window {
    getInitialState?: () => Promise<string> | string;
    refreshAgentStatus?: () => Promise<string> | string;
    copyText?: (text: string) => Promise<string> | string;
    browseDownloadDirGo?: (current: string) => Promise<string> | string;
    generateOTPGo?: () => Promise<string> | string;
    getOTPStatusGo?: () => Promise<string> | string;
    clearPermanentPasswordGo?: () => Promise<string> | string;
    saveSettingsGo?: (raw: string) => Promise<string> | string;
    closeWindowGo?: () => Promise<string> | string;
  }
}

export function hasAgentBridge(): boolean {
  return typeof window.getInitialState === 'function';
}

async function callBridge<T>(fn: () => Promise<string> | string | undefined): Promise<T> {
  if (!fn) throw new Error('Agent bridge unavailable');
  const raw = await fn();
  return JSON.parse(typeof raw === 'string' ? raw : String(raw)) as T;
}

export async function loadAgentState(): Promise<AgentUIState> {
  return callBridge<AgentUIState>(() => window.getInitialState?.());
}

export async function refreshAgentOnline(): Promise<boolean> {
  const data = await callBridge<AgentActionResult>(() => window.refreshAgentStatus?.());
  return Boolean(data.online);
}

export async function saveAgentSettings(payload: AgentSavePayload): Promise<AgentActionResult> {
  return callBridge<AgentActionResult>(() => window.saveSettingsGo?.(JSON.stringify(payload)));
}

export async function generateAgentOTP(): Promise<AgentActionResult> {
  return callBridge<AgentActionResult>(() => window.generateOTPGo?.());
}

export async function getAgentOTPStatus(): Promise<AgentOTPStatus> {
  return callBridge<AgentOTPStatus>(() => window.getOTPStatusGo?.());
}

export async function clearAgentPermanentPassword(): Promise<AgentActionResult> {
  return callBridge<AgentActionResult>(() => window.clearPermanentPasswordGo?.());
}

export async function browseAgentDownloadDir(current: string): Promise<string> {
  if (typeof window.browseDownloadDirGo !== 'function') return current;
  return window.browseDownloadDirGo(current);
}

export async function copyViaBridge(text: string): Promise<void> {
  const data = await callBridge<AgentActionResult>(() => window.copyText?.(text));
  if (!data.ok) throw new Error(data.error || '复制失败');
}

export async function closeDesktopWindow(): Promise<void> {
  if (typeof window.closeWindowGo === 'function') {
    await window.closeWindowGo();
  }
}
