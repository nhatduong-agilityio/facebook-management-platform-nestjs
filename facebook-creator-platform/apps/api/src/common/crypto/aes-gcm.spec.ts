import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { encryptGcm, decryptGcm } from './aes-gcm';

const TEST_KEY = Buffer.alloc(32, 'k').toString('base64');

beforeEach(() => {
  process.env.PII_ENCRYPTION_KEY = TEST_KEY;
  process.env.PII_ENCRYPTION_KEY_ID = 'v1';
});

afterEach(() => {
  delete process.env.PII_ENCRYPTION_KEY;
  delete process.env.PII_ENCRYPTION_KEY_ID;
});

describe('encryptGcm / decryptGcm', () => {
  it('round-trip: decryptGcm(encryptGcm(plain)) === plain', () => {
    const plain = 'EAABsbCS...facebook-access-token';
    expect(decryptGcm(encryptGcm(plain))).toBe(plain);
  });

  it('round-trip with unicode content', () => {
    const plain = 'tëst vàlüé 日本語';
    expect(decryptGcm(encryptGcm(plain))).toBe(plain);
  });

  it('produces different ciphertext on each call (random IV)', () => {
    const plain = 'same-plaintext';
    const ct1 = encryptGcm(plain);
    const ct2 = encryptGcm(plain);
    expect(ct1).not.toBe(ct2);
  });

  it('ciphertext includes the key ID prefix', () => {
    const ct = encryptGcm('hello');
    expect(ct.startsWith('v1:')).toBe(true);
  });

  it('ciphertext has 4 colon-separated parts', () => {
    const parts = encryptGcm('hello').split(':');
    expect(parts).toHaveLength(4);
  });

  it('throws when PII_ENCRYPTION_KEY is missing', () => {
    delete process.env.PII_ENCRYPTION_KEY;
    expect(() => encryptGcm('hello')).toThrow('PII_ENCRYPTION_KEY is not set');
  });

  it('throws when PII_ENCRYPTION_KEY has wrong length', () => {
    process.env.PII_ENCRYPTION_KEY = Buffer.alloc(16).toString('base64');
    expect(() => encryptGcm('hello')).toThrow('32 bytes');
  });

  it('throws on malformed ciphertext', () => {
    expect(() => decryptGcm('not:valid')).toThrow('Invalid encrypted value format');
  });

  it('throws when auth tag is tampered', () => {
    const ct = encryptGcm('secret');
    const parts = ct.split(':');
    parts[2] = 'deadbeefdeadbeefdeadbeefdeadbeef';
    expect(() => decryptGcm(parts.join(':'))).toThrow();
  });
});
