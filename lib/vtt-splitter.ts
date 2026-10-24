import type { VttCue } from './vtt-parser';

export interface ConversationChunk {
  starts: number;    // seconds
  ends: number;      // seconds
  cues: VttCue[];
  text: string;      // all cue text joined with newlines
}

function buildChunk(cues: VttCue[]): ConversationChunk {
  return {
    starts: cues[0].start,
    ends: cues[cues.length - 1].end,
    cues,
    text: cues.map((c) => c.speaker ? `${c.speaker}: ${c.text}` : c.text).join('\n'),
  };
}

export function splitConversations(
  cues: VttCue[],
  gapThreshold = 90,  // seconds
): ConversationChunk[] {
  if (cues.length === 0) return [];

  const rawChunks: VttCue[][] = [];
  let current: VttCue[] = [cues[0]];

  for (let i = 1; i < cues.length; i++) {
    const prevCue = current[current.length - 1];
    const thisCue = cues[i];

    if (thisCue.start - prevCue.end > gapThreshold) {
      // Gap exceeds threshold — save current chunk, start a new one
      rawChunks.push(current);
      current = [thisCue];
    } else {
      current.push(thisCue);
    }
  }
  rawChunks.push(current);

  // Build initial chunks
  let chunks: ConversationChunk[] = rawChunks.map(buildChunk);

  // Merge chunks shorter than 45 seconds into their neighbor,
  // but only when the merge would reduce count above 1 and the candidate chunk
  // is adjacent (i.e. there is no large gap between it and its neighbor).
  // This avoids collapsing genuine separate conversations that happen to be short.
  const minDuration = 45;
  let merging = true;
  while (merging && chunks.length > 1) {
    merging = false;
    const next: ConversationChunk[] = [];
    let i = 0;
    while (i < chunks.length) {
      const chunk = chunks[i];
      const duration = chunk.ends - chunk.starts;

      if (duration < minDuration) {
        // Only merge if the gap to the nearest neighbor is within gapThreshold
        // (i.e. it is a true continuation, not a gap-separated conversation)
        const prevChunk = next.length > 0 ? next[next.length - 1] : null;
        const nextChunk = i + 1 < chunks.length ? chunks[i + 1] : null;

        const gapToPrev = prevChunk ? chunk.starts - prevChunk.ends : Infinity;
        const gapToNext = nextChunk ? nextChunk.starts - chunk.ends : Infinity;

        if (gapToPrev <= gapThreshold && prevChunk) {
          // Merge into previous
          merging = true;
          const merged = buildChunk([...prevChunk.cues, ...chunk.cues]);
          next[next.length - 1] = merged;
        } else if (gapToNext <= gapThreshold && nextChunk) {
          // Merge into next
          merging = true;
          const merged = buildChunk([...chunk.cues, ...nextChunk.cues]);
          next.push(merged);
          i++; // skip next chunk since we consumed it
        } else {
          // Keep as-is — separated by large gaps so it stands alone
          next.push(chunk);
        }
      } else {
        next.push(chunk);
      }
      i++;
    }
    chunks = next;
  }

  return chunks;
}
