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

export function isFileTransferFailed(state: FileTransferUiState): boolean {
  const m = state.message;
  return (
    m.includes('失败') ||
    m.includes('错误') ||
    m.includes('超时') ||
    m.includes('未就绪')
  );
}

export function isFileTransferSuccess(state: FileTransferUiState): boolean {
  return state.progress === 100 && !isFileTransferFailed(state);
}

export function isFileTransferActive(state: FileTransferUiState | null): boolean {
  return Boolean(state?.message);
}
