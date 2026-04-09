import {
  MAX_FILE_SIZE_BYTES,
  ALLOWED_EXTENSIONS,
  BLOCKED_EXTENSIONS,
} from '@/lib/files/types';

const PK_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

export function getExtension(filename: string): string {
  const dot = filename.lastIndexOf('.');
  if (dot < 0) return '';
  return filename.slice(dot).toLowerCase();
}

export function sanitizeFilename(name: string): string {
  // Extract basename first to handle path traversal
  const parts = name.split(/[/\\]/);
  const basename = parts[parts.length - 1] ?? name;
  let clean = basename.replace(/\.\./g, '');
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
  if (sizeBytes > MAX_FILE_SIZE_BYTES) {
    return { valid: false, error: 'This file is too large. The maximum is 10 MB.' };
  }

  const ext = getExtension(filename);

  if ((BLOCKED_EXTENSIONS as readonly string[]).includes(ext)) {
    return { valid: false, error: "This file type isn't supported. Please upload a CSV or Excel file." };
  }

  if (!(ALLOWED_EXTENSIONS as readonly string[]).includes(ext)) {
    return { valid: false, error: "This file type isn't supported. Please upload a CSV or Excel file." };
  }

  if (ext === '.xlsx' && !data.subarray(0, 4).equals(PK_MAGIC)) {
    return { valid: false, error: 'This file appears to be corrupted or is not a valid spreadsheet.' };
  }

  if (ext === '.xls') {
    const OLE2_MAGIC = Buffer.from([0xd0, 0xcf, 0x11, 0xe0]);
    if (!data.subarray(0, 4).equals(OLE2_MAGIC)) {
      return { valid: false, error: 'This file appears to be corrupted or is not a valid spreadsheet.' };
    }
  }

  return { valid: true };
}
