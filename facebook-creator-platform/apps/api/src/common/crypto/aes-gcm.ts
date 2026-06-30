import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const TAG_BYTES = 16;

function getKey(): Buffer {
  const raw = process.env.PII_ENCRYPTION_KEY;
  if (!raw) throw new Error('PII_ENCRYPTION_KEY is not set');
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) throw new Error('PII_ENCRYPTION_KEY must be 32 bytes (base64-encoded)');
  return key;
}

function getKeyId(): string {
  return process.env.PII_ENCRYPTION_KEY_ID ?? 'v1';
}

/**
 * Encrypts a plaintext string with AES-256-GCM using the key from PII_ENCRYPTION_KEY.
 *
 * The returned ciphertext is a colon-delimited string:
 * `<keyId>:<ivHex>:<authTagHex>:<ciphertextHex>`
 *
 * The key-id prefix enables key rotation: decrypt with the key version that matches
 * the prefix, re-encrypt with the new key, and update PII_ENCRYPTION_KEY_ID.
 *
 * @param plain - UTF-8 plaintext to encrypt (e.g. a Facebook access token).
 * @returns Encoded ciphertext string safe to store in a `text` DB column.
 * @throws If PII_ENCRYPTION_KEY is unset or not exactly 32 bytes when decoded.
 */
export function encryptGcm(plain: string): string {
  const key = getKey();
  const keyId = getKeyId();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${keyId}:${iv.toString('hex')}:${tag.toString('hex')}:${ct.toString('hex')}`;
}

/**
 * Decrypts a value previously produced by encryptGcm().
 *
 * @param cipher - Encoded ciphertext in `<keyId>:<iv>:<tag>:<ct>` format.
 * @returns Original plaintext string.
 * @throws If the format is invalid, the auth tag length is wrong, or decryption fails
 *         (tampered ciphertext or wrong key).
 */
export function decryptGcm(cipher: string): string {
  const key = getKey();
  const parts = cipher.split(':');
  if (parts.length !== 4) throw new Error('Invalid encrypted value format');
  const [, ivHex, tagHex, ctHex] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  if (tag.length !== TAG_BYTES) throw new Error('Invalid auth tag length');
  const ct = Buffer.from(ctHex, 'hex');
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(ct) + decipher.final('utf8');
}
