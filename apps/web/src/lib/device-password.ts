import type { DeviceInfo } from './api';

export type AccessPasswordType = 'permanent' | 'otp';

const REMEMBER_PREFIX = 'gsdesk:remembered-password:';

export function getRememberedPassword(deviceId: string): string | null {
  try {
    const raw = localStorage.getItem(`${REMEMBER_PREFIX}${deviceId}`);
    return raw || null;
  } catch {
    return null;
  }
}

export function setRememberedPassword(deviceId: string, password: string | null) {
  const key = `${REMEMBER_PREFIX}${deviceId}`;
  if (!password) {
    localStorage.removeItem(key);
    return;
  }
  localStorage.setItem(key, password);
}

export function shouldShowPasswordModal(device: DeviceInfo): boolean {
  return Boolean(device.access_protected || device.access_password_set || device.otp_active);
}

export function defaultPasswordType(device: DeviceInfo): AccessPasswordType {
  if (device.access_password_set) return 'permanent';
  if (device.otp_active) return 'otp';
  return 'permanent';
}
