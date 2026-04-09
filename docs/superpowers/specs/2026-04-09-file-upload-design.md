# File Upload/Download for Chat

**Goal:** Let church staff upload spreadsheets (CSV, XLSX) into chat conversations for the AI to process, and download files the AI generates — all scoped to individual conversations with automatic cleanup.

**Architecture:** Storage abstraction (local filesystem MVP, S3-compatible future) with server-side file parsing before model ingestion. Files are conversation-scoped — they live and die with the conversation. Upload/download via authenticated API routes. Local `create_file` tool enables the model to generate downloadable files.

**Tech Stack additions:** papaparse (CSV parsing), SheetJS/xlsx (XLSX parsing), lucide-react icons (Paperclip, Download, FileSpreadsheet)

---

## 1. Storage Abstraction

### FileStore Interface

```typescript
interface FileMeta {
  filename: string;
  mediaType: string;
  sizeBytes: number;
  userId: string;
  orgId: string;
  conversationId: string;
}

interface FileStore {
  put(key: string, data: Buffer, meta: FileMeta): Promise<string>; // returns storage key
  get(key: string): Promise<{ data: Buffer; meta: FileMeta } | null>;
  delete(key: string): Promise<void>;
}
```

No `list` method — files are tracked in Postgres, not enumerated from storage.

### LocalFileStore (MVP)

- Writes to a Docker volume at `/data/uploads/{orgId}/{userId}/{uuid}.ext`
- For local dev, uses `./uploads/` in the project root
- Selected by `FILE_STORE=local` env var (default)

### S3FileStore (future, not built in MVP)

- Same interface, configurable via `S3_BUCKET`, `S3_REGION`, `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`
- Cloudflare R2 is the recommended first cloud target (already using Cloudflare tunnel, zero egress fees)
- Selected by `FILE_STORE=s3` env var

### Factory

```typescript
function getFileStore(): FileStore {
  const provider = process.env.FILE_STORE || 'local';
  switch (provider) {
    case 'local': return new LocalFileStore(process.env.UPLOAD_DIR || './uploads');
    case 's3': return new S3FileStore(/* env config */);
    default: throw new Error(`Unknown FILE_STORE: ${provider}`);
  }
}
```

### Limits

- 10MB per file (enforced client-side and server-side)
- 3 files per message
- Allowed types: `.csv`, `.xlsx`, `.xls`, `.tsv`
- Validated by file extension AND magic bytes (PK header for XLSX, UTF-8 text for CSV/TSV)
- Macro-enabled formats rejected (`.xlsm`, `.docm`, `.xltm`)

### File Lifecycle

- Files are **conversation-scoped** — tied to a conversation via foreign key
- Manual conversation delete, TTL expiry, and any future conversation limit enforcement all flow through a single `deleteConversationWithFiles()` function
- This function queries files for the conversation, deletes from FileStore, then deletes the conversation (Prisma `onDelete: Cascade` handles DB rows)
- Processing temp data (parsed text sent to model) is in-memory only, never persisted
- No ghost files — every deletion path cleans both storage and DB

---

## 2. Database Schema

```prisma
model File {
  id              String   @id @default(uuid())
  userId          String
  orgId           String
  conversationId  String
  filename        String        // Original display name (user-facing)
  mediaType       String        // e.g. "text/csv"
  sizeBytes       Int
  storageKey      String @unique // UUID-based path in FileStore
  createdAt       DateTime @default(now())

  user         User         @relation(fields: [userId], references: [id])
  organization Organization @relation(fields: [orgId], references: [id])
  conversation Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)

  @@schema("agent")
}
```

