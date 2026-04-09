import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { LocalFileStore } from '@/lib/files/store';
import { rmSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import type { FileMeta } from '@/lib/files/types';

const TEST_DIR = join(process.cwd(), '.test-uploads');

describe('LocalFileStore', () => {
  let store: LocalFileStore;

  const meta: FileMeta = {
    filename: 'test.csv',
    mediaType: 'text/csv',
    sizeBytes: 11,
    userId: 'user-1',
    orgId: 'org-1',
    conversationId: 'conv-1',
  };

  beforeEach(() => {
    mkdirSync(TEST_DIR, { recursive: true });
    store = new LocalFileStore(TEST_DIR);
  });

  afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it('put stores a file and get retrieves it', async () => {
    const data = Buffer.from('hello,world');
    const key = await store.put('org-1/user-1/abc.csv', data, meta);
    expect(key).toBe('org-1/user-1/abc.csv');
    const result = await store.get(key);
    expect(result).not.toBeNull();
    expect(result!.data.toString()).toBe('hello,world');
    expect(result!.meta.filename).toBe('test.csv');
  });

  it('get returns null for nonexistent key', async () => {
    const result = await store.get('nonexistent');
    expect(result).toBeNull();
  });

  it('delete removes a stored file', async () => {
    const data = Buffer.from('hello');
    const key = await store.put('org-1/user-1/del.csv', data, meta);
    await store.delete(key);
    const result = await store.get(key);
    expect(result).toBeNull();
  });

  it('delete does not throw for nonexistent key', async () => {
    await expect(store.delete('nonexistent')).resolves.toBeUndefined();
  });

  it('creates nested directories as needed', async () => {
    const data = Buffer.from('nested');
    const key = 'org-deep/user-deep/nested-file.csv';
    await store.put(key, data, meta);
    expect(existsSync(join(TEST_DIR, 'org-deep', 'user-deep', 'nested-file.csv'))).toBe(true);
  });

  it('rejects path traversal attempts', async () => {
    const data = Buffer.from('evil');
    await expect(store.put('../../etc/passwd', data, meta)).rejects.toThrow('Path traversal');
  });
});
