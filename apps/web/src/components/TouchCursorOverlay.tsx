interface TouchCursorOverlayProps {
  position: { x: number; y: number } | null;
  pressing?: boolean;
}

/** 触摸控制时在画面上显示虚拟鼠标（相对拖动，不跟随触点绝对位置）。 */
export default function TouchCursorOverlay({ position, pressing }: TouchCursorOverlayProps) {
  if (!position) return null;

  return (
    <div
      className="pointer-events-none absolute left-0 top-0 z-10 will-change-transform"
      style={{ transform: `translate3d(${position.x}px, ${position.y}px, 0)` }}
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
