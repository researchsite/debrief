import Papa from 'papaparse';

/**
 * Parses a LinkedIn CSV export string into typed rows.
 *
 * LinkedIn exports sometimes include a few lines of notes/metadata before the
 * actual header row.  We find the real header by scanning for the first line
 * whose first CSV token matches `expectedFirstColumn`, then slice from there.
 */
export function parseLinkedInCsv<T extends Record<string, string>>(
  csvText: string,
  expectedFirstColumn: string,
): T[] {
  // 1. Split into lines
  const lines = csvText.split(/\r?\n/);

  // 2. Find the header row index
  let headerIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    // Parse just the first token of this line to handle quoted commas
    const parsed = Papa.parse<string[]>(line, { header: false });
    const firstToken =
      parsed.data?.[0]?.[0]?.replace(/^﻿/, '') ?? ''; // strip BOM
    if (firstToken === expectedFirstColumn) {
      headerIndex = i;
      break;
    }
  }

  if (headerIndex === -1) {
    // Header not found — return empty
    return [];
  }

  // 3. Slice from header row onward
  const relevant = lines.slice(headerIndex).join('\n');

  // 4. Parse with papaparse
  const result = Papa.parse<T>(relevant, {
    header: true,
    skipEmptyLines: true,
  });

  // 5. Return typed rows
  return result.data;
}
