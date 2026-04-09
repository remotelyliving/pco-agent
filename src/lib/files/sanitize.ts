const DANGEROUS_PREFIXES = ['=', '+', '@', '\t', '\r'];

export function sanitizeCellValue(value: string): string {
  if (!value) return value;
  if (DANGEROUS_PREFIXES.some((p) => value.startsWith(p))) {
    return "'" + value;
  }
  // Only sanitize '-' when followed by non-digit (formulas like -cmd|stuff, not numbers like -5)
  if (value.startsWith('-') && !/^-\d/.test(value)) {
    return "'" + value;
  }
  return value;
}

export function sanitizeRows(rows: string[][]): string[][] {
  return rows.map((row) => row.map(sanitizeCellValue));
}
