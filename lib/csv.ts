/** Writing CSV that is safe to open in a spreadsheet. */

export type CsvCell = string | number | null | undefined;

/**
 * One cell. Text that a spreadsheet would run as a formula (it starts with
 * =, +, - or @) is prefixed with an apostrophe so it opens as text. Numbers
 * are left alone, so a negative amount stays a number.
 */
export function csvCell(value: CsvCell): string {
  const raw = String(value ?? '');
  const text = typeof value === 'string' && /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(heads: string[], rows: CsvCell[][]): string {
  return [heads, ...rows].map((row) => row.map(csvCell).join(',')).join('\n');
}
