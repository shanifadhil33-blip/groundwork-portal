import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/** SEC06: phone numbers, codes and voice notes are sealed before they are stored. The key comes from the server secret, never from source. */
const PREFIX = 'gw1.';
function key(secret: string) { return createHash('sha256').update(`groundwork-seal:${secret}`).digest(); }

export function seal(plain: string, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(secret), iv);
  const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + Buffer.concat([iv, tag, body]).toString('base64url');
}

export function openSealed(value: string | null | undefined, secret: string | undefined): string | null {
  if (value == null || value === '') return value ?? null;
  if (!value.startsWith(PREFIX)) return value;
  if (!secret) return null;
  try {
    const raw = Buffer.from(value.slice(PREFIX.length), 'base64url');
    if (raw.length < 28) return null;
    const decipher = createDecipheriv('aes-256-gcm', key(secret), raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8');
  } catch { return null; }
}

export function sameSecret(a: string, b: string) {
  const left = Buffer.from(a), right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
