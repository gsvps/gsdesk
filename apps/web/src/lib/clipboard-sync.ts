export interface ClipboardSyncState {
  lastRemote: string;
  lastSent: string;
}

export function createClipboardSyncState(): ClipboardSyncState {
  return { lastRemote: '', lastSent: '' };
}

export async function applyRemoteClipboard(content: string, state: ClipboardSyncState): Promise<boolean> {
  if (!content || content === state.lastSent) return false;
  state.lastRemote = content;
  try {
    await navigator.clipboard.writeText(content);
    return true;
  } catch {
    return false;
  }
}

export async function pasteClipboardToRemote(
  send: (payload: Record<string, unknown>) => void,
  state: ClipboardSyncState
): Promise<boolean> {
  try {
    const text = await navigator.clipboard.readText();
    if (!text) return false;
    state.lastSent = text;
    send({ type: 'clipboard', content: text, action: 'paste' });
    return true;
  } catch {
    return false;
  }
}

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target.isContentEditable
  );
}

export function isFileDragEvent(e: React.DragEvent): boolean {
  return Array.from(e.dataTransfer.types).includes('Files');
}
