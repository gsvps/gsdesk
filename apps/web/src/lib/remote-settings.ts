export type QualityPreset = 'low' | 'medium' | 'high' | 'ultra' | '4k';

export const QUALITY_OPTIONS: { value: QualityPreset; label: string }[] = [
  { value: 'low', label: '流畅' },
  { value: 'medium', label: '标准' },
  { value: 'high', label: '高清' },
  { value: 'ultra', label: '超清' },
  { value: '4k', label: '4K' },
];

export function isTouchDevice(): boolean {
  if (typeof window === 'undefined') return false;
  return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
}
