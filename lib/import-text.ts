export function formatImportText(value: unknown): string {
  if (value == null) return '';

  if (typeof value === 'string') return value;

  if (Array.isArray(value)) {
    return value.map(formatImportText).filter(Boolean).join('\n');
  }

  if (typeof value === 'object') {
    return Object.entries(value)
      .map(([key, entry]) => {
        const formatted = formatImportText(entry);
        return formatted ? `${key.replaceAll('_', ' ')}: ${formatted}` : '';
      })
      .filter(Boolean)
      .join('\n');
  }

  return String(value);
}
