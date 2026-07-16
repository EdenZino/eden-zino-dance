const encoder = new TextEncoder();

function b64(bytes: Uint8Array): string {
  let value = '';
  for (const byte of bytes) value += String.fromCharCode(byte);
  return btoa(value);
}

function fromB64(value: string): Uint8Array {
  const raw = atob(value);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

function exactArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

export function randomToken(bytes = 32): string {
  const data = crypto.getRandomValues(new Uint8Array(bytes));
  return b64(data).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

export async function hashPassword(password: string, iterations = 210_000): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const derived = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: exactArrayBuffer(salt), iterations },
    key,
    256,
  );
  return `pbkdf2$${iterations}$${b64(salt)}$${b64(new Uint8Array(derived))}`;
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [algorithm, iterationText, saltText, hashText] = encoded.split('$');
  if (algorithm !== 'pbkdf2' || !iterationText || !saltText || !hashText) return false;
  const iterations = Number(iterationText);
  const salt = fromB64(saltText);
  const expected = fromB64(hashText);
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const derived = new Uint8Array(await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: exactArrayBuffer(salt), iterations },
    key,
    expected.length * 8,
  ));
  if (derived.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < derived.length; i += 1) diff |= derived[i] ^ expected[i];
  return diff === 0;
}

export async function sha256(value: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return Array.from(new Uint8Array(hash)).map((v) => v.toString(16).padStart(2, '0')).join('');
}

export async function hmac(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(value));
  return b64(new Uint8Array(signature));
}
