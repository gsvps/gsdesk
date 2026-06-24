/** WebSocket 信令与控制消息类型 */

export type SignalMessageType =
  | 'heartbeat'
  | 'connection_request'
  | 'connection_accept'
  | 'connection_reject'
  | 'webrtc_offer'
  | 'webrtc_answer'
  | 'ice_candidate'
  | 'session_close'
  | 'error';

export interface SignalMessage {
  type: SignalMessageType;
  session_id?: string;
  device_id?: string;
  sdp?: string;
  candidate?: string;
  sdp_mid?: string | null;
  sdp_mline_index?: number | null;
  timestamp?: number;
  nonce?: string;
  signature?: string;
  message?: string;
}

export type DataChannelMessageType =
  | 'mouse_move'
  | 'mouse_click'
  | 'key_press'
  | 'clipboard'
  | 'screen_frame'
  | 'screen_info';

export interface MouseMoveMessage {
  type: 'mouse_move';
  x: number;
  y: number;
}

export interface MouseClickMessage {
  type: 'mouse_click';
  button: 'left' | 'right' | 'middle';
  action: 'down' | 'up';
}

export interface KeyPressMessage {
  type: 'key_press';
  key: string;
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
}

export interface ClipboardMessage {
  type: 'clipboard';
  content: string;
}

export type DataChannelMessage =
  | MouseMoveMessage
  | MouseClickMessage
  | KeyPressMessage
  | ClipboardMessage;

export type SessionStatus = 'pending' | 'active' | 'closed' | 'rejected';
