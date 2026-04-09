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
      const XLS_MAGIC = Buffer.from([0xd0, 0xcf, 0x11, 0xe0]);
      const PK_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
      const header4 = data.subarray(0, 4);
      if (!header4.equals(XLS_MAGIC) && !header4.equals(PK_MAGIC)) {
        throw new Error('Not a valid Excel file');
      }
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
