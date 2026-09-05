import { parse } from 'csv-parse/sync';
import { isValidEmail, normalizeEmail } from './emailValidator.util';

export interface ParsedCsvRow {
  rowNumber: number; // 1-based, matches "Row N" shown to the user (header = row 0)
  fields: Record<string, string>;
  email: string;
  isValidEmail: boolean;
  isDuplicate: boolean;
  missingRequiredFields: string[];
}

export interface ParsedCsvResult {
  headers: string[];
  rows: ParsedCsvRow[];
  totalRecords: number;
  validRecords: number;
  invalidRecords: number;
  duplicateRecords: number;
}

/**
 * Parses raw CSV text into rows keyed by whatever headers the file contains.
 * No column name is hardcoded — every header becomes a mail-merge variable.
 * The only assumption is that a column named "email" (case-insensitive)
 * identifies the recipient address; if absent, all rows are invalid.
 */
export function parseCsv(csvContent: string, requiredColumns: string[] = []): ParsedCsvResult {
  const records: Record<string, string>[] = parse(csvContent, {
    columns: (header: string[]) => header.map((h) => h.trim()),
    skip_empty_lines: true,
    trim: true,
    bom: true,
  });

  const headers = records.length > 0 ? Object.keys(records[0]) : [];
  const emailHeader = headers.find((h) => h.toLowerCase() === 'email');

  const seenEmails = new Set<string>();
  const rows: ParsedCsvRow[] = [];

  records.forEach((record, index) => {
    const rawEmail = emailHeader ? record[emailHeader] ?? '' : '';
    const email = normalizeEmail(rawEmail);
    const validEmail = isValidEmail(email);

    const isDuplicate = validEmail && seenEmails.has(email);
    if (validEmail) seenEmails.add(email);

    const missingRequiredFields = requiredColumns.filter((col) => !record[col] || record[col].trim() === '');

    rows.push({
      rowNumber: index + 1,
      fields: record,
      email,
      isValidEmail: validEmail,
      isDuplicate,
      missingRequiredFields,
    });
  });

  const validRecords = rows.filter(
    (r) => r.isValidEmail && !r.isDuplicate && r.missingRequiredFields.length === 0,
  ).length;
  const invalidRecords = rows.filter((r) => !r.isValidEmail).length;
  const duplicateRecords = rows.filter((r) => r.isDuplicate).length;

  return {
    headers,
    rows,
    totalRecords: rows.length,
    validRecords,
    invalidRecords,
    duplicateRecords,
  };
}
