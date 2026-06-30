import { Type, Platform, EntityProperty } from '@mikro-orm/core';
import { decryptGcm, encryptGcm } from './aes-gcm';

/**
 * MikroORM custom type that transparently encrypts PII columns at rest using AES-256-GCM.
 *
 * Apply this type to any entity property that stores sensitive data (e.g. Facebook access
 * tokens). The value is stored as `<keyId>:<iv>:<tag>:<ct>` in a `text` column and
 * decrypted back to a plain string when read from the database.
 *
 * The key is read from the PII_ENCRYPTION_KEY environment variable at call time, which
 * allows key rotation without changing entity code (update the env var and re-encrypt
 * affected rows).
 *
 * @example
 * ```ts
 * @Property({ type: EncryptedText })
 * accessToken!: string; // stored encrypted; never log or return in API responses
 * ```
 */
export class EncryptedText extends Type<string | null, string | null> {
  /**
   * Encrypts the JS value before writing to the database.
   *
   * @param value - Plaintext string, or null for nullable columns.
   * @returns Encrypted ciphertext string, or null.
   */
  convertToDatabaseValue(value: string | null): string | null {
    return value == null ? value : encryptGcm(value);
  }

  /**
   * Decrypts the stored ciphertext when reading from the database.
   *
   * @param value - Encrypted ciphertext string, or null.
   * @returns Plaintext string, or null.
   */
  convertToJSValue(value: string | null): string | null {
    return value == null ? value : decryptGcm(value);
  }

  /**
   * Maps this type to a PostgreSQL `text` column (ciphertext is variable-length).
   *
   * @param _prop     - MikroORM entity property metadata (unused).
   * @param _platform - Target database platform (unused).
   * @returns `'text'`
   */
  getColumnType(_prop: EntityProperty, _platform: Platform): string {
    return 'text';
  }
}
