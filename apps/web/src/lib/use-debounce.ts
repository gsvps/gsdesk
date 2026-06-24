import { useEffect, useRef } from 'react';

/** 依赖变化后延迟执行；skipInitial 为 true 时跳过首次挂载。 */
export function useDebouncedEffect(
  effect: () => void | Promise<void>,
  deps: readonly unknown[],
  delayMs: number,
  enabled = true,
  skipInitial = false
) {
  const initial = useRef(skipInitial);

  useEffect(() => {
    if (!enabled) return;
    if (initial.current) {
      initial.current = false;
      return;
    }
    const timer = window.setTimeout(() => {
      void effect();
    }, delayMs);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- debounced snapshot of deps
  }, deps);
}
