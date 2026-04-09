import { mkdir, readFile, writeFile, unlink } from 'fs/promises';
import { join, dirname, resolve } from 'path';
import type { FileMeta } from '@/lib/files/types';

export interface FileStore {
  put(key: string, data: Buffer, meta: FileMeta): Promise<string>;
  get(key: string): Promise<{ data: Buffer; meta: FileMeta } | null>;
  delete(key: string): Promise<void>;
}

export class LocalFileStore implements FileStore {
  constructor(private readonly baseDir: string) {}

  private resolveSafe(key: string): string {
    const resolved = join(this.baseDir, key);
    const normalizedBase = resolve(this.baseDir);
    const normalizedResolved = resolve(resolved);
    if (!normalizedResolved.startsWith(normalizedBase + '/') && normalizedResolved !== normalizedBase) {
      throw new Error('Path traversal detected');
    }
    return resolved;
  }

  async put(key: string, data: Buffer, meta: FileMeta): Promise<string> {
    const filePath = this.resolveSafe(key);
    const metaPath = filePath + '.meta.json';
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, data);
    await writeFile(metaPath, JSON.stringify(meta));
    return key;
  }

  async get(key: string): Promise<{ data: Buffer; meta: FileMeta } | null> {
    const filePath = this.resolveSafe(key);
    const metaPath = filePath + '.meta.json';
    try {
      const [data, metaRaw] = await Promise.all([
        readFile(filePath),
        readFile(metaPath, 'utf-8'),
      ]);
      return { data, meta: JSON.parse(metaRaw) as FileMeta };
    } catch {
      return null;
    }
  }

  async delete(key: string): Promise<void> {
    const filePath = this.resolveSafe(key);
    const metaPath = filePath + '.meta.json';
    try {
      await Promise.all([unlink(filePath), unlink(metaPath)]);
    } catch {
      // File may not exist
    }
  }
}

let _store: FileStore | null = null;

export function getFileStore(): FileStore {
  if (!_store) {
    const provider = process.env.FILE_STORE || 'local';
    switch (provider) {
      case 'local':
        _store = new LocalFileStore(process.env.UPLOAD_DIR || './uploads');
        break;
      default:
        throw new Error(`Unknown FILE_STORE provider: ${provider}`);
    }
  }
  return _store;
}
