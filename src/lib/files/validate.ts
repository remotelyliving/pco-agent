import {
  MAX_FILE_SIZE_BYTES,
  MAX_IMAGE_SIZE_BYTES,
  ALLOWED_EXTENSIONS,
  BLOCKED_EXTENSIONS,
  IMAGE_EXTENSIONS,
} from '@/lib/files/types';

const PK_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff]);
const WEBP_RIFF = Buffer.from('RIFF');
const WEBP_MARKER = Buffer.from('WEBP');

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

  if ((IMAGE_EXTENSIONS as readonly string[]).includes(ext) && sizeBytes > MAX_IMAGE_SIZE_BYTES) {
    return { valid: false, error: 'This image is too large. The maximum for images is 5 MB.' };
  }

  const UNSUPPORTED_MSG = "This file type isn't supported. You can upload spreadsheets (CSV, Excel) or images (JPG, PNG).";

  if ((BLOCKED_EXTENSIONS as readonly string[]).includes(ext)) {
    return { valid: false, error: UNSUPPORTED_MSG };
  }

  if (!(ALLOWED_EXTENSIONS as readonly string[]).includes(ext)) {
    return { valid: false, error: UNSUPPORTED_MSG };
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

  if ((IMAGE_EXTENSIONS as readonly string[]).includes(ext)) {
    const corruptMsg = 'This file appears to be corrupted or is not a valid image.';
    if (ext === '.png' && !data.subarray(0, 8).equals(PNG_MAGIC)) {
      return { valid: false, error: corruptMsg };
    }
    if ((ext === '.jpg' || ext === '.jpeg') && !data.subarray(0, 3).equals(JPEG_MAGIC)) {
      return { valid: false, error: corruptMsg };
    }
    if (ext === '.webp') {
      if (!data.subarray(0, 4).equals(WEBP_RIFF) || !data.subarray(8, 12).equals(WEBP_MARKER)) {
        return { valid: false, error: corruptMsg };
      }
    }
  }

  return { valid: true };
}
