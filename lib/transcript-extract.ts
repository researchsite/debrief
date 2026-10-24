import { jsonCompletion } from './openai';
import type { ConversationChunk } from './vtt-splitter';

export interface ConversationExtraction {
  who: {
    name: string;
    company: string;
    role: string;
    clues: string;
  };
  summary: string;
  key_points: string[];
  topics: string[];
  promises: string[];        // things either side offered to do
  follow_up_needed: boolean;
  confidence: number;        // 0-1
}

export async function extractConversation(
  text: string,
): Promise<ConversationExtraction> {
  return jsonCompletion<ConversationExtraction>([
    {
      role: 'system',
      content:
        'Analyze this conversation excerpt and return JSON: {who:{name,company,role,clues}, summary, key_points:string[], topics:string[], promises:string[], follow_up_needed:boolean, confidence:0-1}. Focus on identifying the other person (not the narrator). Use confidence 0-1 based on how clearly they introduced themselves.',
    },
    {
      role: 'user',
      content: text,
    },
  ]);
}

export async function extractAllConversations(
  chunks: ConversationChunk[],
): Promise<ConversationExtraction[]> {
  const results: ConversationExtraction[] = [];
  // Sequential to avoid rate limits
  for (const chunk of chunks) {
    const extraction = await extractConversation(chunk.text);
    results.push(extraction);
  }
  return results;
}
