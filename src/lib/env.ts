// src/lib/env.ts
// Fail-fast validation of required environment variables at startup.

function getRequired(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function getEncryptionKey(): string {
  return getRequired('ENCRYPTION_KEY');
}

export function getDatabaseUrl(): string {
  return getRequired('DATABASE_URL');
}

export function validateEnv(): void {
  const required = [
    'DATABASE_URL',
    'NEXTAUTH_SECRET',
    'PCO_CLIENT_ID',
    'PCO_CLIENT_SECRET',
    'ENCRYPTION_KEY',
  ];
  const missing = required.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}`
    );
  }
}
