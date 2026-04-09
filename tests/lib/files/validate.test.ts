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
