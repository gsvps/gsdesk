import type { Point } from './touch-mouse';

export interface ViewTransform {
  scale: number;
  panX: number;
  panY: number;
}

export const VIEW_SCALE_MIN = 1;
export const VIEW_SCALE_MAX = 4;
export const VIEW_SCALE_STEP = 0.25;

export function clampViewScale(scale: number): number {
  return Math.min(VIEW_SCALE_MAX, Math.max(VIEW_SCALE_MIN, scale));
}

export function normalizeViewTransform(scale: number, panX: number, panY: number): ViewTransform {
  const clamped = clampViewScale(scale);
  if (clamped <= 1) {
    return { scale: 1, panX: 0, panY: 0 };
  }
  return { scale: clamped, panX, panY };
}

export function pinchDistance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function pinchMidpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

export interface PinchSession {
  startDistance: number;
  startScale: number;
  startPanX: number;
  startPanY: number;
  startMidX: number;
  startMidY: number;
}

export function startPinchSession(a: Point, b: Point, view: ViewTransform): PinchSession {
  return {
    startDistance: Math.max(pinchDistance(a, b), 1),
    startScale: view.scale,
    startPanX: view.panX,
    startPanY: view.panY,
    startMidX: (a.x + b.x) / 2,
    startMidY: (a.y + b.y) / 2,
  };
}

export function pinchViewTransform(session: PinchSession, a: Point, b: Point): ViewTransform {
  const distance = Math.max(pinchDistance(a, b), 1);
  const mid = pinchMidpoint(a, b);
  const scale = clampViewScale(session.startScale * (distance / session.startDistance));
  const panX = session.startPanX + (mid.x - session.startMidX);
  const panY = session.startPanY + (mid.y - session.startMidY);
  return normalizeViewTransform(scale, panX, panY);
}

export const TWO_FINGER_TAP_MAX_PINCH_RATIO = 0.08;
export const TWO_FINGER_TAP_MAX_MID_MOVE_PX = 14;

export function adjustViewScale(current: ViewTransform, delta: number): ViewTransform {
  return normalizeViewTransform(current.scale + delta, current.panX, current.panY);
}
