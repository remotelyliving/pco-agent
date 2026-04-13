export const MAX_FILE_SIZE_BYTES = (parseInt(process.env.MAX_UPLOAD_SIZE_MB || '10', 10)) * 1024 * 1024;
export const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB — Anthropic rejects base64 images >5MB
export const MAX_FILES_PER_MESSAGE = 3;
export const MAX_USER_STORAGE_BYTES = 500 * 1024 * 1024; // 500MB per user
export const MAX_PARSE_ROWS = 500;

export const DATA_EXTENSIONS = ['.csv', '.tsv', '.xlsx', '.xls'] as const;
export const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp'] as const;
export const ALLOWED_EXTENSIONS = [...DATA_EXTENSIONS, ...IMAGE_EXTENSIONS] as const;
export type AllowedExtension = (typeof ALLOWED_EXTENSIONS)[number];

export const EXTENSION_TO_MIME: Record<AllowedExtension, string> = {
  '.csv': 'text/csv',
  '.tsv': 'text/tab-separated-values',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.xls': 'application/vnd.ms-excel',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};

export const IMAGE_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;

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
