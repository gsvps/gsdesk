import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import FileTransferPanel from '../components/FileTransferPanel';
import FileTransferStatusBar from '../components/FileTransferStatusBar';
import MobileKeyboard from '../components/MobileKeyboard';
import ReconnectDialog from '../components/ReconnectDialog';
import TouchCursorOverlay, { type TouchCursorOverlayHandle } from '../components/TouchCursorOverlay';
import { apiFetch, prepareSessionReconnect, type SessionCreateResult } from '../lib/api';
import {
  applyRemoteClipboard,
  createClipboardSyncState,
  isEditableTarget,
  isFileDragEvent,
  pasteClipboardToRemote,
} from '../lib/clipboard-sync';
import {
  isTouchDevice,
  QUALITY_OPTIONS,
  type QualityPreset,
} from '../lib/remote-settings';
import {
  centerCursorInContent,
  clampCursorInContent,
  computeContentBounds,
  contentToRemote,
  pointerDistance,
  TOUCH_LONG_PRESS_MS,
  TOUCH_TAP_THRESHOLD_PX,
  type ContentBounds,
  type FitMode as TouchFitMode,
} from '../lib/touch-mouse';
import {
  adjustViewScale,
  normalizeViewTransform,
  pinchMidpoint,
  pinchDistance,
  pinchViewTransform,
  startPinchSession,
  TWO_FINGER_TAP_MAX_MID_MOVE_PX,
  TWO_FINGER_TAP_MAX_PINCH_RATIO,
  VIEW_SCALE_STEP,
  type PinchSession,
  type ViewTransform,
} from '../lib/touch-viewport';
import type { FileTransferUiState } from '../lib/file-transfer-ui';
import { downloadSessionFile, progressFromLoaded, sendFileToAgent } from '../lib/session-files';
import { RemoteSession, type ScreenInfoMessage } from '../lib/webrtc';

type FitMode = 'contain' | 'cover';

const PEER_STATE_LABEL: Record<RTCPeerConnectionState, string> = {
  new: '正在初始化...',
  connecting: '正在连接...',
  connected: '已连接',
  disconnected: '未连接',
  failed: '连接失败',
  closed: '连接已关闭',
};

const RECONNECT_TIMEOUT_SEC = 30;

interface ReconnectPromptState {
  open: boolean;
  secondsLeft: number;
  error: string;
  busy: boolean;
}

