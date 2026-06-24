import type { SignalMessage } from '@clouddesk/protocol';
import type { SessionCreateResult } from './api';
import { resolveSignalUrl } from './signal-url';

export interface ScreenFrameMessage {
  type: 'screen_frame';
  /** base64（JSON 信令路径）；二进制路径请用 jpegBytes */
  data: string;
  jpegBytes?: Uint8Array;
  width: number;
  height: number;
  format: 'jpeg';
}

export interface ScreenInfoMessage {
  type: 'screen_info';
  width: number;
  height: number;
}

export interface ClipboardMessage {
  type: 'clipboard';
  content: string;
}

export interface FileReadyMessage {
  type: 'file_ready';
  file_id: string;
  filename: string;
  size?: number;
}

export interface FileAgentDoneMessage {
  type: 'file_agent_done';
  file_id: string;
  filename: string;
  path?: string;
}

export interface FileErrorMessage {
  type: 'file_error';
  message: string;
}

export interface RemoteSessionOptions {
  signalUrl: string;
  signalPath?: string;
  wsToken?: string;
  sessionId?: string;
  onVideoTrack?: (stream: MediaStream) => void;
  onScreenFrame?: (frame: ScreenFrameMessage) => void;
  onScreenInfo?: (info: ScreenInfoMessage) => void;
  onConnectionStateChange?: (state: RTCPeerConnectionState) => void;
  onUnexpectedDisconnect?: () => void;
  onSignal?: (message: SignalMessage) => void;
  onStatus?: (status: string) => void;
  onError?: (message: string) => void;
  onFileReady?: (msg: FileReadyMessage) => void;
  onFileAgentDone?: (msg: FileAgentDoneMessage) => void;
  onFileError?: (msg: FileErrorMessage) => void;
  onClipboard?: (msg: ClipboardMessage) => void;
}

