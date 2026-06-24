import type { SignalMessage } from '@clouddesk/protocol';
import type { Env } from '../../../worker/src/env.js';
import { DeviceRoomHandler } from './device-room.js';
import { SessionRoomHandler } from './session-room.js';

type DoId = DurableObjectId | { name?: string; toString(): string };

class RoomStub {
  constructor(private handler: { fetch(request: Request): Promise<Response> }) {}

  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const request = input instanceof Request ? input : new Request(input, init);
    return this.handler.fetch(request);
  }
}

export class RoomRegistry {
  private env!: Env;
  private deviceRooms = new Map<string, DeviceRoomHandler>();
  private sessionRooms = new Map<string, SessionRoomHandler>();

  setEnv(env: Env) {
    this.env = env;
  }

  getDeviceRoomHandler(deviceId: string): DeviceRoomHandler {
    let room = this.deviceRooms.get(deviceId);
    if (!room) {
      room = new DeviceRoomHandler(deviceId, this.env, this);
      this.deviceRooms.set(deviceId, room);
    }
    return room;
  }

  getSessionRoom(sessionId: string): SessionRoomHandler {
    let room = this.sessionRooms.get(sessionId);
    if (!room) {
      room = new SessionRoomHandler(sessionId, this.env, this);
      this.sessionRooms.set(sessionId, room);
    }
    return room;
  }

  createDeviceNamespace(): DurableObjectNamespace {
    return {
      idFromName: (name: string) => ({ name, toString: () => name }) as DurableObjectId,
      idFromString: (id: string) => ({ name: id, toString: () => id }) as DurableObjectId,
      newUniqueId: () => ({ toString: () => crypto.randomUUID() }) as DurableObjectId,
      get: (id: DoId) => {
        const name = typeof id === 'object' && 'name' in id && id.name ? id.name : id.toString();
        return new RoomStub(this.getDeviceRoomHandler(name));
      },
    };
  }

  createSessionNamespace(): DurableObjectNamespace {
    return {
      idFromName: (name: string) => ({ name, toString: () => name }) as DurableObjectId,
      idFromString: (id: string) => ({ name: id, toString: () => id }) as DurableObjectId,
      newUniqueId: () => ({ toString: () => crypto.randomUUID() }) as DurableObjectId,
      get: (id: DoId) => {
        const name = typeof id === 'object' && 'name' in id && id.name ? id.name : id.toString();
        return new RoomStub(this.getSessionRoom(name));
      },
    };
  }

  relayToDevice(deviceId: string, message: SignalMessage) {
    this.getDeviceRoomHandler(deviceId).relayMessage(message);
  }
}
