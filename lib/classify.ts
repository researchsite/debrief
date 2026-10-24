import { jsonCompletion } from './openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

export type AssetKind = 'slide' | 'deck' | 'coupon' | 'badge' | 'business_card' | 'agenda' | 'qr' | 'other';

export interface ClassifiedCoupon {
  kind: 'coupon';
  code: string;
  vendor: string;
  value: string;
  description: string;
  expires: string | null;
  terms: string;
  redeem_url: string;
}

export interface ClassifiedSlide {
  kind: 'slide' | 'deck';
  title: string;
  speaker: string;
  ideas: string[];
  topics: string[];
  links: string[];
}

export interface ClassifiedBadge {
  kind: 'badge' | 'business_card';
  name: string;
  company: string;
  title: string;
  email: string;
  linkedin_url: string;
}

export interface ClassifiedAgenda {
  kind: 'agenda';
  sessions: { title: string; starts: string; room: string; speaker: string }[];
}

export interface ClassifiedOther {
  kind: 'other' | 'qr';
  text: string;
}

export type ClassificationResult =
  | ClassifiedCoupon
  | ClassifiedSlide
  | ClassifiedBadge
  | ClassifiedAgenda
  | ClassifiedOther;

export async function classifyImage(
  base64Image: string,
  mimeType: string,
): Promise<ClassificationResult> {
  const messages: ChatCompletionMessageParam[] = [
    {
      role: 'system',
      content: `Classify this image and extract structured data. Return JSON with a "kind" field (one of: slide, deck, coupon, badge, business_card, agenda, qr, other) and the matching fields:
- coupon/credit: {kind, code, vendor, value, description, expires (ISO date or null), terms, redeem_url}
- slide/deck: {kind, title, speaker, ideas: string[], topics: string[], links: string[]}
- badge/business_card: {kind, name, company, title, email, linkedin_url}
- agenda: {kind, sessions: [{title, starts, room, speaker}]}
- other/qr: {kind, text}
Return only valid JSON.`,
    },
    {
      role: 'user',
      content: [
        {
          type: 'image_url',
          image_url: { url: `data:${mimeType};base64,${base64Image}` },
        },
      ],
    },
  ];

  return jsonCompletion<ClassificationResult>(messages);
}

export async function classifyPdfText(text: string): Promise<ClassificationResult> {
  const messages: ChatCompletionMessageParam[] = [
    {
      role: 'system',
      content: `Classify this document text and extract structured data. Return JSON with a "kind" field (one of: slide, deck, coupon, badge, business_card, agenda, qr, other) and the matching fields:
- coupon/credit: {kind, code, vendor, value, description, expires (ISO date or null), terms, redeem_url}
- slide/deck: {kind, title, speaker, ideas: string[], topics: string[], links: string[]}
- badge/business_card: {kind, name, company, title, email, linkedin_url}
- agenda: {kind, sessions: [{title, starts, room, speaker}]}
- other/qr: {kind, text}
Return only valid JSON.`,
    },
    {
      role: 'user',
      content: text,
    },
  ];

  return jsonCompletion<ClassificationResult>(messages);
}

export async function extractPdfText(buffer: Buffer): Promise<string> {
  // Dynamic import to avoid CJS/ESM issues at module load time
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mod = (await import('pdf-parse')) as any;
  const pdfParse = (mod.default ?? mod) as (buf: Buffer) => Promise<{ text: string }>;
  const data = await pdfParse(buffer);
  return data.text;
}
