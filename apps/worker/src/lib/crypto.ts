const PBKDF2_ITERATIONS = 100_000;

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveKey(password, salt);
  return `${bufferToHex(salt)}:${bufferToHex(new Uint8Array(key))}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [saltHex, hashHex] = stored.split(':');
  if (!saltHex || !hashHex) return false;

  const salt = hexToBuffer(saltHex);
  const expected = hexToBuffer(hashHex);
  const key = await deriveKey(password, salt);
  const actual = new Uint8Array(key);

  if (actual.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i++) {
    diff |= actual[i] ^ expected[i];
  }
  return diff === 0;
}

async function deriveKey(password: string, salt: Uint8Array): Promise<ArrayBuffer> {
  const encoder = new TextEncoder();
  const baseKey = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  return crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    baseKey,
    256
  );
}

function bufferToHex(buffer: Uint8Array): string {
  return Array.from(buffer)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function hexToBuffer(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

export function generateId(prefix?: string): string {
  const id = crypto.randomUUID().replace(/-/g, '');
  return prefix ? `${prefix}_${id}` : id;
}

export function generateNumericDeviceId(): string {
  return String(secureRandomInt(10_000_000, 99_999_999));
}

/** 6 位数字 OTP（密码学安全）。 */
export function secureOtpCode(): string {
  return String(secureRandomInt(100_000, 999_999));
}

export function secureRandomInt(min: number, max: number): number {
  const range = max - min + 1;
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return min + (buf[0] % range);
}

/** 校验 base64 Ed25519 公钥（32 字节 raw）。 */
export async function validateEd25519PublicKey(publicKeyBase64: string): Promise<boolean> {
  try {
    const publicKeyRaw = base64ToBuffer(publicKeyBase64);
    if (publicKeyRaw.length !== 32) return false;
    await crypto.subtle.importKey('raw', publicKeyRaw, { name: 'Ed25519' }, false, ['verify']);
    return true;
  } catch {
    return false;
  }
}

export async function verifyEd25519Signature(
  publicKeyBase64: string,
  message: string,
  signatureBase64: string
): Promise<boolean> {
  try {
    const publicKeyRaw = base64ToBuffer(publicKeyBase64);
    const signature = base64ToBuffer(signatureBase64);
    const key = await crypto.subtle.importKey('raw', publicKeyRaw, { name: 'Ed25519' }, false, ['verify']);
    return crypto.subtle.verify('Ed25519', key, signature, new TextEncoder().encode(message));
  } catch {
    return false;
  }
}

function base64ToBuffer(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function bufferToBase64(buffer: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < buffer.length; i++) {
    binary += String.fromCharCode(buffer[i]);
  }
  return btoa(binary);
}