export class RemoteSession {
  private pc: RTCPeerConnection;
  private ws: WebSocket | null = null;
  private dataChannel: RTCDataChannel | null = null;
  private accepted = false;
  private closed = false;
  private acceptTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private options: RemoteSessionOptions) {
    this.pc = this.createPeerConnection();
  }

  async connect(): Promise<void> {
    await this.openSignaling();
  }

  async reconnect(session: SessionCreateResult): Promise<void> {
    this.teardownMedia(false);
    this.options.signalUrl = session.signal_url;
    this.options.signalPath = session.signal_path;
    this.options.wsToken = session.ws_token;
    this.options.sessionId = session.session_id;
    this.accepted = false;
    this.closed = false;
    this.pc = this.createPeerConnection();
    await this.openSignaling();
  }

  private createPeerConnection(): RTCPeerConnection {
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    });

    pc.ontrack = (event) => {
      if (event.streams[0]) {
        this.options.onVideoTrack?.(event.streams[0]);
      }
    };

    pc.onicecandidate = (event) => {
      if (event.candidate && this.accepted) {
        this.sendSignal({
          type: 'ice_candidate',
          candidate: JSON.stringify(event.candidate.toJSON()),
        });
      }
    };

    pc.onconnectionstatechange = () => {
      this.options.onConnectionStateChange?.(pc.connectionState);
    };

    const channel = pc.createDataChannel('control', { ordered: true });
    channel.onmessage = (event) => {
      void this.handleControlMessage(event.data);
    };
    this.dataChannel = channel;
    return pc;
  }

  private async openSignaling(): Promise<void> {
    const wsUrl = resolveSignalUrl({
      session_id: this.options.sessionId ?? '',
      signal_url: this.options.signalUrl,
      signal_path: this.options.signalPath,
      ws_token: this.options.wsToken ?? '',
      nonce: '',
    });
    const ws = new WebSocket(wsUrl);
    this.ws = ws;

    ws.onmessage = (event) => {
      const message = JSON.parse(event.data as string) as SignalMessage;
      this.options.onSignal?.(message);
      void this.handleSignal(message).catch((err) => {
        const text = err instanceof Error ? err.message : '信令处理失败';
        this.options.onError?.(text);
      });
    };

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      ws.onopen = () => {
        if (!settled) {
          settled = true;
          resolve();
        }
      };
      ws.onerror = () => {
        if (!settled && !this.closed) {
          settled = true;
          reject(new Error(`信令连接失败: ${wsUrl}`));
        }
      };
      ws.onclose = (ev) => {
        if (!settled && !this.closed) {
          settled = true;
          reject(new Error(`信令连接关闭 (${ev.code}): ${wsUrl}`));
          return;
        }
        if (this.accepted && !this.closed) {
          this.options.onUnexpectedDisconnect?.();
        }
      };
    });

    this.options.onStatus?.('等待 Agent 确认连接...');
    this.acceptTimer = setTimeout(() => {
      if (!this.accepted) {
        this.options.onError?.('等待 Agent 确认超时，请从设备列表重新发起连接');
      }
    }, 60_000);
  }

  private async startWebRTC() {
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    this.sendSignal({ type: 'webrtc_offer', sdp: offer.sdp ?? undefined });
    this.options.onStatus?.('正在建立 WebRTC 连接...');
  }

  private async handleSignal(message: SignalMessage) {
    if (message.type === 'connection_accept') {
      if (this.accepted) return;
      this.accepted = true;
      if (this.acceptTimer) {
        clearTimeout(this.acceptTimer);
        this.acceptTimer = null;
      }
      this.options.onStatus?.('Agent 已接受，开始 WebRTC 协商...');
      await this.startWebRTC();
      return;
    }

    if (message.type === 'connection_reject') {
      throw new Error('对方拒绝了连接请求');
    }

    if (message.type === 'error') {
      const reason = message.message ?? '连接被拒绝';
      if (reason.includes('nonce_mismatch') || reason.includes('nonce_expired')) {
        throw new Error('连接验证失败，请从设备列表重新发起连接');
      }
      throw new Error(reason.startsWith('连接确认失败') ? reason : `连接确认失败: ${reason}`);
    }

    if (message.type === 'webrtc_answer' && message.sdp) {
      await this.pc.setRemoteDescription({ type: 'answer', sdp: message.sdp });
    }

    if (message.type === 'ice_candidate' && message.candidate) {
      const candidate = JSON.parse(message.candidate) as RTCIceCandidateInit;
      await this.pc.addIceCandidate(candidate);
    }
  }

  private async handleControlMessage(data: string | ArrayBuffer | Blob) {
    if (data instanceof ArrayBuffer) {
      this.handleBinaryFrame(data);
      return;
    }

    let text: string;
    if (typeof data === 'string') {
      text = data;
    } else if (typeof Blob !== 'undefined' && data instanceof Blob) {
      text = await data.text();
    } else {
      return;
    }

    try {
      const message = JSON.parse(text) as
        | ScreenFrameMessage
        | ScreenInfoMessage
        | FileReadyMessage
        | FileAgentDoneMessage
        | FileErrorMessage
        | ClipboardMessage
        | { type: string };
      if (message.type === 'screen_frame') {
        this.options.onScreenFrame?.(message as ScreenFrameMessage);
      }
      if (message.type === 'screen_info') {
        this.options.onScreenInfo?.(message as ScreenInfoMessage);
      }
      if (message.type === 'file_ready') {
        this.options.onFileReady?.(message as FileReadyMessage);
      }
      if (message.type === 'file_agent_done') {
        this.options.onFileAgentDone?.(message as FileAgentDoneMessage);
      }
      if (message.type === 'file_error') {
        this.options.onFileError?.(message as FileErrorMessage);
      }
      if (message.type === 'clipboard') {
        this.options.onClipboard?.(message as ClipboardMessage);
      }
    } catch {
      // ignore non-json control payloads
    }
  }

  private handleBinaryFrame(data: ArrayBuffer) {
    const view = new DataView(data);
    if (data.byteLength < 8) return;
    if (
      view.getUint8(0) !== 0x43 ||
      view.getUint8(1) !== 0x44 ||
      view.getUint8(2) !== 0x53 ||
      view.getUint8(3) !== 0x46
    ) {
      return;
    }
    const width = view.getUint16(4);
    const height = view.getUint16(6);
    const jpegBytes = new Uint8Array(data.slice(8));
    this.options.onScreenFrame?.({
      type: 'screen_frame',
      data: '',
      jpegBytes,
      width,
      height,
      format: 'jpeg',
    });
  }

  sendControl(payload: Record<string, unknown>) {
    if (this.dataChannel?.readyState === 'open') {
      this.dataChannel.send(JSON.stringify(payload));
    }
  }

  private sendSignal(message: SignalMessage) {
    this.ws?.send(JSON.stringify(message));
  }

  private teardownMedia(markClosed: boolean) {
    if (markClosed) {
      this.closed = true;
    }
    if (this.acceptTimer) {
      clearTimeout(this.acceptTimer);
      this.acceptTimer = null;
    }
    try {
      this.ws?.close();
    } catch {
      /* ignore */
    }
    this.ws = null;
    try {
      this.pc.close();
    } catch {
      /* ignore */
    }
    this.dataChannel = null;
  }

  close() {
    this.teardownMedia(true);
  }
}
