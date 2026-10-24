export interface VttCue {
  id: string;
  start: number;  // seconds from start
  end: number;    // seconds from start
  speaker?: string;
  text: string;
}

function parseTimestamp(ts: string): number {
  // ts like "00:03:05.000"
  const [h, m, rest] = ts.split(':');
  const [s, ms] = rest.split('.');
  return parseInt(h) * 3600 + parseInt(m) * 60 + parseInt(s) + parseInt(ms) / 1000;
}

export function parseVtt(vttText: string): VttCue[] {
  // Normalize line endings
  const normalized = vttText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Split on double newline to get raw cue blocks
  const blocks = normalized.split(/\n\n+/);

  const cues: VttCue[] = [];
  const timingPattern = /^(\d{2}:\d{2}:\d{2}\.\d{3})\s+-->\s+(\d{2}:\d{2}:\d{2}\.\d{3})/;

  for (const block of blocks) {
    const lines = block.trim().split('\n');
    if (lines.length === 0) continue;

    // Skip WEBVTT header or empty blocks
    const firstLine = lines[0].trim();
    if (firstLine === 'WEBVTT' || firstLine === '') continue;

    let lineIdx = 0;
    let cueId = '';

    // If first line is a cue number (all digits), use it as ID and advance
    if (/^\d+$/.test(firstLine)) {
      cueId = firstLine;
      lineIdx = 1;
    }

    if (lineIdx >= lines.length) continue;

    // Next line should be the timing line
    const timingLine = lines[lineIdx].trim();
    const timingMatch = timingPattern.exec(timingLine);
    if (!timingMatch) continue;

    const start = parseTimestamp(timingMatch[1]);
    const end = parseTimestamp(timingMatch[2]);
    lineIdx++;

    // Remaining lines are the text
    const textLines = lines.slice(lineIdx).map((l) => l.trim()).filter((l) => l !== '');
    if (textLines.length === 0) continue;

    // Check if first text line matches "Speaker Name:" pattern
    let speaker: string | undefined;
    const speakerMatch = /^([A-Z][a-zA-Z\s]+):\s*(.*)$/.exec(textLines[0]);
    let finalText: string;

    if (speakerMatch) {
      speaker = speakerMatch[1].trim();
      const remainder = speakerMatch[2].trim();
      const otherLines = textLines.slice(1);
      finalText = [remainder, ...otherLines].filter((l) => l !== '').join('\n');
    } else {
      finalText = textLines.join('\n');
    }

    cues.push({
      id: cueId || String(cues.length + 1),
      start,
      end,
      speaker,
      text: finalText,
    });
  }

  // Sort by start time
  cues.sort((a, b) => a.start - b.start);

  return cues;
}
