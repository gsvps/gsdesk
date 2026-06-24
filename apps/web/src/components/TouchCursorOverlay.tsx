interface TouchCursorOverlayProps {
  position: { x: number; y: number } | null;
  pressing?: boolean;
}

/** 触摸控制时在画面上显示本地鼠标指示，便于定位点击位置。 */
export default function TouchCursorOverlay({ position, pressing }: TouchCursorOverlayProps) {
  if (!position) return null;

  return (
    <div
      className="pointer-events-none absolute z-10"
      style={{ left: position.x, top: position.y }}
      aria-hidden
    >
      <svg
        width="28"
        height="28"
        viewBox="0 0 24 24"
        className={`drop-shadow-md ${pressing ? 'scale-90' : 'scale-100'}`}
        style={{ transformOrigin: '4px 4px' }}
      >
        <path
          d="M5 3 L5 17 L9.5 12.5 L13 19 L16 17.5 L12.5 11.5 L18 11.5 Z"
          fill="white"
          stroke="#0f172a"
          strokeWidth="1.25"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}
