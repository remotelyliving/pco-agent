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
    expect(result).toEqual({ valid: false, error: "This file type isn't supported. You can upload spreadsheets (CSV, Excel) or images (JPG, PNG)." });
  });
  it('rejects macro-enabled formats', () => {
    const result = validateFile('file.xlsm', 100, Buffer.from('data'));
    expect(result).toEqual({ valid: false, error: "This file type isn't supported. You can upload spreadsheets (CSV, Excel) or images (JPG, PNG)." });
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
  it('rejects xls with wrong magic bytes', () => {
    const result = validateFile('file.xls', 100, Buffer.from('not an xls file'));
    expect(result).toEqual({ valid: false, error: 'This file appears to be corrupted or is not a valid spreadsheet.' });
  });
  it('accepts valid xls with OLE2 magic bytes', () => {
    const ole2Header = Buffer.from([0xd0, 0xcf, 0x11, 0xe0]);
    const data = Buffer.concat([ole2Header, Buffer.alloc(100)]);
    const result = validateFile('data.xls', data.length, data);
    expect(result).toEqual({ valid: true });
  });

  // Image validation tests
  it('accepts valid PNG with correct magic bytes', () => {
    const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const data = Buffer.concat([pngHeader, Buffer.alloc(100)]);
    const result = validateFile('screenshot.png', data.length, data);
    expect(result).toEqual({ valid: true });
  });
  it('rejects PNG with wrong magic bytes', () => {
    const result = validateFile('fake.png', 100, Buffer.from('not a png'));
    expect(result).toEqual({ valid: false, error: 'This file appears to be corrupted or is not a valid image.' });
  });
  it('accepts valid JPEG with correct magic bytes', () => {
    const jpegHeader = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
    const data = Buffer.concat([jpegHeader, Buffer.alloc(100)]);
    const result = validateFile('photo.jpg', data.length, data);
    expect(result).toEqual({ valid: true });
  });
  it('accepts .jpeg extension with correct magic bytes', () => {
    const jpegHeader = Buffer.from([0xff, 0xd8, 0xff, 0xe1]);
    const data = Buffer.concat([jpegHeader, Buffer.alloc(100)]);
    const result = validateFile('photo.jpeg', data.length, data);
    expect(result).toEqual({ valid: true });
  });
  it('rejects JPEG with wrong magic bytes', () => {
    const result = validateFile('fake.jpg', 100, Buffer.from('not a jpeg'));
    expect(result).toEqual({ valid: false, error: 'This file appears to be corrupted or is not a valid image.' });
  });
  it('accepts valid WebP with RIFF and WEBP markers', () => {
    const riff = Buffer.from('RIFF');
    const size = Buffer.alloc(4); // file size placeholder
    const webp = Buffer.from('WEBP');
    const data = Buffer.concat([riff, size, webp, Buffer.alloc(100)]);
    const result = validateFile('image.webp', data.length, data);
    expect(result).toEqual({ valid: true });
  });
  it('rejects WebP with missing WEBP marker', () => {
    const riff = Buffer.from('RIFF');
    const size = Buffer.alloc(4);
    const notWebp = Buffer.from('WAVE');
    const data = Buffer.concat([riff, size, notWebp, Buffer.alloc(100)]);
    const result = validateFile('fake.webp', data.length, data);
    expect(result).toEqual({ valid: false, error: 'This file appears to be corrupted or is not a valid image.' });
  });
  it('rejects GIF (not in allowed list)', () => {
    const result = validateFile('animation.gif', 100, Buffer.from('GIF89a'));
    expect(result).toEqual({ valid: false, error: "This file type isn't supported. You can upload spreadsheets (CSV, Excel) or images (JPG, PNG)." });
  });
  it('rejects SVG (not in allowed list)', () => {
    const result = validateFile('vector.svg', 100, Buffer.from('<svg>'));
    expect(result).toEqual({ valid: false, error: "This file type isn't supported. You can upload spreadsheets (CSV, Excel) or images (JPG, PNG)." });
  });
  it('rejects images over 5MB', () => {
    const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const data = Buffer.concat([pngHeader, Buffer.alloc(100)]);
    const result = validateFile('large.png', 6 * 1024 * 1024, data);
    expect(result).toEqual({ valid: false, error: 'This image is too large. The maximum for images is 5 MB.' });
  });
  it('allows data files up to 10MB (not capped at 5MB)', () => {
    const result = validateFile('big.csv', 8 * 1024 * 1024, Buffer.from('name,email\na,b'));
    expect(result).toEqual({ valid: true });
  });
});
