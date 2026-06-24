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

/** 光标坐标相对于远程画面区域（0,0 为画面左上角）。 */
export function clampCursorInContent(
  x: number,
  y: number,
  contentW: number,
  contentH: number,
  hotspot: Point = CURSOR_HOTSPOT
): Point {
  const minX = -hotspot.x;
  const maxX = contentW - hotspot.x;
  const minY = -hotspot.y;
  const maxY = contentH - hotspot.y;
  return {
    x: Math.min(maxX, Math.max(minX, x)),
    y: Math.min(maxY, Math.max(minY, y)),
  };
}

export function centerCursorInContent(
  contentW: number,
  contentH: number,
  hotspot: Point = CURSOR_HOTSPOT
): Point {
  return clampCursorInContent(
    contentW / 2 - hotspot.x,
    contentH / 2 - hotspot.y,
    contentW,
    contentH,
    hotspot
  );
}

export function contentToRemote(
  x: number,
  y: number,
  screenW: number,
  screenH: number,
  contentW: number,
  contentH: number,
  hotspot: Point = CURSOR_HOTSPOT
): Point | null {
  if (contentW <= 0 || contentH <= 0) return null;
  const tipX = x + hotspot.x;
  const tipY = y + hotspot.y;
  if (tipX < 0 || tipY < 0 || tipX > contentW || tipY > contentH) return null;
  return {
    x: Math.round((tipX / contentW) * screenW),
    y: Math.round((tipY / contentH) * screenH),
  };
}

export function pointerDistance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
