import { Fernet } from 'fernet-nodejs';

export function generateKey(): string {
  return Fernet.generateKey();
}

export function encrypt(plaintext: string, key: string): string {
  const f = new Fernet(key);
  return f.encrypt(plaintext);
}

export function decrypt(encrypted: string, key: string): string {
  const f = new Fernet(key);
  return f.decrypt(encrypted);
}
