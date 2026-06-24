export type FitMode = 'contain' | 'cover';

export interface Point {
  x: number;
  y: number;
}

export interface ContentBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const CURSOR_HOTSPOT: Point = { x: 4, y: 4 };
export const TOUCH_TAP_THRESHOLD_PX = 12;
export const TOUCH_LONG_PRESS_MS = 450;

export function computeContentBounds(
  surfaceRect: DOMRect,
  targetRect: DOMRect,
  screenW: number,
  screenH: number,
  fitMode: FitMode
): ContentBounds | null {
  if (screenW <= 0 || screenH <= 0) return null;

  const scale =
    fitMode === 'cover'
      ? Math.max(targetRect.width / screenW, targetRect.height / screenH)
      : Math.min(targetRect.width / screenW, targetRect.height / screenH);
  const renderedW = screenW * scale;
  const renderedH = screenH * scale;
  const offsetX = (targetRect.width - renderedW) / 2;
  const offsetY = (targetRect.height - renderedH) / 2;

  return {
    x: targetRect.left - surfaceRect.left + offsetX,
    y: targetRect.top - surfaceRect.top + offsetY,
    width: renderedW,
    height: renderedH,
  };
}

export function clampCursorPosition(
  x: number,
  y: number,
  bounds: ContentBounds,
  hotspot: Point = CURSOR_HOTSPOT
): Point {
  const minX = bounds.x - hotspot.x;
  const maxX = bounds.x + bounds.width - hotspot.x;
  const minY = bounds.y - hotspot.y;
  const maxY = bounds.y + bounds.height - hotspot.y;
  return {
    x: Math.min(maxX, Math.max(minX, x)),
    y: Math.min(maxY, Math.max(minY, y)),
  };
}

export function centerCursorPosition(
  bounds: ContentBounds,
  hotspot: Point = CURSOR_HOTSPOT
): Point {
  return clampCursorPosition(
    bounds.x + bounds.width / 2 - hotspot.x,
    bounds.y + bounds.height / 2 - hotspot.y,
    bounds,
    hotspot
  );
}

export function surfaceToRemote(
  x: number,
  y: number,
  bounds: ContentBounds,
  screenW: number,
  screenH: number,
  hotspot: Point = CURSOR_HOTSPOT
): Point | null {
  if (bounds.width <= 0 || bounds.height <= 0) return null;
  const tipX = x + hotspot.x;
  const tipY = y + hotspot.y;
  const nx = (tipX - bounds.x) / bounds.width;
  const ny = (tipY - bounds.y) / bounds.height;
  if (nx < 0 || ny < 0 || nx > 1 || ny > 1) return null;
  return {
    x: Math.round(nx * screenW),
    y: Math.round(ny * screenH),
  };
}

export function pointerDistance(a: Point, b: Point): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}
