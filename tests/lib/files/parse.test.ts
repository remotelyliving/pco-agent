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
    expect(result).not.toContain('Person 550');
  });

  it('parses XLSX buffer', () => {
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