**Filename sanitization:** The `filename` field stores the original name for display only. Path separators (`/`, `\`, `..`), null bytes, and control characters are stripped on upload. The `storageKey` is always a UUID — never derived from user input.

---

## 3. API Routes

### POST /api/files — Upload

- Auth required (NextAuth session)
- Accepts `multipart/form-data` with a `file` field and `conversationId` field
- Validates: file type (extension + magic bytes), size (10MB cap), conversation ownership
- Generates UUID storage key, writes to FileStore, creates DB record
- Returns `{ fileId, filename, mediaType, sizeBytes }`
- Rate limited: added to existing rate limiter in `proxy.ts` (60/min mutation bucket)

### GET /api/files/[id] — Download

- Auth required
- Verifies requesting user is file owner (same userId) OR org admin
- Streams file from FileStore with correct `Content-Type` and `Content-Disposition` headers
- No signed URLs, no public access — uses existing session auth

### DELETE /api/files/[id] — Delete

- Auth required, same ownership check as download
- Deletes from FileStore and DB
- Also called internally by `deleteConversationWithFiles()`

---

## 4. File Parsing & Model Integration

### Pre-processing Pipeline

Runs in the chat route (`api/chat/route.ts`) before `streamText()`:

1. Detect file parts in the incoming message
2. For each file, fetch from FileStore and parse:
   - **CSV/TSV:** Parse with `papaparse` → structured text (headers + rows)
   - **XLSX/XLS:** Parse with SheetJS → extract first sheet → same structured text
3. Cap at 500 rows. If the file has more, note "Showing first 500 of N rows" in the preamble
4. Replace the file message part with a text part:
   ```
   The user uploaded "volunteers.xlsx" (247 rows, 8 columns: Name, Email, Phone, Team, Position, Status, Last Served, Notes).
   Here is the data:

   Name | Email | Phone | Team | ...
   John Smith | john@example.com | 555-1234 | Worship | ...
   ...
   ```
5. Original file remains in FileStore for reference/download

### Generated Files (Download Path)

A local tool defined in the chat route and merged into the `tools` object alongside MCP tools before passing to `streamText` (not an MCP tool — runs server-side in our app):

```typescript
create_file: {
  description: 'Create a downloadable file for the user (CSV or Excel spreadsheet)',
  parameters: z.object({
    filename: z.string().describe('Name for the file, e.g. "sunday-schedule.csv"'),
    format: z.enum(['csv', 'xlsx']),
    headers: z.array(z.string()),
    rows: z.array(z.array(z.string())),
  }),
  execute: async ({ filename, format, headers, rows }) => {
    // Build file buffer (papaparse for CSV, SheetJS for XLSX)
    // Sanitize formula injection (prefix =, +, -, @, \t, \r with ')
    // Write to FileStore, create DB record
    // Return { fileId, downloadUrl, filename, sizeBytes }
  },
}
```

The model calls this tool when it wants to produce a downloadable file. The assistant message renders a download card with the returned info.

---

## 5. Chat UI

### Upload Trigger

- Paperclip icon button (`lucide-react` `Paperclip`) to the left of the textarea
- 48px touch target, consistent with app button sizing
- Triggers hidden `<input type="file" accept=".csv,.xlsx,.xls,.tsv">`
- Supports multiple files (up to 3)

### Pre-Send Preview

After file selection, a removable chip appears below the textarea:
- File spreadsheet icon + filename (truncated at 30 chars) + human-readable size ("2.4 MB") + X button to remove
- Message is NOT sent until the user clicks Send
- Multiple chips stack vertically for multiple files

### Client-Side Validation

Before upload, check extension and size. Reject immediately with plain-language errors:
- Wrong type: "This file type isn't supported. Please upload a CSV or Excel file."
- Too large: "This file is too large. The maximum is 10 MB."
- Too many: "You can attach up to 3 files at a time."

### Upload Flow on Send

1. Upload each file to `POST /api/files` (progress bar on each chip)
2. On success, include file references in `sendMessage()`
3. On failure, show error inline — do NOT lose the user's typed message text

### In-Chat Display

**User bubble:** Compact file card (spreadsheet icon, filename, size) alongside their text message.

**Assistant bubble (downloads):** Download card with file icon, filename, size, and a prominent "Download" button (48px height, primary color) linking to `/api/files/{id}`.

### PII Consent Banner

One-time dismissible banner on first file attach in any conversation:

> "Files you upload are sent to your AI provider for processing. Your data is not used for training. This notice won't appear again."

Stored as a `localStorage` flag (`file-upload-consent-dismissed`). No server round-trip.

---

## 6. Security Controls

### Upload Validation (Server-Side)

1. Extension allowlist: `.csv`, `.xlsx`, `.xls`, `.tsv`
2. Magic byte validation: PK signature (504B0304) for XLSX, UTF-8 text for CSV/TSV
3. Reject macro-enabled formats even if renamed
4. Filename sanitization: strip path separators, null bytes, control characters; store UUID key
5. Size enforcement: 10MB hard cap (defense in depth — client already checks)

### Formula Injection on Generated Files

When `create_file` writes CSV/XLSX, sanitize cell values: prefix any cell starting with `=`, `+`, `-`, `@`, `\t`, `\r` with a single quote character. Prevents Excel formula execution when users open downloaded files.

### Access Control

- Upload: authenticated user, file scoped to userId + orgId + conversationId
- Download: authenticated user must be file owner OR org admin
- Delete: same as download
- No public URLs, no signed URLs, no unauthenticated access

---

## 7. Docker / Deployment

### Docker Volume

Add to `docker-compose.yml`:
```yaml
services:
  pco-agent:
    volumes:
      - uploads:/data/uploads
volumes:
  uploads:
```

Add to `Dockerfile` before `USER nextjs`:
```dockerfile
RUN mkdir -p /data/uploads && chown nextjs:nodejs /data/uploads
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `FILE_STORE` | `local` | Storage backend: `local` or `s3` (future) |
| `UPLOAD_DIR` | `/data/uploads` | Local storage directory |
| `MAX_UPLOAD_SIZE_MB` | `10` | Per-file upload limit |

S3 variables (future): `S3_BUCKET`, `S3_REGION`, `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`

### .gitignore

Add `uploads/` to prevent local dev uploads from being committed.

---

## 8. New File Map

```
src/
  lib/
    files/
      store.ts          # FileStore interface + factory
      local-store.ts    # LocalFileStore implementation
      parse.ts          # CSV/XLSX pre-processing to text
      validate.ts       # Type/size/magic-byte validation
      sanitize.ts       # Formula injection sanitization for generated files
      types.ts          # FileMeta, FileRecord types, constants (limits, allowed types)
  app/api/
    files/
      route.ts          # POST upload
      [id]/
        route.ts        # GET download, DELETE
  components/
    chat/
      file-chip.tsx     # Pre-send file preview chip with progress + remove
      file-card.tsx     # In-chat file display (upload card + download card)
```

**Modified files:**
- `src/app/api/chat/route.ts` — file pre-processing pipeline + `create_file` tool registration
- `src/components/chat/chat-interface.tsx` — paperclip button, file state, upload flow, consent banner
- `src/components/chat/message-bubble.tsx` — render file cards for upload/download parts
- `src/app/api/conversations/[id]/route.ts` — use `deleteConversationWithFiles()` in DELETE handler
- `prisma/schema.prisma` — add File model
- `docker-compose.yml` — add uploads volume
- `Dockerfile` — create uploads directory with correct permissions

---

## 9. Future Enhancements (Not in MVP)

- **Table-to-download (Approach C):** Detect structured tables in assistant markdown responses, offer "Download as CSV/Excel" button. Requires reliable markdown table detection.
- **Virus scanning:** ClamAV sidecar container for uploaded files before processing.
- **Prompt injection defense:** Research and implement detection/mitigation for malicious instructions embedded in uploaded file content (CSV cell values, sheet names, etc.).
- **Column-level PII redaction:** Let users specify which columns to send to the AI, redacting sensitive fields.
- **Encryption at rest:** AES-256-GCM for stored files (reuse Fernet key infrastructure).
- **S3/R2 storage backend:** Implement `S3FileStore` with Cloudflare R2 as recommended first target.
- **Image/PDF support:** Extend allowed types to images and PDFs for reference documents.
