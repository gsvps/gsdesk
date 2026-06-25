export interface LocalDevice {
  id: string;
  display_name: string;
  added_at: number;
}

const STORAGE_KEY = 'gsdesk_local_devices';

export function isValidDeviceId(id: string): boolean {
  return /^\d{8}$/.test(id.trim());
}

export function formatDeviceId(id: string): string {
  const trimmed = id.trim();
  if (/^\d+$/.test(trimmed) && trimmed.length <= 8) {
    return trimmed.padStart(8, '0');
  }
  return trimmed;
}

function dedupeDevices(devices: LocalDevice[]): LocalDevice[] {
  const byId = new Map<string, LocalDevice>();
  for (const item of devices) {
    const id = formatDeviceId(item.id);
    if (!isValidDeviceId(id)) continue;
    const normalized: LocalDevice = {
      id,
      display_name: item.display_name?.trim() || id,
      added_at: item.added_at || 0,
    };
    const existing = byId.get(id);
    if (!existing || normalized.added_at >= existing.added_at) {
      byId.set(id, normalized);
    }
  }
  return Array.from(byId.values()).sort((a, b) => b.added_at - a.added_at);
}

export function loadLocalDevices(): LocalDevice[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as LocalDevice[];
    if (!Array.isArray(parsed)) return [];
    const deduped = dedupeDevices(parsed);
    if (deduped.length !== parsed.length) {
      saveLocalDevices(deduped);
    }
    return deduped;
  } catch {
    return [];
  }
}

export function saveLocalDevices(devices: LocalDevice[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(dedupeDevices(devices)));
}

export function addLocalDevice(id: string, displayName: string): LocalDevice[] {
  const normalizedId = formatDeviceId(id);
  const next = loadLocalDevices().filter((item) => item.id !== normalizedId);
  next.unshift({
    id: normalizedId,
    display_name: displayName.trim() || normalizedId,
    added_at: Date.now(),
  });
  saveLocalDevices(next);
  return next;
}

export function renameLocalDevice(id: string, displayName: string): LocalDevice[] {
  const normalizedId = formatDeviceId(id);
  const next = loadLocalDevices().map((item) =>
    item.id === normalizedId ? { ...item, display_name: displayName.trim() || normalizedId } : item
  );
  saveLocalDevices(next);
  return next;
}

export function removeLocalDevice(id: string): LocalDevice[] {
  const normalizedId = formatDeviceId(id);
  const next = loadLocalDevices().filter((item) => item.id !== normalizedId);
  saveLocalDevices(next);
  return next;
}
