/**
 * Verschlüsselung der automatisch abgerufenen Angebote: Die Datei liegt auf der öffentlichen Webseite, lesbar ist sie nur
 * mit dem Familien-Schlüssel. AES-256-GCM, Schlüssel per PBKDF2 (SHA-256) aus dem Passwort. Läuft im Browser und in Node.
 */
export interface Sealed {
  v: 1;
  salt: string;
  iv: string;
  data: string;
}

const ITERATIONS = 210_000;

const toB64 = (bytes: Uint8Array) => {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function deriveKey(passphrase: string, salt: Uint8Array) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase.trim()), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function seal(data: unknown, passphrase: string): Promise<Sealed> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt);
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(data)));
  return { v: 1, salt: toB64(salt), iv: toB64(iv), data: toB64(new Uint8Array(cipher)) };
}

/** Wirft bei falschem Schlüssel oder veränderter Datei. */
export async function unseal<T>(box: Sealed, passphrase: string): Promise<T> {
  const key = await deriveKey(passphrase, fromB64(box.salt));
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(box.iv) }, key, fromB64(box.data));
  return JSON.parse(new TextDecoder().decode(plain)) as T;
}

export const isSealed = (x: unknown): x is Sealed =>
  !!x && (x as Sealed).v === 1 && typeof (x as Sealed).salt === 'string' && typeof (x as Sealed).data === 'string';
