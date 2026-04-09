# File Upload/Download Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let church staff upload spreadsheets (CSV, XLSX) into chat conversations for the AI to process, and download files the AI generates.

**Architecture:** Storage abstraction (local filesystem MVP) with server-side CSV/XLSX parsing before model ingestion. Files are conversation-scoped with cascade deletion. Upload/download via authenticated API routes. Local `create_file` tool enables AI-generated downloads.

**Tech Stack:** papaparse (CSV), xlsx/SheetJS (XLSX), Prisma File model, Next.js API routes, lucide-react icons

---

## File Structure

### New Files
| File | Responsibility |
|------|---------------|
| `src/lib/files/types.ts` | FileMeta, FileRecord types, constants (limits, allowed extensions, MIME types) |
| `src/lib/files/validate.ts` | Extension allowlist, magic byte check, size check, filename sanitization |
| `src/lib/files/store.ts` | FileStore interface + factory + LocalFileStore implementation |
| `src/lib/files/parse.ts` | CSV/XLSX → text pre-processing for model context |
| `src/lib/files/sanitize.ts` | Formula injection sanitization for generated files |
| `src/lib/files/persist.ts` | DB CRUD for File records + deleteConversationWithFiles() |
| `src/app/api/files/route.ts` | POST upload endpoint |
| `src/app/api/files/[id]/route.ts` | GET download + DELETE endpoint |
| `src/components/chat/file-chip.tsx` | Pre-send file preview chip with progress + remove |
| `src/components/chat/file-card.tsx` | In-chat file display (upload card + download card) |
| `tests/lib/files/validate.test.ts` | Validation tests |
| `tests/lib/files/store.test.ts` | LocalFileStore tests |
| `tests/lib/files/parse.test.ts` | CSV/XLSX parsing tests |
| `tests/lib/files/sanitize.test.ts` | Formula injection sanitization tests |
| `tests/lib/files/persist.test.ts` | File DB persist + cascade delete tests |

### Modified Files
| File | Change |
|------|--------|
| `prisma/schema.prisma` | Add File model with Conversation relation |
| `package.json` | Add papaparse + xlsx dependencies |
| `src/proxy.ts` | Add /api/files rate limit entry |
| `src/app/api/chat/route.ts` | File pre-processing pipeline + create_file tool |
| `src/app/api/conversations/[id]/route.ts` | Use deleteConversationWithFiles() |
| `src/components/chat/chat-interface.tsx` | Paperclip button, file state, upload flow, consent banner |
| `src/components/chat/message-bubble.tsx` | Render file-card for file parts |
| `docker-compose.yml` | Add uploads volume |
| `Dockerfile` | Create /data/uploads directory |
| `.gitignore` | Add uploads/ |

---

### Task 1: Install Dependencies + Schema

**Files:**
- Modify: `package.json`
- Modify: `prisma/schema.prisma`
- Modify: `.gitignore`

- [ ] **Step 1: Install papaparse and xlsx**

```bash
npm install papaparse xlsx
npm install -D @types/papaparse
```

- [ ] **Step 2: Add File model to Prisma schema**

Add after the `Message` model in `prisma/schema.prisma`:

```prisma
model File {
  id             String   @id @default(uuid())
  userId         String   @map("user_id")
  orgId          String   @map("org_id")
  conversationId String   @map("conversation_id")
  filename       String
  mediaType      String   @map("media_type")
  sizeBytes      Int      @map("size_bytes")
  storageKey     String   @unique @map("storage_key")
  createdAt      DateTime @default(now()) @map("created_at")

  user         User         @relation(fields: [userId], references: [id])
  organization Organization @relation(fields: [orgId], references: [id])
  conversation Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)

  @@index([conversationId])
  @@index([userId])
  @@map("files")
  @@schema("agent")
}
```

Add `files File[]` relation to the `Organization`, `User`, and `Conversation` models:

In the `Organization` model, add after `memory Memory[]`:
```prisma
  files   File[]
```

In the `User` model, add after `memories Memory[]`:
```prisma
  files   File[]
```

In the `Conversation` model, add after `messages Message[]`:
```prisma
  files   File[]
```

- [ ] **Step 3: Add uploads/ to .gitignore**

Append to `.gitignore`:
```
uploads/
```

- [ ] **Step 4: Push schema to database**

```bash
npx prisma db push
npx prisma generate
```

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json prisma/schema.prisma .gitignore
git commit -m "feat: add File schema + papaparse/xlsx dependencies"
```

---

### Task 2: Types and Constants

**Files:**
- Create: `src/lib/files/types.ts`

- [ ] **Step 1: Create types.ts**

```typescript
// src/lib/files/types.ts

export const MAX_FILE_SIZE_BYTES = (parseInt(process.env.MAX_UPLOAD_SIZE_MB || '10', 10)) * 1024 * 1024;
export const MAX_FILES_PER_MESSAGE = 3;
export const MAX_PARSE_ROWS = 500;

export const ALLOWED_EXTENSIONS = ['.csv', '.tsv', '.xlsx', '.xls'] as const;
export type AllowedExtension = (typeof ALLOWED_EXTENSIONS)[number];

export const EXTENSION_TO_MIME: Record<AllowedExtension, string> = {
  '.csv': 'text/csv',
  '.tsv': 'text/tab-separated-values',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.xls': 'application/vnd.ms-excel',
};

export const BLOCKED_EXTENSIONS = ['.xlsm', '.docm', '.xltm', '.xlam'] as const;

export interface FileMeta {
  filename: string;
  mediaType: string;
  sizeBytes: number;
  userId: string;
  orgId: string;
  conversationId: string;
}

