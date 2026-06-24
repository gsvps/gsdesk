const DEFAULT_VERSION = '0.1.0';

export function parseVersion(input: string): number[] {
  return input
    .trim()
    .replace(/^v/i, '')
    .split('.')
    .map((part) => Number.parseInt(part, 10))
    .map((n) => (Number.isFinite(n) ? n : 0));
}

export function compareVersions(a: string, b: string): number {
  const left = parseVersion(a);
  const right = parseVersion(b);
  const len = Math.max(left.length, right.length);
  for (let i = 0; i < len; i += 1) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export function latestClientVersion(env: Env): string {
  return env.CLIENT_LATEST_VERSION?.trim() || DEFAULT_VERSION;
}

export function clientDownloadURL(env: Env, platform: string): string {
  const fromEnv = env.CLIENT_DOWNLOAD_URL?.trim();
  if (fromEnv) return fromEnv;
  if (platform === 'windows') {
    return 'https://github.com/clouddesk/clouddesk/releases/latest';
  }
  return '';
}

export function clientReleaseNotes(env: Env): string {
  return env.CLIENT_RELEASE_NOTES?.trim() || '';
}
