/**
 * A small RFC 4180 CSV reader. Written by hand rather than pulled in as a
 * dependency: the project's install is already fragile enough to need
 * `--legacy-peer-deps`, and this is the whole of what we need.
 *
 * Handles quoted fields, escaped quotes (`""`), commas and newlines inside
 * quotes, CRLF or LF line endings, and a leading UTF-8 BOM (Excel adds one).
 * Client-safe — no server-only imports.
 */

/** Delimiters we'll auto-detect. Excel in some locales exports semicolons. */
const DELIMITERS = [",", ";", "\t"] as const;

/**
 * Guesses the delimiter from the header line by counting occurrences outside
 * quotes. Falls back to a comma when nothing is conclusive.
 */
function detectDelimiter(text: string): string {
  const firstLine = text.slice(0, text.indexOf("\n") === -1 ? text.length : text.indexOf("\n"));
  let best = ",";
  let bestCount = 0;
  for (const d of DELIMITERS) {
    let count = 0;
    let inQuotes = false;
    for (let i = 0; i < firstLine.length; i++) {
      const ch = firstLine[i];
      if (ch === '"') inQuotes = !inQuotes;
      else if (ch === d && !inQuotes) count++;
    }
    if (count > bestCount) {
      best = d;
      bestCount = count;
    }
  }
  return best;
}

/** Splits raw CSV text into rows of string cells. Blank lines are dropped. */
export function parseCsv(input: string): string[][] {
  const text = input.replace(/^﻿/, "");
  const delimiter = detectDelimiter(text);

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;

  const endField = () => {
    row.push(field);
    field = "";
  };
  const endRow = () => {
    endField();
    // Skip rows that are entirely empty (trailing newline, spacer lines).
    if (row.some((c) => c.trim() !== "")) rows.push(row);
    row = [];
  };

  while (i < text.length) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === delimiter) {
      endField();
      i++;
      continue;
    }
    if (ch === "\r") {
      // CRLF or a lone CR — either way it ends the row.
      if (text[i + 1] === "\n") i++;
      endRow();
      i++;
      continue;
    }
    if (ch === "\n") {
      endRow();
      i++;
      continue;
    }
    field += ch;
    i++;
  }

  // Whatever is left after the final line (file not ending in a newline).
  if (field !== "" || row.length > 0) endRow();

  return rows;
}

/**
 * Normalises a header cell for matching: lowercased, with everything that
 * isn't a letter or digit removed. So "Contact Name", "contact_name" and
 * "CONTACT-NAME" all collapse to "contactname".
 */
export function normalizeHeader(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Quotes a single cell for output if it contains anything structural. */
export function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** Builds CSV text from a header row plus data rows. */
export function toCsv(headers: string[], rows: string[][]): string {
  const lines = [headers.map(csvCell).join(",")];
  for (const r of rows) lines.push(r.map(csvCell).join(","));
  return lines.join("\r\n");
}