export interface FileRecord {
  id: string;
  userId: string;
  orgId: string;
  conversationId: string;
  filename: string;
  mediaType: string;
  sizeBytes: number;
  storageKey: string;
  createdAt: Date;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/files/types.ts
git commit -m "feat: add file types and constants"
```

---

### Task 3: File Validation

**Files:**
- Create: `src/lib/files/validate.ts`
- Create: `tests/lib/files/validate.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/lib/files/validate.test.ts
import { describe, it, expect } from 'vitest';
import { validateFile, sanitizeFilename, getExtension } from '@/lib/files/validate';

describe('getExtension', () => {
  it('returns lowercase extension', () => {
    expect(getExtension('report.CSV')).toBe('.csv');
  });

  it('returns last extension for double-extension', () => {
    expect(getExtension('file.tar.gz')).toBe('.gz');
  });

  it('returns empty string for no extension', () => {
    expect(getExtension('noext')).toBe('');
  });
});

describe('sanitizeFilename', () => {
  it('strips path separators', () => {
    expect(sanitizeFilename('../../etc/passwd')).toBe('passwd');
  });

  it('strips null bytes', () => {
    expect(sanitizeFilename('file\x00.csv')).toBe('file.csv');
  });

  it('strips control characters', () => {
    expect(sanitizeFilename('file\t\r\n.csv')).toBe('file.csv');
  });

  it('keeps normal filenames unchanged', () => {
    expect(sanitizeFilename('volunteers 2026.xlsx')).toBe('volunteers 2026.xlsx');
  });

  it('returns "unnamed" for empty result', () => {
    expect(sanitizeFilename('../../')).toBe('unnamed');
  });
});

describe('validateFile', () => {
  it('rejects files that are too large', () => {
    const result = validateFile('file.csv', 20 * 1024 * 1024, Buffer.from('data'));
    expect(result).toEqual({ valid: false, error: 'This file is too large. The maximum is 10 MB.' });
  });

  it('rejects disallowed extensions', () => {
    const result = validateFile('file.exe', 100, Buffer.from('data'));
    expect(result).toEqual({ valid: false, error: "This file type isn't supported. Please upload a CSV or Excel file." });
  });

  it('rejects macro-enabled formats', () => {
    const result = validateFile('file.xlsm', 100, Buffer.from('data'));
    expect(result).toEqual({ valid: false, error: "This file type isn't supported. Please upload a CSV or Excel file." });
  });

  it('rejects xlsx with wrong magic bytes', () => {
    const result = validateFile('file.xlsx', 100, Buffer.from('not a zip file'));
    expect(result).toEqual({ valid: false, error: 'This file appears to be corrupted or is not a valid spreadsheet.' });
  });

  it('accepts valid csv', () => {
    const result = validateFile('data.csv', 100, Buffer.from('name,email\nJohn,j@x.com'));
    expect(result).toEqual({ valid: true });
  });

  it('accepts valid xlsx with PK magic bytes', () => {
    const pkHeader = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
    const data = Buffer.concat([pkHeader, Buffer.alloc(100)]);
    const result = validateFile('data.xlsx', data.length, data);
    expect(result).toEqual({ valid: true });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/lib/files/validate.test.ts
```
Expected: FAIL — module not found

- [ ] **Step 3: Implement validate.ts**

```typescript
// src/lib/files/validate.ts
import {
  MAX_FILE_SIZE_BYTES,
  ALLOWED_EXTENSIONS,
  BLOCKED_EXTENSIONS,
  type AllowedExtension,
} from '@/lib/files/types';

const PK_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

export function getExtension(filename: string): string {
  const dot = filename.lastIndexOf('.');
  if (dot < 0) return '';
  return filename.slice(dot).toLowerCase();
}

export function sanitizeFilename(name: string): string {
  // Strip path separators and traversal
  let clean = name.replace(/[/\\]/g, '').replace(/\.\./g, '');
  // Strip null bytes and control characters
  clean = clean.replace(/[\x00-\x1f\x7f]/g, '');
  clean = clean.trim();
  return clean || 'unnamed';
}

type ValidationResult = { valid: true } | { valid: false; error: string };

export function validateFile(
  filename: string,
  sizeBytes: number,
  data: Buffer,
): ValidationResult {
  // Size check
  if (sizeBytes > MAX_FILE_SIZE_BYTES) {
    return { valid: false, error: 'This file is too large. The maximum is 10 MB.' };
  }

  const ext = getExtension(filename);

  // Blocked extensions
  if ((BLOCKED_EXTENSIONS as readonly string[]).includes(ext)) {
    return { valid: false, error: "This file type isn't supported. Please upload a CSV or Excel file." };
  }

  // Allowed extensions
  if (!(ALLOWED_EXTENSIONS as readonly string[]).includes(ext)) {
    return { valid: false, error: "This file type isn't supported. Please upload a CSV or Excel file." };
  }

  // Magic byte validation for binary formats
  if (ext === '.xlsx' || ext === '.xls') {
    if (ext === '.xlsx' && !data.subarray(0, 4).equals(PK_MAGIC)) {
      return { valid: false, error: 'This file appears to be corrupted or is not a valid spreadsheet.' };
    }
    // .xls has various magic bytes (D0CF11E0); skip deep validation for MVP
  }

  return { valid: true };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/lib/files/validate.test.ts
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/files/validate.ts tests/lib/files/validate.test.ts
git commit -m "feat: file validation — extension, size, magic bytes"
```

---

### Task 4: LocalFileStore

**Files:**
- Create: `src/lib/files/store.ts`
- Create: `tests/lib/files/store.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/lib/files/store.test.ts
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
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/lib/files/store.test.ts
```
Expected: FAIL — module not found

- [ ] **Step 3: Implement store.ts**

```typescript
// src/lib/files/store.ts
import { mkdir, readFile, writeFile, unlink, readdir } from 'fs/promises';
import { join, dirname } from 'path';
import { existsSync } from 'fs';
import type { FileMeta } from '@/lib/files/types';

export interface FileStore {
  put(key: string, data: Buffer, meta: FileMeta): Promise<string>;
  get(key: string): Promise<{ data: Buffer; meta: FileMeta } | null>;
  delete(key: string): Promise<void>;
}

export class LocalFileStore implements FileStore {
  constructor(private readonly baseDir: string) {}

  async put(key: string, data: Buffer, meta: FileMeta): Promise<string> {
    const filePath = join(this.baseDir, key);
    const metaPath = filePath + '.meta.json';
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, data);
    await writeFile(metaPath, JSON.stringify(meta));
    return key;
  }

  async get(key: string): Promise<{ data: Buffer; meta: FileMeta } | null> {
    const filePath = join(this.baseDir, key);
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
    const filePath = join(this.baseDir, key);
    const metaPath = filePath + '.meta.json';
    try {
      await Promise.all([unlink(filePath), unlink(metaPath)]);
    } catch {
      // File may not exist — that's fine
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/lib/files/store.test.ts
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/files/store.ts tests/lib/files/store.test.ts
git commit -m "feat: FileStore interface + LocalFileStore implementation"
```

---

### Task 5: File Parsing (CSV/XLSX → Text)

**Files:**
- Create: `src/lib/files/parse.ts`
- Create: `tests/lib/files/parse.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/lib/files/parse.test.ts
import { describe, it, expect } from 'vitest';
import { parseFileToText } from '@/lib/files/parse';
import * as XLSX from 'xlsx';

describe('parseFileToText', () => {
  it('parses CSV data to pipe-delimited text', () => {
    const csv = 'Name,Email,Phone\nJohn Smith,john@x.com,555-1234\nJane Doe,jane@x.com,555-5678';
    const result = parseFileToText(Buffer.from(csv), 'text/csv', 'people.csv');

    expect(result).toContain('people.csv');
    expect(result).toContain('2 rows');
    expect(result).toContain('3 columns');
    expect(result).toContain('Name');
    expect(result).toContain('John Smith');
    expect(result).toContain('Jane Doe');
  });

  it('parses TSV data', () => {
    const tsv = 'Name\tEmail\nAlice\talice@x.com';
    const result = parseFileToText(Buffer.from(tsv), 'text/tab-separated-values', 'data.tsv');
    expect(result).toContain('Alice');
    expect(result).toContain('1 rows');
  });

  it('caps at MAX_PARSE_ROWS', () => {
    const header = 'id,name';
    const rows = Array.from({ length: 600 }, (_, i) => `${i},Person ${i}`).join('\n');
    const csv = header + '\n' + rows;
    const result = parseFileToText(Buffer.from(csv), 'text/csv', 'big.csv');

    expect(result).toContain('first 500 of 600 rows');
    // Should not contain row 500+ data
    expect(result).not.toContain('Person 550');
  });

  it('parses XLSX buffer', () => {
    // Create a minimal XLSX in memory
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
      ['Name', 'Role'],
      ['Bob', 'Vocalist'],
      ['Sue', 'Drummer'],
    ]);
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

    const result = parseFileToText(buf, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'team.xlsx');
    expect(result).toContain('team.xlsx');
    expect(result).toContain('2 rows');
    expect(result).toContain('Bob');
    expect(result).toContain('Vocalist');
  });

  it('returns error message for unparseable file', () => {
    const result = parseFileToText(Buffer.from([0x00, 0x01, 0x02]), 'application/vnd.ms-excel', 'bad.xls');
    expect(result).toContain('could not be read');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/lib/files/parse.test.ts
```
Expected: FAIL — module not found

- [ ] **Step 3: Implement parse.ts**

```typescript
// src/lib/files/parse.ts
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { MAX_PARSE_ROWS } from '@/lib/files/types';

export function parseFileToText(
  data: Buffer,
  mediaType: string,
  filename: string,
): string {
  try {
    let headers: string[];
    let rows: string[][];
    let totalRows: number;

    if (mediaType === 'text/csv' || mediaType === 'text/tab-separated-values') {
      const text = data.toString('utf-8');
      const parsed = Papa.parse<string[]>(text, { header: false, skipEmptyLines: true });
      if (!parsed.data || parsed.data.length < 2) {
        return `The user uploaded "${filename}" but it appears to be empty.`;
      }
      headers = parsed.data[0];
      const allRows = parsed.data.slice(1);
      totalRows = allRows.length;
      rows = allRows.slice(0, MAX_PARSE_ROWS);
    } else {
      // XLSX / XLS
      const workbook = XLSX.read(data, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) {
        return `The user uploaded "${filename}" but it contains no sheets.`;
      }
      const sheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: '' });
      if (!jsonData || jsonData.length < 2) {
        return `The user uploaded "${filename}" but it appears to be empty.`;
      }
      headers = (jsonData[0] as unknown[]).map(String);
      const allRows = jsonData.slice(1).map((row) => (row as unknown[]).map(String));
      totalRows = allRows.length;
      rows = allRows.slice(0, MAX_PARSE_ROWS);
    }

    const rowCountNote = totalRows > MAX_PARSE_ROWS
      ? `Showing first ${MAX_PARSE_ROWS} of ${totalRows} rows`
      : `${totalRows} rows`;

    const headerLine = headers.join(' | ');
    const dataLines = rows.map((row) => row.join(' | ')).join('\n');

    return `The user uploaded "${filename}" (${rowCountNote}, ${headers.length} columns: ${headers.join(', ')}).\nHere is the data:\n\n${headerLine}\n${dataLines}`;
  } catch {
    return `The user uploaded "${filename}" but it could not be read. The file may be corrupted.`;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/lib/files/parse.test.ts
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/files/parse.ts tests/lib/files/parse.test.ts
git commit -m "feat: CSV/XLSX parsing to text for model context"
```

---

### Task 6: Formula Injection Sanitization

**Files:**
- Create: `src/lib/files/sanitize.ts`
- Create: `tests/lib/files/sanitize.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/lib/files/sanitize.test.ts
import { describe, it, expect } from 'vitest';
import { sanitizeCellValue, sanitizeRows } from '@/lib/files/sanitize';

describe('sanitizeCellValue', () => {
  it('prefixes cells starting with =', () => {
    expect(sanitizeCellValue('=SUM(A1:A10)')).toBe("'=SUM(A1:A10)");
  });

  it('prefixes cells starting with +', () => {
    expect(sanitizeCellValue('+cmd|')).toBe("'+cmd|");
  });

  it('prefixes cells starting with -', () => {
    expect(sanitizeCellValue('-1+1')).toBe("'-1+1");
  });

  it('prefixes cells starting with @', () => {
    expect(sanitizeCellValue('@SUM(A1)')).toBe("'@SUM(A1)");
  });

  it('prefixes cells starting with tab', () => {
    expect(sanitizeCellValue('\tcmd')).toBe("'\tcmd");
  });

  it('prefixes cells starting with carriage return', () => {
    expect(sanitizeCellValue('\rcmd')).toBe("'\rcmd");
  });

  it('leaves normal text unchanged', () => {
    expect(sanitizeCellValue('John Smith')).toBe('John Smith');
  });

  it('leaves numbers unchanged', () => {
    expect(sanitizeCellValue('12345')).toBe('12345');
  });

  it('handles empty string', () => {
    expect(sanitizeCellValue('')).toBe('');
  });
});

describe('sanitizeRows', () => {
  it('sanitizes all cells in all rows', () => {
    const rows = [
      ['Name', '=HYPERLINK("evil")'],
      ['John', '+cmd|stuff'],
    ];
    const result = sanitizeRows(rows);
    expect(result[0][1]).toBe("'=HYPERLINK(\"evil\")");
    expect(result[1][1]).toBe("'+cmd|stuff");
    expect(result[0][0]).toBe('Name');
    expect(result[1][0]).toBe('John');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/lib/files/sanitize.test.ts
```
Expected: FAIL — module not found

- [ ] **Step 3: Implement sanitize.ts**

```typescript
// src/lib/files/sanitize.ts

const DANGEROUS_PREFIXES = ['=', '+', '-', '@', '\t', '\r'];

export function sanitizeCellValue(value: string): string {
  if (!value) return value;
  if (DANGEROUS_PREFIXES.some((p) => value.startsWith(p))) {
    return "'" + value;
  }
  return value;
}

export function sanitizeRows(rows: string[][]): string[][] {
  return rows.map((row) => row.map(sanitizeCellValue));
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/lib/files/sanitize.test.ts
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/files/sanitize.ts tests/lib/files/sanitize.test.ts
git commit -m "feat: formula injection sanitization for generated files"
```

---

### Task 7: File DB Persistence + Cascade Delete

**Files:**
- Create: `src/lib/files/persist.ts`
- Create: `tests/lib/files/persist.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/lib/files/persist.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock prisma
vi.mock('@/lib/db', () => ({
  prisma: {
    file: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      delete: vi.fn(),
    },
    conversation: {
      delete: vi.fn(),
    },
    $transaction: vi.fn((fn: (tx: unknown) => Promise<unknown>) => fn({
      file: {
        findMany: vi.fn().mockResolvedValue([]),
        deleteMany: vi.fn(),
      },
      conversation: {
        delete: vi.fn(),
      },
    })),
  },
}));

// Mock file store
vi.mock('@/lib/files/store', () => ({
  getFileStore: vi.fn(() => ({
    delete: vi.fn(),
  })),
}));

import { createFileRecord, getFileRecord, deleteConversationWithFiles } from '@/lib/files/persist';
import { prisma } from '@/lib/db';

describe('createFileRecord', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a file record in the database', async () => {
    const mockFile = {
      id: 'file-1',
      userId: 'user-1',
      orgId: 'org-1',
      conversationId: 'conv-1',
      filename: 'test.csv',
      mediaType: 'text/csv',
      sizeBytes: 100,
      storageKey: 'org-1/user-1/abc.csv',
      createdAt: new Date(),
    };
    vi.mocked(prisma.file.create).mockResolvedValue(mockFile);

    const result = await createFileRecord({
      userId: 'user-1',
      orgId: 'org-1',
      conversationId: 'conv-1',
      filename: 'test.csv',
      mediaType: 'text/csv',
      sizeBytes: 100,
      storageKey: 'org-1/user-1/abc.csv',
    });

    expect(prisma.file.create).toHaveBeenCalledOnce();
    expect(result.id).toBe('file-1');
  });
});

describe('getFileRecord', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns file record by id', async () => {
    const mockFile = {
      id: 'file-1',
      userId: 'user-1',
      orgId: 'org-1',
      conversationId: 'conv-1',
      filename: 'test.csv',
      mediaType: 'text/csv',
      sizeBytes: 100,
      storageKey: 'org-1/user-1/abc.csv',
      createdAt: new Date(),
    };
    vi.mocked(prisma.file.findUnique).mockResolvedValue(mockFile);

    const result = await getFileRecord('file-1');
    expect(result).toEqual(mockFile);
  });
});

describe('deleteConversationWithFiles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls transaction to delete files from store then DB', async () => {
    await deleteConversationWithFiles('conv-1');
    expect(prisma.$transaction).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/lib/files/persist.test.ts
```
Expected: FAIL — module not found

- [ ] **Step 3: Implement persist.ts**

```typescript
// src/lib/files/persist.ts
import { prisma } from '@/lib/db';
import { getFileStore } from '@/lib/files/store';
import { logger } from '@/lib/logger';

export async function createFileRecord(data: {
  userId: string;
  orgId: string;
  conversationId: string;
  filename: string;
  mediaType: string;
  sizeBytes: number;
  storageKey: string;
}) {
  return prisma.file.create({ data });
}

export async function getFileRecord(id: string) {
  return prisma.file.findUnique({ where: { id } });
}

export async function getFilesByConversation(conversationId: string) {
  return prisma.file.findMany({ where: { conversationId } });
}

export async function deleteFileRecord(id: string) {
  const file = await prisma.file.findUnique({ where: { id } });
  if (!file) return;

  const store = getFileStore();
  await store.delete(file.storageKey);
  await prisma.file.delete({ where: { id } });
}

export async function deleteConversationWithFiles(conversationId: string) {
  const store = getFileStore();

  await prisma.$transaction(async (tx) => {
    // Find all files for this conversation
    const files = await tx.file.findMany({
      where: { conversationId },
      select: { storageKey: true },
    });

    // Delete from file store (outside transaction — best-effort)
    for (const file of files) {
      try {
        await store.delete(file.storageKey);
      } catch (err) {
        logger.warn('[files] Failed to delete file from store', {
          storageKey: file.storageKey,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // Delete DB records (cascade handles file rows too, but be explicit)
    await tx.file.deleteMany({ where: { conversationId } });
    await tx.conversation.delete({ where: { id: conversationId } });
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/lib/files/persist.test.ts
```
Expected: PASS

- [ ] **Step 5: Update conversation DELETE handler to use deleteConversationWithFiles**

Modify `src/app/api/conversations/[id]/route.ts`, replace:
```typescript
    // Messages cascade-delete due to onDelete: Cascade
    await prisma.conversation.delete({ where: { id } });
```
with:
```typescript
    // Delete conversation + all associated files from storage and DB
    await deleteConversationWithFiles(id);
```

Add the import at the top:
```typescript
import { deleteConversationWithFiles } from '@/lib/files/persist';
```

Remove the `prisma` import if no longer needed (keep it — PATCH handler still uses it).

- [ ] **Step 6: Commit**

```bash
git add src/lib/files/persist.ts tests/lib/files/persist.test.ts src/app/api/conversations/[id]/route.ts
git commit -m "feat: file DB persistence + cascade delete with storage cleanup"
```

---

### Task 8: Upload API Route

**Files:**
- Create: `src/app/api/files/route.ts`
- Modify: `src/proxy.ts`

- [ ] **Step 1: Create the upload route**

```typescript
// src/app/api/files/route.ts
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { getRequestId } from '@/lib/request-context';
import { getFileStore } from '@/lib/files/store';
import { validateFile, sanitizeFilename, getExtension } from '@/lib/files/validate';
import { createFileRecord } from '@/lib/files/persist';
import { EXTENSION_TO_MIME, MAX_FILES_PER_MESSAGE } from '@/lib/files/types';
import type { AllowedExtension } from '@/lib/files/types';
import { randomUUID } from 'crypto';

export async function POST(req: Request) {
  const requestId = await getRequestId();
  const log = logger.child({ requestId });

  const session = await auth();
  if (!session?.user?.agentUserId) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const conversationId = formData.get('conversationId') as string | null;

    if (!file) {
      return Response.json({ error: 'No file provided' }, { status: 400 });
    }

    if (!conversationId) {
      return Response.json({ error: 'conversationId is required' }, { status: 400 });
    }

    // Verify conversation ownership
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId, userId: session.user.agentUserId },
    });

    if (!conversation) {
      return Response.json({ error: 'Conversation not found' }, { status: 404 });
    }

    // Read file data
    const arrayBuffer = await file.arrayBuffer();
    const data = Buffer.from(arrayBuffer);

    // Validate
    const validation = validateFile(file.name, data.length, data);
    if (!validation.valid) {
      return Response.json({ error: validation.error }, { status: 400 });
    }

    // Sanitize filename and determine media type
    const cleanName = sanitizeFilename(file.name);
    const ext = getExtension(cleanName) as AllowedExtension;
    const mediaType = EXTENSION_TO_MIME[ext] || 'application/octet-stream';

    // Generate storage key and store
    const uuid = randomUUID();
    const storageKey = `${session.user.orgId}/${session.user.agentUserId}/${uuid}${ext}`;
    const store = getFileStore();

    await store.put(storageKey, data, {
      filename: cleanName,
      mediaType,
      sizeBytes: data.length,
      userId: session.user.agentUserId,
      orgId: session.user.orgId,
      conversationId,
    });

    // Create DB record
    const record = await createFileRecord({
      userId: session.user.agentUserId,
      orgId: session.user.orgId,
      conversationId,
      filename: cleanName,
      mediaType,
      sizeBytes: data.length,
      storageKey,
    });

    log.info('[files] Upload complete', {
      fileId: record.id,
      filename: cleanName,
      sizeBytes: data.length,
      conversationId,
    });

    return Response.json({
      fileId: record.id,
      filename: cleanName,
      mediaType,
      sizeBytes: data.length,
    });
  } catch (error) {
    log.error('[files] Upload error', {
      error: error instanceof Error ? error.message : String(error),
    });
    return Response.json(
      { error: 'Upload failed. Please try again.' },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 2: Add rate limit entry in proxy.ts**

In `src/proxy.ts`, add to the `RATE_LIMITS` object:

```typescript
  '/api/files': 60,
  '/api/files/:id': 60,
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/files/route.ts src/proxy.ts
git commit -m "feat: POST /api/files upload endpoint with validation"
```

---

### Task 9: Download + Delete API Route

**Files:**
- Create: `src/app/api/files/[id]/route.ts`

- [ ] **Step 1: Create the download/delete route**

```typescript
// src/app/api/files/[id]/route.ts
import { auth } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { getRequestId } from '@/lib/request-context';
import { getFileRecord, deleteFileRecord } from '@/lib/files/persist';
import { getFileStore } from '@/lib/files/store';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const requestId = await getRequestId();
  const log = logger.child({ requestId });

  const session = await auth();
  if (!session?.user?.agentUserId) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { id } = await params;

  try {
    const file = await getFileRecord(id);
    if (!file) {
      return new Response('Not found', { status: 404 });
    }

    // Ownership check: must be file owner or org admin
    const isOwner = file.userId === session.user.agentUserId;
    const isAdmin = session.user.role === 'admin' && file.orgId === session.user.orgId;
    if (!isOwner && !isAdmin) {
      return new Response('Not found', { status: 404 });
    }

    const store = getFileStore();
    const result = await store.get(file.storageKey);
    if (!result) {
      log.error('[files] File exists in DB but not in store', { fileId: id, storageKey: file.storageKey });
      return new Response('File not found in storage', { status: 404 });
    }

    return new Response(result.data, {
      headers: {
        'Content-Type': file.mediaType,
        'Content-Disposition': `attachment; filename="${encodeURIComponent(file.filename)}"`,
        'Content-Length': String(result.data.length),
      },
    });
  } catch (error) {
    log.error('[files] Download error', { error: error instanceof Error ? error.message : String(error) });
    return Response.json({ error: 'Download failed' }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const requestId = await getRequestId();
  const log = logger.child({ requestId });

  const session = await auth();
  if (!session?.user?.agentUserId) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { id } = await params;

  try {
    const file = await getFileRecord(id);
    if (!file) {
      return new Response('Not found', { status: 404 });
    }

    const isOwner = file.userId === session.user.agentUserId;
    const isAdmin = session.user.role === 'admin' && file.orgId === session.user.orgId;
    if (!isOwner && !isAdmin) {
      return new Response('Not found', { status: 404 });
    }

    await deleteFileRecord(id);
    return new Response(null, { status: 204 });
  } catch (error) {
    log.error('[files] Delete error', { error: error instanceof Error ? error.message : String(error) });
    return Response.json({ error: 'Delete failed' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/files/[id]/route.ts
git commit -m "feat: GET/DELETE /api/files/[id] download + delete endpoints"
```

---

### Task 10: Chat Route — File Pre-Processing + create_file Tool

**Files:**
- Modify: `src/app/api/chat/route.ts`

- [ ] **Step 1: Add imports at top of chat route**

Add to the imports section of `src/app/api/chat/route.ts`:

```typescript
import { z } from 'zod';
import { tool } from 'ai';
import { parseFileToText } from '@/lib/files/parse';
import { getFileStore } from '@/lib/files/store';
import { getFileRecord, createFileRecord } from '@/lib/files/persist';
import { sanitizeRows } from '@/lib/files/sanitize';
import { EXTENSION_TO_MIME } from '@/lib/files/types';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { randomUUID } from 'crypto';
```

- [ ] **Step 2: Add file pre-processing before streamText**

After the system prompt is built (after `buildSystemPrompt()` call) and before the `streamText()` call, add a file pre-processing step. Insert before `// 9. Stream the response`:

```typescript
    // 8b. Pre-process any file attachments in the last message
    const processedMessages = [...messages];
    const lastMsg = processedMessages[processedMessages.length - 1];
    if (lastMsg?.role === 'user' && lastMsg.parts) {
      const newParts = [];
      for (const part of lastMsg.parts) {
        if (part.type === 'file' && 'url' in part) {
          const fileUrl = (part as { type: 'file'; url: string }).url;
          // Extract file ID from /api/files/{id}
          const fileIdMatch = fileUrl.match(/\/api\/files\/([^/?]+)/);
          if (fileIdMatch) {
            const fileRecord = await getFileRecord(fileIdMatch[1]);
            if (fileRecord) {
              const store = getFileStore();
              const stored = await store.get(fileRecord.storageKey);
              if (stored) {
                const parsed = parseFileToText(stored.data, fileRecord.mediaType, fileRecord.filename);
                newParts.push({ type: 'text' as const, text: parsed });
                continue;
              }
            }
          }
          // If we couldn't process the file, keep the original part
          newParts.push(part);
        } else {
          newParts.push(part);
        }
      }
      processedMessages[processedMessages.length - 1] = {
        ...lastMsg,
        parts: newParts,
      };
    }
```

- [ ] **Step 3: Add create_file tool to the tools object**

Before the `streamText()` call, after MCP tools are loaded, merge in the local create_file tool:

```typescript
    // 8c. Register local create_file tool for AI-generated downloads
    const createFileTool = tool({
      description: 'Create a downloadable file for the user (CSV or Excel spreadsheet). Use this when the user asks you to export, generate, or create a file they can download.',
      parameters: z.object({
        filename: z.string().describe('Name for the file, e.g. "sunday-schedule.csv"'),
        format: z.enum(['csv', 'xlsx']).describe('File format'),
        headers: z.array(z.string()).describe('Column headers'),
        rows: z.array(z.array(z.string())).describe('Row data — each row is an array of cell values'),
      }),
      execute: async ({ filename, format, headers, rows }) => {
        const sanitized = sanitizeRows(rows);
        let data: Buffer;
        let mediaType: string;

        if (format === 'csv') {
          const csvContent = Papa.unparse({ fields: headers, data: sanitized });
          data = Buffer.from(csvContent, 'utf-8');
          mediaType = 'text/csv';
        } else {
          const ws = XLSX.utils.aoa_to_sheet([headers, ...sanitized]);
          const wb = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
          data = Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
          mediaType = EXTENSION_TO_MIME['.xlsx'];
        }

        const ext = format === 'csv' ? '.csv' : '.xlsx';
        const storageKey = `${session.user.orgId}/${session.user.agentUserId}/${randomUUID()}${ext}`;
        const store = getFileStore();
        await store.put(storageKey, data, {
          filename,
          mediaType,
          sizeBytes: data.length,
          userId: session.user.agentUserId,
          orgId: session.user.orgId,
          conversationId,
        });

        const record = await createFileRecord({
          userId: session.user.agentUserId,
          orgId: session.user.orgId,
          conversationId,
          filename,
          mediaType,
          sizeBytes: data.length,
          storageKey,
        });

        return {
          fileId: record.id,
          downloadUrl: `/api/files/${record.id}`,
          filename,
          sizeBytes: data.length,
        };
      },
    });

    const allTools = { ...tools, create_file: createFileTool };
```

- [ ] **Step 4: Update streamText call to use processedMessages and allTools**

Change the `streamText()` call:

```typescript
  const result = streamText({
      model: createModel(user.apiProvider!, modelId, apiKey),
      system: systemPrompt,
      messages: await convertToModelMessages(processedMessages),
      tools: allTools,
      stopWhen: stepCountIs(5),
```

- [ ] **Step 5: Commit**

```bash
git add src/app/api/chat/route.ts
git commit -m "feat: file pre-processing pipeline + create_file tool in chat"
```

---

### Task 11: UI — File Chip + File Card Components

**Files:**
- Create: `src/components/chat/file-chip.tsx`
- Create: `src/components/chat/file-card.tsx`

- [ ] **Step 1: Create file-chip.tsx**

```tsx
// src/components/chat/file-chip.tsx
'use client';

import { FileSpreadsheet, X } from 'lucide-react';

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function truncateName(name: string, max = 30): string {
  if (name.length <= max) return name;
  const ext = name.lastIndexOf('.');
  if (ext > 0 && name.length - ext < 8) {
    const extStr = name.slice(ext);
    return name.slice(0, max - extStr.length - 3) + '...' + extStr;
  }
  return name.slice(0, max - 3) + '...';
}

interface FileChipProps {
  name: string;
  size: number;
  progress?: number; // 0-100, undefined = not uploading
  error?: string;
  onRemove: () => void;
}

export function FileChip({ name, size, progress, error, onRemove }: FileChipProps) {
  return (
    <div className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${error ? 'border-red-300 bg-red-50' : 'border-gray-200 bg-gray-50'}`}>
      <FileSpreadsheet className="h-4 w-4 shrink-0 text-gray-500" />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-gray-700">{truncateName(name)}</p>
        <p className="text-xs text-gray-500">{formatSize(size)}</p>
        {error && <p className="text-xs text-red-600">{error}</p>}
        {progress !== undefined && !error && (
          <div className="mt-1 h-1 w-full rounded-full bg-gray-200">
            <div
              className="h-1 rounded-full bg-blue-600 transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}
      </div>
      <button
        onClick={onRemove}
        className="flex min-h-[44px] min-w-[44px] items-center justify-center text-gray-400 hover:text-gray-600"
        aria-label={`Remove ${name}`}
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Create file-card.tsx**

```tsx
// src/components/chat/file-card.tsx
'use client';

import { FileSpreadsheet, Download } from 'lucide-react';

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface UploadCardProps {
  filename: string;
  sizeBytes: number;
}

export function UploadCard({ filename, sizeBytes }: UploadCardProps) {
  return (
    <div className="my-2 flex items-center gap-2 rounded-lg border border-gray-200 bg-white p-2 text-sm">
      <FileSpreadsheet className="h-5 w-5 shrink-0 text-green-600" />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-gray-700">{filename}</p>
        <p className="text-xs text-gray-500">{formatSize(sizeBytes)}</p>
      </div>
    </div>
  );
}

interface DownloadCardProps {
  fileId: string;
  filename: string;
  sizeBytes: number;
}

export function DownloadCard({ fileId, filename, sizeBytes }: DownloadCardProps) {
  return (
    <div className="my-2 flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm">
      <FileSpreadsheet className="h-5 w-5 shrink-0 text-blue-600" />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-gray-700">{filename}</p>
        <p className="text-xs text-gray-500">{formatSize(sizeBytes)}</p>
      </div>
      <a
        href={`/api/files/${fileId}`}
        download={filename}
        className="flex min-h-[48px] items-center gap-1.5 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700"
      >
        <Download className="h-4 w-4" />
        Download
      </a>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/chat/file-chip.tsx src/components/chat/file-card.tsx
git commit -m "feat: FileChip + FileCard UI components"
```

---

### Task 12: Chat Interface — Paperclip Button + Upload Flow

**Files:**
- Modify: `src/components/chat/chat-interface.tsx`

- [ ] **Step 1: Add file state and imports**

Add imports at the top of `src/components/chat/chat-interface.tsx`:

```typescript
import { Paperclip } from 'lucide-react';
import { FileChip } from '@/components/chat/file-chip';
import { ALLOWED_EXTENSIONS, MAX_FILE_SIZE_BYTES, MAX_FILES_PER_MESSAGE } from '@/lib/files/types';
```

Inside the `ChatInterface` component, add state after the existing state declarations:

```typescript
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingFiles, setPendingFiles] = useState<Array<{ file: File; error?: string; progress?: number }>>([]);
  const [consentDismissed, setConsentDismissed] = useState(() => {
    if (typeof window === 'undefined') return true;
    return localStorage.getItem('file-upload-consent-dismissed') === 'true';
  });
```

- [ ] **Step 2: Add file handling functions**

Add these functions inside the component, after the existing handler functions:

```typescript
  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    // Show consent banner on first use
    if (!consentDismissed) {
      // Banner will show — files still get added
    }

    const newFiles: typeof pendingFiles = [];
    for (const file of files) {
      if (pendingFiles.length + newFiles.length >= MAX_FILES_PER_MESSAGE) {
        newFiles.push({ file, error: 'You can attach up to 3 files at a time.' });
        break;
      }
      const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
      if (!(ALLOWED_EXTENSIONS as readonly string[]).includes(ext)) {
        newFiles.push({ file, error: "This file type isn't supported. Please upload a CSV or Excel file." });
        continue;
      }
      if (file.size > MAX_FILE_SIZE_BYTES) {
        newFiles.push({ file, error: 'This file is too large. The maximum is 10 MB.' });
        continue;
      }
      newFiles.push({ file });
    }
    setPendingFiles((prev) => [...prev, ...newFiles]);
    // Reset input so re-selecting the same file works
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function removeFile(index: number) {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index));
  }

  function dismissConsent() {
    setConsentDismissed(true);
    localStorage.setItem('file-upload-consent-dismissed', 'true');
  }

  async function uploadFiles(conversationId: string): Promise<Array<{ type: 'file'; url: string; mediaType: string; filename: string }>> {
    const validFiles = pendingFiles.filter((pf) => !pf.error);
    const uploaded: Array<{ type: 'file'; url: string; mediaType: string; filename: string }> = [];

    for (let i = 0; i < validFiles.length; i++) {
      const pf = validFiles[i];
      setPendingFiles((prev) =>
        prev.map((f) => (f.file === pf.file ? { ...f, progress: 0 } : f))
      );

      const formData = new FormData();
      formData.append('file', pf.file);
      formData.append('conversationId', conversationId);

      try {
        const res = await fetch('/api/files', { method: 'POST', body: formData });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: 'Upload failed' }));
          setPendingFiles((prev) =>
            prev.map((f) => (f.file === pf.file ? { ...f, error: err.error, progress: undefined } : f))
          );
          continue;
        }
        const data = await res.json();
        setPendingFiles((prev) =>
          prev.map((f) => (f.file === pf.file ? { ...f, progress: 100 } : f))
        );
        uploaded.push({
          type: 'file',
          url: `/api/files/${data.fileId}`,
          mediaType: data.mediaType,
          filename: data.filename,
        });
      } catch {
        setPendingFiles((prev) =>
          prev.map((f) => (f.file === pf.file ? { ...f, error: 'Upload failed. Please try again.', progress: undefined } : f))
        );
      }
    }

    return uploaded;
  }
```

- [ ] **Step 3: Update submitText to handle files**

Replace the existing `submitText` function:

```typescript
  const submitText = useCallback(async (text: string) => {
    if (!text.trim() || isStreaming) return;
    if (textareaRef.current) {
      textareaRef.current.value = '';
      textareaRef.current.style.height = 'auto';
    }

    const validFiles = pendingFiles.filter((pf) => !pf.error);

    if (validFiles.length > 0 && convId) {
      const fileRefs = await uploadFiles(convId);
      setPendingFiles([]);
      await sendMessage({ text: text.trim(), files: fileRefs.length > 0 ? fileRefs : undefined });
    } else {
      setPendingFiles([]);
      await sendMessage({ text: text.trim() });
    }
  }, [isStreaming, sendMessage, pendingFiles, convId]);
```

- [ ] **Step 4: Add paperclip button, file chips, and consent banner to the JSX**

In the form JSX, add the paperclip button before the textarea, file chips above the form, and consent banner:

Replace the `<form>` block with:

```tsx
      {!consentDismissed && pendingFiles.length > 0 && (
        <div className="mx-4 mb-2 flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
          <p className="flex-1">
            Files you upload are sent to your AI provider for processing. Your data is not used for training. This notice won&apos;t appear again.
          </p>
          <button onClick={dismissConsent} className="shrink-0 font-medium text-amber-600 hover:text-amber-800">
            Got it
          </button>
        </div>
      )}

      {pendingFiles.length > 0 && (
        <div className="mx-4 mb-2 space-y-1">
          {pendingFiles.map((pf, i) => (
            <FileChip
              key={`${pf.file.name}-${i}`}
              name={pf.file.name}
              size={pf.file.size}
              progress={pf.progress}
              error={pf.error}
              onRemove={() => removeFile(i)}
            />
          ))}
        </div>
      )}

      <form onSubmit={handleSubmit} className="border-t p-4">
        <div className="flex items-end gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,.xls,.tsv"
            multiple
            className="hidden"
            onChange={handleFileSelect}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isStreaming}
            className="flex min-h-[48px] min-w-[48px] items-center justify-center rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 disabled:opacity-50"
            aria-label="Attach file"
          >
            <Paperclip className="h-5 w-5" />
          </button>
          <Textarea
            ref={textareaRef}
            placeholder="Ask about your church data..."
            onKeyDown={handleKeyDown}
            onInput={handleInput}
            rows={1}
            className="min-h-[44px] flex-1 resize-none"
            disabled={isStreaming}
            aria-label="Chat message"
          />
          <Button
            type="submit"
            disabled={isStreaming}
            className="h-[44px] min-w-[44px] shrink-0"
            aria-label="Send message"
          >
            {isStreaming ? '...' : 'Send'}
          </Button>
        </div>
        <p className="mt-1 text-xs text-gray-400">
          Press Enter to send, Shift+Enter for a new line
        </p>
      </form>
```

- [ ] **Step 5: Commit**

```bash
git add src/components/chat/chat-interface.tsx
git commit -m "feat: paperclip upload button, file chips, consent banner in chat"
```

---

### Task 13: Message Bubble — Render File Cards

**Files:**
- Modify: `src/components/chat/message-bubble.tsx`

- [ ] **Step 1: Add file card imports and rendering**

Add import at the top:
```typescript
import { UploadCard, DownloadCard } from '@/components/chat/file-card';
```

In the `message.parts.map()` block, add handling for file parts and tool results that contain file downloads. Add after the existing `if (part.type === 'text')` block:

```tsx
          if (part.type === 'file') {
            const filePart = part as { type: 'file'; url: string; mediaType: string; filename?: string };
            return (
              <UploadCard
                key={i}
                filename={filePart.filename || 'Uploaded file'}
                sizeBytes={0}
              />
            );
          }
```

For download cards from tool results, add inside the `dynamic-tool` handler when the tool is `create_file` and state is `output-available`:

After the existing `if (part.type === 'dynamic-tool')` block, update it to:

```tsx
          if (part.type === 'dynamic-tool') {
            const isDone = part.state === 'output-available';
            // Show download card for create_file tool results
            if (isDone && part.toolName === 'create_file' && part.output) {
              const output = part.output as { fileId?: string; filename?: string; sizeBytes?: number };
              if (output.fileId) {
                return (
                  <DownloadCard
                    key={i}
                    fileId={output.fileId}
                    filename={output.filename || 'download'}
                    sizeBytes={output.sizeBytes || 0}
                  />
                );
              }
            }
            return (
              <div
                key={i}
                className="my-2 rounded border border-gray-200 bg-white p-2 text-sm text-gray-600"
              >
                <span className="font-medium">{getToolLabel(part.toolName, isDone)}</span>
              </div>
            );
          }
```

- [ ] **Step 2: Commit**

```bash
git add src/components/chat/message-bubble.tsx
git commit -m "feat: render UploadCard + DownloadCard in chat messages"
```

---

### Task 14: Docker + Deployment Config

**Files:**
- Modify: `Dockerfile`
- Modify: `docker-compose.yml`
- Modify: `.env.example`

- [ ] **Step 1: Update Dockerfile**

Add before the `USER nextjs` line in the `runner` stage:

```dockerfile
RUN mkdir -p /data/uploads && chown nextjs:nodejs /data/uploads
```

- [ ] **Step 2: Update docker-compose.yml**

Add a volume mount to the `pco-agent` service:

```yaml
    volumes:
      - uploads:/data/uploads
```

Add a top-level volumes section:

```yaml
volumes:
  uploads:
```

- [ ] **Step 3: Update .env.example**

Append:

```bash
# File upload storage (default: local filesystem)
# FILE_STORE="local"
# UPLOAD_DIR="/data/uploads"
# MAX_UPLOAD_SIZE_MB="10"
```

- [ ] **Step 4: Commit**

```bash
git add Dockerfile docker-compose.yml .env.example
git commit -m "feat: Docker volume + env config for file uploads"
```

---

### Task 15: Full Integration Test + Final Verification

**Files:**
- All test files

- [ ] **Step 1: Run the full test suite**

```bash
npx vitest run
```
Expected: All tests pass

- [ ] **Step 2: Run type check**

```bash
npx tsc --noEmit
```
Expected: No errors

- [ ] **Step 3: Run lint**

```bash
npx eslint src --ext .ts,.tsx
```
Expected: 0 errors

- [ ] **Step 4: Run production build**

```bash
npm run build
```
Expected: Build succeeds

- [ ] **Step 5: Verify the Prisma schema is in sync**

```bash
npx prisma validate
```
Expected: "The schema is valid"

- [ ] **Step 6: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "fix: integration test fixes for file upload feature"
```

---

## Self-Review Checklist

**Spec coverage:**
- [x] Section 1 (Storage Abstraction) → Task 2, 4
- [x] Section 2 (Database Schema) → Task 1
- [x] Section 3 (API Routes) → Task 8, 9
- [x] Section 4 (File Parsing) → Task 5, 10
- [x] Section 4 (Generated Files / create_file) → Task 6, 10
- [x] Section 5 (Chat UI) → Task 11, 12, 13
- [x] Section 6 (Security) → Task 3, 6, 8 (validation in upload route)
- [x] Section 7 (Docker/Deployment) → Task 14
- [x] Section 8 (File map) → All tasks align with file map
- [x] Cascade delete → Task 7
- [x] Rate limiting → Task 8
- [x] PII consent banner → Task 12
