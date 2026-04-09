import { describe, it, expect } from 'vitest';
import { sanitizeCellValue, sanitizeRows } from '@/lib/files/sanitize';

describe('sanitizeCellValue', () => {
  it('prefixes cells starting with =', () => {
    expect(sanitizeCellValue('=SUM(A1:A10)')).toBe("'=SUM(A1:A10)");
  });
  it('prefixes cells starting with +', () => {
    expect(sanitizeCellValue('+cmd|')).toBe("'+cmd|");
  });
  it('prefixes cells starting with - followed by non-digit', () => {
    expect(sanitizeCellValue('-cmd|stuff')).toBe("'-cmd|stuff");
  });
  it('leaves negative numbers unchanged', () => {
    expect(sanitizeCellValue('-5')).toBe('-5');
    expect(sanitizeCellValue('-100.50')).toBe('-100.50');
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
