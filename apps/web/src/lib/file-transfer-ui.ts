export interface FileTransferUiState {
  message: string;
  /** 0–100；null 表示进行中但大小未知（显示不确定进度） */
  progress: number | null;
}

export function fileTransferPercent(loaded: number, total: number | null | undefined): number | null {
  if (total != null && total > 0) {
    return Math.min(100, Math.round((loaded / total) * 100));
  }
  return null;
}

export function isFileTransferActive(state: FileTransferUiState | null): boolean {
  return Boolean(state?.message);
}
