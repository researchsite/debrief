import { describe, it, expect } from 'vitest';
import { parseLinkedInCsv } from '../lib/linkedin-csv';

describe('parseLinkedInCsv', () => {
  it('parses a normal CSV', () => {
    const csv = 'Name\nTypeScript\nReact\n';
    const rows = parseLinkedInCsv<{ Name: string }>(csv, 'Name');
    expect(rows).toHaveLength(2);
    expect(rows[0].Name).toBe('TypeScript');
  });

  it('skips note lines before the header row', () => {
    const csv = 'Notes: exported from LinkedIn\n\nFirst Name,Last Name\nJohn,Doe\n';
    const rows = parseLinkedInCsv<{ 'First Name': string; 'Last Name': string }>(csv, 'First Name');
    expect(rows).toHaveLength(1);
    expect(rows[0]['First Name']).toBe('John');
  });
});
