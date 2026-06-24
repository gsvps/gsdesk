import { useCallback, useMemo, useState } from 'react';

interface MobileKeyboardProps {
  onKey: (key: string, mods: { ctrl: boolean; alt: boolean; shift: boolean }) => void;
}

const ROWS: string[][] = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', 'Backspace'],
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', 'Enter'],
  ['Shift', 'z', 'x', 'c', 'v', 'b', 'n', 'm', ',', '.', '/'],
  ['Tab', 'Ctrl', 'Alt', 'Space', 'Esc', '←', '↓', '↑', '→'],
];

function labelFor(key: string): string {
  switch (key) {
    case 'Space':
      return '空格';
    case 'Backspace':
      return '⌫';
    case 'Enter':
      return '↵';
    case 'Shift':
      return '⇧';
    case 'Ctrl':
      return 'Ctrl';
    case 'Alt':
      return 'Alt';
    case 'Tab':
      return 'Tab';
    case 'Esc':
      return 'Esc';
    default:
      return key;
  }
}

export default function MobileKeyboard({ onKey }: MobileKeyboardProps) {
  const [shift, setShift] = useState(false);
  const [ctrl, setCtrl] = useState(false);
  const [alt, setAlt] = useState(false);

  const mods = useMemo(() => ({ ctrl, alt, shift }), [ctrl, alt, shift]);

  const press = useCallback(
    (raw: string) => {
      if (raw === 'Shift') {
        setShift((v) => !v);
        return;
      }
      if (raw === 'Ctrl') {
        setCtrl((v) => !v);
        return;
      }
      if (raw === 'Alt') {
        setAlt((v) => !v);
        return;
      }

      let key = raw;
      if (raw === 'Space') key = ' ';
      if (raw === 'Esc') key = 'Escape';
      if (raw === '←') key = 'ArrowLeft';
      if (raw === '→') key = 'ArrowRight';
      if (raw === '↑') key = 'ArrowUp';
      if (raw === '↓') key = 'ArrowDown';

      const sendKey = shift && key.length === 1 ? key.toUpperCase() : key;
      onKey(sendKey, mods);

      if (shift && key.length === 1) setShift(false);
    },
    [mods, onKey, shift]
  );

  return (
    <div
      className="shrink-0 border-t border-slate-800 bg-slate-950/95 px-1 pb-[max(0.25rem,env(safe-area-inset-bottom))] pt-1"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="mx-auto flex max-w-3xl flex-col gap-0.5">
        {ROWS.map((row, rowIdx) => (
          <div key={rowIdx} className="flex justify-center gap-0.5 sm:gap-1">
            {row.map((key) => {
              const wide =
                key === 'Space' ? 'min-w-[28%] flex-[2]' : key === 'Backspace' || key === 'Enter' ? 'min-w-[12%] flex-[1.2]' : 'flex-1';
              const active =
                (key === 'Shift' && shift) || (key === 'Ctrl' && ctrl) || (key === 'Alt' && alt);
              return (
                <button
                  key={key}
                  type="button"
                  className={`${wide} rounded-md border border-slate-700/80 bg-slate-900 px-0.5 py-2 text-[10px] leading-none text-slate-200 active:bg-slate-700 sm:px-1 sm:py-2.5 sm:text-xs ${
                    active ? 'border-sky-600 bg-sky-950 text-white' : ''
                  }`}
                  onClick={() => press(key)}
                >
                  {labelFor(key)}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
