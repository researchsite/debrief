export interface VttCue {
  id: string;
  start: number;  // seconds from start
  end: number;    // seconds from start
  speaker?: string;
  text: string;
}

function parseTimestamp(ts: string): number {
  return ts.split(':').reduce((seconds, part) => seconds * 60 + Number(part), 0);
}

export function parseVtt(vttText: string): VttCue[] {
  // Normalize line endings
  const normalized = vttText.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Split on double newline to get raw cue blocks
  const blocks = normalized.split(/\n[\t ]*\n+/);

  const cues: VttCue[] = [];
  const timingPattern = /^((?:\d{2,}:)?[0-5]\d:[0-5]\d\.\d{3})\s+-->\s+((?:\d{2,}:)?[0-5]\d:[0-5]\d\.\d{3})(?:\s|$)/;

  for (const block of blocks) {
    const lines = block.trim().split('\n');
    if (lines.length === 0) continue;

    // Skip WEBVTT header or empty blocks
    const firstLine = lines[0].trim();
    if (/^(?:WEBVTT|NOTE|STYLE|REGION)(?:\s|$)/.test(firstLine) || firstLine === '') continue;

    let lineIdx = 0;
    let cueId = '';

    // Cue identifiers can be names or numbers.
    if (!timingPattern.test(firstLine)) {
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
    if (end <= start) continue;
    lineIdx++;

    // Remaining lines are the text
    const rawText = lines.slice(lineIdx).join('\n');
    const voiceMatch = /<v(?:\.[^\s>]+)*\s+([^>]+)>/i.exec(rawText);
    const textLines = rawText.replace(/<[^>]*>/g, '')
      .replace(/&(amp|lt|gt|nbsp|lrm|rlm);/g, (_, entity: string) => ({ amp: '&', lt: '<', gt: '>', nbsp: ' ', lrm: '', rlm: '' })[entity] ?? '')
      .split('\n').map((l) => l.trim()).filter(Boolean);
    if (textLines.length === 0) continue;

    // Check if first text line matches "Speaker Name:" pattern
    let speaker: string | undefined = voiceMatch?.[1].trim();
    const speakerMatch = /^([\p{L}\p{N}][\p{L}\p{N}\s.'’_-]{0,79}):\s*(.*)$/u.exec(textLines[0]);
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
