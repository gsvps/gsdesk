export interface InstallState {
  installed: boolean;
  install_dir: string;
  default_dir: string;
  running_from: boolean;
  needs_setup: boolean;
}

export interface InstallResult {
  ok: boolean;
  started?: boolean;
  error?: string;
  message?: string;
  install_dir?: string;
  relaunch?: boolean;
}

export interface InstallProgress {
  running: boolean;
  done: boolean;
  ok: boolean;
  error?: string;
  message?: string;
  step: string;
  percent: number;
  relaunch?: boolean;
}

export interface InstallOptions {
  install_dir: string;
  create_desktop_shortcut: boolean;
}

declare global {
  interface Window {
    getInstallStateGo?: () => Promise<string> | string;
    browseInstallDirGo?: (current: string) => Promise<string> | string;
    runInstallGo?: (raw: string) => Promise<string> | string;
    getInstallProgressGo?: () => Promise<string> | string;
  }
}

function parseJSON<T>(raw: string | undefined): T {
  return JSON.parse(typeof raw === 'string' ? raw : String(raw)) as T;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function getInstallState(): Promise<InstallState> {
  if (typeof window.getInstallStateGo !== 'function') {
    return {
      installed: true,
      install_dir: '',
      default_dir: 'D:\\CloudDesk',
      running_from: true,
      needs_setup: false,
    };
  }
  return parseJSON<InstallState>(await window.getInstallStateGo());
}

export async function browseInstallDir(current: string): Promise<string> {
  if (typeof window.browseInstallDirGo !== 'function') return current;
  return window.browseInstallDirGo(current);
}

export async function getInstallProgress(): Promise<InstallProgress> {
  if (typeof window.getInstallProgressGo !== 'function') {
    return { running: false, done: false, ok: false, step: '', percent: 0 };
  }
  return parseJSON<InstallProgress>(await window.getInstallProgressGo());
}

export async function runInstall(installDir: string, createDesktopShortcut = true): Promise<InstallResult> {
  if (typeof window.runInstallGo !== 'function') {
    return { ok: false, error: '安装功能仅在桌面客户端可用' };
  }
  const payload: InstallOptions = {
    install_dir: installDir,
    create_desktop_shortcut: createDesktopShortcut,
  };
  const started = parseJSON<InstallResult>(await window.runInstallGo(JSON.stringify(payload)));
  if (!started.ok || !started.started) {
    return started;
  }

  while (true) {
    await sleep(150);
    const progress = await getInstallProgress();
    if (progress.running) continue;
    if (!progress.done) continue;
    return {
      ok: progress.ok,
      error: progress.error,
      message: progress.message,
      relaunch: progress.relaunch,
    };
  }
}
