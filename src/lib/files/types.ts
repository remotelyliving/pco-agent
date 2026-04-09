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

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
