import { forwardRef, useImperativeHandle, useRef } from 'react';

export interface TouchCursorOverlayHandle {
  setPosition: (x: number, y: number) => void;
}

interface TouchCursorOverlayProps {
  pressing?: boolean;
}

/** 渲染在远程画面容器内，光标随内容缩放，视觉上「在画面里」。 */
const TouchCursorOverlay = forwardRef<TouchCursorOverlayHandle, TouchCursorOverlayProps>(
  function TouchCursorOverlay({ pressing }, ref) {
    const rootRef = useRef<HTMLDivElement>(null);

    useImperativeHandle(ref, () => ({
      setPosition(x: number, y: number) {
        if (rootRef.current) {
          rootRef.current.style.transform = `translate3d(${x}px, ${y}px, 0)`;
        }
      },
    }));

    return (
      <div
        ref={rootRef}
        className="pointer-events-none absolute left-0 top-0 z-10 will-change-transform"
        aria-hidden
      >
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          className={`drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)] ${pressing ? 'scale-90' : 'scale-100'}`}
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
);

export default TouchCursorOverlay;
