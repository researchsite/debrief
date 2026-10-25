import { NextRequest, NextResponse } from 'next/server';
import { ClassificationResultError, normalizeClassificationResult } from '@/lib/classification-result';
import { writeCoupon, writeAsset } from '@/lib/graph-writes';
import { query } from '@/lib/graph';
import { upsertContactProfile } from '@/lib/person-profile';
import { qrRecordId, saveQrProvenance } from '@/lib/qr-save';
import type { QrProvenance } from '@/lib/import-types';

interface SaveRequest {
  result: unknown;
  filePath: string;
  eventName?: string;
  qr?: QrProvenance;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as SaveRequest;
    const { filePath, eventName, qr } = body;
    if (typeof filePath !== 'string' || !filePath.startsWith('/uploads/') || filePath.includes('..')) return NextResponse.json({ error: 'A valid uploaded image is required.' }, { status: 400 });
    if (qr && (typeof qr.payload !== 'string' || !qr.payload || qr.payload.length > 32768 || (qr.url !== undefined && typeof qr.url !== 'string') || (qr.resolvedUrl !== undefined && typeof qr.resolvedUrl !== 'string'))) return NextResponse.json({ error: 'A valid QR payload is required.' }, { status: 400 });
    const result = normalizeClassificationResult(body.result);
    const assetPath = qr ? `${filePath}#qr=${qrRecordId(filePath, qr.payload)}` : filePath;
    let personId: string | undefined;

    switch (result.kind) {
      case 'coupon': {
        if (!result.code.trim()) return NextResponse.json({ error: 'Enter the coupon code before saving.' }, { status: 400 });
        await writeCoupon({
          code: result.code,
          vendor: result.vendor,
          value: result.value,
          description: result.description,
          expires: result.expires,
          terms: result.terms,
          redeemUrl: result.redeem_url,
          assetPath,
          eventName,
        });
        break;
      }

      case 'slide':
      case 'deck': {
        await writeAsset({
          kind: result.kind,
          filePath: assetPath,
          extractedText: result.title,
        });

        // Write Session node
        if (result.title) {
          await query(
            `MERGE (s:Session {title: $title}) SET s.speaker = $speaker`,
            { title: result.title, speaker: result.speaker ?? '' },
          );
        }

        // Write Idea nodes
        for (const idea of result.ideas ?? []) {
          await query(
            `MERGE (i:Idea {text: $text})`,
            { text: idea },
          );
          if (result.title) {
            await query(
              `MATCH (s:Session {title: $title}) MATCH (i:Idea {text: $text}) MERGE (s)-[:HAS_IDEA]->(i)`,
              { title: result.title, text: idea },
            );
          }
        }

        // Write Topic nodes
        for (const topic of result.topics ?? []) {
          const normalized = topic.toLowerCase();
          await query(
            `MERGE (t:Topic {name: $name})`,
            { name: normalized },
          );
          if (result.title) {
            await query(
              `MATCH (s:Session {title: $title}) MATCH (t:Topic {name: $name}) MERGE (s)-[:COVERS]->(t)`,
              { title: result.title, name: normalized },
            );
          }
        }
        break;
      }

      case 'badge':
      case 'business_card': {
        await writeAsset({
          kind: result.kind,
          filePath: assetPath,
          extractedText: result.name,
        });

        personId = await upsertContactProfile({
          id: result.id || `contact:${qrRecordId('contact', qr?.payload || result.email || result.phone || JSON.stringify(result))}`,
          linkedin_url: result.linkedin_url, name: result.name, headline: result.title, city: '',
          current_company: result.company, past_companies: [], schools: [], skills: [], email: result.email, phone: result.phone,
        });
        break;
      }

      case 'agenda': {
        await writeAsset({
          kind: 'agenda',
          filePath: assetPath,
          extractedText: (result.sessions ?? []).map((s) => s.title).join(', '),
        });

        for (const session of result.sessions ?? []) {
          await query(
            `MERGE (s:Session {title: $title}) SET s.starts = $starts, s.room = $room, s.speaker = $speaker`,
            {
              title: session.title,
              starts: session.starts ?? '',
              room: session.room ?? '',
              speaker: session.speaker ?? '',
            },
          );
        }
        break;
      }

      default: {
        await writeAsset({
          kind: result.kind === 'qr' ? 'qr' : 'other',
          filePath: assetPath,
          extractedText: (result as { text?: string }).text ?? '',
        });
        break;
      }
    }

    if (qr) await saveQrProvenance(filePath, qr, result, personId);
    return NextResponse.json({ ok: true, personId });
  } catch (err) {
    console.error('[save] error:', err instanceof Error ? (err.stack ?? err.message) : err);
    return NextResponse.json(
      { error: err instanceof Error && err.message ? err.message : 'Save failed' },
      { status: err instanceof ClassificationResultError ? 400 : 500 },
    );
  }
}
