import { describe, it, expect } from 'vitest';
import { encrypt, decrypt, generateKey } from '@/lib/crypto';

describe('crypto', () => {
  it('generates a valid fernet key', () => {
    const key = generateKey();
    expect(typeof key).toBe('string');
    expect(key.length).toBeGreaterThan(0);
  });

  it('encrypts and decrypts a roundtrip', () => {
    const key = generateKey();
    const plaintext = 'sk-ant-api03-secret-key-here';
    const encrypted = encrypt(plaintext, key);
    expect(encrypted).not.toBe(plaintext);
    const decrypted = decrypt(encrypted, key);
    expect(decrypted).toBe(plaintext);
  });

  it('decrypt with wrong key throws', () => {
    const key1 = generateKey();
    const key2 = generateKey();
    const encrypted = encrypt('secret', key1);
    expect(() => decrypt(encrypted, key2)).toThrow();
  });

  it('encrypt returns a string (base64)', () => {
    const key = generateKey();
    const result = encrypt('test', key);
    expect(typeof result).toBe('string');
  });
});
