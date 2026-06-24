export interface User {
  id: string;
  email: string;
  name: string | null;
  avatar: string | null;
}

export interface Device {
  id: string;
  userId: string;
  deviceName: string;
  hostname: string;
  os: string;
  unattendedEnabled: boolean;
  online: boolean;
  lastSeen: number | null;
  createdAt: number;
}

export interface Session {
  id: string;
  userId: string;
  deviceId: string;
  status: string;
  startedAt: number | null;
  endedAt: number | null;
}