export default function RemotePage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const viewportRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sessionRef = useRef<RemoteSession | null>(null);
  const screenSizeRef = useRef({ width: 1920, height: 1080 });
  const pendingMoveRef = useRef<{ x: number; y: number } | null>(null);
  const moveRafRef = useRef<number>(0);
  const pointerActiveRef = useRef(false);
  const fitModeRef = useRef<FitMode>('contain');
  const keyboardEnabledRef = useRef(false);
  const clipboardSyncRef = useRef(createClipboardSyncState());
  const dragDepthRef = useRef(0);
  const wasConnectedRef = useRef(false);
  const userDisconnectRef = useRef(false);
  const reconnectBusyRef = useRef(false);
  const reconnectPromptRef = useRef<ReconnectPromptState | null>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const touchCursorPosRef = useRef<{ x: number; y: number } | null>(null);
  const touchCursorRafRef = useRef(0);
  const touchGestureRef = useRef<'idle' | 'pending' | 'moving' | 'dragging'>('idle');
  const touchFingerStartRef = useRef({ x: 0, y: 0 });
  const touchFingerLastRef = useRef({ x: 0, y: 0 });
  const touchLongPressTimerRef = useRef(0);
  const touchMouseDownRef = useRef(false);
  const cursorOverlayRef = useRef<TouchCursorOverlayHandle>(null);
  const touchPointersRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchSessionRef = useRef<PinchSession | null>(null);
  const viewTransformRef = useRef<ViewTransform>({ scale: 1, panX: 0, panY: 0 });
  const twoFingerGestureRef = useRef<{
    mode: 'none' | 'tap-candidate' | 'pinch';
    startDistance: number;
    startMidX: number;
    startMidY: number;
  }>({ mode: 'none', startDistance: 0, startMidX: 0, startMidY: 0 });
  const [status, setStatus] = useState('正在建立连接...');
  const [error, setError] = useState('');
  const [useVideoTrack, setUseVideoTrack] = useState(false);
  const [fitMode, setFitMode] = useState<FitMode>(() => {
    const saved = sessionStorage.getItem('gsdesk:fit-mode');
    return saved === 'cover' ? 'cover' : 'contain';
  });
  const [quality, setQuality] = useState<QualityPreset>(() => {
    const saved = sessionStorage.getItem('gsdesk:quality');
    return saved === 'low' || saved === 'medium' || saved === 'high' || saved === 'ultra' || saved === '4k' ? saved : 'high';
  });
  const [keyboardEnabled, setKeyboardEnabled] = useState(false);
  const [showFilePanel, setShowFilePanel] = useState(false);
  const [fileTransfer, setFileTransfer] = useState<FileTransferUiState | null>(null);
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const [isTouch] = useState(() => isTouchDevice());
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [reconnectPrompt, setReconnectPrompt] = useState<ReconnectPromptState | null>(null);
  const [reconnectDismissed, setReconnectDismissed] = useState(false);
  const [touchPressing, setTouchPressing] = useState(false);
  const [contentLayout, setContentLayout] = useState<ContentBounds | null>(null);
  const [viewTransform, setViewTransform] = useState<ViewTransform>({ scale: 1, panX: 0, panY: 0 });

  useEffect(() => {
    reconnectPromptRef.current = reconnectPrompt;
  }, [reconnectPrompt]);

  const openReconnectPrompt = useCallback(() => {
    if (userDisconnectRef.current || reconnectPromptRef.current?.open) return;
    setReconnectDismissed(false);
    setReconnectPrompt({
      open: true,
      secondsLeft: RECONNECT_TIMEOUT_SEC,
      error: '',
      busy: false,
    });
  }, []);

  const cancelReconnectPrompt = useCallback(() => {
    setReconnectPrompt(null);
    setReconnectDismissed(true);
  }, []);

  const performReconnect = useCallback(async () => {
    if (!sessionId || userDisconnectRef.current || reconnectBusyRef.current) return;
    reconnectBusyRef.current = true;
    setReconnectPrompt((prev) => ({
      open: true,
      secondsLeft: prev?.secondsLeft ?? RECONNECT_TIMEOUT_SEC,
      error: '',
      busy: true,
    }));
    setStatus('正在重新连接...');
    setError('');
    try {
      const sessionInfo = await prepareSessionReconnect(sessionId);
      const remote = sessionRef.current;
      if (!remote) {
        throw new Error('会话未就绪，请返回设备列表重新连接');
      }
      await remote.reconnect(sessionInfo);
      setReconnectPrompt(null);
      setReconnectDismissed(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : '重连失败';
      setReconnectPrompt({
        open: true,
        busy: false,
        error: message,
        secondsLeft: RECONNECT_TIMEOUT_SEC,
      });
      setError(message);
      setStatus('连接已断开');
    } finally {
      reconnectBusyRef.current = false;
    }
  }, [sessionId]);

  useEffect(() => {
    fitModeRef.current = fitMode;
    sessionStorage.setItem('gsdesk:fit-mode', fitMode);
  }, [fitMode]);

  useEffect(() => {
    keyboardEnabledRef.current = keyboardEnabled;
  }, [keyboardEnabled]);

  useEffect(() => {
    sessionStorage.setItem('gsdesk:quality', quality);
    sessionRef.current?.sendControl({ type: 'set_quality', preset: quality });
  }, [quality]);

  useEffect(() => {
    if (!reconnectPrompt?.open || reconnectPrompt.busy) return;
    if (reconnectPrompt.secondsLeft <= 0) {
      void performReconnect();
      return;
    }
    const timer = window.setTimeout(() => {
      setReconnectPrompt((prev) => {
        if (!prev?.open || prev.busy) return prev;
        return { ...prev, secondsLeft: prev.secondsLeft - 1 };
      });
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [reconnectPrompt?.open, reconnectPrompt?.busy, reconnectPrompt?.secondsLeft, performReconnect]);

  useEffect(() => {
    if (!status.startsWith('已连接')) return;
    sessionRef.current?.sendControl({ type: 'set_quality', preset: quality });
  }, [status, quality]);

  const sendKeyPress = useCallback((key: string, mods: { ctrl: boolean; alt: boolean; shift: boolean }) => {
    sessionRef.current?.sendControl({
      type: 'key_press',
      key,
      ctrl: mods.ctrl,
      alt: mods.alt,
      shift: mods.shift,
    });
  }, []);

  useEffect(() => {
    function onFullscreenChange() {
      setIsFullscreen(Boolean(document.fullscreenElement));
    }
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  const drawFrame = useCallback((frame: { data: string; jpegBytes?: Uint8Array; width: number; height: number }) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { width, height } = frame;
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const paint = (source: CanvasImageSource) => {
      ctx.drawImage(source, 0, 0, width, height);
    };

    if (frame.jpegBytes && frame.jpegBytes.byteLength > 0) {
      const bytes = new Uint8Array(frame.jpegBytes);
      void createImageBitmap(new Blob([bytes], { type: 'image/jpeg' }))
        .then((bitmap) => {
          paint(bitmap);
          bitmap.close();
        })
        .catch(() => {
          /* drop corrupt frame */
        });
      return;
    }

    if (!frame.data) return;
    const img = new Image();
    img.onload = () => paint(img);
    img.src = `data:image/jpeg;base64,${frame.data}`;
  }, []);

  useEffect(() => {
    if (!sessionId) return;

    let aborted = false;
    let remote: RemoteSession | null = null;
    userDisconnectRef.current = false;
    wasConnectedRef.current = false;
    setReconnectPrompt(null);
    setReconnectDismissed(false);

    const maybePromptReconnect = (state: RTCPeerConnectionState) => {
      if (aborted || userDisconnectRef.current || !wasConnectedRef.current) return;
      if (state === 'disconnected' || state === 'failed') {
        openReconnectPrompt();
      }
    };

    async function start() {
      const raw = sessionStorage.getItem(`session:${sessionId}`);
      if (!raw) {
        setError('会话信息不存在，请从设备列表重新发起连接');
        return;
      }

      setError('');
      setStatus('正在建立连接...');
      setUseVideoTrack(false);

      const freshKey = `session:${sessionId}:fresh`;
      const isFreshVisit = sessionStorage.getItem(freshKey) === '1';
      if (isFreshVisit) {
        sessionStorage.removeItem(freshKey);
      } else {
        setError('会话已失效，请返回设备列表重新点击「连接」');
        setStatus('未连接');
        return;
      }

      const sessionInfo = JSON.parse(raw) as SessionCreateResult;
      remote = new RemoteSession({
        signalUrl: sessionInfo.signal_url,
        signalPath: sessionInfo.signal_path,
        wsToken: sessionInfo.ws_token,
        sessionId: sessionInfo.session_id,
        onVideoTrack: (stream) => {
          if (aborted) return;
          setError('');
          setUseVideoTrack(true);
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            void videoRef.current.play().catch(() => undefined);
          }
          setStatus('已连接 (VP8)');
        },
        onScreenFrame: (frame) => {
          if (aborted) return;
          setError('');
          setUseVideoTrack(false);
          screenSizeRef.current = { width: frame.width, height: frame.height };
          drawFrame(frame);
          setStatus('已连接 (JPEG · 可调画质)');
        },
        onScreenInfo: (info: ScreenInfoMessage) => {
          screenSizeRef.current = { width: info.width, height: info.height };
        },
        onConnectionStateChange: (state) => {
          if (aborted) return;
          if (state === 'connected') {
            wasConnectedRef.current = true;
            setReconnectPrompt(null);
            setReconnectDismissed(false);
            setError('');
            setStatus((s) => (s.startsWith('已连接') ? s : '已连接'));
          } else if (state === 'failed') {
            setError('WebRTC 连接失败');
            maybePromptReconnect(state);
          } else if (state === 'disconnected') {
            setStatus(PEER_STATE_LABEL[state] ?? `连接状态: ${state}`);
            maybePromptReconnect(state);
          } else {
            setStatus(PEER_STATE_LABEL[state] ?? `连接状态: ${state}`);
          }
        },
        onUnexpectedDisconnect: () => {
          if (aborted) return;
          setStatus('连接已断开');
          maybePromptReconnect('disconnected');
        },
        onStatus: (next) => {
          if (!aborted) setStatus(next);
        },
        onError: (message) => {
          if (!aborted) setError(message);
        },
        onFileReady: (msg) => {
          if (aborted || !sessionId) return;
          setFileTransfer({ message: `正在下载 ${msg.filename}…`, progress: 0 });
          void downloadSessionFile(sessionId, msg.file_id, msg.filename, (loaded, total) => {
            if (!aborted) {
              setFileTransfer({
                message: `正在下载 ${msg.filename}…`,
                progress: progressFromLoaded(loaded, total),
              });
            }
          })
            .then(() => {
              if (!aborted) {
                setFileTransfer({ message: `已下载：${msg.filename}`, progress: 100 });
              }
            })
            .catch((err) => {
              if (!aborted) {
                setFileTransfer({
                  message: err instanceof Error ? err.message : '下载失败',
                  progress: 100,
                });
              }
            });
        },
        onFileAgentDone: (msg) => {
          if (!aborted) {
            setFileTransfer({ message: `已保存到远程：${msg.path ?? msg.filename}`, progress: 100 });
          }
        },
        onFileError: (msg) => {
          if (!aborted) {
            setFileTransfer({ message: `文件传输失败：${msg.message}`, progress: 100 });
          }
        },
        onClipboard: (msg) => {
          if (aborted) return;
          void applyRemoteClipboard(msg.content, clipboardSyncRef.current).then((ok) => {
            if (ok) setFileTransfer({ message: '剪贴板已从远程同步', progress: 100 });
          });
        },
      });

      sessionRef.current = remote;
      try {
        await remote.connect();
      } catch (err) {
        if (!aborted) {
          setError(err instanceof Error ? err.message : '连接失败');
        }
      }
    }

    void start();

    return () => {
      aborted = true;
      sessionRef.current = null;
      remote?.close();
    };
  }, [sessionId, drawFrame, openReconnectPrompt]);

  useEffect(() => {
    if (isTouch) return;

    function onKeyDown(e: KeyboardEvent) {
      if (isEditableTarget(e.target)) return;

      if (!isTouch && e.ctrlKey && !e.altKey && e.key.toLowerCase() === 'v') {
        e.preventDefault();
        void pasteClipboardToRemote(
          (payload) => sessionRef.current?.sendControl(payload),
          clipboardSyncRef.current
        );
        return;
      }

      e.preventDefault();
      sendKeyPress(e.key, { ctrl: e.ctrlKey, alt: e.altKey, shift: e.shiftKey });
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isTouch, sendKeyPress]);

  async function toggleFullscreen() {
    const target = viewportRef.current ?? document.documentElement;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await target.requestFullscreen();
      }
    } catch {
      /* browser may block without user gesture */
    }
    setIsFullscreen(Boolean(document.fullscreenElement));
  }

  async function handleFileDrop(e: React.DragEvent<HTMLElement>) {
    e.preventDefault();
    dragDepthRef.current = 0;
    setIsDraggingFiles(false);
    if (!sessionId || !status.startsWith('已连接')) return;

    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;

    for (const file of files) {
      try {
        setFileTransfer({ message: `正在上传 ${file.name}…`, progress: 0 });
        await sendFileToAgent(
          sessionId,
          file,
          (payload) => sessionRef.current?.sendControl(payload) ?? false,
          (loaded, total) => {
            setFileTransfer({
              message: `正在上传 ${file.name}…`,
              progress: progressFromLoaded(loaded, total),
            });
          }
        );
        setFileTransfer({ message: `已发送到远程：${file.name}`, progress: 100 });
      } catch (err) {
        setFileTransfer({
          message: err instanceof Error ? err.message : '上传失败',
          progress: 100,
        });
        break;
      }
    }
  }

  function handleDragEnter(e: React.DragEvent<HTMLElement>) {
    if (!isFileDragEvent(e)) return;
    e.preventDefault();
    dragDepthRef.current += 1;
    setIsDraggingFiles(true);
  }

  function handleDragLeave(e: React.DragEvent<HTMLElement>) {
    if (!isFileDragEvent(e)) return;
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setIsDraggingFiles(false);
  }

  function handleDragOver(e: React.DragEvent<HTMLElement>) {
    if (!isFileDragEvent(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }

  const dropHandlers = {
    onDragEnter: handleDragEnter,
    onDragLeave: handleDragLeave,
    onDragOver: handleDragOver,
    onDrop: (e: React.DragEvent<HTMLElement>) => void handleFileDrop(e),
  };

  async function disconnectSession() {
    if (!sessionId || disconnecting) return;
    userDisconnectRef.current = true;
    setReconnectPrompt(null);
    setDisconnecting(true);
    sessionRef.current?.close();
    try {
      await apiFetch(`/api/session/${sessionId}/close`, { method: 'POST' });
    } catch {
      // 会话可能已结束，仍返回列表
    } finally {
      sessionStorage.removeItem(`session:${sessionId}`);
      sessionStorage.removeItem(`session:${sessionId}:fresh`);
      navigate('/');
    }
  }

  function applyViewTransform(scale: number, panX: number, panY: number) {
    const next = normalizeViewTransform(scale, panX, panY);
    viewTransformRef.current = next;
    setViewTransform(next);
  }

  function refreshContentLayout() {
    const layout = getTouchLayout();
    setContentLayout(layout?.bounds ?? null);
  }

  function getTouchLayout(): { bounds: ContentBounds; screenW: number; screenH: number } | null {
    const surface = surfaceRef.current;
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!surface) return null;

    let target: HTMLElement | null = null;
    let screenW = screenSizeRef.current.width;
    let screenH = screenSizeRef.current.height;

    if (video && video.videoWidth > 0) {
      target = video;
      screenW = video.videoWidth;
      screenH = video.videoHeight;
    } else if (canvas) {
      target = canvas;
    } else if (video) {
      target = video;
    }

    if (!target || screenW <= 0 || screenH <= 0) return null;

    const bounds = computeContentBounds(
      surface.getBoundingClientRect(),
      target.getBoundingClientRect(),
      screenW,
      screenH,
      fitModeRef.current as TouchFitMode
    );
    if (!bounds) return null;
    return { bounds, screenW, screenH };
  }

  function syncTouchCursorDisplay() {
    if (touchCursorRafRef.current) return;
    touchCursorRafRef.current = requestAnimationFrame(() => {
      touchCursorRafRef.current = 0;
      const pos = touchCursorPosRef.current;
      if (pos) cursorOverlayRef.current?.setPosition(pos.x, pos.y);
    });
  }

  function remoteAtTouchCursor(): { x: number; y: number } | null {
    const layout = getTouchLayout();
    const pos = touchCursorPosRef.current;
    if (!layout || !pos) return null;
    return contentToRemote(
      pos.x,
      pos.y,
      layout.screenW,
      layout.screenH,
      layout.bounds.width,
      layout.bounds.height
    );
  }

  function sendRemoteMouseMoveAtCursor() {
    const remote = remoteAtTouchCursor();
    if (!remote) return null;
    pendingMoveRef.current = remote;
    flushMouseMove();
    return remote;
  }

  function moveTouchCursorByDelta(dx: number, dy: number) {
    const layout = getTouchLayout();
    const pos = touchCursorPosRef.current;
    if (!layout || !pos) return;
    const invScale = 1 / viewTransformRef.current.scale;
    touchCursorPosRef.current = clampCursorInContent(
      pos.x + dx * invScale,
      pos.y + dy * invScale,
      layout.bounds.width,
      layout.bounds.height
    );
    syncTouchCursorDisplay();
    const remote = remoteAtTouchCursor();
    if (!remote) return;
    pendingMoveRef.current = remote;
    if (!moveRafRef.current) {
      moveRafRef.current = requestAnimationFrame(flushMouseMove);
    }
  }

  function initTouchCursor() {
    const layout = getTouchLayout();
    if (!layout) return;
    const center = centerCursorInContent(layout.bounds.width, layout.bounds.height);
    touchCursorPosRef.current = center;
    cursorOverlayRef.current?.setPosition(center.x, center.y);
    sendRemoteMouseMoveAtCursor();
  }

  function clearTouchLongPressTimer() {
    if (touchLongPressTimerRef.current) {
      window.clearTimeout(touchLongPressTimerRef.current);
      touchLongPressTimerRef.current = 0;
    }
  }

  function sendTouchClick(
    remote: { x: number; y: number },
    button: 'left' | 'right' | 'middle' = 'left'
  ) {
    sessionRef.current?.sendControl({
      type: 'mouse_click',
      button,
      action: 'down',
      x: remote.x,
      y: remote.y,
    });
    sessionRef.current?.sendControl({
      type: 'mouse_click',
      button,
      action: 'up',
      x: remote.x,
      y: remote.y,
    });
  }

  function sendTouchRightClickAtCursor() {
    const remote = sendRemoteMouseMoveAtCursor();
    if (remote) sendTouchClick(remote, 'right');
  }

  function cancelSingleFingerGesture() {
    clearTouchLongPressTimer();
    touchGestureRef.current = 'idle';
    touchMouseDownRef.current = false;
    pointerActiveRef.current = false;
    setTouchPressing(false);
  }

  function resetTwoFingerGesture() {
    twoFingerGestureRef.current = { mode: 'none', startDistance: 0, startMidX: 0, startMidY: 0 };
  }

  useLayoutEffect(() => {
    if (!isTouch) return;
    refreshContentLayout();
    const surface = surfaceRef.current;
    if (!surface) return;
    const observer = new ResizeObserver(() => refreshContentLayout());
    observer.observe(surface);
    return () => observer.disconnect();
  }, [isTouch, fitMode, useVideoTrack, status, viewTransform]);

  useEffect(() => {
    if (!isTouch || !status.startsWith('已连接')) return;
    initTouchCursor();
  }, [isTouch, status, fitMode, useVideoTrack, contentLayout]);

  useEffect(() => {
    if (!isTouch) return;
    return () => {
      clearTouchLongPressTimer();
      if (touchCursorRafRef.current) {
        cancelAnimationFrame(touchCursorRafRef.current);
      }
    };
  }, [isTouch]);

  function mapCoordsFromClient(clientX: number, clientY: number) {
    const canvas = canvasRef.current;
    const video = videoRef.current;

    let target: HTMLElement | null = null;
    let screenW = screenSizeRef.current.width;
    let screenH = screenSizeRef.current.height;

    if (video && video.videoWidth > 0) {
      target = video;
      screenW = video.videoWidth;
      screenH = video.videoHeight;
    } else if (canvas) {
      target = canvas;
    } else if (video) {
      target = video;
    }

    if (!target || screenW <= 0 || screenH <= 0) return null;

    const rect = target.getBoundingClientRect();
    const mode = fitModeRef.current;
    const scale =
      mode === 'cover'
        ? Math.max(rect.width / screenW, rect.height / screenH)
        : Math.min(rect.width / screenW, rect.height / screenH);
    const renderedW = screenW * scale;
    const renderedH = screenH * scale;
    const offsetX = (rect.width - renderedW) / 2;
    const offsetY = (rect.height - renderedH) / 2;
    const x = clientX - rect.left - offsetX;
    const y = clientY - rect.top - offsetY;
    if (x < 0 || y < 0 || x > renderedW || y > renderedH) return null;
    return {
      x: Math.round((x / renderedW) * screenW),
      y: Math.round((y / renderedH) * screenH),
    };
  }

  function flushMouseMove() {
    moveRafRef.current = 0;
    const coords = pendingMoveRef.current;
    if (!coords) return;
    sessionRef.current?.sendControl({ type: 'mouse_move', x: coords.x, y: coords.y });
  }

  function queueMouseMove(clientX: number, clientY: number) {
    const coords = mapCoordsFromClient(clientX, clientY);
    if (!coords) return;
    pendingMoveRef.current = coords;
    if (!moveRafRef.current) {
      moveRafRef.current = requestAnimationFrame(flushMouseMove);
    }
  }

  function handleTouchPointerMoveByClient(clientX: number, clientY: number) {
    const dx = clientX - touchFingerLastRef.current.x;
    const dy = clientY - touchFingerLastRef.current.y;
    touchFingerLastRef.current = { x: clientX, y: clientY };
    if (dx === 0 && dy === 0) return;

    const moved = pointerDistance(touchFingerStartRef.current, { x: clientX, y: clientY });
    if (moved > TOUCH_TAP_THRESHOLD_PX && touchGestureRef.current === 'pending') {
      clearTouchLongPressTimer();
      touchGestureRef.current = 'moving';
    }

    moveTouchCursorByDelta(dx, dy);
  }

  useEffect(() => {
    if (isTouch) return;

    function onPointerMove(e: PointerEvent) {
      if (!pointerActiveRef.current) return;
      queueMouseMove(e.clientX, e.clientY);
    }

    function onPointerUp() {
      pointerActiveRef.current = false;
      setTouchPressing(false);
    }

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      if (moveRafRef.current) {
        cancelAnimationFrame(moveRafRef.current);
      }
    };
  }, [isTouch]);

  function beginPinchIfNeeded() {
    if (touchPointersRef.current.size < 2) return;
    cancelSingleFingerGesture();
    const pts = [...touchPointersRef.current.values()];
    if (pts.length < 2) return;
    const dist = pinchDistance(pts[0], pts[1]);
    const mid = pinchMidpoint(pts[0], pts[1]);
    twoFingerGestureRef.current = {
      mode: 'tap-candidate',
      startDistance: dist,
      startMidX: mid.x,
      startMidY: mid.y,
    };
    pinchSessionRef.current = startPinchSession(pts[0], pts[1], viewTransformRef.current);
  }

  function updatePinchGesture() {
    if (touchPointersRef.current.size < 2) return;
    const pts = [...touchPointersRef.current.values()];
    if (pts.length < 2) return;

    const dist = pinchDistance(pts[0], pts[1]);
    const mid = pinchMidpoint(pts[0], pts[1]);
    const gesture = twoFingerGestureRef.current;

    if (gesture.mode === 'tap-candidate') {
      const distRatio = Math.abs(dist - gesture.startDistance) / Math.max(gesture.startDistance, 1);
      const midMove = Math.hypot(mid.x - gesture.startMidX, mid.y - gesture.startMidY);
      if (distRatio > TWO_FINGER_TAP_MAX_PINCH_RATIO || midMove > TWO_FINGER_TAP_MAX_MID_MOVE_PX) {
        gesture.mode = 'pinch';
      }
    }

    if (gesture.mode === 'pinch' && pinchSessionRef.current) {
      const next = pinchViewTransform(pinchSessionRef.current, pts[0], pts[1]);
      applyViewTransform(next.scale, next.panX, next.panY);
    }
  }

  function handleTouchSurfacePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    touchPointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    e.currentTarget.setPointerCapture(e.pointerId);
    if (touchPointersRef.current.size >= 2) {
      beginPinchIfNeeded();
      return;
    }
    handleTouchPointerDown(e);
  }

  function handleTouchSurfacePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    touchPointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (touchPointersRef.current.size >= 2) {
      updatePinchGesture();
      return;
    }
    if (pointerActiveRef.current) {
      handleTouchPointerMoveByClient(e.clientX, e.clientY);
    }
  }

  function handleTouchSurfacePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    touchPointersRef.current.delete(e.pointerId);
    if (touchPointersRef.current.size >= 2) {
      beginPinchIfNeeded();
      return;
    }
    if (touchPointersRef.current.size === 1) {
      resetTwoFingerGesture();
      pinchSessionRef.current = null;
      const pt = [...touchPointersRef.current.values()][0]!;
      touchFingerStartRef.current = pt;
      touchFingerLastRef.current = pt;
      touchGestureRef.current = 'idle';
      pointerActiveRef.current = false;
      setTouchPressing(false);
      return;
    }

    if (twoFingerGestureRef.current.mode === 'tap-candidate') {
      sendTouchRightClickAtCursor();
      resetTwoFingerGesture();
      pinchSessionRef.current = null;
      cancelSingleFingerGesture();
      return;
    }

    resetTwoFingerGesture();
    pinchSessionRef.current = null;
    pointerActiveRef.current = false;
    finishTouchPointer();
  }

  const touchSurfaceHandlers = {
    onPointerDown: handleTouchSurfacePointerDown,
    onPointerMove: handleTouchSurfacePointerMove,
    onPointerUp: handleTouchSurfacePointerUp,
    onPointerCancel: handleTouchSurfacePointerUp,
  };

  function sendMouseMove(e: React.PointerEvent<HTMLElement>) {
    queueMouseMove(e.clientX, e.clientY);
  }

  function handleTouchPointerDown(e: React.PointerEvent<HTMLElement>) {
    pointerActiveRef.current = true;
    setTouchPressing(true);
    touchGestureRef.current = 'pending';
    touchMouseDownRef.current = false;
    touchFingerStartRef.current = { x: e.clientX, y: e.clientY };
    touchFingerLastRef.current = { x: e.clientX, y: e.clientY };

    clearTouchLongPressTimer();
    touchLongPressTimerRef.current = window.setTimeout(() => {
      if (touchGestureRef.current !== 'pending') return;
      const remote = sendRemoteMouseMoveAtCursor();
      if (!remote) return;
      touchGestureRef.current = 'dragging';
      touchMouseDownRef.current = true;
      sessionRef.current?.sendControl({
        type: 'mouse_click',
        button: 'left',
        action: 'down',
        x: remote.x,
        y: remote.y,
      });
    }, TOUCH_LONG_PRESS_MS);
  }

  function finishTouchPointer() {
    const gesture = touchGestureRef.current;
    if (gesture === 'idle') return;

    clearTouchLongPressTimer();
    setTouchPressing(false);
    touchGestureRef.current = 'idle';

    const remote = sendRemoteMouseMoveAtCursor();
    if (!remote) return;

    const moved = pointerDistance(touchFingerStartRef.current, touchFingerLastRef.current);

    if (gesture === 'pending' && moved < TOUCH_TAP_THRESHOLD_PX) {
      sendTouchClick(remote);
    } else if (gesture === 'dragging' && touchMouseDownRef.current) {
      sessionRef.current?.sendControl({
        type: 'mouse_click',
        button: 'left',
        action: 'up',
        x: remote.x,
        y: remote.y,
      });
      touchMouseDownRef.current = false;
    }
  }

  function sendMouseDown(e: React.PointerEvent<HTMLElement>) {
    pointerActiveRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    const coords = mapCoordsFromClient(e.clientX, e.clientY);
    if (!coords) return;
    pendingMoveRef.current = coords;
    flushMouseMove();
    const button = e.button === 2 ? 'right' : e.button === 1 ? 'middle' : 'left';
    sessionRef.current?.sendControl({
      type: 'mouse_click',
      button,
      action: 'down',
      x: coords.x,
      y: coords.y,
    });
  }

  function sendMouseUp(e: React.PointerEvent<HTMLElement>) {
    pointerActiveRef.current = false;
    const coords = mapCoordsFromClient(e.clientX, e.clientY);
    if (!coords) return;
    const button = e.button === 2 ? 'right' : e.button === 1 ? 'middle' : 'left';
    sessionRef.current?.sendControl({
      type: 'mouse_click',
      button,
      action: 'up',
      x: coords.x,
      y: coords.y,
    });
  }

  const pointerHandlers = {
    onPointerMove: sendMouseMove,
    onPointerDown: sendMouseDown,
    onPointerUp: sendMouseUp,
    onContextMenu: (e: React.MouseEvent<HTMLElement>) => e.preventDefault(),
  };

  const fitClass = fitMode === 'cover' ? 'object-cover' : 'object-contain';
  const toolbarBtn =
    'rounded-md px-2 py-1 text-[10px] text-slate-300 transition hover:bg-slate-800 hover:text-white disabled:opacity-50 sm:px-2.5 sm:text-xs';
  const toolbarBtnActive = 'bg-slate-800 text-white';
  const isConnected = status.startsWith('已连接');
  const isConnecting =
    !isConnected &&
    (status.includes('连接中') ||
      status.includes('建立连接') ||
      status.includes('重新连接') ||
      status.includes('初始化'));

  return (
    <div ref={viewportRef} className="flex h-[100dvh] flex-col bg-black">
      <div className="flex shrink-0 items-center justify-center border-b border-slate-800 px-2 py-2 sm:px-4 sm:py-2.5">
        <div className="flex max-w-[min(92vw,44rem)] flex-wrap items-center justify-center gap-0.5 rounded-lg border border-slate-800 bg-slate-900/90 p-0.5 sm:gap-1 sm:p-1">
          <div className="flex min-w-[2.5rem] items-center justify-center px-1" title={status}>
            {isConnected ? (
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-green-500" />
              </span>
            ) : isConnecting ? (
              <span className="whitespace-nowrap text-[10px] font-medium text-amber-300 sm:text-xs">连接中...</span>
            ) : (
              <span className="whitespace-nowrap text-[10px] font-medium text-red-400 sm:text-xs">未连接</span>
            )}
          </div>

          <span className="mx-0.5 h-4 w-px bg-slate-700" aria-hidden />

          <div className="flex items-center rounded-md bg-slate-950/60 p-0.5">
            <button
              type="button"
              className={`${toolbarBtn} ${fitMode === 'contain' ? toolbarBtnActive : ''}`}
              onClick={() => setFitMode('contain')}
              title="完整显示画面，可能有黑边"
            >
              适应
            </button>
            <button
              type="button"
              className={`${toolbarBtn} ${fitMode === 'cover' ? toolbarBtnActive : ''}`}
              onClick={() => setFitMode('cover')}
              title="铺满屏幕，可能裁切边缘"
            >
              铺满
            </button>
          </div>

          <select
            value={quality}
            onChange={(e) => setQuality(e.target.value as QualityPreset)}
            className="max-w-[4.5rem] rounded-md border border-slate-700 bg-slate-950 px-1 py-1 text-[10px] text-slate-200 sm:max-w-none sm:px-2 sm:text-xs"
            title="画质档位"
          >
            {QUALITY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

          <span className="mx-0.5 hidden h-4 w-px bg-slate-700 sm:block" aria-hidden />

          <button
            type="button"
            className={`${toolbarBtn} ${isFullscreen ? toolbarBtnActive : ''}`}
            onClick={() => void toggleFullscreen()}
            title="切换全屏"
          >
            {isFullscreen ? '退出' : '全屏'}
          </button>

          {isTouch && (
            <>
              <button
                type="button"
                className={toolbarBtn}
                onClick={() => {
                  const next = adjustViewScale(viewTransformRef.current, -VIEW_SCALE_STEP);
                  applyViewTransform(next.scale, next.panX, next.panY);
                }}
                title="缩小画面"
              >
                －
              </button>
              <button
                type="button"
                className={`${toolbarBtn} min-w-[2.5rem] ${viewTransform.scale > 1 ? toolbarBtnActive : ''}`}
                onClick={() => applyViewTransform(1, 0, 0)}
                title="双指捏合可缩放；点击恢复原始大小"
              >
                {Math.round(viewTransform.scale * 100)}%
              </button>
              <button
                type="button"
                className={toolbarBtn}
                onClick={() => {
                  const next = adjustViewScale(viewTransformRef.current, VIEW_SCALE_STEP);
                  applyViewTransform(next.scale, next.panX, next.panY);
                }}
                title="放大画面"
              >
                ＋
              </button>
              <button
                type="button"
                className={toolbarBtn}
                onClick={() => sendTouchRightClickAtCursor()}
                title="在当前鼠标位置发送右键（也可双指轻点）"
              >
                右键
              </button>
              <button
                type="button"
                className={`${toolbarBtn} ${keyboardEnabled ? toolbarBtnActive : ''}`}
                onClick={() => setKeyboardEnabled((v) => !v)}
                title={keyboardEnabled ? '键盘已开启，输入会发送到远程' : '键盘已关闭'}
              >
                ⌨{keyboardEnabled ? '开' : '关'}
              </button>
            </>
          )}

          <div className="relative">
            <button
              type="button"
              className={`${toolbarBtn} ${showFilePanel ? toolbarBtnActive : ''}`}
              onClick={() => setShowFilePanel((v) => !v)}
              title="文件传输（R2 中转）"
            >
              文件
            </button>
            {showFilePanel && sessionId && (
              <FileTransferPanel
                sessionId={sessionId}
                transfer={fileTransfer}
                onTransferUpdate={setFileTransfer}
                onSendControl={(payload) => sessionRef.current?.sendControl(payload) ?? false}
                onClose={() => setShowFilePanel(false)}
              />
            )}
          </div>

          <span className="mx-0.5 hidden h-4 w-px bg-slate-700 sm:block" aria-hidden />

          {!isConnected && reconnectDismissed && !reconnectPrompt?.open && (
            <button
              type="button"
              className={`${toolbarBtn} text-sky-300 hover:bg-sky-950/40 hover:text-sky-200`}
              onClick={() => void performReconnect()}
              title="手动重新连接"
            >
              重连
            </button>
          )}

          <button
            type="button"
            className={`${toolbarBtn} text-red-300 hover:bg-red-950/40 hover:text-red-200`}
            onClick={() => void disconnectSession()}
            disabled={disconnecting}
            title="结束远程会话"
          >
            断开
          </button>
        </div>
      </div>
      {fileTransfer?.message && (
        <FileTransferStatusBar state={fileTransfer} onDismiss={() => setFileTransfer(null)} />
      )}
      {error && !status.startsWith('已连接') ? (
        <div className="flex flex-1 items-center justify-center text-red-400">{error}</div>
      ) : (
        <div
          ref={surfaceRef}
          className="relative min-h-0 flex-1 overflow-hidden bg-black touch-none"
          {...dropHandlers}
          {...(isTouch ? touchSurfaceHandlers : {})}
        >
          {isDraggingFiles && (
            <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center border-2 border-dashed border-sky-400 bg-sky-950/50">
              <p className="rounded-lg bg-slate-900/80 px-4 py-2 text-sm text-sky-200 sm:text-base">
                松开鼠标即可上传到远程电脑
              </p>
            </div>
          )}
          <div
            className="absolute inset-0"
            style={
              isTouch
                ? {
                    transform: `translate(${viewTransform.panX}px, ${viewTransform.panY}px) scale(${viewTransform.scale})`,
                    transformOrigin: 'center center',
                    willChange: 'transform',
                  }
                : undefined
            }
          >
            <video
              ref={videoRef}
              className={`absolute inset-0 h-full w-full ${fitClass} ${useVideoTrack ? 'block' : 'hidden'}${isTouch ? ' cursor-none' : ''}`}
              autoPlay
              playsInline
              muted
              {...(useVideoTrack && !isTouch ? pointerHandlers : {})}
            />
            <canvas
              ref={canvasRef}
              className={`absolute inset-0 h-full w-full ${fitClass} ${useVideoTrack ? 'hidden' : 'block'}${isTouch ? ' cursor-none' : ''}`}
              {...(!useVideoTrack && !isTouch ? pointerHandlers : {})}
            />
            {contentLayout && isTouch && isConnected && (
              <div
                className="pointer-events-none absolute overflow-hidden"
                style={{
                  left: contentLayout.x,
                  top: contentLayout.y,
                  width: contentLayout.width,
                  height: contentLayout.height,
                }}
              >
                <TouchCursorOverlay ref={cursorOverlayRef} pressing={touchPressing} />
              </div>
            )}
          </div>
          {reconnectPrompt?.open && (
            <ReconnectDialog
              secondsLeft={reconnectPrompt.secondsLeft}
              busy={reconnectPrompt.busy}
              error={reconnectPrompt.error}
              onReconnectNow={() => void performReconnect()}
              onCancel={cancelReconnectPrompt}
            />
          )}
        </div>
      )}
      {keyboardEnabled && isTouch && !error && (
        <MobileKeyboard
          onKey={(key, mods) => {
            if (keyboardEnabledRef.current) sendKeyPress(key, mods);
          }}
        />
      )}
    </div>
  );
}
