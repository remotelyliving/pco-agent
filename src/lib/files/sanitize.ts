const DANGEROUS_PREFIXES = ['=', '+', '-', '@', '\t', '\r'];

export function sanitizeCellValue(value: string): string {
  if (!value) return value;
  if (DANGEROUS_PREFIXES.some((p) => value.startsWith(p))) {
    return "'" + value;
  }
  return value;
}

export function sanitizeRows(rows: string[][]): string[][] {
  return rows.map((row) => row.map(sanitizeCellValue));
}
